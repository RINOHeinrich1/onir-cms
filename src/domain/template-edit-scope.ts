import type { TemplateEditorManifest } from "./template-editor";

export function isSharedCollection(editor: TemplateEditorManifest, collection: string): boolean {
  return editor.version === 2
    ? (editor.scopes ?? []).some((entry) => entry.param === collection && entry.scope === "shared")
    : false;
}
