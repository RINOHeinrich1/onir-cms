// Pagination pure du livre (mesure de texte injectée).

/** Découpe UNE ligne logique (sans retour à la ligne) selon la largeur mesurée. */
function wrapLine(line, maxW, ctx) {
  const words = line.replace(/[ \t]+/g, " ").trim().split(" ").filter(Boolean);
  const out = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (!current || ctx.measureText(candidate).width <= maxW) current = candidate;
    else { out.push(current); current = word; }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Découpe un texte en lignes selon une largeur et une police données.
 * Les retours à la ligne EXPLICITES sont conservés (texte brut WYSIWYG) :
 * une ligne vide devient une ligne `""`, rendue comme un espace vertical.
 */
export function wrapLines(text, maxW, font, ctx) {
  ctx.font = font;
  const logical = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd());

  // On ne conserve pas les lignes vides de début/fin (artefacts de collage).
  while (logical.length > 0 && logical[0].trim() === "") logical.shift();
  while (logical.length > 0 && logical[logical.length - 1].trim() === "") logical.pop();

  const out = [];
  for (const logicalLine of logical) {
    if (logicalLine.trim() === "") { out.push(""); continue; }
    out.push(...wrapLine(logicalLine, maxW, ctx));
  }
  return out;
}

/**
 * Pagine une suite d'entrées : 1 image = 1 page (image + légende seules),
 * puis le texte s'écoule page après page. Aucune ligne orpheline.
 * Retourne [{ image?, caption?, text?, lines?, title?, start?, entry? }]
 */
export function paginate(entries, geo, ctx) {
  const font = geo.fontPx + "px " + geo.fontFamily;
  const maxLines = Math.max(3, Math.floor(geo.textH / geo.lh));
  const pages = [];
  entries.forEach((e, ei) => {
    if (e.image) pages.push({ kind: "image", image: e.image, caption: e.caption || "", entry: ei });
    const body = String(e.text || "").trim();
    if (!body) return;
    const lines = wrapLines(body, geo.textW, font, ctx);
    let i = 0;
    while (i < lines.length) {
      let take = Math.min(maxLines, lines.length - i);
      const rest = lines.length - (i + take);
      if (rest === 1 && take > 2) take -= 1;
      pages.push({
        kind: "text", entry: ei, start: i, lines: lines.slice(i, i + take),
        title: i === 0 ? (e.title || "") : ""
      });
      i += take;
    }
  });
  return pages;
}
