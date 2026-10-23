// Actions EXTÉRIEURES : « Discuter » + « Ouvrir album » EMPILÉS, en HAUT À DROITE.
// Un clic n'agit pas directement : il ENTRE dans la maison (porte + travelling),
// puis la vue demandée s'ouvre (voir `#enterFromOutside` / `#goInterior`).
import { h } from "../lib/dom.js";
import { createActionButtons } from "./action-buttons.js";

export function createOutsideActions({ root, onDiscuss, onAlbum, onLibrary }) {
  const el = h("div", { class: "outside-actions" }, createActionButtons({ onDiscuss, onAlbum, onLibrary }));
  root.append(el);
  return {
    el,
    setVisible(visible) { el.classList.toggle("show", visible); },
  };
}
