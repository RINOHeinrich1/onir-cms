import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import { generateChatbotFromBuildSession } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import type { ChatbotAiUploadFile } from "@/application/use-cases/chatbots/generate-chatbot-ai-draft";
import { getPool } from "@/infrastructure/db/pool";
import { chatbotBuilderLimiter } from "@/lib/rate-limit";
import { chatbotBuilderDependencies } from "../../../deps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function uploadedFiles(formData: FormData): Promise<ChatbotAiUploadFile[]> {
  const files: ChatbotAiUploadFile[] = [];
  for (const entry of formData.getAll("files")) {
    if (typeof entry === "string") continue;
    const file = entry as File;
    if (typeof file.name !== "string" || typeof file.arrayBuffer !== "function") continue;
    files.push({
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return files;
}

/** POST /api/chatbots/ai/builder/sessions/[id]/generate — génère le brouillon. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const limited = chatbotBuilderLimiter(`chatbot-builder-generate:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de générations IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }
    const formData = await request.formData();
    const { id } = await context.params;
    const result = await generateChatbotFromBuildSession(
      chatbotBuilderDependencies(getPool()),
      actor,
      id,
      await uploadedFiles(formData),
      {
        ...(field(formData, "providerId") === ""
          ? {}
          : { providerId: field(formData, "providerId") }),
        ...(field(formData, "model") === "" ? {} : { model: field(formData, "model") }),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
