import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import type { ChatbotAiUploadFile } from "@/application/use-cases/chatbots/generate-chatbot-ai-draft";
import { extractKnowledgeFromSources } from "@/application/use-cases/connaissances/extract-knowledge-from-sources";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { officeDocumentExtractor } from "@/infrastructure/documents/office-document-extractor";
import { siteContextReader } from "@/infrastructure/web/site-context-reader";
import { knowledgeImportLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

function websiteUrls(formData: FormData): string[] {
  const raw = formData.getAll("urls").filter((entry): entry is string => typeof entry === "string");
  const values = raw.flatMap((entry) => {
    try {
      const parsed = JSON.parse(entry) as unknown;
      if (Array.isArray(parsed))
        return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return [entry];
    }
    return [entry];
  });
  return values.map((entry) => entry.trim()).filter((entry) => entry !== "");
}

/** POST /api/connaissances/ai/extract — extraction de connaissances candidates. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:create");
    const limited = knowledgeImportLimiter(`knowledge-import:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop d’imports IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }
    const formData = await request.formData();
    const result = await extractKnowledgeFromSources(
      {
        aiFactory: pgAiClientFactory(getPool()),
        documents: officeDocumentExtractor(),
        websites: siteContextReader(),
      },
      actor,
      { files: await uploadedFiles(formData), websiteUrls: websiteUrls(formData) },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
