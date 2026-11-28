// research/248 phase 1 (D673): Settings › 外观和声音 / Look and sound lists the installed
// themes with a live preview tile each, and 换回 Pebble / Back to Pebble is always one tap away.
// The same rows appear in Settings › 插件 / Plugins. The consent card says the host's own literal
// lines, one fact each (D291). Each tile shows its own theme in the paper the window is in now.
import { PEBBLE_TOKENS, type ThemesServerFrame, type ThemesView, type ThemeRow } from "@ducter/protocol";
import { words } from "@ducter/protocol/src/lang.ts";
import { useEffect } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { GRow, Waiting } from "./set-grid.tsx";
import { applyThemeTokens, currentMode } from "./theme.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What Look and sound and Plugins know; the home's frames keep it current. */
export const TH: {
  frame?: Extract<ThemesServerFrame, { t: "themes" }>;
  consent: Record<string, boolean>;
  busy: Record<string, boolean>;
} = { consent: {}, busy: {} };

function applyActive(f: ThemesView) {
  const active = f.themes.find((r) => r.id === f.active);
  applyThemeTokens(active?.theme?.tokens ?? null);
}

function onThemesFrame(f: ThemesServerFrame) {
  if (f.t === "themes") {
    TH.frame = f;
    applyActive(f);
    A.changed();
    return;
  }
  delete TH.busy[f.id];
  A.changed();
}

// Other modules import this one; app.ts is still building its one A as this file loads.
queueMicrotask(() => {
  A.onThemesFrame = onThemesFrame;
});

/** The active theme's own name (Pebble, or an installed look's), in this language. */
export function activeThemeName(): string {
  const f = TH.frame;
  if (!f || f.active === "pebble") return "Pebble";
  const r = f.themes.find((x) => x.id === f.active);
  return r ? words(r.name, A.L.lang) : "Pebble";
}

/** The consent lines in this language, one fact each, from the host's own words (i18n tables). */
function lines(r: ThemeRow): string[] {
  return [
    t("theme.consent.look"),
    t("theme.consent.layout"),
    t("theme.consent.made", r.author ?? ""),
    r.reviewed ? t("theme.reviewed") : t("theme.unreviewed"),
  ];
}

/** Five of a paper's colours, as a theme's mark (D622's clay tile). */
function Swatches({ m }: { m: { bg: string; accent: string; ink: string; decide: { surface: string }; ok: { surface: string } } }) {
  return (
    <span class="theme-tile" aria-hidden="true">
      <i style={{ background: m.bg }} />
      <i style={{ background: m.decide.surface }} />
      <i style={{ background: m.accent }} />
      <i style={{ background: m.ok.surface }} />
      <i style={{ background: m.ink }} />
    </span>
  );
}

/** A theme's mark in the current paper. */
function ThemeTile({ r }: { r: ThemeRow }) {
  const m = r.theme?.tokens[currentMode()];
  if (!m) return <span class="theme-tile" aria-hidden="true" />;
  return <Swatches m={m} />;
}

/** Pebble's mark in the current paper. */
function PebbleTile() {
  return <Swatches m={PEBBLE_TOKENS[currentMode()]} />;
}

/** One theme's row: its mark, its name, its state, and the one tap that applies it. */
function ThemeRowRow({ r }: { r: ThemeRow }) {
  const showConsent = TH.consent[r.id];
  const apply = () => {
    TH.busy[r.id] = true;
    A.send({ t: "theme_set", id: r.id });
    A.changed();
  };
  return (
    <section class="theme-row">
      <GRow cls="flat" tile={<ThemeTile r={r} />} title={words(r.name, A.L.lang)} line={r.active ? t("theme.active") : r.author ? t("theme.author", r.author) : ""}>
        {!r.active && r.consented && <Btn kind="secondary" size="sm" label={t("theme.use")} onClick={apply} />}
        {!r.active && !r.consented && <Btn kind="secondary" size="sm" label={t("theme.install")} onClick={() => (TH.consent[r.id] = true, A.changed())} />}
      </GRow>
      {showConsent && (
        <div class="theme-consent" role="group" aria-label={r.name.en}>
          {lines(r).map((l) => (
            <p class="small" key={l}>
              {l}
            </p>
          ))}
          <div class="row">
            <Btn kind="secondary" size="sm" label={t("theme.install")} onClick={() => ((TH.busy[r.id] = true), A.send({ t: "theme_consent", id: r.id }), A.changed())} />
            <Btn kind="text" size="sm" label={t("theme.notnow")} onClick={() => (delete TH.consent[r.id], A.changed())} />
          </div>
        </div>
      )}
    </section>
  );
}

/** The installed themes, Pebble first (换回 Pebble always one tap away). */
export function LookThemes() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "themes" });
  }, [A.S.welcomed]);
  const f = TH.frame;
  const pebbleOn = f?.active === "pebble";
  return (
    <section class="set">
      <div class="set-card">
        <GRow cls="flat" title={t("settings.look.themes")} line={t("settings.look.themes.note")}>
          <span />
        </GRow>
        <GRow cls="flat" tile={<PebbleTile />} title="Pebble" line={pebbleOn ? t("theme.active") : t("settings.look.back.note")}>
          {!pebbleOn && <Btn kind="secondary" size="sm" label={t("settings.look.back")} onClick={() => A.send({ t: "theme_set", id: "pebble" })} />}
        </GRow>
        {f?.themes.map((r) => <ThemeRowRow key={r.id} r={r} />)}
      </div>
    </section>
  );
}

/** Settings › 插件 / Plugins: the lede and the looks as plugin rows. */
export function PluginsSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "themes" });
  }, [A.S.welcomed]);
  const f = TH.frame;
  if (!f) return <Waiting text={t("imports.state.looking")} />;
  return (
    <section class="set plugins">
      <p class="small sub">{t("plugins.lede")}</p>
      <div class="set-card">
        <GRow cls="flat" title={t("plugins.theme.group")} line={t("settings.look.themes.note")}>
          <span />
        </GRow>
        {f.themes.map((r) => <ThemeRowRow key={r.id} r={r} />)}
        {f.themes.length === 0 && <p class="small muted">{t("settings.look.back.note")}</p>}
      </div>
    </section>
  );
}
