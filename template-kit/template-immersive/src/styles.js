// Styles du template immersive (déplacés verbatim de src/index.js).

export const STYLE = `
  :host { display:block; position:fixed; inset:0; font-family: system-ui, sans-serif; overflow:hidden; background:#0d0a06;
    /* Hauteur de la zone de dialogue : plancher lisible, indépendant du zoom et du breakpoint de largeur. */
    --disc-h: clamp(18rem, 38vh, 44rem);
    --disc-h: clamp(18rem, 38dvh, 44rem); }
  .stage { position:absolute; inset:0; background:#17110a; }
  .stage canvas { display:block; width:100%; height:100%; touch-action:none; -webkit-user-select:none; user-select:none; }
  .hint { position:absolute; left:50%; bottom:2.2rem; transform:translateX(-50%); z-index:8;
    color:#f1e2c6; font-family:Georgia,serif; font-size:.95rem; letter-spacing:.04em;
    background:rgba(20,12,6,.62); border:1px solid rgba(214,183,130,.35); padding:.5rem 1rem; border-radius:2rem;
    transition:opacity .4s; }
  .hint.hidden { opacity:0; pointer-events:none; }
  .fade { position:fixed; inset:0; z-index:50; background:#0a0704; opacity:0; pointer-events:none; transition:opacity .4s ease; }
  .loading { position:fixed; inset:0; z-index:40; display:none; align-items:center; justify-content:center; background:#17110a; pointer-events:auto; }
  .loading.show { display:flex; }
  .loading .page { width:10rem; padding:1.1rem .9rem; border-radius:.5rem; background:#fbf6ea;
    border:1px solid rgba(150,120,70,.4); box-shadow:0 20px 50px rgba(20,12,6,.55);
    display:flex; flex-direction:column; align-items:center; gap:.7rem; color:#5b4632;
    font-family:Georgia,serif; font-size:.8rem; letter-spacing:.03em; }
  .loading-step { max-width:15rem; text-align:center; font-size:.68rem; line-height:1.35; opacity:.78; }
  .loading .spinner { width:1.5rem; height:1.5rem; border-radius:50%;
    border:2px solid rgba(150,120,70,.3); border-top-color:#8a5a1f; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  /* ---------- LIVRE 2D (ouverture + pages) ---------- */
  .bookov { position:fixed; inset:0; z-index:15; display:none; flex-direction:column; align-items:center; justify-content:center; gap:.45rem;
    background:rgba(10,7,4,.9); perspective:2400px; perspective-origin:50% 40%; overflow:auto;
    padding:calc(.55rem + env(safe-area-inset-top)) .7rem calc(.55rem + env(safe-area-inset-bottom)); }
  .bookov.open { display:flex; }
  /* Barre de commandes (retour) et pied (navigation) : HORS du papier, toujours accessibles. */
  .bookbar, .bookfoot { flex:0 0 auto; width:100%; max-width:min(97vw, 84rem); display:flex; align-items:center; }
  .bookbar { justify-content:flex-end; }
  /* margin-top : le livre ouvert est incliné (rotateX) → sa projection déborde un peu vers le bas ;
     on réserve la place pour que la navigation ne soit JAMAIS recouverte. */
  .bookfoot { justify-content:center; gap:1.1rem; margin-top:1.2rem; }
  .book { position:relative; flex:1 1 auto; min-height:0; width:min(97vw, 84rem);
    max-height:min(90vh, 56rem); max-height:min(90dvh, 56rem);
    transform:translateX(-25%) rotateX(10deg) scale(.98); transform-style:preserve-3d;
    transition:transform .9s cubic-bezier(.22,.72,.16,1); }
  .book.open { transform:translateX(0) rotateX(10deg) scale(1); }
  /* Portrait étroit : UNE page (la page de gauche est un blanc inutile) → photo 2× plus large.
     aspect-ratio : une page seule garde une proportion de page (et non de colonne géante). */
  .bookov.single .book { flex:0 1 auto; height:auto; width:min(94vw, 34rem); aspect-ratio:3 / 4;
    max-height:min(84dvh, 52rem); transform:translateX(0) rotateX(6deg) scale(.97); }
  .bookov.single .book.open { transform:translateX(0) rotateX(0deg) scale(1); }
  .bookov.single .page.left, .bookov.single .spine { display:none; }
  .bookov.single .page.right { width:100%; border-radius:.45rem; }
  .bookov.single .cover { width:100%; }
  .pages { position:absolute; inset:0; display:flex; transform-style:preserve-3d;
    box-shadow:0 40px 70px rgba(0,0,0,.5); border-radius:.4rem; opacity:0; transition:opacity .5s ease .3s; }
  .book.open .pages { opacity:1; }
  .page { position:relative; width:50%; height:100%; overflow:hidden;
    background:radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,.5), transparent 60%),
      linear-gradient(180deg,#fbf6ea,#efe4cf); box-shadow:inset 0 0 60px rgba(120,90,45,.18); }
  .page.left { border-radius:.45rem 0 0 .45rem; box-shadow:inset -26px 0 40px -30px rgba(0,0,0,.5), inset 0 0 60px rgba(120,90,45,.18); }
  .page.right { border-radius:0 .45rem .45rem 0; box-shadow:inset 26px 0 40px -30px rgba(0,0,0,.5), inset 0 0 60px rgba(120,90,45,.18); }
  .spine { position:absolute; left:50%; top:0; bottom:0; width:2.4rem; transform:translateX(-50%);
    background:linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,0) 48%, rgba(0,0,0,.22)); pointer-events:none; z-index:4; }
  .photo { position:absolute; inset:2rem 2rem 4.4rem; background:#fffdf8; padding:.7rem;
    border:1px solid #e2d6bd; box-shadow:0 12px 26px rgba(70,45,20,.28), inset 0 0 0 1px #fff;
    display:flex; align-items:center; justify-content:center; }
  .photo img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
  .photo.zoom { cursor:zoom-in; }
  .caption { position:absolute; left:2rem; right:2rem; bottom:1.6rem; display:-webkit-box; -webkit-box-orient:vertical;
    -webkit-line-clamp:2; overflow:hidden; text-align:center; font-family:Georgia,"Times New Roman",serif;
    font-style:italic; font-size:.95rem; line-height:1.3; color:#5b4632; }
  .btext { position:absolute; left:2.2rem; right:2.2rem; top:2.3rem; bottom:2.6rem;
    font-family:Georgia,"Times New Roman",serif; color:#3f2f21; overflow:hidden; }
  .btext .bh { font-weight:700; font-size:1.05em; margin:0 0 .55em; color:#2b1c10;
    border-bottom:1px solid rgba(120,90,45,.25); padding-bottom:.25em; }
  .btext .ln { white-space:nowrap; overflow:hidden; }
  .btext .ln.first { text-indent:1.4em; }
  .folio { position:absolute; bottom:.45rem; left:0; right:0; text-align:center; font-size:.68rem; color:#a08c6d;
    font-family:Georgia,serif; }
  .cover { position:absolute; top:0; bottom:0; right:0; width:50%; transform-origin:left center; z-index:6;
    transition:transform .95s cubic-bezier(.22,.72,.16,1); backface-visibility:hidden;
    background:linear-gradient(160deg,#4a3526,#241708 70%); background-size:100% 100%; background-repeat:no-repeat;
    border-radius:.2rem .5rem .5rem .2rem; box-shadow:0 30px 60px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.05);
    display:flex; align-items:center; justify-content:center; cursor:pointer; }
  .cover::before { content:""; position:absolute; left:0; top:0; bottom:0; width:1.1rem;
    background:linear-gradient(90deg, rgba(0,0,0,.4), rgba(0,0,0,0)); border-radius:.2rem 0 0 .2rem; }
  .cover.open { transform:rotateY(-180deg); pointer-events:none; }
  .leaf { position:absolute; top:0; width:50%; height:100%; z-index:5; transform-style:preserve-3d;
    transform:rotateY(0deg); backface-visibility:hidden; }
  .leaf.right { right:0; transform-origin:left center; }
  .leaf.left { left:0; transform-origin:right center; }
  .leaf .face { position:absolute; inset:0; backface-visibility:hidden; overflow:hidden;
    background:linear-gradient(180deg,#fbf6ea,#efe4cf); }
  .leaf .face.back { transform:rotateY(180deg); }
  .leaf.anim { transition:transform .95s cubic-bezier(.4,.05,.35,1); }
  .bnav { width:2.9rem; height:2.9rem; border-radius:50%; border:1px solid rgba(214,183,130,.5); cursor:pointer;
    color:#f1e2c6; font-size:1.4rem; background:rgba(20,12,6,.7); }
  .bnav:disabled { opacity:.28; cursor:default; }
  .bclose { cursor:pointer; font:inherit; font-size:.82rem; color:#f1e2c6; padding:.55rem .9rem; min-height:2.5rem;
    border-radius:.5rem; border:1px solid rgba(241,226,198,.35); background:rgba(30,20,12,.74); }

  /* ---------- LECTEUR (zoom, 2D, 2 pages) ---------- */
  .reader { position:fixed; inset:0; z-index:30; display:none; flex-direction:column; align-items:center; justify-content:center; gap:.45rem;
    background:rgba(10,7,4,.95); perspective:2400px; perspective-origin:50% 40%; overflow:auto;
    padding:calc(.55rem + env(safe-area-inset-top)) .7rem calc(.55rem + env(safe-area-inset-bottom)); }
  .reader.open { display:flex; }
  .rbar, .rfoot { flex:0 0 auto; width:min(97vw, 96rem); display:flex; align-items:center; }
  .rbar { justify-content:flex-end; }
  .rfoot { justify-content:center; gap:1.1rem; }
  .rsheet { position:relative; flex:1 1 auto; min-height:0; width:min(97vw, 96rem);
    max-height:min(94vh, 66rem); max-height:min(94dvh, 66rem);
    transform-style:preserve-3d; transition:transform .7s cubic-bezier(.25,.7,.2,1); }
  .rpage { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden;
    display:flex; flex-direction:column; border-radius:.6rem; overflow:hidden;
    background:linear-gradient(180deg,#fbf6ea,#efe4cf); border:1px solid rgba(150,120,70,.4);
    box-shadow:0 30px 70px rgba(0,0,0,.6); }
  .rpage.back { transform:rotateY(180deg); }
  .rphoto { flex:0 0 54%; min-height:0; overflow:hidden; margin:1rem 1rem .1rem; padding:.6rem;
    background:#fffdf8; border:1px solid #e2d6bd; display:flex; align-items:center; justify-content:center; }
  .rphoto img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
  .rbody { flex:1 1 auto; min-height:0; overflow-y:auto; padding:.6rem 1.6rem .2rem; }
  .rcap { font-family:Georgia,"Times New Roman",serif; color:#3f2f20; font-size:1.05rem; line-height:1.55;
    white-space:pre-wrap; overflow-wrap:anywhere; max-width:min(78ch, 100%); margin-inline:auto; }
  .rfolio { flex:0 0 auto; text-align:center; color:#a08c6d; font-family:Georgia,serif; font-size:.82rem; padding:.3rem 0 .9rem; }
  .rnav { width:2.9rem; height:2.9rem; border-radius:50%; border:1px solid rgba(214,183,130,.5);
    background:rgba(20,12,6,.68); color:#f1e2c6; font-size:1.4rem; cursor:pointer; }
  .rnav:disabled { opacity:.28; cursor:default; }
  .rclose { width:2.75rem; height:2.75rem; border-radius:50%; border:0; cursor:pointer; font-size:1.3rem;
    color:#fff; background:rgba(255,255,255,.16); }
  .rclose:hover { background:rgba(255,255,255,.28); }

  /* ---------- SAS D'ENTRÉE (formulaire CENTRÉ ; maison 3D en fond) ---------- */
  .entry { position:fixed; inset:0; z-index:25; display:flex; align-items:center; justify-content:center;
    padding:calc(2.2rem + env(safe-area-inset-top)) calc(1.2rem + env(safe-area-inset-right))
      calc(2.2rem + var(--kb, 0px) + env(safe-area-inset-bottom)) calc(1.2rem + env(safe-area-inset-left));
    overflow:auto; opacity:0; pointer-events:none; transition:opacity .7s ease;
    font-family:Georgia,"Times New Roman",serif; color:#f1e2c6;
    background:radial-gradient(130% 110% at 50% 118%, rgba(6,4,2,.62), transparent 58%); }
  .entry.show { opacity:1; }
  .entry.show .panel { pointer-events:auto; }
  .panel { width:min(92vw, 34rem); background:linear-gradient(160deg, rgba(74,53,38,.94), rgba(36,23,8,.94));
    border:1px solid rgba(214,183,130,.42); border-radius:1rem; padding:1.3rem 1.4rem 1.4rem;
    box-shadow:0 24px 60px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.04);
    display:flex; flex-direction:column; gap:.85rem; }
  .entry-title { margin:0; font-size:1.5rem; letter-spacing:.05em; color:#f4e7cd; }
  .entry-brand { margin:0; font-size:.78rem; letter-spacing:.16em; text-transform:uppercase; color:#c9a86a; }
  .entry-sub { margin:0 0 .2rem; font-size:.92rem; line-height:1.5; color:rgba(241,226,198,.8); }
  .form { display:flex; flex-direction:column; gap:.7rem; }
  .form label { font-size:.8rem; color:#cbb595; display:flex; flex-direction:column; gap:.3rem; }
  .form input { border:1px solid #cdbb9c; background:#fffdf7; border-radius:.6rem; padding:.6rem .75rem;
    font:inherit; font-size:.92rem; color:#3f2f20; }
  .form input:focus { outline:none; border-color:#a5854f; box-shadow:0 0 0 3px rgba(165,133,79,.18); }
  .check { flex-direction:row !important; align-items:flex-start; gap:.5rem; color:#e7d6b4; }
  .check input { width:auto; margin-top:.15rem; }
  .form-link { color:#e6bd77; font-weight:600; }
  .form button { border:0; background:linear-gradient(160deg,#573f2b,#2a1c12); color:#f1e2c6;
    border-radius:.6rem; padding:.7rem; cursor:pointer; font:inherit; font-weight:600; letter-spacing:.03em;
    transition:filter .2s ease, opacity .2s ease; }
  .form button:hover:not(:disabled) { filter:brightness(1.12); }
  .form button:disabled { opacity:.45; cursor:not-allowed; }
  @media (orientation: landscape) and (max-height: 560px) {
    .photo { inset:1rem 1rem 3rem; }
    .caption { -webkit-line-clamp:1; bottom:1.35rem; font-size:.82rem; }
  }

  /* ---------- SCÈNE DISCUSSION (la salle pivote ; personnage 3D au fond) ---------- */
  .discussion { position:fixed; inset:0; z-index:16; display:flex; flex-direction:column; justify-content:flex-end;
    transform:translateY(6%); opacity:0; pointer-events:none;
    transition:transform .6s cubic-bezier(.22,.72,.16,1), opacity .5s ease;
    font-family:Georgia,"Times New Roman",serif; }
  .discussion.open { transform:translateY(0); opacity:1; }
  /* Capé à 38% de haut : le compositeur reste TOUJOURS visible et le bas ne recouvre jamais
     la zone basse du tableau (bottom:38%). --kb = clavier virtuel mobile (voir #kbOffset). */
  .discbottom { pointer-events:none; padding-top:2.4rem; padding-bottom:var(--kb, 0px); position:relative; z-index:3;
    display:flex; flex-direction:column; min-height:0; height:var(--disc-h); box-sizing:border-box;
    background:linear-gradient(180deg, rgba(10,7,4,0), rgba(10,7,4,.5) 30%, rgba(10,7,4,.86)); }
  .discussion.open .discbottom { pointer-events:auto; }
  .discussion.open .board { pointer-events:auto; }
  .discussion.open .dclose, .discussion.open .dreset, .discussion.open .boardtoggle { pointer-events:auto; }
  .discussion .stage2d { position:relative; flex:1 1 auto; min-height:0; }
  .avatarStage { position:absolute; left:0; top:0; bottom:0; width:54%; z-index:1; }
  .avatarStage canvas { display:block; outline:none; }
  .discnav { display:flex; align-items:center; justify-content:center; gap:.7rem; padding:.2rem 0; }
  .dnav { flex:0 0 auto; width:2.75rem; height:2.75rem; border-radius:50%; border:1px solid rgba(214,183,130,.5);
    background:rgba(30,20,12,.6); color:#f1e2c6; cursor:pointer; font:inherit; font-size:1.35rem; line-height:1; }
  .dnav:hover:not(:disabled) { background:rgba(60,42,26,.8); }
  .dnav:disabled { opacity:.3; cursor:default; }
  .dfolio { font-size:.72rem; color:rgba(241,226,198,.72); font-variant-numeric:tabular-nums; letter-spacing:.04em; }
  .board { position:absolute; right:3%; top:6%; bottom:var(--disc-h); width:min(44%, 30rem); overflow:auto; z-index:2;
    box-sizing:border-box;
    background:linear-gradient(160deg,#4a3526,#241708 78%); border:1px solid rgba(214,183,130,.5);
    border-radius:.7rem; box-shadow:0 24px 50px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05);
    padding:1rem 1.1rem; color:#f1e2c6; }
  .board h2 { margin:0 0 .7rem; font-size:1rem; letter-spacing:.09em; text-transform:uppercase;
    color:#e7d3a8; border-bottom:1px solid rgba(214,183,130,.35); padding-bottom:.5rem; }
  .board .zt { font-size:.68rem; letter-spacing:.13em; text-transform:uppercase; color:#c9a86a; margin:0 0 .4rem; }
  .board .zone { margin-bottom:.9rem; }
  .board .zone:last-child { margin-bottom:0; }
  .board .empty { color:rgba(241,226,198,.45); font-style:italic; font-size:.84rem; }
  .board .bimg { width:100%; border-radius:.4rem; border:1px solid rgba(214,183,130,.35); display:block; }
  .board .know { margin:.2rem 0; }
  .board .know .t { display:block; font-size:.88rem; color:#f1e2c6; }
  .board .know .ref { display:block; font-size:.72rem; color:#c9a86a; }
  .board .link { display:inline-block; margin:.15rem .3rem .15rem 0; padding:.3rem .65rem; border-radius:2rem;
    border:1px solid rgba(214,183,130,.5); color:#e7d3a8; cursor:pointer; font-size:.8rem; text-decoration:none;
    background:rgba(255,255,255,.04); }
  .board .link:hover { background:rgba(214,183,130,.18); }
  /* Dialogue à HAUTEUR FIXE : aucun défilement. Un message trop long est paginé
     (voir src/ui/pagination.js) et se feuillette avec ‹ ›. */
  .dialogue { flex:1 1 auto; padding:.4rem 1.4rem .2rem; display:flex; flex-direction:column; gap:.4rem;
    min-height:0; overflow:hidden; }
  .bubble { position:relative; width:68%; height:100%; box-sizing:border-box; flex:0 0 auto;
    /* Bas de bulle réservé au marqueur de troncature « … » (aucun chevauchement du texte). */
    padding:.55rem .85rem 1.05rem; border-radius:1rem; font-size:.92rem; line-height:1.4;
    box-shadow:0 8px 20px rgba(0,0,0,.35); overflow:hidden; overflow-wrap:anywhere; }
  .bubble.typing { cursor:pointer; }
  /* Marqueurs de pagination : « … » en tête de page 2+ et en pied de page tronquée. */
  .cont-start { float:left; margin-right:.3rem; opacity:.62; }
  .cont-end { position:absolute; right:.55rem; bottom:.35rem; font-size:.8rem; line-height:1; opacity:.62; }
  .sr-live { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .bubble.assistant { align-self:flex-start; background:#fbf6ea; color:#3f2f20; border-bottom-left-radius:.25rem; }
  .bubble.user { align-self:flex-end; background:#5b4632; color:#fbf6ea; border-bottom-right-radius:.25rem; }
  .bubble.assistant::before { content:"IA : "; font-weight:700; color:#8a5a1f; }
  .bubble.user::before { content:"Vous : "; font-weight:700; color:#e7d3a8; }
  .bubble a { color:#8a5a1f; text-decoration:underline; word-break:break-word; }
  .bubble.user a { color:#f0d9a8; }
  .bubble strong { font-weight:700; }
  .bubble em { font-style:italic; }
  .bubble code { background:rgba(0,0,0,.08); padding:0 .25rem; border-radius:.25rem; font-family:ui-monospace,monospace; font-size:.86em; }
  .bubble ul { margin:.2rem 0 .2rem 1.1rem; padding:0; }
  .bubble li { margin:.1rem 0; }
  .bubble .md-h { font-weight:700; margin:.25rem 0 .1rem; }
  .discussion.react .bubble.assistant { animation:bob .5s ease; }
  @keyframes bob { 0%{transform:translateY(0)} 40%{transform:translateY(-4px)} 100%{transform:translateY(0)} }
  .discussion .composer { flex:0 0 auto; display:flex; gap:.5rem;
    padding:.6rem 1.1rem calc(.9rem + env(safe-area-inset-bottom)); }
  .discussion .composer input { flex:1; min-width:0; border:1px solid rgba(214,183,130,.4); background:#fffdf7;
    border-radius:.7rem; padding:.7rem .9rem; font:inherit; font-size:.95rem; color:#3f2f20; }
  .discussion .composer input:focus { outline:none; border-color:#d6b782; box-shadow:0 0 0 3px rgba(214,183,130,.2); }
  .discussion .composer button { display:inline-flex; align-items:center; justify-content:center; gap:.45rem;
    min-width:2.75rem; min-height:2.75rem; border:0; border-radius:.7rem; padding:0 1.15rem; cursor:pointer;
    font:inherit; font-weight:600; color:#fbf6ea; background:linear-gradient(160deg,#573f2b,#2a1c12); }
  .discussion .composer button:hover { background:#4a3526; }
  .discussion .composer .ico { display:inline-flex; align-items:center; }
  .discussion .composer .ico svg { width:1.05rem; height:1.05rem; fill:none; stroke:currentColor;
    stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  /* « Terminer » : action secondaire, sobre (la confirmation se fait en MODALE). */
  .discussion .composer .cfinish { background:none; border:1px solid rgba(214,183,130,.55); color:#f1e2c6; }
  .discussion .composer .cfinish:hover { background:rgba(60,42,26,.8); }
  /* Modale de confirmation, séparée du bouton (au-dessus de tout le panneau). */
  .finishmodal { position:fixed; inset:0; z-index:40; display:none; align-items:center; justify-content:center;
    padding:1.2rem; background:rgba(8,5,2,.58); }
  .finishmodal.open { display:flex; }
  .finishcard { width:min(24rem,100%); border-radius:1rem; padding:1.25rem 1.2rem 1rem; color:#f6ecda;
    background:linear-gradient(170deg,#3a2a1c,#1d130c); border:1px solid rgba(214,183,130,.45);
    box-shadow:0 18px 50px rgba(0,0,0,.5); font-family:Georgia,serif; }
  .finishtitle { margin:0 0 .5rem; font-size:1.1rem; font-weight:600; }
  .finishtext { margin:0 0 1.1rem; font-size:.95rem; line-height:1.45; color:#d9c9ae; }
  .finishbtns { display:flex; gap:.6rem; justify-content:flex-end; flex-wrap:wrap; }
  .finishbtns button { min-height:2.75rem; border-radius:.7rem; padding:0 1rem; cursor:pointer;
    font:inherit; font-weight:600; }
  .finishbtns .fghost { background:none; border:1px solid rgba(214,183,130,.5); color:#f1e2c6; }
  .finishbtns .fghost:hover { background:rgba(60,42,26,.8); }
  .finishbtns .fgo { border:0; background:linear-gradient(160deg,#573f2b,#2a1c12); color:#fbf6ea; }
  .finishbtns .fgo:hover { background:#4a3526; }
  /* Toast de confirmation (haut de l'écran : ne masque ni le texte ni le composer). */
  .finishtoast { position:fixed; left:50%; top:calc(1rem + env(safe-area-inset-top)); z-index:41;
    display:flex; align-items:center; gap:.5rem; max-width:calc(100% - 2rem); padding:.6rem 1rem;
    border-radius:999px; font-family:Georgia,serif; font-size:.9rem; color:#f6ecda;
    background:rgba(45,31,19,.96); border:1px solid rgba(214,183,130,.5);
    box-shadow:0 10px 30px rgba(0,0,0,.45); opacity:0; pointer-events:none;
    transform:translate(-50%,-.6rem); transition:opacity .3s ease, transform .3s ease; }
  .finishtoast.show { opacity:1; transform:translate(-50%,0); }
  .finishtoast .ico svg { width:1rem; height:1rem; fill:none; stroke:#9ed6a4; stroke-width:2.4;
    stroke-linecap:round; stroke-linejoin:round; }
  .discussion .dclose { position:absolute; top:calc(1rem + env(safe-area-inset-top)); left:calc(1rem + env(safe-area-inset-left));
    z-index:4; cursor:pointer; font:inherit; font-size:.82rem; color:#f1e2c6; padding:.55rem .9rem; min-height:2.5rem;
    border-radius:.5rem; border:1px solid rgba(241,226,198,.35); background:rgba(30,20,12,.74); }
  .discussion .dreset { position:absolute; top:calc(3.7rem + env(safe-area-inset-top)); left:calc(1rem + env(safe-area-inset-left));
    z-index:4; cursor:pointer; font:inherit; font-size:.74rem; color:rgba(241,226,198,.72); background:none; border:0;
    text-decoration:underline; padding:.6rem .1rem; min-height:2.75rem; }
  /* Tableau repliable : sous 1024px il masquerait le personnage (axe visé par DISC_CAM) → replié par défaut. */
  .boardtoggle { display:none; }
  .diag { position:fixed; left:6px; bottom:6px; z-index:60; font:11px ui-monospace,monospace; color:#7CFC98;
    background:rgba(0,0,0,.72); padding:3px 7px; border-radius:4px; max-width:92vw; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  /* Barre d'actions de la salle : « Discuter » + « Ouvrir album » CÔTE À CÔTE (jamais superposés).
     Sous mobile, les libellés sont masqués → deux icônes tactiles 44px côte à côte. */
  .actions { position:fixed; left:50%; bottom:calc(5.7rem + env(safe-area-inset-bottom)); transform:translateX(-50%);
    z-index:9; display:none; align-items:center; gap:.7rem; }
  .actions.show { display:flex; }
  .action { cursor:pointer; display:inline-flex; align-items:center; gap:.5rem; font-family:Georgia,serif;
    font-size:.95rem; letter-spacing:.04em; color:#f1e2c6; padding:.55rem 1.2rem; border-radius:2rem;
    border:1px solid rgba(214,183,130,.5); background:linear-gradient(160deg,#573f2b,#2a1c12);
    box-shadow:0 12px 26px rgba(20,12,6,.5); white-space:nowrap; }
  .action:hover { background:linear-gradient(160deg,#6a4d34,#33220f); }
  .action svg { width:1.1rem; height:1.1rem; flex:0 0 auto; fill:none; stroke:currentColor;
    stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
  /* Actions EXTÉRIEURES : mêmes boutons, EMPILÉS l'un AU-DESSUS de l'autre, en HAUT À DROITE.
     Un clic fait ENTRER dans la maison puis ouvre la vue demandée (voir #enterFromOutside). */
  .outside-actions { position:fixed; top:calc(1.1rem + env(safe-area-inset-top));
    right:calc(1.1rem + env(safe-area-inset-right)); z-index:9;
    display:none; flex-direction:column; align-items:flex-end; gap:.7rem; }
  .outside-actions.show { display:flex; }
  @media (max-width: 700px) {
    .action { width:3rem; height:3rem; padding:0; justify-content:center; border-radius:50%; }
    .action .lbl { display:none; }
    .action svg { width:1.35rem; height:1.35rem; }
    .actions { bottom:calc(5.2rem + env(safe-area-inset-bottom)); }
    .outside-actions { top:calc(.6rem + env(safe-area-inset-top));
      right:calc(.6rem + env(safe-area-inset-right)); gap:.5rem; }
  }
  @media (max-width: 1024px) {
    .boardtoggle { display:inline-block; position:absolute; top:calc(6.9rem + env(safe-area-inset-top));
      left:calc(1rem + env(safe-area-inset-left)); z-index:6; cursor:pointer; font:inherit; font-size:.78rem;
      color:#f1e2c6; padding:.55rem .85rem; min-height:2.5rem; border-radius:.5rem;
      border:1px solid rgba(241,226,198,.35); background:rgba(30,20,12,.74); }
    .discussion .dclose, .discussion .dreset { z-index:6; }
    /* Tableau replié : la zone basse n'a plus à réserver la place du tableau → plus de hauteur pour lire.
       30 % : au-delà, la zone basse recouvre le personnage sur téléphone. */
    .discussion.narrowboard .board { display:none; }
    /* Tableau déplié = panneau MODAL : il passe AU-DESSUS de la discussion (sinon, en paysage
       téléphone, le peu de hauteur disponible le ferait recouvrir le champ de saisie). */
    .discussion.narrowboard.narrowboard-open .board { display:block; top:calc(9.6rem + env(safe-area-inset-top));
      left:calc(.6rem + env(safe-area-inset-left)); right:calc(.6rem + env(safe-area-inset-right));
      bottom:calc(.6rem + env(safe-area-inset-bottom)); width:auto; height:auto; max-height:none; z-index:5; }
  }
  @media (max-width: 600px) {
    .bubble { width:100%; }
  }
  /* Composer compact : « Envoyer » et « Terminer » passent en icônes (cible 44 px). */
  @media (max-width: 700px) {
    .discussion .composer { gap:.4rem; padding-left:.7rem; padding-right:.7rem; }
    .discussion .composer button { width:2.75rem; padding:0; }
    .discussion .composer .lbl { display:none; }
    .discussion .composer .ico svg { width:1.2rem; height:1.2rem; }
  }
  @media (max-height: 700px) {
    .discbottom { padding-top:1rem; }
  }
  @media (orientation: landscape) and (max-height: 560px) {
    .discbottom { padding-top:1rem; }
    :host { --disc-h: 18rem; }
    .discussion .composer { padding:.45rem .8rem calc(.5rem + env(safe-area-inset-bottom)); }
    .rphoto { flex:0 0 44%; }
    .discussion .dreset { top:calc(3.2rem + env(safe-area-inset-top)); }
    .boardtoggle { top:calc(6.1rem + env(safe-area-inset-top)); }
  }

  /* ---------- BIBLIOTHÈQUE 3D (inventaire des livres) ---------- */
  .libraryov { position:fixed; inset:0; z-index:16; display:none; flex-direction:column;
    background:rgba(10,7,4,.92); overflow:auto;
    padding:calc(.8rem + env(safe-area-inset-top)) .8rem calc(.8rem + env(safe-area-inset-bottom)); }
  .libraryov.open { display:flex; }
  .librarybar { display:flex; align-items:center; gap:.8rem; width:100%; max-width:84rem; margin:0 auto .9rem; }
  .libraryheading { color:#f1e2c6; font-family:Georgia,serif; font-size:1.1rem; letter-spacing:.08em;
    text-transform:uppercase; }
  .librarygrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr)); gap:1.1rem;
    width:100%; max-width:84rem; margin:0 auto; }
  .libraryempty { grid-column:1 / -1; padding:2rem 1rem; text-align:center; color:#d8c7aa;
    font-family:Georgia,serif; border:1px dashed rgba(214,183,130,.3); border-radius:.5rem; }
  .bookcard { display:flex; flex-direction:column; gap:.45rem; min-width:0; }
  .bookcover { position:relative; aspect-ratio:3 / 4; padding:1.2rem .9rem; border-radius:.25rem .55rem .55rem .25rem;
    background:linear-gradient(145deg, var(--cover-a), var(--cover-b));
    border:1px solid rgba(255,255,255,.12); box-shadow:0 12px 24px rgba(0,0,0,.45), inset 5px 0 12px rgba(0,0,0,.35);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.65rem;
    color:var(--cover-ink); overflow:hidden; }
  .bookcover::after { content:""; position:absolute; inset:0 auto 0 0; width:.45rem;
    background:linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.05)); }
  .bookcover-rule { width:70%; height:1px; background:currentColor; opacity:.55; }
  .bookcover-title { font-family:Georgia,"Times New Roman",serif; font-size:.9rem; line-height:1.25;
    text-align:center; text-shadow:0 1px 2px rgba(0,0,0,.55); }
  .bookmeta { display:flex; flex-direction:column; gap:.1rem; color:#e7d6b8; font-size:.78rem; }
  .bookmeta strong { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bookmeta span { color:#bda98b; }
  @media (max-width:600px) {
    .librarygrid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; }
    .libraryheading { font-size:.95rem; }
  }

  .bookcard { border:0; padding:0; background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; }
  .bookcard:hover .bookcover { transform:translateY(-2px); box-shadow:0 16px 30px rgba(0,0,0,.55), inset 5px 0 12px rgba(0,0,0,.35); }
  .bookcard .bookcover { transition:transform .18s ease, box-shadow .18s ease; }
  .hidden { display:none !important; }
  .librarydetail { width:100%; max-width:60rem; margin:0 auto; display:flex; flex-direction:column; gap:1rem; }
  .librarypage-wrap { display:flex; justify-content:center; }
  .librarypage { position:relative; width:min(92vw, 44rem); min-height:24rem; padding:2.4rem 2.2rem 2.8rem;
    border-radius:.45rem; background:linear-gradient(180deg,#fbf6ea,#efe4cf);
    box-shadow:0 30px 60px rgba(0,0,0,.5), inset 0 0 60px rgba(120,90,45,.16);
    display:flex; flex-direction:column; align-items:center; gap:1rem; }
  .librarypage-count { position:absolute; right:1.2rem; bottom:.8rem; color:#7c674d; font-family:Georgia,serif; font-size:.8rem; }
  .librarypage-photo { max-width:100%; padding:.6rem; background:#fffdf8; border:1px solid #e2d6bd; box-shadow:0 10px 24px rgba(70,45,20,.25); }
  .librarypage-photo img { display:block; max-width:100%; max-height:55vh; object-fit:contain; }
  .librarypage-text { color:#3b2c1d; font-family:Georgia,"Times New Roman",serif; font-size:1rem; line-height:1.55; max-width:38rem; }
  .librarypage-nav { display:flex; justify-content:center; gap:1.4rem; }
`;
