import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ParticleOverlayConfig } from "../../src/types";

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  drift: number;
}

// Seeded pseudo-random so particles are stable across frames
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

interface ParticleOverlayProps {
  config: ParticleOverlayConfig;
  durationFrames?: number;
}

export const ParticleOverlay: React.FC<ParticleOverlayProps> = ({ config, durationFrames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const d = durationFrames ?? durationInFrames;

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: config.count }, (_, i) => ({
      x:     seededRandom(i * 7.1)  * 100,
      y:     seededRandom(i * 3.7)  * 100,
      size:  seededRandom(i * 11.3) * 16 + 4,
      speed: seededRandom(i * 5.9)  * 0.04 + 0.01,
      phase: seededRandom(i * 13.1) * Math.PI * 2,
      drift: (seededRandom(i * 17.3) - 0.5) * 0.02,
    }));
  }, [config.count]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p, i) => {
        const drift = p.drift * frame;
        const rise  = p.speed * frame;
        const px    = (p.x + drift * 100 + 200) % 100;
        const py    = ((p.y - rise * 100) + 200) % 100;
        const pulse = Math.sin(frame * 0.05 + p.phase);
        const fadeIn  = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const fadeOut = interpolate(frame, [d - 15, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const alpha   = config.opacity * fadeIn * fadeOut * (0.4 + 0.6 * ((pulse + 1) / 2));

        return (
          <div
            key={i}
            style={{
              position:      "absolute",
              left:          `${px}%`,
              top:           `${py}%`,
              width:         p.size,
              height:        p.size,
              borderRadius:  "50%",
              backgroundColor: config.color,
              opacity:       alpha,
              filter:        `blur(${p.size * 0.4}px)`,
              transform:     "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
