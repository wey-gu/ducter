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

export const FONT = "Bricolage, 'Noto Sans SC', sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

loadFont({ family: "Bricolage", url: staticFile("fonts/bricolage.woff2"), weight: "200 800" });
loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono.woff2"), weight: "400" });

// Pebble's depth: a solid base under every card, a press-down ledge under every button.
export const cardShadow = `0 4px 0 ${C.line}, 0 18px 40px -18px rgba(43,33,24,0.25)`;
