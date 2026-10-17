"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ContourLines, FilmGrain, FlowingGradient, Shader } from "shaders/react";

export function ResearchField({ active = false, muted = false }: { active?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [motion, setMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!preference.matches && document.visibilityState === "visible");
    update();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      observer.disconnect();
    };
  }, []);

  return <div ref={ref} className={`research-field ${active ? "field-active" : ""} ${muted ? "field-muted" : ""}`}>
    <div className="field-canvas" aria-hidden="true">
      {motion && visible && !paused && available && <Shader disableTelemetry onUnavailable={() => setAvailable(false)} style={{ width: "100%", height: "100%" }}>
        <FlowingGradient colorA="#131312" colorB="#3b3b37" colorC={active ? "#ec9264" : "#d8b998"} colorD="#75746d" distortion={0.8} speed={active ? 0.2 : 0.07} seed={18} />
        <ContourLines levels={22} lineWidth={0.8} softness={0.2} colorMode="custom" lineColor="#e8e4d8" backgroundColor="#171715" opacity={0.33} />
        <FilmGrain strength={0.09} bias={0.5} />
      </Shader>}
    </div>
    <div className="field-reticle" aria-hidden="true"><span /><span /></div>
    <span className="field-coordinate" aria-hidden="true">{active ? "OBSERVING SIGNAL" : "TRACE / FIELD NOTES"}</span>
    {motion && available && <button className="field-motion" onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume research animation" : "Pause research animation"}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>}
  </div>;
}
