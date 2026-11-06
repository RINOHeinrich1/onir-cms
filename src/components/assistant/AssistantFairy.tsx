"use client";

import type { AnimationItem } from "lottie-web";
import { useEffect, useRef } from "react";
import animationData from "./onir-fairy-launcher-v7.json";

export function AssistantFairy() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let cancelled = false;
    let animation: AnimationItem | null = null;

    void import("lottie-web").then(({ default: lottie }) => {
      if (cancelled) return;
      animation = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        animationData,
      });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        animation.goToAndStop(0, true);
      } else {
        animation.play();
      }
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, []);

  return <div className="assistant-fairy" ref={containerRef} aria-hidden="true" />;
}
