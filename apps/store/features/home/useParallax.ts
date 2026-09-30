"use client";

import { type RefObject, useEffect } from "react";

/** Escribe `--parallax` (px) en el elemento según el scroll, para moverlo con
 * `translate3d` desde CSS. No hace nada si el usuario pidió menos movimiento. */
export function useParallax(ref: RefObject<HTMLElement | null>, speed = 0.35) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.setProperty("--parallax", `${Math.min(window.scrollY, window.innerHeight) * speed}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, speed]);
}
