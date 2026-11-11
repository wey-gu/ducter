// The pieces every scene uses, drawn with Pebble's tokens: clay art, the headline, buttons,
// bubbles, tags, the Mac window, the phone, a tap and sparkles.
import type { CSSProperties, ReactNode } from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { hasCJK, useCopy, useLang, zhGap } from "./copy";
import { C, FONT, HEAD, MONO, MOTION, TYPE } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

/** A spring from 0 to 1 that starts at frame `at` (Pebble's motion is bouncy). */
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
export const useType = () => (useSquare() ? TYPE.square : TYPE.wide);

/** Text as it should be set in the current language (D78's quarter-em gaps for zh). */
export const useT = () => {
  const lang = useLang();
  return (s: string) => (lang === "zh" ? zhGap(s) : s);
};

/** `safe` names an element the safe-area audit (scripts/audit.ts) checks stays inside the frame. */
export const Art = ({ src, style, safe }: { src: string; style?: CSSProperties; safe?: string }) => (
  <Img src={staticFile(src)} data-safe={safe} style={{ display: "block", ...style }} />
);

export const Fill = ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: FONT, ...style }}>{children}</div>
);

/** The app's text entrance (220 ms: a short rise and a fade), word by word; zh by phrase. */
const enter = (frame: number, at: number) => {
  const p = interpolate(frame, [at, at + MOTION.enterFrames], [0, 1], { ...clamp, easing: easeOut });
  return { opacity: p, transform: `translateY(${(1 - p) * MOTION.rise}px)` };
};

/** Split a line into the pieces that enter one after another: words, or zh phrases. */
const pieces = (line: string): { text: string; gap: boolean }[] => {
  if (!hasCJK(line)) return line.split(" ").map((w) => ({ text: w, gap: true }));
  const out: { text: string; gap: boolean }[] = [];
  for (const chunk of line.split(" ")) {
    // break after Chinese punctuation, so a phrase enters as one
    const parts = chunk.split(/(?<=[，。、；：？！])/);
    parts.forEach((p, i) => out.push({ text: p, gap: i === parts.length - 1 }));
  }
  return out;
};

