// Tableau HTML de la discussion : image, connaissance, liens.
import { h } from "../lib/dom.js";

export function createBoardUI({ openMedia }) {
  const media = h("div", { class: "zone" });
  const know = h("div", { class: "zone" });
  const links = h("div", { class: "zone" });
  const el = h("div", { class: "board" }, [h("h2", { text: "Tableau" }), media, know, links]);
  let hasContent = false;

  function render(asst, { photos = [], liens = [] } = {}) {
    let img = null;
    const ph = (asst?.medias ?? []).find((m) => m && m.type === "photo" && m.url);
    if (ph) img = ph.url;
    if (!img && photos.length) img = photos[0].url ?? null;

    const knowledge = Array.isArray(asst?.knowledge) ? asst.knowledge : [];
    const outLinks = [], seen = new Set();
    const addLink = (l) => { if (l && l.url && !seen.has(l.url)) { seen.add(l.url); outLinks.push(l); } };
    for (const md of (asst?.medias ?? [])) if (md && md.type === "lien") addLink(md);
    for (const l of liens) addLink(l);

    hasContent = !!img || knowledge.length > 0 || outLinks.length > 0;
    media.replaceChildren(
      h("div", { class: "zt", text: "Image" }),
      ...(img ? [h("img", { class: "bimg", src: img, alt: "" })] : [h("div", { class: "empty", text: "Aucune image" })]),
    );
    know.replaceChildren(
      h("div", { class: "zt", text: "Connaissance" }),
      ...(knowledge.length ? knowledge.map((k) => h("div", { class: "know" }, [
        h("span", { class: "t", text: k?.titre ?? "(sans titre)" }),
        h("span", { class: "ref", text: k?.ref ?? "" }),
      ])) : [h("div", { class: "empty", text: "Aucune connaissance" })]),
    );
    links.replaceChildren(
      h("div", { class: "zt", text: "Liens" }),
      ...(outLinks.length ? outLinks.map((l) => {
        const a = h("a", { class: "link", href: l.url, text: l.libelle ?? l.url, rel: "noopener" });
        a.addEventListener("click", (e) => { e.preventDefault(); openMedia(l.url); });
        return a;
      }) : [h("div", { class: "empty", text: "Aucun lien" })]),
    );
  }

  return { el, render, get hasContent() { return hasContent; } };
}
