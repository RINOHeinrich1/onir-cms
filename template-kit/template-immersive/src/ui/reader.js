// Lecteur zoom 2D (deux pages, flips 720 ms).
import { h } from "../lib/dom.js";

export function createReaderUI({ root, getPhotos, navState, onChange, timer }) {
  const mkPage = (cls) => {
    const img = h("img", { alt: "" });
    const cap = h("div", { class: "rcap" });
    const body = h("div", { class: "rbody" }, [cap]);
    const folio = h("div", { class: "rfolio" });
    const el = h("div", { class: `rpage ${cls}` }, [h("div", { class: "rphoto" }, [img]), body, folio]);
    return { el, img, cap, body, folio };
  };
  const front = mkPage("front");
  const back = mkPage("back");
  const sheet = h("div", { class: "rsheet" }, [front.el, back.el]);
  const prev = h("button", { class: "rnav prev", "aria-label": "Page précédente", text: "‹", onclick: () => go(-1) });
  const next = h("button", { class: "rnav next", "aria-label": "Page suivante", text: "›", onclick: () => go(1) });
  const reader = h("div", { class: "reader" }, [
    h("div", { class: "rbar" }, [
      h("button", { class: "rclose", "aria-label": "Fermer", text: "✕", onclick: () => close() }),
    ]),
    sheet,
    h("div", { class: "rfoot" }, [prev, next]),
  ]);
  reader.addEventListener("click", (e) => {
    if (e.target === reader || e.target.classList?.contains("rbar") || e.target.classList?.contains("rfoot")) close();
  });

  let flipping = false;
  let open = false;

  function fill(page, photo, num, total) {
    page.img.src = photo?.url ?? "";
    page.img.alt = photo?.libelle ?? "";
    page.cap.textContent = photo?.libelle ?? "";
    page.folio.textContent = photo ? `${num} / ${total}` : "";
    page.body.scrollTop = 0;
  }

  function render() {
    const photos = getPhotos();
    const n = photos.length;
    fill(front, photos[navState.index] ?? null, navState.index + 1, n);
    sheet.style.transition = "none";
    sheet.style.transform = "rotateY(0deg)";
    prev.disabled = navState.index <= 0;
    next.disabled = navState.index >= n - 1;
  }

  function openReader() {
    if (getPhotos().length === 0) return;
    open = true;
    flipping = false;
    render();
    root.append(reader);
    requestAnimationFrame(() => reader.classList.add("open"));
  }

  function close() {
    open = false;
    reader.classList.remove("open");
    timer(() => reader.remove(), 250);
  }

  function go(delta) {
    const photos = getPhotos();
    const nextIndex = navState.index + delta;
    if (nextIndex < 0 || nextIndex > photos.length - 1 || flipping) return;
    flipping = true;
    if (delta > 0) {
      fill(front, photos[navState.index] ?? null, navState.index + 1, photos.length);
      fill(back, photos[nextIndex] ?? null, nextIndex + 1, photos.length);
      sheet.style.transition = "none"; sheet.style.transform = "rotateY(0deg)"; void sheet.offsetWidth;
      sheet.style.transition = ""; sheet.style.transform = "rotateY(-180deg)";
    } else {
      fill(front, photos[nextIndex] ?? null, nextIndex + 1, photos.length);
      fill(back, photos[navState.index] ?? null, navState.index + 1, photos.length);
      sheet.style.transition = "none"; sheet.style.transform = "rotateY(-180deg)"; void sheet.offsetWidth;
      sheet.style.transition = ""; sheet.style.transform = "rotateY(0deg)";
    }
    timer(() => {
      navState.index = nextIndex;
      onChange?.();
      render();
      flipping = false;
    }, 720);
  }

  return { el: reader, open: openReader, close, go, render, isOpen: () => open };
}
