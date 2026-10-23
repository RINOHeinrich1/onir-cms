// Template « Immersive » v4.26.0 — SAS D'ENTRÉE 3D RÉALISTE (maison PBR + HDRI, porte qui
// s'ouvre) + SALLE 3D PBR + PERSONNAGE 3D RIGGÉ/ANIMÉ (FBX) + LIVRE 2D + DISCUSSION.
//
// • Assets 3D **embarqués CC0** (aucun réseau au runtime) :
//   - HDRI Poly Haven : `kloppenheim_06_puresky_512.hdr` (ciel/extérieur) +
//     `brown_photostudio_02_512.hdr` (intérieur, PMREMGenerator).
//   - Textures PBR ambientCG (brique/enduit/tuiles/bois/parquet/pierre) :
//     map / normalMap / roughnessMap / aoMap → `MeshStandardMaterial`.
//   - Personnage 3D via **TalkingHead** (MIT) : avatar `brunette-t.glb`
//     (Ready Player Me, **CC BY-NC** → usage NON commercial), humeurs + gestes.
// • SAS (phase `identity`) : la MAISON 3D est **en fond**, le FORMULAIRE est un
//   overlay **centré à l'écran** (jamais sous la maison). À la soumission la maison
//   **passe devant**, la **porte s'ouvre** (animation), puis on **entre dans la
//   SALLE** : **livre FERMÉ** (barre d'actions « Discuter » / « Ouvrir album »,
//   ou CLIC direct sur le pupitre).
//   Identité déjà connue (phase `chat` au chargement) → **sas SAUTÉ**, salle directe.
// • Vue salle : pièce PBR (parquet, murs, plafond), pupitre + livre — en 3D.
// • Scène « discussion » : la salle pivote ; le PERSONNAGE 3D (TalkingHead, muet)
//   reflète l'humeur du visiteur (setMood + gestes) ; tableau + dialogue en overlay.
//
// Contrat `onirtech.template-host.v1`. Lib embarquée (hors-ligne) : Three.js (MIT).

import * as THREE from "../vendor/immersive.js";
import { TalkingHead } from "../vendor/immersive.js";

import {
  ASSET, TEX_MAPS, TEX_TILE, SUN_DIR, ENTRY_DOOR_MS, FORM_FADE_MS, HOLD_OPEN_MS, ARRIVAL_OPEN_MS,
  IN_ROOM, OUT, DESK, DISC_CAM, OUTSIDE_FOG, TEMPLATE_VERSION,
} from "./constants.js";
import { STYLE } from "./styles.js";
import { h, ICON_CHAT, ICON_BOOK } from "./lib/dom.js";
import { easeInOut } from "./lib/math.js";
import { moodFromUserState } from "./lib/mood.js";
import { mdToHtml } from "./lib/markdown.js";
import { paginate } from "./lib/book-layout.js";
import { makeCoverCanvas, makeCoverTexture } from "./lib/cover.js";
import { withAO, uvPlane, uvBox, uvScale } from "./scene/geometry.js";
import { createMaterials } from "./scene/materials.js";
import { loadEnvironments } from "./scene/environment.js";
import { createRenderer } from "./scene/renderer.js";
import { createLights } from "./scene/lights.js";
import { buildRoom } from "./scene/room.js";
import { buildLectern } from "./scene/lectern.js";
import { buildBookMesh } from "./scene/book-mesh.js";
import { buildHouse } from "./scene/house.js";
import { buildEnclosure } from "./scene/enclosure.js";
import { paintDecoBoard } from "./scene/desk-deco.js";
import { buildDeskScene } from "./scene/desk.js";
import { createAvatar } from "./scene/avatar.js";
import { detectQuality } from "./scene/quality.js";
import { createCameraRig } from "./camera/rig.js";
import { bindOrbitInput } from "./camera/input.js";
import { bindPicking } from "./interaction/picking.js";
import { createRoomRotation } from "./scene/room-rotation.js";
import { createDebugOverlay } from "./debug/overlay.js";
import { createHostAdapter } from "./host/adapter.js";
import { createEntryUI } from "./ui/entry.js";
import { createBoardUI } from "./ui/board.js";
import { createDiscussionUI } from "./ui/discussion.js";
import { createOutsideActions } from "./ui/outside-actions.js";
import { roomActionsVisible, outsideActionsVisible } from "./lib/actions-visibility.js";
import { createBookUI } from "./ui/book.js";
import { createLibraryUI } from "./ui/library.js";
import { createReaderUI } from "./ui/reader.js";
import { createMachine, checkInvariants } from "./state/machine.js";
import { createLifecycle } from "./lifecycle.js";
import { disposeObject3D, disposeEnvironment, disposeRenderer } from "./scene/dispose.js";
import { isValidEmail, identityKey, loadIdentity, saveIdentity, clearIdentity } from "./lib/identity.js";

const ELEMENT = "onirtech-template-immersive";


/** Mesure de texte hors DOM (même police/largeur que le rendu). */
const __bookCtx = (() => { let c = null; return () => (c || (c = document.createElement("canvas").getContext("2d"))); })();

class ImmersiveTemplate extends HTMLElement {
  #root; #ctx; #host = null; #materials = null; #lifecycle = null;
  // 3D
  #renderer; #scene; #camera; #last = 0; #running = false; #paused = false; #canvas; #stage; #lecternTop;
  #roomGroup; #houseGroup; #doorPivot; #houseGround; #sun; #lamp; #spot; #lecternGroup; #setShadowExtent;
  #roomRotation = null; #deskObj = null; #chairObj = null; #bookMesh = null; #debug = null;
  #rig = null;
  // qualité / perf
  #quality = "high"; #needsRender = true;
  #onResize; #vvBound = false;
  // assets
  #env = null;
  #assetsReady = false;
  #texManager = null;
  #boot = null; #preparing = false; #prepared = false;
  #loadingStep = null;
  // état
  #ready = false; #bootAt = 0; #renderCount = 0; #title = "Album";
  #renderedPhase; #machine = null;
  // sas d'entrée
  #entryUI = null;
  #entryShown = false; #entrySubmitAt = 0; #sending = false; #entryAuto = false;
  #entryAnim = false; #entryT = 0; #entryDur = ENTRY_DOOR_MS / 1000;
  #fadeEl;
  // livre 2D / lecteur
  #bookUI = null; #readerUI = null; #libraryUI = null; #coverMat = null; #navState = { index: 0, anchor: null };
  #shelfGroup = null;
  #library = null; #libraryRequested = false;
  #album = null; #albumState = "idle"; #albumRequested = false;
  // personnage 3D (TalkingHead)
  #avatar = null;
  // discussion
  #discussionUI = null; #boardUI = null; #msgs = []; #discCount = -1; #msgIdx = -1;
  // actions EXTÉRIEURES (colonne haut-droite) + action demandée avant l'entrée
  #outsideUI = null; #pendingEnter = null;
  #deskGroup; #board3D; #boardCanvas; #boardCtx; #boardTex;
  #hint; #loading; #bootTimer = 0;
  #diagEl; #diagText = "";

