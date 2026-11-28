// research/248 phase 1 (D673): Settings › 外观和声音 / Look and sound lists the installed
// themes, one live preview tile each, and 换回 Pebble / Back to Pebble is always one tap away.
// The same frame also feeds Settings › 插件 / Plugins' theme rows. The active theme is shared on
// the home, so the web and the Mac agree; `pebble` is the shipped default and is never installed.
import type { ThemeManifest } from "./theme.ts";

/** One installed theme's row: its mark (a drawn tile of its colours), name, and its own facts. */
export interface ThemeRow {
  id: string;
  name: { en: string; zh?: string };
  author?: string;
  version: string;
  /** The person said yes once; switching back to it doesn't ask again. */
  consented: boolean;
  /** This theme is applied now. */
  active: boolean;
  reviewed: boolean;
  unreviewed: boolean;
  problem?: "broken" | "needs_newer" | "contrast";
  detail?: string;
  /** The resolved theme (missing tokens already fall back to Pebble), for the preview and apply. */
  theme?: ThemeManifest;
}

/** What Look and sound and Plugins read, one frame, kept current on every change. */
export interface ThemesView {
  /** "pebble", or an installed theme's id. */
  active: string;
  themes: ThemeRow[];
}

export type ThemesClientFrame =
  // Subscribe; answered with a themes frame and again on every change.
  | { t: "themes" }
  // 换回 Pebble / Back to Pebble, or pick an installed theme (the person's tap).
  | { t: "theme_set"; id: string }
  // The consent card's 装上 / Install: keep the consent, then apply.
  | { t: "theme_consent"; id: string }
  // 删掉这个主题 / Remove this theme (a removal reverts to Pebble).
  | { t: "theme_remove"; id: string };

export type ThemesServerFrame =
  | ({ t: "themes" } & ThemesView)
  // The answer to a set, consent or remove; the themes frame that follows carries the new rows.
  | { t: "theme_answer"; id: string; op: "set" | "consent" | "remove"; ok: boolean; active?: string; error?: string; detail?: string };