export const Caption = ({ text, at = 0, size, color = C.ink, align = "left", style }: { text: string; at?: number; size?: number; color?: string; align?: "left" | "center"; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const type = useType();
  const zh = hasCJK(text);
  const fs = (size ?? type.h1) * (zh ? 0.94 : 1); // D78: the rounded face at 94%
  let i = 0;
  return (
    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: fs, lineHeight: zh ? 1.22 : 1.04, letterSpacing: zh ? 0 : "-0.025em", color, textAlign: align, ...style }}>
      {text.split("\n").map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {pieces(line).map((w, wi, arr) => (
            <span key={wi} style={{ display: "inline-block", marginRight: wi < arr.length - 1 && w.gap ? (zh ? "0.25em" : "0.24em") : 0, ...enter(frame, at + (i++) * MOTION.wordStagger) }}>
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

export const Sub = ({ text, at = 0, size, style }: { text: string; at?: number; size?: number; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const type = useType();
  const t = useT();
  return (
    <div style={{ fontFamily: FONT, fontWeight: 550, fontSize: size ?? type.sub, lineHeight: hasCJK(text) ? 1.6 : 1.3, color: C.ink2, whiteSpace: "pre-line", ...enter(frame, at), ...style }}>
      {t(text)}
    </div>
  );
};

/** The headline in its one place: top left, the same baseline in every scene. */
export const Headline = ({ h, sub, at = 4, color, subColor }: { h: string; sub?: string; at?: number; color?: string; subColor?: string }) => {
  const type = useType();
  const words = h.split(/\s+/).length;
  return (
    <div data-safe="headline" style={{ position: "absolute", left: type.x, top: type.y, zIndex: 5 }}>
      <Caption text={h} at={at} color={color} />
      {sub && <Sub text={sub} at={at + Math.min(words, 8) * MOTION.wordStagger + 4} style={{ marginTop: 18, color: subColor ?? C.ink2 }} />}
    </div>
  );
};

type BtnKind = "ink" | "secondary" | "accent" | "plain";
/** Pebble's press-down buttons. `pressed` goes 0 → 1 as the button is pushed onto its ledge. */
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

export const Tag = ({ children, sub, style, chosen = false, dot }: { children: ReactNode; sub?: ReactNode; style?: CSSProperties; chosen?: boolean; dot?: string }) => (
  <div
    data-safe="tag"
    style={{
      fontFamily: FONT, background: C.bg, borderRadius: 14, padding: "8px 16px", textAlign: "center", color: C.ink,
      boxShadow: `0 3px 0 ${C.line2}${chosen ? `, 0 0 0 2.5px ${C.ink}` : ""}`, whiteSpace: "nowrap", ...style,
    }}
  >
    <div style={{ fontWeight: 800, fontSize: 24 }}>{children}</div>
    {sub && (
      <div style={{ fontWeight: 650, fontSize: 18, color: dot ? "#174A75" : C.muted, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        {dot && <span style={{ width: 9, height: 9, borderRadius: 5, background: dot }} />}
        {sub}
      </div>
    )}
  </div>
);

export const Bubble = ({ who, children, style }: { who: "you" | "partner"; children: ReactNode; style?: CSSProperties }) => {
  const zh = useLang() === "zh";
  return (
    <div
      style={{
        fontFamily: FONT, fontSize: 27, lineHeight: zh ? 1.65 : 1.45, fontWeight: 450, color: C.ink, padding: "14px 22px",
        background: who === "you" ? C.accent : C.surface, maxWidth: 860,
        borderRadius: who === "you" ? "22px 22px 6px 22px" : "22px 22px 22px 6px",
        alignSelf: who === "you" ? "flex-end" : "flex-start",
        boxShadow: who === "you" ? `0 3px 0 ${C.accentLedge}` : `0 3px 0 ${C.line}`, ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Code = ({ children }: { children: ReactNode }) => (
  <span style={{ fontFamily: MONO, fontSize: "0.86em", background: C.sunken, padding: "1px 8px", borderRadius: 8 }}>{children}</span>
);

/** The Mac app's window: traffic lights, Ducter's face and status, Devices and On hand. */
export const MacWindow = ({ face, status, children, width = 1180, height = 800, style }: { face: string; status: string; children: ReactNode; width?: number; height?: number; style?: CSSProperties }) => {
  const c = useCopy();
  const t = useT();
  return (
    <div data-safe="window" style={{ width, height, borderRadius: 22, background: C.bg, overflow: "hidden", position: "relative", fontFamily: FONT, boxShadow: `0 0 0 1px ${C.line}, 0 6px 0 ${C.line2}, 0 50px 90px -30px rgba(74,50,26,0.45)`, ...style }}>
      <div style={{ height: 92, display: "flex", alignItems: "center", padding: "0 26px", gap: 18, borderBottom: `1px solid ${C.line}`, background: "#FFFAF3" }}>
        <div style={{ display: "flex", gap: 9 }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((col) => <div key={col} style={{ width: 15, height: 15, borderRadius: 8, background: col }} />)}
        </div>
        <Art src={face} style={{ width: 64, height: 64, objectFit: "contain", marginLeft: 8 }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 28, color: C.ink }}>Ducter</div>
          <div style={{ fontWeight: 500, fontSize: 18, color: C.muted, minHeight: 22 }}>{t(status)}</div>
        </div>
        <div style={{ flex: 1 }} />
        <Btn scale={1.05}>{c.devices}</Btn>
        <Btn scale={1.05}>{c.onHand}</Btn>
      </div>
      {children}
    </div>
  );
};

/** An iPhone, drawn: ink bezel, the dynamic island, the time. */
export const Phone = ({ children, width = 430, style }: { children: ReactNode; width?: number; style?: CSSProperties }) => {
  const h = width * 2.06;
  return (
    <div data-safe="phone" style={{ width, height: h, borderRadius: width * 0.16, background: "#231A13", padding: width * 0.032, boxShadow: `inset 0 0 0 2px #4A3D30, 0 50px 90px -30px rgba(74,50,26,0.5)`, ...style }}>
      <div style={{ width: "100%", height: "100%", borderRadius: width * 0.13, background: C.bg, overflow: "hidden", position: "relative", fontFamily: FONT }}>
        <div style={{ position: "absolute", top: width * 0.03, left: "50%", transform: "translateX(-50%)", width: width * 0.3, height: width * 0.085, borderRadius: 40, background: "#140D07" }} />
        <div style={{ position: "absolute", top: width * 0.045, left: width * 0.1, fontWeight: 700, fontSize: width * 0.042, color: C.ink }}>09:41</div>
        {children}
      </div>
    </div>
  );
};

/** A fingertip: a soft press, then a ring. */
export const Tap = ({ at, x, y, size = 1 }: { at: number; x: number; y: number; size?: number }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -10 || t > 24) return null;
  const finger = interpolate(t, [-10, -2, 6, 14], [0, 1, 1, 0], clamp);
  const ring = interpolate(t, [0, 22], [0, 1], { ...clamp, easing: easeOut });
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none", zIndex: 10 }}>
      <div style={{ position: "absolute", width: 64 * size, height: 64 * size, left: -32 * size, top: -32 * size, borderRadius: 999, background: "rgba(43,33,24,0.2)", border: `${2 * size}px solid rgba(255,255,255,0.7)`, opacity: finger, transform: `scale(${t < 0 ? 1.15 - 0.15 * finger : 0.9})` }} />
      {t >= 0 && <div style={{ position: "absolute", width: 130 * size, height: 130 * size, left: -65 * size, top: -65 * size, borderRadius: 999, border: `${3 * size}px solid ${C.ink}`, opacity: (1 - ring) * 0.45, transform: `scale(${0.3 + ring * 0.9})` }} />}
    </div>
  );
};

export const Check = ({ size = 22, color = C.okStrong }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "-0.15em" }}>
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Sparkles where clay lands (the equip's snap, a device joining). */
export const Sparkles = ({ at, x, y, r = 70, n = 6, color = "#FFFDF4" }: { at: number; x: number; y: number; r?: number; n?: number; color?: string }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 22) return null;
  const p = interpolate(t, [0, 22], [0, 1], { ...clamp, easing: easeOut });
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const d = r * (0.45 + 0.75 * p) * (i % 2 ? 0.75 : 1);
        const s = (i % 2 ? 12 : 18) * (1 - p * 0.7) * interpolate(t, [0, 3], [0.3, 1], clamp);
        return (
          <svg key={i} width={s * 2} height={s * 2} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x + Math.cos(a) * d - s, top: y + Math.sin(a) * d * 0.6 - s, opacity: 1 - p * p, overflow: "visible" }}>
            <path d="M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10Z" fill={color} />
          </svg>
        );
      })}
    </>
  );
};

/** Ducter's own phone (D217): an Android phone, drawn: a slimmer ink bezel, a punch-hole camera,
 * the gesture bar. Not the owner's iPhone, so it reads as a different device at a glance. */
export const Android = ({ children, width = 400, style }: { children: ReactNode; width?: number; style?: CSSProperties }) => {
  const h = width * 2.2;
  return (
    <div data-safe="phone" style={{ width, height: h, borderRadius: width * 0.1, background: "#231A13", padding: width * 0.026, boxShadow: `inset 0 0 0 2px #4A3D30, 0 50px 90px -30px rgba(74,50,26,0.5)`, ...style }}>
      <div style={{ width: "100%", height: "100%", borderRadius: width * 0.08, background: C.surface, overflow: "hidden", position: "relative", fontFamily: FONT }}>
        <div style={{ position: "absolute", top: width * 0.03, left: "50%", marginLeft: -width * 0.024, width: width * 0.048, height: width * 0.048, borderRadius: 99, background: "#140D07", zIndex: 3 }} />
        <div style={{ position: "absolute", top: width * 0.032, left: width * 0.07, fontWeight: 650, fontSize: width * 0.038, color: C.ink, zIndex: 3 }}>14:52</div>
        {children}
        <div style={{ position: "absolute", bottom: width * 0.025, left: "50%", marginLeft: -width * 0.14, width: width * 0.28, height: width * 0.012, borderRadius: 9, background: C.ink, opacity: 0.6, zIndex: 3 }} />
      </div>
    </div>
  );
};

/** A plain drawn play mark (never the emoji-capable triangle character). */
export const PlayMark = ({ size = 24, color = C.surface }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill={color} />
  </svg>
);
