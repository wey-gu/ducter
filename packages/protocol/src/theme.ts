// research/248 phase 1 (D673): a theme is pure token data — colours, the shipped type faces,
// radii, depth/shadow and motion — for a light and a dark paper. No code, no reads, no network,
// no layout. One `theme.json` (`ducter-theme/1`) is read by both clients (the web's CSS variables
// and the Mac's theme.Tokens) from the same schema; the default is Pebble (themes/pebble.json).
//
// A theme may only change the tokens below. The structural tokens the clients derive from them
// (sunken surfaces, button ledges, the Devices scene, file-family colours, the locator, the clay
// art's ground) stay Pebble's, so a theme can never break the shell's chrome or a component's
// depth. Missing tokens fall back to Pebble's own value (the person's brief), so a half-written
// theme is still a whole look, never half-Pebble at a broken contrast.

/** The one theme format. */
export const THEME_FORMAT = "ducter-theme/1";
/** The theme file inside a `theme` plugin. */
export const THEME_FILE = "theme.json";

/** A semantic state's mark (dot), tinted surface and the ink on it (needs-you, done, …). */
export interface ThemeStateTokens {
  dot: string;
  surface: string;
  ink: string;
}

/** The colours of one paper (light or dark). */
export interface ThemeModeTokens {
  /** The page's ground. */
  bg: string;
  /** Cards and the composer. */
  surface: string;
  /** A raised surface (the knob, a raised row). */
  surfaceRaised: string;
  /** Primary text. */
  ink: string;
  /** Muted/secondary text. */
  inkMuted: string;
  /** The accent: the user's bubble, the send, the equip. */
  accent: string;
  /** Ink drawn on the accent. */
  onAccent: string;
  /** Hairlines. */
  line: string;
  userBubble: string;
  onUserBubble: string;
  partnerBubble: string;
  onPartnerBubble: string;
  /** needs-you (D482's ask, a waiting decision). */
  decide: ThemeStateTokens;
  /** working (under way). */
  progress: ThemeStateTokens;
  /** waiting (a task resting on its wait). */
  wait: ThemeStateTokens;
  /** done. */
  ok: ThemeStateTokens;
  /** failed. */
  fail: ThemeStateTokens;
}

/** Both papers. Every theme declares both; a dark-only look still ships a light paper. */
export interface ThemeTokens {
  light: ThemeModeTokens;
  dark: ThemeModeTokens;
}

/** The motion personality and its two bounded durations (D290's vocabulary). */
export interface ThemeMotion {
  personality: "bouncy" | "snappy" | "calm" | "stepped";
  /** A press, milliseconds; clamped so a theme may not make a press slow. */
  press: number;
  /** A screen or notice entering, milliseconds; the same bound. */
  enter: number;
}

/** The radius scale a theme may set (the shipped scale's values only). */
export interface ThemeShape {
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  pill: number;
}

/** The depth personality (D76, ui.md): how a card or button stands. */
export type ThemeDepth = "press" | "offset" | "hairline" | "glow";

/** A `theme.json` document. */
export interface ThemeManifest {
  format: typeof THEME_FORMAT;
  name: { en: string; zh?: string };
  tokens: ThemeTokens;
  /** Optional; Pebble's when absent. */
  motion?: ThemeMotion;
  shape?: ThemeShape;
  depth?: ThemeDepth;
  density?: "comfortable" | "compact";
}

/** The flat colour keys of one mode, in the order the schema and Pebble fill them. */
export const MODE_KEYS = [
  "bg",
  "surface",
  "surfaceRaised",
  "ink",
  "inkMuted",
  "accent",
  "onAccent",
  "line",
  "userBubble",
  "onUserBubble",
  "partnerBubble",
  "onPartnerBubble",
] as const;
/** The semantic states a mode fills, each a {dot, surface, ink}. */
export const STATE_KEYS = ["decide", "progress", "wait", "ok", "fail"] as const;

