// The pieces every scene uses, drawn with Pebble's tokens: clay art, captions, buttons, bubbles,
// tags, the Mac window and the phone.
import type { CSSProperties, ReactNode } from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, MONO, cardShadow } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A spring from 0 to 1 that starts at frame `at`. */
export const useSpring = (at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 120, mass: 0.9, ...config } });
};

/** Is this the square cut? Scenes lay out for 16:9 and for 1:1. */
export const useSquare = () => {
  const { width, height } = useVideoConfig();
  return width === height;
};

export const Art = ({ src, style }: { src: string; style?: CSSProperties }) => (
  <Img src={staticFile(src)} style={{ display: "block", ...style }} />
);

export const Fill = ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: FONT, ...style }}>{children}</div>
);

/** A headline: words rise in one after another. */
export const Caption = ({
  text, at = 0, size = 104, color = C.ink, align = "left", style, stagger = 3,
}: { text: string; at?: number; size?: number; color?: string; align?: "left" | "center"; style?: CSSProperties; stagger?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = text.split("\n");
  let i = 0;
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.025em", color, textAlign: align, ...style }}>
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.split(" ").map((w, wi) => {
            const s = spring({ frame: frame - at - (i++) * stagger, fps, config: { damping: 16, stiffness: 140 } });
            return (
              <span key={wi} style={{ display: "inline-block", opacity: s, transform: `translateY(${(1 - s) * 0.45 * size}px)`, marginRight: "0.24em" }}>
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const Sub = ({ text, at = 0, size = 40, style }: { text: string; at?: number; size?: number; style?: CSSProperties }) => {
  const s = useSpring(at, { damping: 20 });
  return (
    <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: size, lineHeight: 1.3, color: C.muted, opacity: s, transform: `translateY(${(1 - s) * 16}px)`, ...style }}>
      {text}
    </div>
  );
};

type BtnKind = "ink" | "secondary" | "accent" | "plain";
/** Pebble's press-down buttons. `pressed` goes 0 → 1 as the button is pushed down onto its ledge. */
export const Btn = ({ kind = "secondary", children, scale = 1, pressed = 0, onTint = false }: { kind?: BtnKind; children: ReactNode; scale?: number; pressed?: number; onTint?: boolean }) => {
  const ledge = 4 * scale;
  const look: Record<BtnKind, CSSProperties & { ledge: string }> = {
    ink: { background: "linear-gradient(#3B2D22, #2B2118)", color: C.bg, ledge: "#140D07" },
    secondary: { background: onTint ? C.surface : C.bg, color: C.ink, ledge: onTint ? "#E99A65" : "#CDAE8C" },
    accent: { background: C.accent, color: C.ink, ledge: C.accentLedge },
    plain: { background: "transparent", color: onTint ? C.decideInk : C.ink2, ledge: "transparent" },
  };
  const l = look[kind];
  const down = pressed * ledge;
  return (
    <div
      style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 17 * scale, padding: `${10 * scale}px ${18 * scale}px`, borderRadius: 12 * scale,
        background: l.background, color: l.color, transform: `translateY(${down}px)`, whiteSpace: "nowrap",
        boxShadow: kind === "plain" ? "none" : `inset 0 1.5px 0 rgba(255,255,255,${kind === "ink" ? 0.18 : 0.8}), 0 ${ledge - down}px 0 ${l.ledge}, 0 ${8 - down * 1.5}px 14px -6px rgba(43,33,24,${0.35 * (1 - pressed)})`,
      }}
    >
      {children}
    </div>
  );
};

export const Tag = ({ children, sub, style, chosen = false }: { children: ReactNode; sub?: ReactNode; style?: CSSProperties; chosen?: boolean }) => (
  <div
    style={{
      fontFamily: FONT, background: C.bg, borderRadius: 14, padding: "8px 16px", textAlign: "center", color: C.ink,
      boxShadow: `0 3px 0 ${C.line2}${chosen ? `, 0 0 0 2.5px ${C.ink}` : ""}`, whiteSpace: "nowrap", ...style,
    }}
  >
    <div style={{ fontWeight: 800, fontSize: 24 }}>{children}</div>
    {sub && <div style={{ fontWeight: 600, fontSize: 18, color: C.muted, marginTop: 2 }}>{sub}</div>}
  </div>
);

export const Bubble = ({ who, children, style }: { who: "you" | "partner"; children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      fontFamily: FONT, fontSize: 26, lineHeight: 1.45, fontWeight: 450, color: C.ink, padding: "14px 22px",
      background: who === "you" ? C.accent : C.surface, maxWidth: who === "you" ? 720 : 760,
      borderRadius: who === "you" ? "22px 22px 6px 22px" : "22px 22px 22px 6px",
      alignSelf: who === "you" ? "flex-end" : "flex-start",
      boxShadow: who === "you" ? `0 3px 0 ${C.accentLedge}` : `0 3px 0 ${C.line}`, ...style,
    }}
  >
    {children}
  </div>
);

