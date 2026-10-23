// Machine à états de navigation du template immersive (pure, sans DOM/host).

export const DEFAULT_STATE = {
  phase: "boot",          // boot | identity | chat (piloté par le host)
  scene: "outside",       // outside | entering | room | discussion | book
  overlay: "none",        // none | identity | book | reader
  overlayPrev: "none",
  door: "closed",         // closed | opening | open
  entered: false,         // ex-#enteredRoom
  exited: false,          // ex-#exited
  interiorPending: false, // ex-#pendingInterior (seuil z < 3.4)
  bookPending: false,     // ex-#pendingBook (attente fin caméra)
  booktest: false,        // ?booktest=1 (mode dev)
  readerIndex: 0,         // index partagé livre/lecteur
};

export function createMachine(initial = {}) {
  let state = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set();

  function commit(patch) {
    const next = { ...state, ...patch };
    if (next.overlay !== state.overlay) next.overlayPrev = state.overlay;
    state = next;
    for (const fn of listeners) fn(state);
    return state;
  }

  function send(type, payload = {}) {
    switch (type) {
      case "HOST_PHASE": {
        if (payload.phase === "identity" || payload.phase === "chat") commit({ phase: payload.phase });
        break;
      }
      case "SHOW_IDENTITY":
        commit({ overlay: "identity", scene: "outside", entered: false });
        break;
      case "SUBMIT_IDENTITY":
      case "AUTO_ENTER":
        commit({ overlay: "none", scene: "entering", door: "opening", entered: false, exited: false });
        break;
      case "DOOR_OPENED":
        commit({ scene: "entering", door: "open", entered: true, interiorPending: true });
        break;
      case "INTERIOR_READY":
        commit({ scene: "room", door: "closed", entered: true, interiorPending: false, exited: false });
        break;
      case "ENTER_ROOM_INSTANT":
        commit({ scene: "room", door: "closed", entered: true, interiorPending: false, exited: false, overlay: "none" });
        break;
      case "OPEN_DISCUSSION":
        commit({ scene: "discussion", phase: "chat", entered: true, overlay: "none" });
        break;
      case "CLOSE_DISCUSSION":
        commit({ scene: "room" });
        break;
      case "REQUEST_BOOK":
        if (state.entered) commit({ scene: "book", bookPending: true, overlay: "none" });
        break;
      case "BOOK_OPENED":
        if (state.scene === "book") commit({ bookPending: false, overlay: "book" });
        break;
      case "OPEN_BOOK_DEV":
        // Mode dev : `scene` reste `room` (compat 4.24.x), seul l'overlay s'ouvre.
        commit({ overlay: "book", booktest: true });
        break;
      case "CLOSE_BOOK":
        commit({ scene: "room", bookPending: false, overlay: "none" });
        break;
      case "OPEN_READER":
        if (state.overlay === "book") commit({ overlay: "reader" });
        break;
      case "CLOSE_READER":
        if (state.overlay === "reader") commit({ overlay: "book" });
        break;
      case "EXIT_OUTSIDE":
        commit({ scene: "outside", entered: false, exited: true, overlay: "none", bookPending: false, interiorPending: false });
        break;
      case "ENTER_FROM_OUTSIDE":
        commit({ scene: "entering", door: "opening", entered: false, exited: false });
        break;
      case "TEARDOWN":
        commit({ ...DEFAULT_STATE, booktest: state.booktest });
        break;
      default:
        break;
    }
    return state;
  }

  return {
    send,
    get: () => state,
    snapshot: () => ({ ...state }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** Invariants du §6 — retourne la liste des violations (vide = conforme). */
export function checkInvariants(state) {
  const violations = [];
  if (state.overlay === "reader" && state.overlayPrev !== "book") violations.push("reader sans livre");
  if (state.scene === "discussion" && (state.phase !== "chat" || !state.entered)) violations.push("discussion hors chat/entrée");
  if (state.scene === "book" && !state.entered) violations.push("livre sans entrée");
  if (state.scene === "book" && state.overlay === "book" && state.bookPending) violations.push("livre ouvert pendant attente caméra");
  if (state.overlay === "book" && !state.booktest && (state.scene !== "book" || state.bookPending)) {
    violations.push("overlay livre hors scène livre");
  }
  if (state.overlay === "identity" && (state.scene !== "outside" || state.entered)) violations.push("sas hors extérieur");
  if (state.scene === "outside" && state.entered) violations.push("extérieur avec entered");
  if (state.scene === "room" && !state.entered) violations.push("salle sans entered");
  return violations;
}
