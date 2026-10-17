"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ContourLines, FilmGrain, FlowingGradient, Shader, Spherize } from "shaders/react";

export function ResearchShader({ variant }: { variant: "hero" | "compact" }) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const compact = variant === "compact";
  return <div className={compact ? "compact-shader" : "hero-art"}>
    {!compact && <><span className="art-cross one" aria-hidden="true">+</span><span className="art-cross two" aria-hidden="true">+</span></>}
    <div className="shader-sphere" aria-hidden="true">
      {!paused && !reducedMotion && available && <Shader disableTelemetry onUnavailable={() => setAvailable(false)} style={{ width: "100%", height: "100%" }}>
        <FlowingGradient colorA="#222528" colorB="#737a80" colorC="#f0f0ed" colorD="#b9bec1" distortion={0.65} speed={compact ? 0.45 : 0.22} seed={4} />
        <ContourLines levels={28} lineWidth={0.65} softness={0.15} colorMode="custom" lineColor="#4e5357" backgroundColor="#b9bec1" opacity={0.42} />
        <Spherize radius={1} depth={0.7} lightPosition={{ x: 0.2, y: 0.2 }} lightIntensity={0.3} lightColor="#ffffff" />
        <FilmGrain strength={0.13} bias={0.6} />
      </Shader>}
      <div className="shader-contours" />
    </div>
    {!compact && <><div className="shader-orbit" aria-hidden="true" /><div className="art-caption mono"><span>Figure 01<strong>Observe. Test. Repeat.</strong></span><span>Uncertainty<strong>is a starting point.</strong></span></div>{!reducedMotion && available && <button className="motion-control" onClick={() => setPaused(!paused)} aria-label={paused ? "Play background animation" : "Pause background animation"}>{paused ? <Play size={12} /> : <Pause size={12} />}</button>}</>}
  </div>;
}
