(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute("data-onir-token");
  if (!token) {
    console.warn("[onir-widget] data-onir-token manquant");
    return;
  }

  var existing = document.querySelector('iframe[data-onir-widget-token="' + cssEscape(token) + '"]');
  if (existing) return;

  var origin = new URL(script.src, window.location.href).origin;
  var position = normalizePosition(script.getAttribute("data-onir-position"));
  var closedWidth = positiveNumber(script.getAttribute("data-onir-closed-width"), 64);
  var closedHeight = positiveNumber(script.getAttribute("data-onir-closed-height"), 64);
  var openWidth = positiveNumber(script.getAttribute("data-onir-open-width"), 420);
  var openHeight = positiveNumber(script.getAttribute("data-onir-open-height"), 680);
  var margin = positiveNumber(script.getAttribute("data-onir-margin"), 16);
  var zIndex = script.getAttribute("data-onir-z-index") || "2147483000";

  var iframe = document.createElement("iframe");
  iframe.title = script.getAttribute("data-onir-title") || "Assistant";
  iframe.src = origin + "/embed/" + encodeURIComponent(token);
  iframe.setAttribute("data-onir-widget-token", token);
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("allowtransparency", "true");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.style.position = "fixed";
  iframe.style.border = "0";
  iframe.style.margin = "0";
  iframe.style.padding = "0";
  iframe.style.setProperty("background", "transparent", "important");
  iframe.style.borderRadius = "50%";
  iframe.style.outline = "none";
  iframe.style.colorScheme = "light dark";
  iframe.style.zIndex = zIndex;
  iframe.style.transition = "width 180ms ease, height 180ms ease, opacity 180ms ease";
  iframe.style.opacity = "0";
  iframe.style.overflow = "hidden";
  applyPosition(position);
  setSize(closedWidth, closedHeight);

  function normalizePosition(value) {
    return ["bottom-right", "bottom-left", "top-right", "top-left"].indexOf(value) >= 0
      ? value
      : "bottom-right";
  }

  function positiveNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function applyPosition(value) {
    iframe.style.left = "auto";
    iframe.style.right = "auto";
    iframe.style.top = "auto";
    iframe.style.bottom = "auto";
    if (value === "bottom-left" || value === "top-left") {
      iframe.style.left = margin + "px";
    } else {
      iframe.style.right = margin + "px";
    }
    if (value === "top-left" || value === "top-right") {
      iframe.style.top = margin + "px";
    } else {
      iframe.style.bottom = margin + "px";
    }
  }

  function setSize(width, height) {
    var maxWidth = Math.max(240, window.innerWidth - margin * 2);
    var maxHeight = Math.max(240, window.innerHeight - margin * 2);
    var nextWidth = Math.min(Math.max(width, 48), maxWidth);
    var nextHeight = Math.min(Math.max(height, 48), maxHeight);
    iframe.style.width = nextWidth + "px";
    iframe.style.height = nextHeight + "px";
  }

  function open(payload) {
    var data = payload && typeof payload === "object" ? payload : {};
    var width = positiveNumber(data.width, openWidth);
    var height = positiveNumber(data.height, openHeight);
    applyPosition(position);
    iframe.style.borderRadius = "22px";
    setSize(width, height);
    iframe.focus();
  }

  function close() {
    iframe.style.borderRadius = "50%";
    setSize(closedWidth, closedHeight);
  }

  function onMessage(event) {
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.__onirWidget !== 1) return;
    if (data.type === "open") open(data);
    else if (data.type === "close") close();
  }

  iframe.addEventListener("load", function () {
    iframe.style.opacity = "1";
  });
  window.addEventListener("message", onMessage);

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return value.replace(/["\\]/g, "\\$&");
  }

  (document.body || document.documentElement).appendChild(iframe);
})();
