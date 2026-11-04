import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { generateChatbotTemplateParams } from "@/application/use-cases/chatbots/generate-chatbot-template-params";
import {
  EMPTY_SITE_PALETTE,
  type SiteColorCandidate,
  type SitePalette,
} from "@/domain/site-palette";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { chatbotAiLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const HEX = /^#[0-9a-fA-F]{6}$/;
const CONTEXTS = new Set(["background", "text", "actions", "surfaces", "other"]);
const CONFIDENCES = new Set(["high", "medium", "low", "none"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safePalette(value: unknown): SitePalette {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return EMPTY_SITE_PALETTE;
  const source = value as Record<string, unknown>;
  const candidates: SiteColorCandidate[] = [];
  if (Array.isArray(source.candidates)) {
    for (const entry of source.candidates.slice(0, 10)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const hex = text(row.hex);
      const usageRate = typeof row.usageRate === "number" ? row.usageRate : 0;
      if (!HEX.test(hex) || !Number.isFinite(usageRate)) continue;
      const contexts = Array.isArray(row.contexts)
        ? row.contexts
            .filter((context): context is string => typeof context === "string")
            .filter((context) => CONTEXTS.has(context))
            .slice(0, 5)
        : [];
      candidates.push({
        hex,
        usageRate: Math.max(0, Math.min(1, usageRate)),
        contexts: contexts as SiteColorCandidate["contexts"],
      });
    }
  }
  const confidence = text(source.confidence);
  return {
    candidates,
    confidence: (CONFIDENCES.has(confidence)
      ? confidence
      : candidates.length === 0
        ? "none"
        : "low") as SitePalette["confidence"],
  };
}

function safeKnowledge(value: unknown): Array<{ titre: string; contenu: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const titre = text(row.titre).slice(0, 120);
    const contenu = text(row.contenu).slice(0, 2_000);
    return titre === "" || contenu === "" ? [] : [{ titre, contenu }];
  });
}

/** POST /api/chatbots/ai/template-params — remplit les paramètres statiques du widget. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const limited = chatbotAiLimiter(`chatbot-ai-params:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de générations IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const chatbot = body.chatbot;
    const chatbotRow =
      chatbot !== null && typeof chatbot === "object" && !Array.isArray(chatbot)
        ? (chatbot as Record<string, unknown>)
        : {};
    const result = await generateChatbotTemplateParams(
      {
        aiFactory: pgAiClientFactory(getPool()),
        visualTemplates: pgVisualTemplateRepository(getPool()),
      },
      actor,
      {
        templateId: text(body.templateId),
        templateVersion: text(body.templateVersion),
        chatbot: {
          label: text(chatbotRow.label).slice(0, 160),
          description: text(chatbotRow.description).slice(0, 4_000),
          role: text(chatbotRow.role).slice(0, 500),
          objective: text(chatbotRow.objective).slice(0, 1_000),
          tone: text(chatbotRow.tone).slice(0, 300),
          extraInstructions: text(chatbotRow.extraInstructions).slice(0, 2_000),
        },
        knowledge: safeKnowledge(body.knowledge),
        palette: safePalette(body.palette),
        ...(text(body.description) === "" ? {} : { description: text(body.description) }),
        ...(text(body.providerId) === "" ? {} : { providerId: text(body.providerId) }),
        ...(text(body.model) === "" ? {} : { model: text(body.model) }),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