  constructor() { super(); this.#root = this.attachShadow({ mode: "open" }); }

  set onirtechContext(ctx) {
    this.#ctx = ctx;
    this.#host = createHostAdapter(ctx);
    if (!this.#renderer) this.#build();
    this.#title = this.#bookTitle();
    this.#bookMesh?.setTitle(this.#title); // le livre peut être construit avant le contexte
    this.#sync();
    this.#updateUI();
    this.#paint();
  }
  get onirtechContext() { return this.#ctx; }

  connectedCallback() { if (!this.#renderer) this.#build(); this.#start(); }
  disconnectedCallback() { this.#stop(); this.#teardown(); }

  /** Démontage complet : listeners, timers, avatar, debug, GPU, DOM, état. */
  #teardown() {
    this.#stop();
    this.#lifecycle?.dispose();
    this.#avatar?.dispose();
    this.#debug?.dispose();
    disposeObject3D(this.#scene);
    disposeEnvironment(this.#env);
    disposeRenderer(this.#renderer);
    this.#root.replaceChildren();

    this.#renderer = null; this.#scene = null; this.#camera = null; this.#canvas = null; this.#stage = null;
    this.#lecternTop = null; this.#lecternGroup = null; this.#roomGroup = null; this.#houseGroup = null;
    this.#doorPivot = null; this.#houseGround = null; this.#sun = null; this.#lamp = null; this.#spot = null;
    this.#deskObj = null; this.#chairObj = null; this.#bookMesh = null; this.#coverMat = null;
    this.#materials = null; this.#env = null; this.#rig = null; this.#roomRotation = null; this.#avatar = null;
    this.#texManager = null; this.#boot = null; this.#preparing = false; this.#prepared = false; this.#loadingStep = null; this.#bootTimer = 0;
    this.#debug = null; this.#bookUI = null; this.#readerUI = null; this.#libraryUI = null; this.#entryUI = null;
    this.#shelfGroup = null;
    this.#discussionUI = null; this.#boardUI = null; this.#outsideUI = null;
    this.#machine = null; this.#lifecycle = null;
    this.#hint = null; this.#fadeEl = null; this.#loading = null;
    this.#boardCanvas = null; this.#boardCtx = null; this.#boardTex = null; this.#board3D = null; this.#deskGroup = null;

    this.#ready = false; this.#bootAt = 0; this.#renderCount = 0; this.#sending = false;
    this.#entryShown = false; this.#entryAuto = false; this.#entryAnim = false; this.#entryT = 0;
    this.#entryDur = ENTRY_DOOR_MS / 1000; this.#entrySubmitAt = 0; this.#renderedPhase = undefined;
    this.#title = "Album"; this.#quality = "high"; this.#assetsReady = false; this.#vvBound = false;
    this.#navState = { index: 0, anchor: null }; this.#msgs = []; this.#discCount = -1; this.#msgIdx = -1;
    this.#pendingEnter = null;
    this.#paused = false; this.#last = 0;
  }

  #photos() { return this.#host?.photos ?? []; }

  /** Charge la bibliothèque déclarée (ADR-0026) une seule fois ; repli médiathèque. */
  #maybeLoadLibrary() {
    if (this.#libraryRequested || this.#host?.data == null || this.#host?.has?.("data") !== true) return;
    this.#libraryRequested = true;
    void this.#host.data
      .load("library")
      .then((result) => {
        if (result?.status !== "ok") return;
        const books = result.data?.books;
        if (!Array.isArray(books) || books.length === 0) return;
        this.#library = books;
        this.#libraryUI?.paint();
        this.#needsRender = true;
      })
      .catch(() => { /* repli silencieux sur la médiathèque */ });
  }

  #refreshBookContent() {
    if (this.#bookUI?.isOpen?.()) {
      this.#bookUI.paginate();
      this.#bookUI.refreshCover();
    }
    this.#paint();
  }

  /** Charge l'album dédié (contrat `album`) une seule fois ; repli médiathèque. */
  #maybeLoadAlbum() {
    if (this.#albumRequested || this.#host?.data == null || this.#host?.has?.("data") !== true) return;
    this.#albumRequested = true;
    this.#albumState = "loading";
    void this.#host.data
      .load("album")
      .then((result) => {
        if (result?.status !== "ok") { this.#albumState = "unavailable"; this.#refreshBookContent(); return; }
        const pages = result.data?.pages;
        if (!Array.isArray(pages)) { this.#albumState = "unavailable"; this.#refreshBookContent(); return; }
        this.#album = {
          title: typeof result.data?.title === "string" ? result.data.title : "",
          pages,
        };
        this.#albumState = "ready";
        this.#title = this.#bookTitle();
        this.#bookMesh?.setTitle(this.#title);
        this.#needsRender = true;
        this.#refreshBookContent();
      })
      .catch(() => { this.#albumState = "unavailable"; this.#refreshBookContent(); /* repli média */ });
  }

  /** Ouvre l'inventaire des livres du meuble (contrat `library`). */
  #openLibrary() {
    this.#maybeLoadLibrary();
    this.#libraryUI?.open();
  }

  /** Titre de l'album — variable déclarée par le template (ADR-0023). */
  #bookTitle() {
    if (this.#albumState === "ready") {
      const title = this.#album?.title;
      if (typeof title === "string" && title.trim() !== "") return title.trim();
    }
    return this.#host?.title ?? "Album";
  }

  /** Diagnostic (désactivé en production). */
  #diag(_s) { /* no-op */ }

  #nav() { return this.#machine.get(); }
  #sceneView() {
    const scene = this.#nav().scene;
    return scene === "book" ? "book" : scene === "discussion" ? "discussion" : "room";
  }

  /** Texture PBR en cache (délégué à `scene/materials.js`). */
  #texGet(file, srgb) { return this.#materials.texGet(file, srgb); }
  /** Matériau PBR (délégué à `scene/materials.js`). */
  #mkPBR(name, opts) { return this.#materials.mkPBR(name, opts); }

  // ---- Construction --------------------------------------------------------

  #build() {
    this.#bootAt = performance.now();
    this.#boot = { textures: false, env: false, avatar: false, prepared: false };
    this.#machine = createMachine({ booktest: new URLSearchParams(location.search).get("booktest") === "1" });
    this.#lifecycle = createLifecycle();
    this.#root.replaceChildren(h("style", { text: STYLE }));
    this.#stage = h("div", { class: "stage" });
    this.#stage.style.visibility = "hidden";
    this.#hint = h("div", { class: "hint hidden", text: "Cliquez sur le pupitre pour ouvrir le livre" });
    this.#fadeEl = h("div", { class: "fade" });
    // Le loading est posé AVANT Three.js : aucun écran blanc, même si le GPU met du temps.
    this.#loading = h("div", { class: "loading show", role: "status", "aria-live": "polite" }, [
      h("div", { class: "page" }, [
        h("div", { class: "spinner" }),
        h("div", { text: "Chargement…" }),
        this.#loadingStep = h("div", { class: "loading-step", text: "Préparation de la scène…" }),
      ]),
    ]);
    this.#root.append(this.#stage, this.#hint, this.#fadeEl, this.#loading);

    if (new URLSearchParams(location.search).get("booktest") === "1") {
      this.#lifecycle.timer(() => { this.#openBookOverlay(); }, 2500);
    }
    this.#initThree();
    this.#bindPointer();
    this.#bindOrbit();
    this.#buildBook();
    this.#buildReader();
    this.#buildLibrary();
    this.#buildEntry();
    this.#buildDiscussion();
    this.#buildOutsideActions();

    this.#onResize = () => this.#resize();
    this.#lifecycle.on(window, "resize", this.#onResize);
    this.#lifecycle.on(window, "orientationchange", this.#onResize);
    this.#lifecycle.on(window, "keydown", (e) => this.#onKey(e));
    this.#lifecycle.on(document, "visibilitychange", () => {
      if (document.hidden) {
        this.#paused = true;
        this.#lifecycle.cancelRaf();
      } else {
        this.#paused = false;
        this.#last = performance.now();
        if (this.#running) this.#loop();
      }
    });
    this.#bindViewport();
    this.#resize();
    this.#rig.apply(true);
    this.#loadAssets();
    // Le personnage fait partie du boot : plus de chargement/compilation au moment d'entrer.
    if (this.#quality !== "low") this.#initAvatar();
    else this.#markAvatarReady(false);
    // Secours si un asset ne répond jamais : on révèle ce qui est prêt, sans attendre indéfiniment.
    this.#bootTimer = this.#lifecycle.timer(() => {
      if (this.#prepared || this.#ready) return;
      this.#diag("boot: timeout, préparation forcée");
      this.#boot.textures = true;
      this.#boot.env = true;
      this.#markAvatarReady(false);
      this.#prepareScene();
    }, 20000);
    this.#updateBootProgress();
    this.#diag(`bundle v${TEMPLATE_VERSION} · chargé`);
  }

  /** Palier de qualité (`low` = mobile / bas de gamme) — délégué à `scene/quality.js`. */
  #detectQuality() {
    this.#quality = detectQuality({
      matchMedia: window.matchMedia ? window.matchMedia.bind(window) : undefined,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    });
    return this.#quality;
  }

