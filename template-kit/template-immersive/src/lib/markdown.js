// Rendu Markdown léger et sûr (HTML échappé d'abord).

/** Rend un Markdown LÉGER et SÛR (HTML échappé d'abord) : gras, italique, code,
 *  listes, titres, liens http(s) + URLs nues, retours à la ligne. */
export function mdToHtml(src) {
  const esc = String(src ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => t
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  let html = "", inUl = false;
  for (const line of esc.split(/\r?\n/)) {
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    if (li) { if (!inUl) { html += "<ul>"; inUl = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inUl) { html += "</ul>"; inUl = false; }
    const hd = line.match(/^(#{1,4})\s+(.*)$/);
    if (hd) { html += `<div class="md-h">${inline(hd[2])}</div>`; continue; }
    if (!line.trim()) { html += "<br>"; continue; }
    html += `<div>${inline(line)}</div>`;
  }
  if (inUl) html += "</ul>";
  return html;
}
