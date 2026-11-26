export type TemplateEditHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_CHARS = 24_000;

export function formatTemplateEditHistory(messages: TemplateEditHistoryMessage[]): string {
  if (messages.length === 0) return "(aucun message précédent)";
  const lines = messages.map(
    (message) => `${message.role === "user" ? "Utilisateur" : "Assistant"} : ${message.content}`,
  );
  let text = lines.join("\n");
  if (text.length > MAX_HISTORY_CHARS) {
    text = text.slice(text.length - MAX_HISTORY_CHARS);
  }
  return text;
}
