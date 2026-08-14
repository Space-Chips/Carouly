"use client";

import { createContext, useContext, useEffect, useState } from "react";

const HeroStageContext = createContext({ lit: true, movedUp: true });

export const useHeroStage = () => useContext(HeroStageContext);

/**
 * The landing hero starts on a dark stage, then turns its lights on. The timing
 * mirrors the reference implementation: its live/canvas state begins at 700ms.
 */
export default function HeroStage({ children }: { children: React.ReactNode }) {
  const [lit, setLit] = useState(false);
  const [movedUp, setMovedUp] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(true);
      setMovedUp(true);
      return;
    }

    const lightTimer = window.setTimeout(() => setLit(true), 700);
    const moveTimer = window.setTimeout(() => setMovedUp(true), 1700);
    return () => {
      window.clearTimeout(lightTimer);
      window.clearTimeout(moveTimer);
    };
  }, []);

  return (
    <HeroStageContext.Provider value={{ lit, movedUp }}>
      <section className={`hero-wash ${lit ? "hero-lit" : ""}`}>
        <div className={`hero-content ${movedUp ? "hero-content-moved" : ""}`}>
          {children}
        </div>
      </section>
    </HeroStageContext.Provider>
  );
}
