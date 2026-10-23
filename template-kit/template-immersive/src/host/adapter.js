// Frontière unique avec l'hôte `onirtech.template-host.v1`.
// Aucun autre module ne lit `ctx` directement.

/** Titre de l'album — variable `titre_de_livre`, repli marque puis « Album » (ADR-0023). */
function bookTitle(ctx) {
  const value = ctx?.params?.titre_de_livre;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return ctx?.brand?.name || "Album";
}

export function createHostAdapter(ctx) {
  const raw = ctx?.actions ?? {};
  const call = (name) => (...args) => (typeof raw[name] === "function" ? raw[name](...args) : undefined);
  const capabilities = new Set(Array.isArray(ctx?.capabilities) ? ctx.capabilities : []);

  return {
    phase: ctx?.state?.phase ?? "identity",
    messages: ctx?.state?.messages ?? [],
    photos: ctx?.resources?.media?.photos ?? [],
    liens: ctx?.resources?.media?.liens ?? [],
    consent: ctx?.consent ?? null,
    brand: ctx?.brand ?? null,
    params: ctx?.params ?? {},
    data: ctx?.data ?? null,
    title: bookTitle(ctx),
    capabilities,
    has(cap) { return capabilities.has(cap); },
    actions: {
      submitIdentity: call("submitIdentity"),
      sendMessage: call("sendMessage"),
      finish: call("finish"),
      openMedia: call("openMedia"),
      request: call("request"),
      resize: call("resize"),
      ready: call("ready"),
    },
  };
}