/** A #rrggbb colour, as the schema requires. */
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = (s: string) => {
    const v = parseInt(s, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(hex.slice(1, 3)) + 0.7152 * c(hex.slice(3, 5)) + 0.0722 * c(hex.slice(5, 7));
}

/** The WCAG contrast ratio of fg on bg (both opaque #rrggbb). */
export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** One text-on-surface pair the clients actually use, and its floor (WCAG AA). */
export interface ThemeContrastPair {
  name: string;
  fg: string;
  bg: string;
  min: number;
}

/**
 * The pairs `check` holds a theme to, on the grounds the clients really set them (the Mac's
 * `contrast_test.go` pairs): 4.5:1 for text on its ground, in both papers. The state marks are
 * fills (their ink on their own surface is the text); the accent is a fill with `on-accent` ink.
 */
export function contrastPairs(m: ThemeModeTokens): ThemeContrastPair[] {
  const state = (n: string, s: ThemeStateTokens): ThemeContrastPair[] => [
    { name: `${n} ink / ${n} surface`, fg: s.ink, bg: s.surface, min: 4.5 },
  ];
  return [
    { name: "ink / bg", fg: m.ink, bg: m.bg, min: 4.5 },
    { name: "ink / surface", fg: m.ink, bg: m.surface, min: 4.5 },
    { name: "inkMuted / bg", fg: m.inkMuted, bg: m.bg, min: 4.5 },
    { name: "inkMuted / surface", fg: m.inkMuted, bg: m.surface, min: 4.5 },
    { name: "onAccent / accent", fg: m.onAccent, bg: m.accent, min: 4.5 },
    { name: "onUserBubble / userBubble", fg: m.onUserBubble, bg: m.userBubble, min: 4.5 },
    { name: "onPartnerBubble / partnerBubble", fg: m.onPartnerBubble, bg: m.partnerBubble, min: 4.5 },
    ...state("decide", m.decide),
    ...state("progress", m.progress),
    ...state("wait", m.wait),
    ...state("ok", m.ok),
    ...state("fail", m.fail),
  ];
}

const st = (dot: string, surface: string, ink: string): ThemeStateTokens => ({ dot, surface, ink });

/**
 * Pebble, the default theme, as token data (the same values as `apps/desktop/internal/theme` and
 * `apps/web/static/app.css`). `themes/pebble.json` is the same object, kept in step by
 * `packages/protocol/test/theme-pebble.test.ts`.
 */
export const PEBBLE_TOKENS: ThemeTokens = {
  light: {
    bg: "#FFF6EA",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFBF0",
    ink: "#2B2118",
    inkMuted: "#75654F",
    accent: "#FF8A3D",
    onAccent: "#2B2118",
    line: "#E8D9C4",
    userBubble: "#FF8A3D",
    onUserBubble: "#2B2118",
    partnerBubble: "#FFFFFF",
    onPartnerBubble: "#2B2118",
    decide: st("#FF8A3D", "#FFE3CF", "#8A3A0C"),
    progress: st("#4BA8F0", "#DCEFFF", "#174A75"),
    wait: st("#FFC94D", "#FFF0BF", "#6B5000"),
    ok: st("#7FD99A", "#D6F5DC", "#1F5E2F"),
    fail: st("#E5577A", "#FBDDE4", "#8A1F3B"),
  },
  dark: {
    bg: "#17120E",
    surface: "#231C16",
    surfaceRaised: "#2A221B",
    ink: "#F6EBDD",
    inkMuted: "#A8957E",
    accent: "#FF8A3D",
    onAccent: "#2B2118",
    line: "#3A3027",
    userBubble: "#FF8A3D",
    onUserBubble: "#2B2118",
    partnerBubble: "#2A221B",
    onPartnerBubble: "#F6EBDD",
    decide: st("#FF8A3D", "#3D2414", "#FFC39B"),
    progress: st("#4BA8F0", "#15283A", "#A9D6FB"),
    wait: st("#FFC94D", "#362B0E", "#FFE08A"),
    ok: st("#7FD99A", "#163222", "#A6ECBB"),
    fail: st("#E5577A", "#3A1621", "#F8A9BC"),
  },
};

/** Pebble's motion, radius and density defaults, what a theme falls back to. */
export const PEBBLE_MOTION: ThemeMotion = { personality: "bouncy", press: 70, enter: 220 };
export const PEBBLE_SHAPE: ThemeShape = { radiusSm: 12, radiusMd: 16, radiusLg: 24, radiusXl: 28, pill: 999 };
export const PEBBLE_DEPTH: ThemeDepth = "press";

/** The motion bounds (D290): a press or an enter may not leave the vocabulary. */
export const MOTION_PRESS = { min: 40, max: 140 } as const;
export const MOTION_ENTER = { min: 120, max: 320 } as const;
