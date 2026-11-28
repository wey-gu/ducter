// research/248 phase 1 (D673): the web client applies a theme as pure token data. The active
// theme's colours are injected as CSS variables over Pebble's own `app.css`, in the same
// selector structure (light, system dark, forced dark), so switching the paper (D302) and the
// theme (换回 Pebble / Back to Pebble) both "just work". A theme covers every surface token — the
// paper, the card, the chrome (the top bar uses --bg), the sunken surfaces, the faint inks and
// hairlines, the highlight and the scrim — all derived from the theme's own bg/surface/ink/line/
// accent, so nothing keeps Pebble's warm brown beside a cool paper. Scene and art (the Devices
// stage, the clay figures, the file-family colours) stay Pebble's.
import type { ThemeModeTokens, ThemeTokens } from "@ducter/protocol";

/** Mixes two #rrggbb colours: k of b over (1-k) of a. */
export function mixHex(a: string, b: string, k: number): string {
  const v = (s: string, o: number) => parseInt(s.slice(o, o + 2), 16);
  const ch = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  const r = Math.round(v(a, 1) * (1 - k) + v(b, 1) * k);
  const g = Math.round(v(a, 3) * (1 - k) + v(b, 3) * k);
  const bl = Math.round(v(a, 5) * (1 - k) + v(b, 5) * k);
  return `#${ch(r)}${ch(g)}${ch(bl)}`;
}

/** A #rrggbb colour as rgba(r,g,b,a). */
export function hexToRgba(hex: string, a: number): string {
  const v = (o: number) => parseInt(hex.slice(o, o + 2), 16);
  return `rgba(${v(1)}, ${v(3)}, ${v(5)}, ${a})`;
}

/**
 * The clay (D76) re-derived from the theme's paper: the buttons' ledges and seams, the cards'
 * bases, the drops and the dims. In the light it is the theme's line and ink pressed a little
 * deeper (Pebble's tan ledge under a cool paper read as two themes at once); on a dark paper the
 * ledges go toward black and the shadows stay black, as Pebble's own dark does. Both papers set
 * the same keys, so a light value never leaks into dark through the injected `:root`.
 */
export function clayToCss(m: ThemeModeTokens, dark: boolean): Record<string, string> {
  if (!dark) {
    return {
      "--needs-ledge": mixHex(m.decide.surface, m.decide.ink, 0.18),
      "--base": `0 4px 0 ${m.line}`,
      "--press-primary": mixHex(m.ink, "#000000", 0.5),
      "--primary-top": mixHex(m.ink, m.surface, 0.1),
      "--seam-primary": mixHex(m.ink, m.surface, 0.22),
      "--rim-primary": hexToRgba(m.bg, 0.08),
      "--hi-primary": hexToRgba(m.bg, 0.26),
      "--drop-primary": `0 7px 12px -4px ${hexToRgba(m.ink, 0.38)}`,
      "--press-quiet": mixHex(m.line, m.ink, 0.2),
      "--seam-quiet": mixHex(m.line, m.surface, 0.3),
      "--press-accent": mixHex(m.accent, m.ink, 0.3),
      "--seam-accent": mixHex(m.accent, m.surface, 0.25),
      "--rim": hexToRgba(m.ink, 0.09),
      "--drop": `0 7px 12px -4px ${hexToRgba(m.ink, 0.28)}`,
      "--drop-pressed": `0 1px 3px ${hexToRgba(m.ink, 0.22)}`,
      "--floating": `0 10px 32px ${hexToRgba(m.ink, 0.14)}`,
      "--scrim": hexToRgba(m.ink, 0.14),
      "--viewer-scrim": hexToRgba(m.bg, 0.97),
      "--pic-dim": hexToRgba(m.ink, 0.42),
      "--ring-back": hexToRgba(m.ink, 0.38),
    };
  }
  const deep = mixHex(m.bg, "#000000", 0.45);
  return {
    "--needs-ledge": mixHex(m.decide.surface, "#000000", 0.4),
    "--base": `0 4px 0 ${deep}`,
    "--press-primary": mixHex(m.ink, m.bg, 0.45),
    "--primary-top": m.ink,
    "--seam-primary": mixHex(m.ink, m.bg, 0.3),
    "--rim-primary": "transparent",
    "--hi-primary": "rgba(255, 255, 255, 0.35)",
    "--drop-primary": "0 7px 12px -4px rgba(0, 0, 0, 0.5)",
    "--press-quiet": deep,
    "--seam-quiet": deep,
    "--press-accent": mixHex(m.accent, m.bg, 0.3),
    "--seam-accent": mixHex(m.accent, m.bg, 0.3),
    "--rim": "rgba(255, 255, 255, 0.06)",
    "--drop": "0 7px 12px -4px rgba(0, 0, 0, 0.5)",
    "--drop-pressed": "0 1px 3px rgba(0, 0, 0, 0.4)",
    "--floating": "0 10px 32px rgba(0, 0, 0, 0.5)",
    "--scrim": "rgba(0, 0, 0, 0.42)",
    "--viewer-scrim": hexToRgba(mixHex(m.bg, "#000000", 0.3), 0.96),
    "--pic-dim": "rgba(0, 0, 0, 0.5)",
    "--ring-back": "rgba(0, 0, 0, 0.5)",
  };
}