  #initThree() {
    const low = this.#detectQuality() === "low";
    // Un seul LoadingManager pour toutes les textures : le boot attend un vrai onLoad.
    this.#texManager = new THREE.LoadingManager();
    this.#texManager.onProgress = () => this.#updateBootProgress();
    this.#texManager.onLoad = () => {
      this.#boot.textures = true;
      this.#updateBootProgress();
      this.#prepareScene();
    };
    this.#texManager.onError = () => { this.#updateBootProgress(); };
    this.#materials = createMaterials({ THREE, ASSET, invalidate: () => this.#invalidate(), manager: this.#texManager });
    const { renderer, scene, camera, canvas } = createRenderer({ THREE, quality: this.#quality });
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;
    this.#canvas = canvas;
    this.#stage.appendChild(this.#canvas);

    // Groupe unitaire de la SALLE (rotation immersive vers la discussion).
    this.#roomGroup = new THREE.Group();
    this.#scene.add(this.#roomGroup);
    this.#roomRotation = createRoomRotation({ roomGroup: this.#roomGroup });

    const lights = createLights({ THREE, low, scene: this.#scene });
    this.#sun = lights.sun;
    this.#spot = lights.spot;
    this.#lamp = lights.lamp;
    this.#setShadowExtent = lights.setShadowExtent;

    this.#buildRoom();
    this.#buildLectern();
    this.#buildBookMesh();
    this.#buildHouse();
    this.#buildDeskScene();
    this.#avatar = createAvatar({
      THREE, TalkingHead, ASSET, DESK, scene: this.#scene, roomGroup: this.#roomGroup,
      camera: this.#camera, renderer: this.#renderer,
      onDiag: (m) => this.#diag(m), invalidate: () => this.#invalidate(),
    });

    // Brume extérieure dès le sas (la salle pose sa propre brume à l'entrée).
    this.#scene.fog = new THREE.Fog(OUTSIDE_FOG.color, OUTSIDE_FOG.near, OUTSIDE_FOG.far);

    // Rig caméra + caméra initiale : devant la porte (sas).
    this.#rig = createCameraRig({ THREE, camera: this.#camera, IN_ROOM });
    this.#rig.setCam([0, 2.0, 9.6], [0, 1.7, 3.5], 0.01);
  }

  #buildRoom() {
    const { group, shelf } = buildRoom({
      THREE, mkPBR: (n, o) => this.#mkPBR(n, o), texGet: (f, s) => this.#texGet(f, s),
      withAO, uvPlane, uvBox, uvScale, TEX_TILE, onDiag: (m) => this.#diag(m),
    });
    this.#roomGroup.add(group);
    this.#shelfGroup = shelf;
  }

  #buildLectern() {
    const { group, top } = buildLectern({ THREE, mkPBR: (n, o) => this.#mkPBR(n, o), uvBox, TEX_TILE });
    this.#roomGroup.add(group);
    this.#lecternGroup = group;
    this.#lecternTop = top;
  }

  #buildBookMesh() {
    const book = buildBookMesh({
      THREE, lecternTop: this.#lecternTop, makeCoverTexture, title: this.#bookTitle(),
    });
    this.#coverMat = book.coverMat;
    this.#bookMesh = book;
  }

  #buildHouse() {
    const house = buildHouse({
      THREE, mkPBR: (n, o) => this.#mkPBR(n, o), texGet: (f, s) => this.#texGet(f, s),
      withAO, uvBox, uvScale, TEX_TILE, scene: this.#scene,
    });
    this.#houseGroup = house.group;
    this.#doorPivot = house.doorPivot;
    this.#houseGround = house.ground;

    const enclosure = buildEnclosure({
      THREE, ASSET, mkPBR: (n, o) => this.#mkPBR(n, o), TEX_TILE, withAO, uvBox,
      onDiag: (m) => this.#diag(m), invalidate: () => this.#invalidate(),
    });
    this.#houseGroup.add(enclosure.group);
  }

  #buildDeskScene() {
    const desk = buildDeskScene({
      THREE, ASSET, DESK, TEX_TILE, mkPBR: (n, o) => this.#mkPBR(n, o), uvBox,
      invalidate: () => this.#invalidate(),
      onPlace: (id, object) => {
        if (id === "desk") this.#deskObj = object;
        if (id === "chair") this.#chairObj = object;
      },
      drawDecoBoard: ({ canvas, ctx, tex }) => this.#drawDecoBoard(canvas, ctx, tex),
    });
    this.#roomGroup.add(desk.group);
    this.#deskGroup = desk.group;
    this.#boardCanvas = desk.boardCanvas;
    this.#boardCtx = desk.boardCtx;
    this.#boardTex = desk.boardTex;
    this.#board3D = desk.board3D;
  }

  #loadAssets() {
    this.#env = loadEnvironments({
      THREE, ASSET, renderer: this.#renderer, scene: this.#scene,
      isInterior: () => this.#nav().entered,
      invalidate: () => this.#invalidate(),
      onLoaded: () => {
        this.#assetsReady = true;
        this.#boot.env = true;
        this.#updateBootProgress();
        this.#prepareScene();
      },
      onProgress: () => this.#updateBootProgress(),
    });
  }

  // ---- Personnage 3D (TalkingHead) ----------------------------------------

  /** Initialise TalkingHead et remonte l'état au boot (promesse réellement attendue). */
  #initAvatar() {
    if (!this.#avatar) { this.#markAvatarReady(false); return; }
    const pending = this.#avatar.init();
    if (pending && typeof pending.then === "function") {
      pending.then(() => this.#markAvatarReady(true)).catch(() => this.#markAvatarReady(false));
    } else {
      this.#markAvatarReady(this.#avatar.ready === true);
    }
  }

  #markAvatarReady(ok) {
    if (!this.#boot) return;
    this.#boot.avatar = true;
    this.#updateBootProgress();
    this.#prepareScene();
  }

  /** Avancement réel du boot (textures → environnement → personnage → compilation). */
  #updateBootProgress() {
    if (!this.#boot || !this.#loadingStep) return;
    const pct = this.#boot.prepared ? 100
      : 10 + (this.#boot.textures ? 35 : 0) + (this.#boot.env ? 20 : 0) + (this.#boot.avatar ? 15 : 0) + (this.#preparing ? 10 : 0);
    let label = "Préparation de la scène…";
    if (!this.#boot.textures) label = "Préparation des textures…";
    else if (!this.#boot.env) label = "Préparation de la lumière…";
    else if (!this.#boot.avatar) label = "Préparation du personnage…";
    else if (!this.#prepared) label = "Compilation des shaders…";
    else label = "Ouverture…";
    this.#loadingStep.textContent = `${label} ${Math.min(pct, 99)} %`;
  }

  /** Attend que TOUT soit prêt (textures, HDR/PMREM, avatar) avant de compiler. */
  async #prepareScene() {
    if (!this.#boot || this.#preparing || this.#prepared || this.#ready) return;
    if (!this.#boot.textures || !this.#boot.env || !this.#boot.avatar) return;
    this.#preparing = true;
    this.#updateBootProgress();
    this.#bootTimer = 0;
    try {
      await this.#yieldFrame();
      // Préchauffe l'extérieur puis l'intérieur : le passage de porte ne compile plus rien.
      if (!this.#nav().entered) await this.#warmScene(false);
      await this.#warmScene(true);
      await this.#yieldFrame();
      this.#prepared = true;
      this.#boot.prepared = true;
      this.#updateBootProgress();
      this.#setReady();
    } catch (err) {
      this.#diag("boot: préparation échouée " + (err && err.message ? err.message : err));
      this.#prepared = true;
      this.#setReady();
    } finally {
      this.#preparing = false;
    }
  }

  #yieldFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  #capturePreviewState() {
    const cam = this.#sun?.shadow?.camera;
    return {
      room: this.#roomGroup?.visible,
      house: this.#houseGroup?.visible,
      ground: this.#houseGround?.visible,
      door: this.#doorPivot?.rotation.y,
      fog: this.#scene?.fog,
      background: this.#scene?.background,
      environment: this.#scene?.environment,
      environmentIntensity: this.#scene?.environmentIntensity,
      sun: this.#sun?.intensity,
      spot: this.#spot?.intensity,
      spotShadow: this.#spot?.castShadow,
      lamp: this.#lamp?.intensity,
      shadow: cam ? { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom } : null,
      pos: this.#camera?.position.clone(),
      quat: this.#camera?.quaternion.clone(),
    };
  }

  #restorePreviewState(s) {
    if (!s) return;
    if (this.#roomGroup) this.#roomGroup.visible = s.room;
    if (this.#houseGroup) this.#houseGroup.visible = s.house;
    if (this.#houseGround) this.#houseGround.visible = s.ground;
    if (this.#doorPivot) this.#doorPivot.rotation.y = s.door;
    if (this.#scene) { this.#scene.fog = s.fog; this.#scene.background = s.background; this.#scene.environment = s.environment; this.#scene.environmentIntensity = s.environmentIntensity; }
    if (this.#sun) this.#sun.intensity = s.sun;
    if (this.#spot) { this.#spot.intensity = s.spot; this.#spot.castShadow = s.spotShadow; }
    if (this.#lamp) this.#lamp.intensity = s.lamp;
    const cam = this.#sun?.shadow?.camera;
    if (cam && s.shadow) {
      cam.left = s.shadow.left; cam.right = s.shadow.right; cam.top = s.shadow.top; cam.bottom = s.shadow.bottom;
      cam.updateProjectionMatrix();
    }
    if (this.#camera && s.pos) {
      this.#camera.position.copy(s.pos);
      if (s.quat) this.#camera.quaternion.copy(s.quat);
      this.#camera.updateMatrixWorld();
    }
    if (this.#renderer) this.#renderer.shadowMap.needsUpdate = true;
    this.#needsRender = true;
  }

  /** Rendu de préchauffage hors écran (le loading opaque couvre le canvas). */
  async #warmScene(interior) {
    if (!this.#renderer || !this.#scene || !this.#camera) return;
    const saved = this.#capturePreviewState();
    if (interior) {
      if (this.#roomGroup) this.#roomGroup.visible = true;
      if (this.#doorPivot) this.#doorPivot.rotation.y = 0;
      if (this.#houseGroup) this.#houseGroup.visible = false;
      if (this.#houseGround) this.#houseGround.visible = false;
      this.#scene.fog = new THREE.Fog("#1c150c", 9, 30);
      this.#scene.background = this.#env?.skyTex || new THREE.Color("#8fb6dd");
      if (this.#env?.interiorEnv) this.#scene.environment = this.#env.interiorEnv;
      this.#scene.environmentIntensity = 0.55;
      if (this.#sun) this.#sun.intensity = 1.15;
      if (this.#spot) { this.#spot.intensity = 26; this.#spot.castShadow = this.#quality !== "low"; }
      if (this.#lamp) this.#lamp.intensity = 4.5;
      this.#setShadowExtent?.(8);
      this.#camera.position.set(IN_ROOM.pos[0], IN_ROOM.pos[1], IN_ROOM.pos[2]);
      this.#camera.lookAt(IN_ROOM.tgt[0], IN_ROOM.tgt[1], IN_ROOM.tgt[2]);
      this.#camera.updateMatrixWorld();
    }
    const compile = this.#renderer.compileAsync
      ? this.#renderer.compileAsync(this.#scene, this.#camera)
      : Promise.resolve(this.#renderer.compile(this.#scene, this.#camera));
    try { await compile; } catch { /* le rendu ci-dessous reste le filet de sécurité */ }
    try {
      this.#renderer.shadowMap.needsUpdate = true;
      this.#renderer.render(this.#scene, this.#camera);
      this.#renderer.render(this.#scene, this.#camera);
    } catch { /* contexte perdu : on laisse le fallback */ }
    this.#restorePreviewState(saved);
  }

  /** Humeur du personnage (délégué à `scene/avatar.js`). */
  #applyMood(mood) { this.#avatar?.setMood(mood); }

  /** Geste du personnage (délégué à `scene/avatar.js`). */
  #gesture(name) { this.#avatar?.gesture(name); }

  // ---- LIVRE 2D ------------------------------------------------------------

  #buildBook() {
    this.#bookUI = createBookUI({
      root: this.#root,
      getEntries: () => this.#entries(),
      getTitle: () => this.#title,
      navState: this.#navState,
      measure: __bookCtx,
      onExit: () => this.#exitBook(),
      onOpen: () => { this.#syncLayoutMode(); },
      onOpenReader: () => this.#openReader(),
      timer: (fn, ms) => this.#lifecycle.timer(fn, ms),
    });
  }

  #buildLibrary() {
    this.#libraryUI = createLibraryUI({
      root: this.#root,
      getBooks: () => (Array.isArray(this.#library) ? this.#library : []),
      resolveImage: (mediaId) => this.#photos().find((photo) => photo.id === mediaId)?.url ?? null,
      onClose: () => this.#libraryUI?.close(),
    });
  }

  #buildReader() {
    this.#readerUI = createReaderUI({
      root: this.#root,
      getPhotos: () => this.#photos(),
      navState: this.#navState,
      onChange: () => this.#bookUI?.paint(),
      timer: (fn, ms) => this.#lifecycle.timer(fn, ms),
    });
  }

  // ---- SAS D'ENTRÉE --------------------------------------------------------

  #buildEntry() {
    this.#entryUI = createEntryUI({ root: this.#root, onSubmit: (e) => this.#submitEntry(e) });
  }

  #renderEntryForm() { this.#entryUI?.render(this.#host); }

  #entryValid() { return this.#entryUI?.isValid() ?? false; }
  #refreshEntryButton() { this.#entryUI?.refresh(); }

  #submitEntry(e) {
    e.preventDefault();
    if (this.#sending || !this.#entryValid()) return;
    const submit = this.#host?.actions?.submitIdentity;
    if (typeof submit !== "function") return;
    this.#sending = true;
    this.#entrySubmitAt = performance.now();
    this.#machine.send("SUBMIT_IDENTITY");
    this.#roomGroup.visible = true; // la salle apparaît dès l'ouverture de la baie
    this.#entryDur = ENTRY_DOOR_MS / 1000;
    this.#entryUI.setSending(true);
    // 1) On fait DISPARAÎTRE le formulaire d'abord…
    this.#entryUI.hide();
    // 2) …puis, une fois disparu, on déclenche l'ouverture de la porte.
    this.#lifecycle.timer(() => { this.#entryAnim = true; this.#entryT = 0; }, FORM_FADE_MS);
    const payload = this.#entryUI.values();
    this.#saveIdentity(payload);
    submit(payload);
  }

  // ---- Identité mémorisée (localStorage, par lien) --------------------------

  #identityKey() { return identityKey(location.pathname); }
  #loadIdentity() { return loadIdentity(localStorage, this.#identityKey()); }
  #saveIdentity(o) { saveIdentity(localStorage, this.#identityKey(), o); }
  #clearIdentity() { clearIdentity(localStorage, this.#identityKey()); }

  /** Identité déjà connue → on saute le sas : la porte s'ouvre directement. */
  #autoEnter(saved) {
    if (this.#nav().door === "opening" || this.#nav().entered) return;
    this.#entryAuto = true;
    this.#sending = true;
    this.#entrySubmitAt = performance.now();
    this.#machine.send("AUTO_ENTER");
    this.#entryDur = ENTRY_DOOR_MS / 1000;
    this.#entryAnim = true; this.#entryT = 0;
    if (this.#hint) this.#hint.classList.add("hidden");
    const submit = this.#host?.actions?.submitIdentity;
    if (typeof submit === "function") submit({ nom: saved.nom, email: saved.email, consentement: saved.consentement ?? true });
  }

  /** Affiche le sas (phase `identity`) ; sinon salle 3D (sas sauté si `chat` d'emblée). */
  #renderPhase() {
    const chat = (this.#host?.phase ?? "identity") === "chat";
    this.#machine.send("HOST_PHASE", { phase: chat ? "chat" : "identity" });
    if (!chat) {
      const saved = this.#loadIdentity();
      if (saved) { this.#autoEnter(saved); return; }
      this.#showEntry(); return;
    }
    if (this.#nav().exited) return;
    if (this.#nav().entered) return;
    if (this.#nav().door === "opening") {
      const total = (this.#entryAuto ? 0 : FORM_FADE_MS) + ENTRY_DOOR_MS + (this.#entryAuto ? 0 : HOLD_OPEN_MS);
      const delay = Math.max(0, total - (performance.now() - this.#entrySubmitAt));
      this.#lifecycle.timer(() => this.#transitionToRoom(), delay);
    } else {
      this.#enterRoom(true);
      this.#entryUI?.hide();
    }
  }
  #showEntry() {
    if (!this.#entryUI) return;
    this.#machine.send("SHOW_IDENTITY");
    this.#renderEntryForm();
    this.#hint.classList.add("hidden");
    if (this.#entryShown) return;
    this.#entryShown = true;
    this.#entryUI.show();
  }

  /** Entrée dans la salle : PORTE ouverte → TRAVELLING CONTINU jusqu'au pupitre. */
  #transitionToRoom() {
    if (this.#nav().entered) return;
    this.#machine.send("DOOR_OPENED");
    if (this.#rig.orbit) this.#rig.orbit.on = false;
    this.#entryUI?.hide();
    if (this.#hint) this.#hint.classList.add("hidden"); // salle : l'affordance devient la barre d'actions
    // Un seul mouvement continu : extérieur (devant la porte) → intérieur (pupitre).
    // 1) On s'approche : par la porte ouverte, on voit l'intérieur de la salle.
    this.#rig.setCam([0, 1.55, 4.6], [0, 1.35, 0.6], 1.8);
    // 2) Puis on entre dans la salle jusqu'au pupitre.
    this.#lifecycle.timer(() => this.#rig.setCam(IN_ROOM.pos, IN_ROOM.tgt, 2.0), 1800);
    // Bascule éclairage/intérieur au FRANCHISSEMENT DU SEUIL (voir #loop).
  }

  /** Ambiance intérieure : masque l'extérieur, HDRI intérieur, lampes. */
  #goInterior() {
    this.#machine.send("INTERIOR_READY");
    this.#rig.resetLook();
    this.#needsRender = true;
    this.#entryAnim = false; this.#sending = false; this.#entryUI?.setSending(false); // sas terminé
    this.#roomGroup.visible = true;
    if (this.#doorPivot) this.#doorPivot.rotation.y = 0; // porte REFERMÉE (vue de l'intérieur)
    if (this.#houseGroup) this.#houseGroup.visible = false;
    if (this.#houseGround) this.#houseGround.visible = false;
    this.#scene.fog = new THREE.Fog("#1c150c", 9, 30);
    this.#setShadowExtent?.(8);
    // Le fond doit rester le CIEL : c'est lui qu'on voit par les fenêtres et la porte.
    this.#scene.background = this.#env?.skyTex || new THREE.Color("#8fb6dd");
    if (this.#env?.interiorEnv) this.#scene.environment = this.#env.interiorEnv;
    if (this.#scene) this.#scene.environmentIntensity = 0.55;
    if (this.#sun) this.#sun.intensity = 1.15;
    if (this.#spot) { this.#spot.intensity = 26; this.#spot.castShadow = this.#quality !== "low"; }
    if (this.#lamp) this.#lamp.intensity = 4.5;
    if (this.#renderer) this.#renderer.shadowMap.needsUpdate = true;
    this.#maybeLoadAlbum();
    // Action demandée DEPUIS L'EXTÉRIEUR : la vue s'ouvre À L'ARRIVÉE du travelling.
    if (this.#pendingEnter) {
      const target = this.#pendingEnter;
      this.#pendingEnter = null;
      this.#lifecycle.timer(() => {
        if (target === "discussion") this.#enterDiscussion();
        else if (target === "library") this.#openLibrary();
        else this.#enterBook();
      }, ARRIVAL_OPEN_MS);
    }
    this.#updateUI();
  }

  /** Entrée immédiate (identité déjà connue) : caméra directement dans la salle. */
  #enterRoom(instant = false) {
    if (this.#nav().entered) return;
    this.#goInterior();
    this.#rig.setCam(IN_ROOM.pos, IN_ROOM.tgt, instant ? 0.01 : 1.2);
    if (this.#hint) this.#hint.classList.add("hidden"); // salle : l'affordance devient la barre d'actions
    this.#updateUI();
  }

  #stepEntry(dt) {
    if (!this.#entryAnim) return false;
    this.#entryT = Math.min(1, this.#entryT + dt / this.#entryDur);
    const e = easeInOut(this.#entryT);
    if (this.#doorPivot) this.#doorPivot.rotation.y = -e * 1.95;
    if (this.#entryT >= 1) this.#entryAnim = false;
    return true;
  }

  // ---- SCÈNE DISCUSSION ----------------------------------------------------

  #buildDiscussion() {
    this.#boardUI = createBoardUI({ openMedia: (url) => this.#host?.actions?.openMedia(url) });
    this.#discussionUI = createDiscussionUI({
      root: this.#root,
      board: this.#boardUI,
      onDiscuss: () => this.#enterDiscussion(),
      onAlbum: () => this.#enterBook(),
      onLibrary: () => this.#openLibrary(),
      onSend: (value) => this.#host?.actions?.sendMessage(value),
      onFinish: () => this.#host?.actions?.finish(),
      onExit: () => this.#exitDiscussion(),
      onReset: () => this.#resetIdentity(),
      onNavigate: (delta) => this.#discGo(delta),
      onToggleBoard: () => {},
    });
  }

  /** Actions EXTÉRIEURES : « Discuter » + « Ouvrir album » EMPILÉS, en haut à droite. */
  #buildOutsideActions() {
    this.#outsideUI = createOutsideActions({
      root: this.#root,
      onDiscuss: () => this.#enterFromOutside("discussion"),
      onAlbum: () => this.#enterFromOutside("book"),
      onLibrary: () => this.#enterFromOutside("library"),
    });
  }

  /** Action demandée DEHORS : on ENTRE (porte + travelling) puis on ouvre la vue demandée. */
  #enterFromOutside(target) {
    if (this.#nav().entered || this.#nav().door === "opening") return;
    this.#pendingEnter = target;
    this.#goInside();
  }

  #refreshDiscussion() {
    const messages = this.#host?.messages ?? [];
    const count = messages.length;
    const isNew = this.#discCount >= 0 && count > this.#discCount;
    this.#discCount = count;
    this.#msgs = messages;
    const last = messages.length - 1;
    if (isNew || this.#msgIdx < 0 || this.#msgIdx > last) this.#msgIdx = last;
    if (this.#msgIdx < 0) this.#msgIdx = 0;
    this.#renderDiscussionView();
    // Humeurs/gestes déclenchés UNIQUEMENT sur un nouveau message (jamais en navigant).
    if (isNew) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const mood = moodFromUserState(lastUser);
      this.#applyMood(mood);
      if (this.#avatar?.head) {
        if (mood === "content") this.#gesture("thumbup");
        else if (mood === "triste") this.#gesture("shrug");
        else if (this.#boardUI?.hasContent) this.#gesture("index");
      }
    }
  }

  /** Dernier message ASSISTANT à l'index ≤ idx (contenu affiché sur le tableau). */
  #assistantAt(idx) {
    const n = this.#msgs?.length ?? 0;
    for (let i = Math.min(idx, n - 1); i >= 0; i--) if (this.#msgs[i]?.role === "assistant") return this.#msgs[i];
    return null;
  }

  /** Précédent / suivant — défile MESSAGE par message (alterne les interlocuteurs), sans toucher au personnage. */
  #discGo(delta) {
    const n = this.#msgs?.length ?? 0;
    if (n === 0) return;
    const next = Math.min(n - 1, Math.max(0, this.#msgIdx + delta));
    if (next === this.#msgIdx) return;
    this.#msgIdx = next;
    this.#renderDiscussionView();
  }

  #renderDiscussionView() {
    this.#discussionUI?.render(
      this.#msgs ?? [], this.#msgIdx, this.#assistantAt(this.#msgIdx),
      { photos: this.#host?.photos ?? [], liens: this.#host?.liens ?? [] },
    );
  }

  /** Tableau MURAL = simple décoration (peinture), sans contenu dynamique. */
  #drawDecoBoard(canvas = this.#boardCanvas, ctx = this.#boardCtx, tex = this.#boardTex) {
    paintDecoBoard({ canvas, ctx, tex, invalidate: () => this.#invalidate() });
  }

  /** Cadrage discussion : remonte la scène pour que le panneau bas ne cache pas l'avatar (desktop). */
  #discussionCamera() {
    const h = this.clientHeight || window.innerHeight || 900;
    const w = this.clientWidth || window.innerWidth || 1440;
    const aspect = w / h;
    const panel = this.#discussionUI?.panelHeight?.() ?? h * 0.38;
    const lift = aspect >= 1.5 ? Math.max(0, panel / h) : 0;
    return {
      pos: DISC_CAM.pos,
      tgt: [DISC_CAM.tgt[0], DISC_CAM.tgt[1] - lift, DISC_CAM.tgt[2]],
    };
  }

  #applyDiscussionCamera(dur = 0.2) {
    if (this.#sceneView() !== "discussion" || !this.#rig) return;
    const cam = this.#discussionCamera();
    this.#rig.setCam(cam.pos, cam.tgt, dur);
  }

  #enterDiscussion() {
    if (this.#sceneView() === "discussion") return;
    this.#diag("clic « Discuter » reçu");
    this.#machine.send("OPEN_DISCUSSION");
    this.#hint.classList.add("hidden");
    if (this.#lecternGroup) this.#lecternGroup.visible = false; // on cadre le bureau (mur gauche)
    this.#initAvatar();
    this.#discussionUI?.open(); // tablette/mobile : tableau replié → le personnage reste visible
    this.#syncLayoutMode();
    const cam = this.#discussionCamera();
    this.#rig.setCam(cam.pos, cam.tgt, 1.2);
    this.#discussionUI?.setActionsVisible(false);
    this.#refreshDiscussion();
  }

  #resetIdentity() { this.#clearIdentity(); try { location.reload(); } catch { /* ignore */ } }

  #exitDiscussion() {
    if (this.#sceneView() !== "discussion") return;
    this.#machine.send("CLOSE_DISCUSSION");
    if (this.#lecternGroup) this.#lecternGroup.visible = true;
    this.#rig.setCam(IN_ROOM.pos, IN_ROOM.tgt, 1.1);
    this.#discussionUI?.close();
    this.#updateUI();
  }

  // ---- Boucle 3D -----------------------------------------------------------

  #start() {
    if (this.#running) return;
    this.#running = true;
    this.#paused = false;
    this.#last = performance.now();
    this.#loop();
  }
  #stop() {
    this.#running = false;
    this.#lifecycle?.cancelRaf();
  }

  #loop() {
    if (!this.#running || this.#paused) return;
    this.#lifecycle.raf(() => this.#loop());
    const now = performance.now();
    const dt = Math.min((now - this.#last) / 1000, 0.05);
    this.#last = now;
    const camActive = this.#rig.step(dt);
    if (this.#nav().bookPending && !camActive) this.#openBookOverlay(); // album ouvert À L'ARRIVÉE de la caméra
    const rotActive = this.#roomRotation?.step(dt) ?? false;
    const entryActive = this.#stepEntry(dt);
    if (this.#nav().interiorPending && this.#camera.position.z < 3.4) { this.#goInterior(); }
    if (!this.#debug && new URLSearchParams(location.search).get("debug") === "1") {
      const host = this;
      window.__onirtech = {
        THREE, scene: this.#scene, camera: this.#camera, renderer: this.#renderer,
        get avatar() { return host.#avatar?.object; },
        // Debug/test de flux : sortir de la salle sans raycast sur la porte.
        exitOutside: () => this.#goOutside(),
      };
      window.__onirtech.__a = this.#avatar?.object;
      this.#debug = createDebugOverlay({
        THREE,
        timer: (fn, ms) => this.#lifecycle.timer(fn, ms),
        getRefs: () => ({
          avatar: this.#avatar?.object,
          restPose: this.#avatar?.restPose ?? new Map(),
          animTicks: this.#avatar?.ticks ?? 0,
          camera: this.#camera, roomGroup: this.#roomGroup, deskObj: this.#deskObj, chairObj: this.#chairObj,
          renderer: this.#renderer, scene: this.#scene, look: this.#rig?.look, quality: this.#quality,
          pages: this.#bookUI?.pages ?? [], pageIndex: this.#navState.index, bookov: this.#bookUI?.el ?? null, machine: this.#machine,
        }),
      });
    }
    this.#debug?.update(dt);
    if (this.#debug && window.__onirtech) {
      window.__onirtech.__invariants = checkInvariants(this.#machine.get());
    }
    const avatarActive = this.#avatar?.tick(dt) ?? false;

    // Ombres : recalculées seulement quand la géométrie change réellement.
    if (avatarActive || rotActive || entryActive) this.#renderer.shadowMap.needsUpdate = true;
    // Rendu à la demande : on ne dessine que si quelque chose bouge (ou invalidation explicite).
    if (camActive || rotActive || entryActive || avatarActive || this.#needsRender) {
      this.#renderer.render(this.#scene, this.#camera);
      this.#needsRender = false;
    }
    this.#renderCount++;
    if (this.#debug && window.__onirtech) window.__onirtech.__frameCount = this.#renderCount;
  }

  #resize() {
    this.#needsRender = true;
    const w = this.clientWidth || window.innerWidth;
    const hgt = this.clientHeight || window.innerHeight;
    if (w === 0 || hgt === 0) return;
    // Budget de pixels : plafonne la résolution interne (surtout 2K/4K et Retina).
    // high ≈ 6 Mpx max ; low ≈ 1,2 Mpx. Le DPR reste plafonné à 2 / 1,3.
    const low = this.#quality === "low";
    const maxPx = low ? 1.2e6 : 6e6;
    const maxDpr = low ? 1.3 : 2;
    const deviceDpr = window.devicePixelRatio || 1;
    const budgetDpr = Math.sqrt(maxPx / Math.max(1, w * hgt));
    this.#renderer.setPixelRatio(Math.max(0.75, Math.min(deviceDpr, maxDpr, budgetDpr)));
    this.#renderer.setSize(w, hgt, false);
    this.#camera.aspect = w / hgt;
    // Cadrage : on ÉLARGIT le champ vertical quand l'écran est étroit (portrait) afin de
    // PRÉSERVER le champ HORIZONTAL de référence (sinon le décor est perçu comme « zoomé »).
    const refAspect = 1.5, refFov = 45;
    const hRef = 2 * Math.atan(Math.tan((refFov * Math.PI / 180) / 2) * refAspect);
    const fov = this.#camera.aspect < refAspect
      ? (2 * Math.atan(Math.tan(hRef / 2) / this.#camera.aspect) * 180) / Math.PI
      : refFov;
    this.#camera.fov = Math.min(88, fov);
    this.#camera.updateProjectionMatrix();
    this.#needsRender = true;
    this.#syncLayoutMode();
    this.#applyDiscussionCamera(0.15);
    // La hauteur utile du dialogue a pu changer (barre d'URL mobile, rotation) :
    // la pagination des messages est recalculée (no-op si la boîte n'a pas bougé).
    this.#discussionUI?.repaginate();
    if (this.#sceneView() === "book") this.#bookUI?.refreshCover();
  }

  /** Adapte la mise en page à la largeur : livre en 1 page, tableau de discussion repliable. */
  #syncLayoutMode() {
    const w = this.clientWidth || window.innerWidth || 0;
    if (w <= 0) return;
    this.#bookUI?.setSingle(w <= 600);
    this.#discussionUI?.setNarrow(w <= 1024);
  }

  /** Clavier virtuel mobile : remonte le compositeur (variable CSS `--kb`). */
  #bindViewport() {
    const vv = window.visualViewport;
    if (!vv || this.#vvBound) return;
    this.#vvBound = true;
    const onVv = () => this.#kbOffset();
    this.#lifecycle.on(vv, "resize", onVv);
    this.#lifecycle.on(vv, "scroll", onVv);
    this.#kbOffset();
  }
  #kbOffset() {
    const vv = window.visualViewport;
    if (!vv) return;
    const hidden = Math.max(0, (window.innerHeight || 0) - vv.height - vv.offsetTop);
    this.style.setProperty("--kb", hidden > 60 ? `${Math.round(hidden)}px` : "0px");
    this.#discussionUI?.repaginate();
  }

  /** Demande un re-rendu (rendu à la demande) — à appeler sur TOUT chargement async. */
  #invalidate() { this.#needsRender = true; }

  /** Salve de re-rendus après chargement : rattrape les uploads GPU tardifs (textures/PMREM). */
  #settleBurst() {
    for (const ms of [0, 80, 260, 700, 1600]) this.#lifecycle.timer(() => this.#invalidate(), ms);
  }

  #setReady() {
    if (this.#ready) return;
    // Dernière frame de la scène déjà préparée, rendue SOUS le loading opaque.
    try {
      if (this.#renderer) this.#renderer.shadowMap.needsUpdate = true;
      this.#renderer?.render(this.#scene, this.#camera);
    } catch { /* ignore */ }
    this.#ready = true;
    this.#needsRender = true;
    if (this.#stage) this.#stage.style.visibility = "visible";
    this.#loading?.classList.remove("show");
    this.#settleBurst();
    this.#updateUI();
    this.setAttribute("data-onirtech-ready", "1");
    this.dispatchEvent(new CustomEvent("onirtech-ready", { bubbles: true, composed: true }));
  }

  // ---- Entrée / sortie du livre -------------------------------------------

  /** « Ouvrir album » : mouvement de caméra IMMERSIF (comme « Discuter ») puis
   *  l'album s'ouvre à l'ARRIVÉE de la caméra (voir #loop → #openBookOverlay). */
  #enterBook() {
    if (this.#sceneView() === "book" || this.#nav().bookPending || !this.#nav().entered) return;
    this.#machine.send("REQUEST_BOOK");
    this.#maybeLoadAlbum();
    this.#hint.classList.add("hidden");
    this.#discussionUI?.setActionsVisible(false);
    this.#rig.setCam([0, 1.75, 0.5], [0, 1.0, -0.9], 1.2);
  }

  /** Ouvre l'overlay livre (délégué à `ui/book.js`). */
  #openBookOverlay() {
    const state = this.#nav();
    if (state.scene === "book") this.#machine.send("BOOK_OPENED");
    else if (state.booktest) this.#machine.send("OPEN_BOOK_DEV");
    this.#bookUI?.open();
  }

  /** Couverture 2D (délégué à `ui/book.js`). */
  #applyCoverImage() { this.#bookUI?.refreshCover(); }

  /** Sortie du livre : état/caméra (le DOM est fermé par `ui/book.js`). */
  #exitBook() {
    if (this.#sceneView() === "room") return;
    this.#machine.send("CLOSE_BOOK");
    this.#rig.resetLook();
    this.#bookUI?.close();
    this.#rig.setCam(IN_ROOM.pos, IN_ROOM.tgt, 1.1);
    this.#updateUI();
  }

  /** Entrées du livre du pupitre : album dédié prioritaire, sinon médiathèque. */
  #entries() {
    if (this.#albumState === "loading") return [];
    if (this.#albumState === "ready") {
      const photos = this.#photos();
      return this.#album.pages.map((page) => {
        const media = page.media_id ? photos.find((photo) => photo.id === page.media_id) : null;
        return {
          image: media?.url ?? page.image ?? null,
          caption: page.caption ?? media?.libelle ?? "",
          title: page.title ?? "",
          text: page.text ?? "",
        };
      });
    }
    const list = this.#photos().map((p) => ({
      image: p.url,
      caption: p.libelle ?? "",
      title: p.titre ?? "",
      text: p.texte ?? p.description ?? "",
    }));
    const demo = new URLSearchParams(location.search).get("booktest") === "1"
      ? "Ceci est un texte de démonstration destiné à vérifier que la pagination repartit correctement le contenu sur plusieurs pages du livre, avec une image en premiere page puis du texte qui s'ecoule page apres page sans ligne orpheline ni debordement. ".repeat(14)
      : null;
    if (demo) {
      if (list.length) { list[0].title = "Démonstration"; list[0].text = demo; }
      else list.push({ image: null, caption: "", title: "Démonstration", text: demo });
    }
    return list;
  }

  #paint() { this.#bookUI?.paint(); }

  // ---- Lecteur (zoom 2D) ---------------------------------------------------

  #openReader() { this.#machine.send("OPEN_READER"); this.#readerUI?.open(); }
  #closeReader() { this.#machine.send("CLOSE_READER"); this.#readerUI?.close(); }

  // ---- Synchro / contexte --------------------------------------------------

  #sync() {
    this.#maybeLoadLibrary();
    if (this.#nav().entered) this.#maybeLoadAlbum();
    // NB : on ne fait JAMAIS ouvrir le livre automatiquement (ouverture = clic pupitre).
    const n = this.#photos().length;
    if (n > 0 && this.#navState.index >= n) this.#navState.index = 0;
    if (this.#sceneView() === "discussion") this.#refreshDiscussion();
  }

  #updateUI() {
    const host = this.#host;
    if (!host) return;
    this.#diag(`v${TEMPLATE_VERSION} · ready=` + this.#ready + " entered=" + this.#nav().entered + " view=" + this.#sceneView() + " phase=" + host.phase);
    if (this.#canvas) this.#canvas.style.cursor = this.#canRotate() ? "grab" : "default";
    // Barre d'actions de la SALLE (bas-centre) : inchangée.
    this.#discussionUI?.setActionsVisible(roomActionsVisible({
      ready: this.#ready, entered: this.#nav().entered, view: this.#sceneView(), phase: host.phase,
    }));
    // Actions EXTÉRIEURES (haut-droite, empilées) : dehors, phase chat, sas terminé, porte close.
    this.#outsideUI?.setVisible(outsideActionsVisible({
      ready: this.#ready, entered: this.#nav().entered, door: this.#nav().door,
      phase: host.phase, animating: this.#entryAnim, formShown: this.#entryUI?.isShown() ?? false,
    }));
    if (host.phase !== this.#renderedPhase) {
      this.#renderedPhase = host.phase;
      this.#renderPhase();
    }
  }

  #onKey(e) {
    // Les flèches restent des déplacements de curseur dans un champ de saisie.
    const focus = e.composedPath?.()[0] ?? e.target;
    const editing = !!focus && (focus.tagName === "INPUT" || focus.tagName === "TEXTAREA" || focus.isContentEditable === true);
    if (this.#libraryUI?.isOpen()) {
      if (e.key === "Escape") this.#libraryUI.back();
      return;
    }
    if (this.#readerUI?.isOpen()) {
      if (e.key === "Escape") this.#closeReader();
      else if (e.key === "ArrowRight") this.#readerUI.go(1);
      else if (e.key === "ArrowLeft") this.#readerUI.go(-1);
      return;
    }
    if (this.#sceneView() === "discussion") {
      if (e.key === "Escape") this.#exitDiscussion();
      else if (e.key === "ArrowRight" && !editing) { e.preventDefault(); this.#discussionUI?.nav(1); }
      else if (e.key === "ArrowLeft" && !editing) { e.preventDefault(); this.#discussionUI?.nav(-1); }
      return;
    }
    if (this.#sceneView() === "book") {
      if (e.key === "Escape") this.#exitBook();
      else if (e.key === "ArrowRight") this.#bookUI?.go(1);
      else if (e.key === "ArrowLeft") this.#bookUI?.go(-1);
    }
  }

  // ---- Interaction 3D ------------------------------------------------------

  #bindOrbit() {
    bindOrbitInput({
      canvas: this.#canvas, rig: this.#rig,
      getCanRotate: () => this.#canRotate(), getEnteredRoom: () => this.#nav().entered,
      signal: this.#lifecycle.signal,
    });
  }

  #bindPointer() {
    bindPicking({
      canvas: this.#canvas, camera: this.#camera, THREE,
      getState: () => ({
        view: this.#sceneView(), enteredRoom: this.#nav().entered, doorPivot: this.#doorPivot,
        avatar: this.#avatar?.object, lectern: this.#lecternGroup, shelf: this.#shelfGroup,
      }),
      actions: {
        goOutside: () => this.#goOutside(), goInside: () => this.#goInside(),
        enterDiscussion: () => this.#enterDiscussion(), enterBook: () => this.#enterBook(),
        openLibrary: () => this.#openLibrary(),
      },
      signal: this.#lifecycle.signal,
    });
  }

  /** Sortir : clic sur la porte depuis la salle → retour à l'extérieur. */
  #goOutside() {
    if (!this.#nav().entered) return;
    this.#machine.send("EXIT_OUTSIDE");
    if (this.#rig.orbit) this.#rig.orbit.on = false;
    if (this.#doorPivot) this.#doorPivot.rotation.y = 0;
    if (this.#houseGroup) this.#houseGroup.visible = true;
    if (this.#houseGround) this.#houseGround.visible = true;
    this.#scene.fog = new THREE.Fog(OUTSIDE_FOG.color, OUTSIDE_FOG.near, OUTSIDE_FOG.far);
    this.#setShadowExtent?.(15);
    if (this.#env?.skyTex) this.#scene.background = this.#env.skyTex;
    if (this.#env?.skyEnv) this.#scene.environment = this.#env.skyEnv;
    if (this.#scene) this.#scene.environmentIntensity = 1.0;
    if (this.#sun) this.#sun.intensity = 2.2;
    if (this.#spot) { this.#spot.intensity = 0; this.#spot.castShadow = false; }
    if (this.#lamp) this.#lamp.intensity = 0;
    if (this.#renderer) this.#renderer.shadowMap.needsUpdate = true;
    if (this.#rig.orbit) { this.#rig.orbit.az = 0; this.#rig.orbit.pol = 1.56; }
    this.#rig.setCam(OUT.pos, OUT.tgt, 2.2);
    if (this.#hint) { this.#hint.textContent = "Cliquez sur la porte pour entrer"; this.#hint.classList.remove("hidden"); }
    this.#updateUI();
  }

  /** Entrer : clic sur la porte depuis l'extérieur → la porte s'ouvre puis on entre. */
  #goInside() {
    if (this.#nav().entered || this.#nav().door === "opening") return;
    this.#machine.send("ENTER_FROM_OUTSIDE");
    this.#roomGroup.visible = true; // la baie ouverte laisse voir la salle
    this.#entryAuto = true;
    this.#entrySubmitAt = performance.now();
    this.#entryDur = ENTRY_DOOR_MS / 1000;
    this.#entryAnim = true; this.#entryT = 0;
    if (this.#hint) this.#hint.classList.add("hidden");
    this.#lifecycle.timer(() => this.#transitionToRoom(), ENTRY_DOOR_MS + 120);
  }

  // ---- Souris : orbite (sas) / regard libre (salle) -------------------------

  /** Glisser possible : dehors (tour de la maison) ou dans la salle (regard libre). */
  #canRotate() { return !this.#nav().entered || this.#sceneView() === "room"; }


}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, ImmersiveTemplate);
