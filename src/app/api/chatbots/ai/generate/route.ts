import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireUser } from "@/app/api/_lib/require-user";
import {
  generateTemplateAiDraft,
  type TemplateAiUploadFile,
} from "@/application/use-cases/templates/generate-template-ai-draft";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { getPool } from "@/infrastructure/db/pool";
import { officeDocumentExtractor } from "@/infrastructure/documents/office-document-extractor";
import { siteContextReader } from "@/infrastructure/web/site-context-reader";
import { templateAiLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function uploadedFiles(formData: FormData): Promise<TemplateAiUploadFile[]> {
  const files: TemplateAiUploadFile[] = [];
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

/** POST /api/chatbots/ai/generate — brouillon de chatbot sans écriture (ADR-0060). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { actor } = await requireUser(request);
    const limited = templateAiLimiter(`chatbot-ai:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de générations IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const formData = await request.formData();
    const maxPages = optionalNumber(formData.get("maxPages"));
    const maxDepth = optionalNumber(formData.get("maxDepth"));
    const pool = getPool();
    const result = await generateTemplateAiDraft(
      {
        aiFactory: pgAiClientFactory(pool),
        documents: officeDocumentExtractor(),
        websites: siteContextReader(),
        templates: pgChatTemplateRepository(pool),
        connaissances: pgConnaissanceRepository(pool),
      },
      actor,
      {
        description: field(formData, "description"),
        websiteUrl: field(formData, "websiteUrl"),
        files: await uploadedFiles(formData),
        ...(field(formData, "providerId") === ""
          ? {}
          : { providerId: field(formData, "providerId") }),
        ...(field(formData, "model") === "" ? {} : { model: field(formData, "model") }),
        ...(maxPages === undefined && maxDepth === undefined
          ? {}
          : {
              crawl: {
                ...(maxPages === undefined ? {} : { maxPages }),
                ...(maxDepth === undefined ? {} : { maxDepth }),
              },
            }),
        requiredPermission: "links:create",
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
