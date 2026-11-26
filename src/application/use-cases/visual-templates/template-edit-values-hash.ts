import { createHash } from "node:crypto";
import type { TemplateParamValues } from "@/domain/template-params";

export function hashTemplateEditValues(values: TemplateParamValues): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