/** A theme mode's colours as the CSS variables the web's `app.css` reads, surfaces derived. */
export function modeToCss(m: ThemeModeTokens, dark = false): Record<string, string> {
  return {
    "--bg": m.bg,
    "--surface": m.surface,
    "--surface-raised": m.surfaceRaised,
    "--ink": m.ink,
    "--ink-muted": m.inkMuted,
    "--accent": m.accent,
    "--on-accent": m.onAccent,
    "--line": m.line,
    "--user-bubble": m.userBubble,
    "--on-user-bubble": m.onUserBubble,
    "--partner-bubble": m.partnerBubble,
    "--on-partner-bubble": m.onPartnerBubble,
    "--needs-dot": m.decide.dot,
    "--needs-surface": m.decide.surface,
    "--needs-ink": m.decide.ink,
    "--working-dot": m.progress.dot,
    "--working-surface": m.progress.surface,
    "--working-ink": m.progress.ink,
    "--waiting-dot": m.wait.dot,
    "--waiting-surface": m.wait.surface,
    "--waiting-ink": m.wait.ink,
    "--done-dot": m.ok.dot,
    "--done-surface": m.ok.surface,
    "--done-ink": m.ok.ink,
    "--failed-dot": m.fail.dot,
    "--failed-surface": m.fail.surface,
    "--failed-ink": m.fail.ink,
    // The surfaces and faint inks follow the paper, never Pebble's warm brown.
    "--bg-deep": mixHex(m.bg, m.ink, 0.06),
    "--sunken": mixHex(m.bg, m.ink, 0.04),
    "--surface-sunken": mixHex(m.surface, m.ink, 0.04),
    "--chip-ground": mixHex(m.surface, m.ink, 0.04),
    "--faint": mixHex(m.inkMuted, m.bg, 0.45),
    "--ink-soft": mixHex(m.ink, m.inkMuted, 0.4),
    "--line-2": mixHex(m.line, m.ink, 0.1),
    "--line-soft": mixHex(m.line, m.bg, 0.4),
    "--highlight": mixHex(m.accent, m.bg, 0.72),
    "--highlight-ink": m.ink,
    ...clayToCss(m, dark),
  };
}

/** The paper the page shows now: the forced one, else the system's. */
export function currentMode(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const STYLE_ID = "ducter-theme";

/** The injected stylesheet: light, system-dark and forced-dark, mirroring app.css's own selectors. */
export function themeCss(tokens: ThemeTokens): string {
  const light = Object.entries(modeToCss(tokens.light))
    .map(([k, v]) => `${k}: ${v};`)
    .join("");
  const dark = Object.entries(modeToCss(tokens.dark, true))
    .map(([k, v]) => `${k}: ${v};`)
    .join("");
  return `:root{${light}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
}

/**
 * Puts the theme on the page. `null` (Pebble) removes the injected style, so `app.css`'s own
 * Pebble values return.
 */
export function applyThemeTokens(tokens: ThemeTokens | null) {
  if (typeof document === "undefined") return;
  const old = document.getElementById(STYLE_ID);
  if (!tokens) {
    old?.remove();
    return;
  }
  const css = themeCss(tokens);
  if (old) {
    old.textContent = css;
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}
