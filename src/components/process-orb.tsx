"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

export function ProcessOrb({ state, label, still = false }: { state: OrbState; label: string; still?: boolean }) {
  const [paused, setPaused] = useState(false);
  return <div className="process-orb">
    <div className="process-orb-art"><ThinkingOrb state={state} size={64} theme="light" color="#c64c2b" speed={0.7} paused={paused || still} aria-label={label} /></div>
    {!still && <button className="orb-pause" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? "Resume animation" : "Pause animation"}>{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
  </div>;
}