export const Code = ({ children }: { children: ReactNode }) => (
  <span style={{ fontFamily: MONO, fontSize: "0.86em", background: C.sunken, padding: "1px 8px", borderRadius: 8 }}>{children}</span>
);

/** The Mac app's window: traffic lights, Ducter's face and status, Devices and On hand. */
export const MacWindow = ({ face, status, children, width = 1180, height = 800, style }: { face: string; status: string; children: ReactNode; width?: number; height?: number; style?: CSSProperties }) => (
  <div style={{ width, height, borderRadius: 22, background: C.bg, overflow: "hidden", position: "relative", boxShadow: `0 0 0 1px ${C.line}, 0 6px 0 ${C.line2}, 0 50px 90px -30px rgba(74,50,26,0.45)`, ...style }}>
    <div style={{ height: 92, display: "flex", alignItems: "center", padding: "0 26px", gap: 18, borderBottom: `1px solid ${C.line}`, background: "#FFFAF3" }}>
      <div style={{ display: "flex", gap: 9 }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />)}
      </div>
      <Art src={face} style={{ width: 64, height: 64, objectFit: "contain", marginLeft: 8 }} />
      <div>
        <div style={{ fontWeight: 800, fontSize: 28, color: C.ink }}>Ducter</div>
        <div style={{ fontWeight: 500, fontSize: 18, color: C.muted }}>{status}</div>
      </div>
      <div style={{ flex: 1 }} />
      <Btn scale={1.05}>Devices</Btn>
      <Btn scale={1.05}>On hand</Btn>
    </div>
    {children}
  </div>
);

/** An iPhone, drawn: ink bezel, the dynamic island, the time. */
export const Phone = ({ children, width = 430, style }: { children: ReactNode; width?: number; style?: CSSProperties }) => {
  const h = width * 2.06;
  return (
    <div style={{ width, height: h, borderRadius: width * 0.16, background: "#231A13", padding: width * 0.032, boxShadow: `inset 0 0 0 2px #4A3D30, 0 50px 90px -30px rgba(74,50,26,0.5)`, ...style }}>
      <div style={{ width: "100%", height: "100%", borderRadius: width * 0.13, background: C.bg, overflow: "hidden", position: "relative", fontFamily: FONT }}>
        <div style={{ position: "absolute", top: width * 0.03, left: "50%", transform: "translateX(-50%)", width: width * 0.3, height: width * 0.085, borderRadius: 40, background: "#140D07" }} />
        <div style={{ position: "absolute", top: width * 0.045, left: width * 0.1, fontWeight: 700, fontSize: width * 0.042, color: C.ink }}>09:41</div>
        {children}
      </div>
    </div>
  );
};

/** A soft pulse ring, used where a finger taps. */
export const Tap = ({ at, x, y }: { at: number; x: number; y: number }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -8 || t > 22) return null;
  const finger = interpolate(t, [-8, 0, 6, 14], [0, 1, 1, 0], clamp);
  const ring = interpolate(t, [0, 20], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      <div style={{ position: "absolute", width: 56, height: 56, left: -28, top: -28, borderRadius: 40, background: "rgba(43,33,24,0.22)", opacity: finger, transform: `scale(${0.8 + 0.2 * finger})` }} />
      <div style={{ position: "absolute", width: 120, height: 120, left: -60, top: -60, borderRadius: 80, border: `3px solid ${C.ink}`, opacity: (1 - ring) * 0.5 * (t >= 0 ? 1 : 0), transform: `scale(${0.3 + ring * 0.9})` }} />
    </div>
  );
};

export const Check = ({ size = 22, color = C.okStrong }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "-3px" }}>
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export { cardShadow };
