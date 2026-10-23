// Inventaire 2D des livres du meuble et lecteur de leur contenu (contrat `library`).
import { h } from "../lib/dom.js";

const COVERS = [
  ["#5a2a20", "#2b1510", "#c9a06a"],
  ["#24303a", "#101820", "#9fc0d6"],
  ["#2f3a2a", "#151d13", "#b7cf9a"],
  ["#453626", "#211a12", "#d6b98a"],
  ["#4a2038", "#210d18", "#d3a3bd"],
  ["#2a333c", "#12171c", "#a9c2d0"],
];

function coverIndex(book, index) {
  const source = typeof book?.id === "string" && book.id !== "" ? book.id : String(book?.title ?? index);
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) | 0;
  return Math.abs(hash) % COVERS.length;
}

function titleOf(book) {
  return typeof book?.title === "string" && book.title.trim() !== "" ? book.title.trim() : "Sans titre";
}

function coverStyle(coverEl, book, index) {
  const cover = COVERS[coverIndex(book, index)];
  coverEl.style.setProperty("--cover-a", cover[0]);
  coverEl.style.setProperty("--cover-b", cover[1]);
  coverEl.style.setProperty("--cover-ink", cover[2]);
}

export function createLibraryUI({ root, getBooks, resolveImage, onClose }) {
  const backLabel = h("button", { class: "bclose", text: "← Retour à la salle" });
  const heading = h("div", { class: "libraryheading", text: "Bibliothèque" });
  const grid = h("div", { class: "librarygrid" });
  const detail = h("div", { class: "librarydetail hidden" });
  const overlay = h("div", { class: "libraryov", "aria-hidden": "true" }, [
    h("div", { class: "librarybar" }, [backLabel, heading]),
    grid,
    detail,
  ]);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) onClose?.();
  });
  root.appendChild(overlay);

  let open = false;
  let selected = null;
  let pageIndex = 0;

  function pagesOf(book) {
    return Array.isArray(book?.pages)
      ? [...book.pages].sort((left, right) => (left?.index ?? 0) - (right?.index ?? 0))
      : [];
  }

  function renderGrid() {
    grid.classList.remove("hidden");
    detail.classList.add("hidden");
    backLabel.textContent = "← Retour à la salle";
    heading.textContent = "Bibliothèque";
    grid.replaceChildren();
    const books = getBooks();
    if (!Array.isArray(books) || books.length === 0) {
      grid.appendChild(h("div", { class: "libraryempty", text: "Aucun livre dans la bibliothèque pour le moment." }));
      return;
    }
    books.forEach((book, index) => {
      const title = titleOf(book);
      const coverEl = h("div", { class: "bookcover" }, [
        h("div", { class: "bookcover-rule" }),
        h("div", { class: "bookcover-title", text: title }),
        h("div", { class: "bookcover-rule" }),
      ]);
      coverStyle(coverEl, book, index);
      const pages = pagesOf(book).length;
      const card = h("button", { class: "bookcard", type: "button" }, [
        coverEl,
        h("div", { class: "bookmeta" }, [
          h("strong", { text: title }),
          h("span", { text: pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : "Livre" }),
        ]),
      ]);
      card.addEventListener("click", () => openBook(book));
      grid.appendChild(card);
    });
  }

  function renderDetail() {
    grid.classList.add("hidden");
    detail.classList.remove("hidden");
    backLabel.textContent = "← Bibliothèque";
    heading.textContent = titleOf(selected);
    detail.replaceChildren();
    const pages = pagesOf(selected);
    if (pages.length === 0) {
      detail.appendChild(h("div", { class: "libraryempty", text: "Ce livre n'a pas encore de page." }));
      return;
    }
    pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    const page = pages[pageIndex];
    const image = typeof page?.media_id === "string" ? resolveImage?.(page.media_id) : null;
    const picture = image ?? (typeof page?.image === "string" ? page.image : null);
    const leaf = h("div", { class: "librarypage" }, [
      h("div", { class: "librarypage-count", text: `${pageIndex + 1} / ${pages.length}` }),
      picture ? h("div", { class: "librarypage-photo" }, [h("img", { src: picture, alt: "" })]) : null,
      typeof page?.text === "string" && page.text !== ""
        ? h("div", { class: "librarypage-text", text: page.text })
        : null,
    ]);
    const prev = h("button", {
      class: "bnav prev",
      type: "button",
      "aria-label": "Page précédente",
      text: "‹",
    });
    const next = h("button", {
      class: "bnav next",
      type: "button",
      "aria-label": "Page suivante",
      text: "›",
    });
    prev.disabled = pageIndex <= 0;
    next.disabled = pageIndex >= pages.length - 1;
    prev.addEventListener("click", () => { pageIndex -= 1; renderDetail(); });
    next.addEventListener("click", () => { pageIndex += 1; renderDetail(); });
    detail.append(h("div", { class: "librarypage-wrap" }, [leaf]), h("div", { class: "librarypage-nav" }, [prev, next]));
  }

  function openBook(book) {
    selected = book;
    pageIndex = 0;
    renderDetail();
  }

  function back() {
    if (selected !== null) {
      selected = null;
      renderGrid();
      return;
    }
    onClose?.();
  }

  function paint() {
    if (selected !== null) renderDetail();
    else renderGrid();
  }

  function setOpen(next) {
    open = next;
    overlay.classList.toggle("open", open);
    overlay.setAttribute("aria-hidden", String(!open));
    if (open) {
      selected = null;
      pageIndex = 0;
      renderGrid();
    }
  }

  backLabel.addEventListener("click", () => back());

  return {
    el: overlay,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    back,
    paint,
  };
}
