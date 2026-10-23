// Avatar TalkingHead (chargement, humeurs, gestes, boucle d'animation).
export function createAvatar({ THREE, TalkingHead, ASSET, DESK, scene, roomGroup, camera, renderer, onDiag, invalidate }) {
  let head = null;
  let object = null;
  let loading = false;
  let ready = false;
  let failed = false;
  let pending = null;
  let mood = "neutral";
  let hipsRest = null;
  const restPose = new Map();
  let ticks = 0;
  let animAcc = 0;
  const ANIM_STEP = 1 / 30;

  function tick(dt) {
    if (!head) return false;
    // Le personnage n'a pas besoin de 60/120 fps : 30 fps suffisent et allègent
    // fortement le skinning + la passe d'ombres sur les machines modestes.
    animAcc += dt;
    if (animAcc < ANIM_STEP) return false;
    const step = Math.min(animAcc, 0.1);
    animAcc = 0;
    try {
      head.animate(step * 1000);
      ticks++;
      // TalkingHead recolle l'avatar au sol en déplaçant Hips : on restaure la pose de repos
      // pour éviter toute dérive (montée progressive).
      if (hipsRest) {
        const hb = object && object.getObjectByName("Hips");
        if (hb) hb.position.copy(hipsRest);
      }
      return true;
    } catch { return false; }
  }

  function dispose() {
    head = null;
    object = null;
    hipsRest = null;
    restPose.clear();
    ticks = 0;
    animAcc = 0;
    ready = false;
    failed = false;
    pending = null;
  }

/** Initialise TalkingHead en mode avatarOnly (intégré à NOTRE scène 3D). */
function init() {
  if (pending) return pending;
  if (head) return Promise.resolve(ready);
  loading = true;
  try {
    onDiag("avatar: création instance…");
    head = new TalkingHead(document.createElement("div"), {
      avatarOnly: true,
      avatarOnlyCamera: camera,
      avatarMute: true,
      lipsyncModules: [],
    });

    onDiag("avatar: chargement du GLB…");
    pending = head.showAvatar({ url: ASSET("../assets/models/avatar.glb"), body: "F", avatarMood: "neutral", avatarIdleEyeContact: 0.9, avatarSpeakingEyeContact: 0.9 })
      .then(() => {
        const a = head.armature;
        onDiag("avatar: armature = " + (a ? "ok" : "ABSENTE"));
        if (!a) { failed = true; return false; }
        let n = 0; a.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) n++; });
        a.rotation.y = DESK.ry; // face à l'utilisateur (caméra de discussion)
        a.position.set(DESK.avatar[0], DESK.avatar[1] - 0.45, DESK.avatar[2]);
        a.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        roomGroup.add(a);
        object = a;
        const _hb = a.getObjectByName("Hips");
        hipsRest = _hb ? _hb.position.clone() : null;
        restPose.clear();
        a.traverse((n) => { if (n.isBone) restPose.set(n.name, n.quaternion.clone()); });
        try {
          if (new URLSearchParams(location.search).get("diag") === "1") {
            window.__onirtech = { THREE, scene: scene, camera: camera, renderer: renderer, avatar: a };
          }
        } catch { /* ignore */ }
        ready = true;
        invalidate();
        applyMood(mood);
        onDiag("avatar: AJOUTÉ (" + n + " meshes) pos=" + DESK.avatar.join(","));
        return true;
      })
      .catch((err) => {
        failed = true;
        onDiag("avatar: ÉCHEC chargement: " + (err && err.message ? err.message : err));
        return false;
      })
      .finally(() => { loading = false; });
    return pending;
  } catch (err) {
    head = null;
    failed = true;
    loading = false;
    onDiag("avatar: ERREUR " + (err && err.message ? err.message : err));
    return Promise.resolve(false);
  }
}

/** État du visiteur → humeur TalkingHead (`neutral` | `happy` | `sad`). */
function applyMood(next) {
  mood = next;
  const m = mood === "content" ? "happy" : mood === "triste" ? "sad" : "neutral";
  try { head?.setMood(m); } catch { /* dégradation gracieuse */ }
}

/** Geste du personnage (accompagne la réponse) — best-effort. */
function gesture(name) {
  try { head?.playGesture(name, 3); } catch { /* dégradation gracieuse */ }
}

  return {
    init, tick, setMood: applyMood, gesture, dispose,
    get head() { return head; },
    get object() { return object; },
    get restPose() { return restPose; },
    get ready() { return ready; },
    get failed() { return failed; },
    get pending() { return pending; },
    get hipsRest() { return hipsRest; },
    get ticks() { return ticks; },
    get mood() { return mood; },
  };
}
