// Boutons d'action PARTAGÉS « Discuter » + « Ouvrir album » (salle ET extérieur).
import { h, ICON_CHAT, ICON_BOOK, ICON_GALLERY } from "../lib/dom.js";

export function createActionButtons({ onDiscuss, onAlbum, onLibrary }) {
  return [
    h("button", { class: "action act-disc", type: "button", onclick: () => onDiscuss() }, [
      h("span", { class: "ico", html: ICON_CHAT }),
      h("span", { class: "lbl", text: "Discuter" }),
    ]),
    h("button", { class: "action act-album", type: "button", onclick: () => onAlbum() }, [
      h("span", { class: "ico", html: ICON_BOOK }),
      h("span", { class: "lbl", text: "Ouvrir album" }),
    ]),
    h("button", { class: "action act-library", type: "button", onclick: () => onLibrary?.() }, [
      h("span", { class: "ico", html: ICON_GALLERY }),
      h("span", { class: "lbl", text: "Médiathèque" }),
    ]),
  ];
}
