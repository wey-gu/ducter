// Pebble, as design/ui.md and apps/site/src/styles/site.css define it. The video adds no colors of
// its own: every value here is a Pebble or Isles token.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const C = {
  bg: "#FFF6EA",
  bgDeep: "#FCECD7",
  surface: "#FFFFFF",
  sunken: "#F7EBDA",
  ink: "#2B2118",
  ink2: "#4A3D30",
  muted: "#75654F",
  faint: "#C7B49A",
  line: "#E8D9C4",
  line2: "#E0C9B0",
  accent: "#FF8A3D",
  accentLedge: "#C9642A",
  decideSurface: "#FFE3CF",
  decideInk: "#8A3A0C",
  decideLedge: "#F0C29E",
  ok: "#7FD99A",
  okStrong: "#2FA45C",
  okSurface: "#D6F5DC",
  okInk: "#1F5E2F",
  work: "#4BA8F0",
  // the Isles (theme.go)
  skyTop: "#E9EEEA",
  sky: "#FCEBD6",
  haze: "#FFF6EA",
  seaFar: "#C4E6DF",
  sea: "#A6D8D0",
  seaNear: "#86C4BC",
  plank: "#D9A76A",
  plankDark: "#A8743E",
  rope: "#8A6236",
  parcel: "#FFF3E0",
  parcelEdge: "#C98F4E",
  // the terminal on the site (.term)
  term: "#2B2118",
  termBar: "#3D3127",
  termText: "#F3E7D6",
} as const;

// Latin and digits in Bricolage; Chinese headings in Resource Han Rounded, body in PingFang SC /
// Noto Sans SC (D78). Bricolage has no CJK glyphs, so one stack serves both languages.
export const FONT = "Bricolage, 'PingFang SC', 'Noto Sans SC', sans-serif";
export const HEAD = "Bricolage, 'Ducter Rounded SC', 'PingFang SC', sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

loadFont({ family: "Bricolage", url: staticFile("fonts/bricolage.woff2"), weight: "200 800" });
loadFont({ family: "Ducter Rounded SC", url: staticFile("fonts/rounded-sc-bold.woff2"), weight: "700 900", unicodeRange: "U+2E80-9FFF, U+3000-303F, U+FF00-FFEF" });
loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono.woff2"), weight: "400" });

// Pebble's depth: a solid base under every card, a press-down ledge under every button.
export const cardShadow = `0 4px 0 ${C.line}, 0 18px 40px -18px rgba(43,33,24,0.25)`;

// One type scale for every scene (16:9 / 1:1), and one place for the headline: top left, inside
// margins that keep clear of X's overlays (the bottom ~12% and the right edge on a phone).
export const TYPE = {
  wide: { h1: 96, sub: 38, x: 120, y: 96, right: 160, bottom: 130 },
  square: { h1: 72, sub: 31, x: 72, y: 76, right: 110, bottom: 130 },
} as const;

// Motion tokens (design/ui.md): words enter like the apps' text (a short rise and a fade, calm);
// clay moves bouncy; the equip is peel -> arc -> snap.
export const MOTION = {
  enterFrames: 8, // 220 ms at 30 fps, rounded up to a frame
  rise: 14,
  wordStagger: 2,
} as const;
