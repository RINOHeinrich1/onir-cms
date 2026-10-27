"use client";

import { useEffect } from "react";

/** Signale au loader que la surface widget est réellement servie (ADR-0041). */
export function WidgetReadySignal() {
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ __onirWidget: 1, type: "ready" }, "*");
  }, []);
  return null;
}
