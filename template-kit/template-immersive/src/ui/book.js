// Livre 2D : couverture, pagination, feuilles, navigation.
import { h } from "../lib/dom.js";
import { paginate } from "../lib/book-layout.js";
import { makeCoverCanvas } from "../lib/cover.js";

export function createBookUI({ root, getEntries, getTitle, navState, measure, onExit, onOpen, onOpenReader, timer }) {
  const leftPhoto = h("div", { class: "photo" });
  const rightPhoto = h("div", { class: "photo zoom", onclick: () => onOpenReader?.() });
  const leftCap = h("div", { class: "caption" });
  const rightCap = h("div", { class: "caption" });
  const folioL = h("div", { class: "folio" });
  const folioR = h("div", { class: "folio" });
  const leftPage = h("div", { class: "page left" }, [leftPhoto, leftCap, folioL]);
  const rightPage = h("div", { class: "page right" }, [rightPhoto, rightCap, folioR]);
  const cover = h("div", { class: "cover" });
  const bPrev = h("button", { class: "bnav prev", "aria-label": "Page précédente", text: "‹", onclick: () => go(-1) });
  const bNext = h("button", { class: "bnav next", "aria-label": "Page suivante", text: "›", onclick: () => go(1) });
  const book = h("div", { class: "book" }, [
    h("div", { class: "pages" }, [leftPage, rightPage, h("div", { class: "spine" })]),
    cover,
  ]);
  const bookov = h("div", { class: "bookov" }, [
    h("div", { class: "bookbar" }, [
      h("button", { class: "bclose", text: "← Retour à la salle", onclick: () => onExit?.() }),
    ]),
    book,
    h("div", { class: "bookfoot" }, [bPrev, bNext]),
  ]);
  // Clic sur le fond noir = sortie du livre (le livre est un « plein écran »).
  bookov.addEventListener("click", (e) => {
    if (e.target === bookov || e.target.classList?.contains("bookbar") || e.target.classList?.contains("bookfoot")) onExit?.();
  });

  let pages = [];
  let turning = false;
  let opened = false;

  /** Géométrie réelle de la page (mesurée sur le DOM, police imposée par le rendu). */
  function bookGeo() {
    const el = rightPage || rightPhoto;
    const r = el ? { width: el.clientWidth, height: el.clientHeight } : { width: 440, height: 600 };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const padX = 2.2 * rem;
    const padTop = 2.3 * rem;
    const padBottom = 2.6 * rem;
    return {
      w: r.width, h: r.height,
      textW: Math.max(140, r.width - 2 * padX - 2),
      textH: Math.max(160, r.height - padTop - padBottom),
      fontPx: 16, lh: 26, fontFamily: 'Georgia, "Times New Roman", serif',
    };
  }

  /** Rend une page (image+légende OU lignes de texte) dans un conteneur autonome. */
  function renderPage(page, num, total) {
    const wrap = h("div", { class: "leafpg" });
    wrap.style.cssText = "position:absolute;inset:0;background:linear-gradient(180deg,#fbf6ea,#efe4cf)";
    if (page && page.kind === "image") {
      wrap.appendChild(h("div", { class: "photo" }, [h("img", { src: page.image, alt: page.caption })]));
      if (page.caption) wrap.appendChild(h("div", { class: "caption", text: page.caption }));
    } else if (page && page.lines) {
      const box = h("div", { class: "btext" });
      box.style.fontSize = "16px";
      box.style.lineHeight = "26px";
      if (page.title) box.appendChild(h("div", { class: "bh", text: page.title }));
      page.lines.forEach((ln) => {
        // Une ligne vide explicite doit produire un vrai interligne (pas un div de hauteur 0).
        box.appendChild(h("div", { class: "ln", text: ln === "" ? "\u00a0" : ln }));
      });
      wrap.appendChild(box);
    }
    wrap.appendChild(h("div", { class: "folio", text: num > 0 ? `${num} / ${total}` : "" }));
    return wrap;
  }

  function paint() {
    const total = pages.length;
    const cur = pages[navState.index] || null;
    leftPage.replaceChildren();
    rightPage.replaceChildren(renderPage(cur, navState.index + 1, total));
    if (cur) navState.anchor = { entry: cur.entry, start: cur.start ?? 0 };
    bPrev.disabled = navState.index <= 0;
    bNext.disabled = navState.index >= total - 1;
  }

  /** (Re)pagine le livre et conserve la position de lecture. */
  function paginateBook() {
    const geo = bookGeo();
    if (geo.w < 60 || geo.h < 60) return; // livre pas encore mesurable
    const prev = pages[navState.index] || null;
    const anchor = navState.anchor || (prev ? { entry: prev.entry, start: prev.start ?? 0 } : null);
    pages = paginate(getEntries(), geo, measure());
    if (!pages.length) { navState.index = 0; paint(); return; }
    if (anchor) {
      let found = -1;
      pages.forEach((pg, i) => {
        if (found < 0 && pg.entry === anchor.entry && (pg.start ?? 0) <= anchor.start) found = i;
      });
      navState.index = found >= 0 ? found : Math.min(navState.index, pages.length - 1);
    }
    navState.index = Math.max(0, Math.min(navState.index, pages.length - 1));
    const cur = pages[navState.index];
    navState.anchor = cur ? { entry: cur.entry, start: cur.start ?? 0 } : null;
    paint();
  }

  function turn(delta, next) {
    turning = true;
    const forward = delta > 0;
    const total = pages.length;
    const front = forward ? renderPage(pages[navState.index], navState.index + 1, total) : renderPage(null, 0, total);
    const back = forward ? renderPage(null, 0, total) : renderPage(pages[next], next + 1, total);
    const leaf = h("div", { class: `leaf ${forward ? "right" : "left"}` }, [
      h("div", { class: "face front" }, [front]),
      h("div", { class: "face back" }, [back]),
    ]);
    book.appendChild(leaf);
    timer(() => { navState.index = next; paint(); }, 430);
    requestAnimationFrame(() => {
      leaf.classList.add("anim");
      leaf.style.transform = `rotateY(${forward ? -180 : 180}deg)`;
    });
    timer(() => { leaf.remove(); turning = false; paint(); }, 1000);
  }

  function go(delta) {
    const n = pages.length;
    if (n === 0 || turning) return;
    const next = navState.index + delta;
    if (next < 0 || next > n - 1) return;
    if (bookov.classList.contains("single")) { navState.index = next; paint(); return; }
    turn(delta, next);
  }

  function applyCoverImage() {
    const r = cover.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = makeCoverCanvas(r.width * dpr, r.height * dpr, getTitle());
    cover.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
    cover.style.backgroundSize = "100% 100%";
  }

  function open() {
    bookov.classList.add("open");
    book.classList.remove("open");
    cover.classList.remove("open");
    root.append(bookov);
    opened = true;
    onOpen?.();
    paint();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      applyCoverImage();
      paginateBook();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => paginateBook());
      book.classList.add("open");
      cover.classList.add("open");
    }));
  }

  function close() {
    opened = false;
    cover.classList.remove("open");
    book.classList.remove("open");
    timer(() => { bookov.classList.remove("open"); bookov.remove(); }, 650);
  }

  function setSingle(single) {
    const was = bookov.classList.contains("single");
    bookov.classList.toggle("single", single);
    if (opened && was !== single) requestAnimationFrame(() => paginateBook());
  }

  return {
    el: bookov,
    open, close, paginate: paginateBook, paint, go, setSingle,
    refreshCover: applyCoverImage,
    isOpen: () => opened,
    get pages() { return pages; },
  };
}
