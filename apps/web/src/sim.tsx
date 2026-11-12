// D220: an iOS Simulator booted on the task's computer, inside the workbench's 手机 / Phone page.
// Its screen, live (a frame every ~¼ s through `wb` sim_frame, only while the page is in sight),
// and a rail of the controls Xcode's simctl has (research/64): Home, dark or light, text size, open
// a link, and a screenshot put into the task's composer as a picture (D206). View only: simctl
// can't tap, and the page says so.
import type { WbAnswer, WbError, WbSim } from "@ducter/protocol/src/workbench.ts";
import { simLinkOk, type SimText } from "@ducter/protocol/src/workbench.ts";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import type { Task } from "./store.ts";
import { ask } from "./workbench-ask.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);
const errWords = (e: { error?: WbError; message?: string }) => (e?.error === "failed" && e.message && e.message !== "timeout" ? t("wb.err.failed", e.message) : t(`wb.err.${e?.error ?? "generic"}`));

/** The gap between frames: the next is asked for this long after one lands (≈3–4 a second). */
const GAP_MS = 90;

// ---------- drawn marks (never characters, D73) ----------

const Svg = ({ children }: { children: preact.ComponentChildren }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
);
const HomeMark = () => (
  <Svg>
    <path d="M3.5 9.2 10 3.8l6.5 5.4" />
    <path d="M5.3 8v7.4c0 .5.4.9.9.9h7.6c.5 0 .9-.4.9-.9V8" />
  </Svg>
);
/** Half a disc: dark and light at once. */
const LookMark = ({ dark }: { dark?: boolean }) => (
  <Svg>
    <circle cx="10" cy="10" r="6.3" />
    <path d={dark ? "M10 3.7a6.3 6.3 0 0 1 0 12.6z" : "M10 3.7a6.3 6.3 0 0 0 0 12.6z"} fill="currentColor" stroke="none" />
  </Svg>
);
/** A large and a small letter A, drawn as strokes. */
const TextMark = () => (
  <Svg>
    <path d="M2.8 15.5 6.6 5l3.8 10.5M4.1 12h5" />
    <path d="M11.6 15.5l2.6-6.8 2.6 6.8M12.5 13.2h3.4" stroke-width="1.5" />
  </Svg>
);
const LinkMark = () => (
  <Svg>
    <path d="M8.3 11.7a3 3 0 0 0 4.3 0l2.6-2.6a3 3 0 0 0-4.3-4.3l-1 1" />
    <path d="M11.7 8.3a3 3 0 0 0-4.3 0l-2.6 2.6a3 3 0 0 0 4.3 4.3l1-1" />
  </Svg>
);
const ShotMark = () => (
  <Svg>
    <path d="M3 7.2c0-.9.7-1.6 1.6-1.6h1.9l1.3-1.8h4.4l1.3 1.8h1.9c.9 0 1.6.7 1.6 1.6v7.2c0 .9-.7 1.6-1.6 1.6H4.6c-.9 0-1.6-.7-1.6-1.6z" />
    <circle cx="10" cy="10.6" r="2.7" />
  </Svg>
);

// ---------- the view ----------

interface Live {
  src?: string;
  w?: number;
  h?: number;
  err?: string;
  off?: boolean;
}
const lives = new Map<string, Live>();

export function SimScreen({ task, sim, active, where, onSim }: { task: Task; sim: WbSim; active: boolean; where: string; onSim: (s: WbSim) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  const [menu, setMenu] = useState<"" | "text" | "link">("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const live = lives.get(sim.udid) ?? (lives.set(sim.udid, {}), lives.get(sim.udid)!);

  // Frames, only while this page is the one shown and the window is in sight.
  useEffect(() => {
    if (!active) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = async () => {
      if (!on) return;
      if (document.visibilityState === "hidden") return void (timer = setTimeout(next, 600));
      const el = stage.current;
      const edge = Math.round(Math.min(1600, Math.max(480, (el?.clientHeight ?? 700) * (devicePixelRatio || 1))));
      try {
        const f = (await ask(task.id, { op: "sim_frame", udid: sim.udid, edge })) as Extract<WbAnswer, { op: "sim_frame" }>;
        Object.assign(live, { src: f.image, w: f.w, h: f.h, err: undefined, off: false });
        tick((n) => n + 1);
        timer = setTimeout(next, GAP_MS);
      } catch (e) {
        const err = e as { error: WbError; message?: string };
        live.off = err.error === "missing";
        live.err = live.off ? undefined : errWords(err);
        tick((n) => n + 1);
        timer = setTimeout(next, 2000);
      }
    };
    void next();
    return () => {
      on = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, sim.udid, task.id]);

  const act = async (what: "home" | "appearance" | "text" | "url" | "shot", value?: string) => {
    setBusy(what);
    try {
      const a = (await ask(task.id, { op: "sim_act", udid: sim.udid, act: what, ...(value ? { value } : {}) })) as Extract<WbAnswer, { op: "sim_act" }>;
      if (a.sim) onSim(a.sim);
      if (what === "shot" && a.image) {
        // Decoded here (the page's CSP doesn't let fetch() read a data: URL).
        const bin = atob(a.image.slice(a.image.indexOf(",") + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        A.addFiles(task.id, [new File([blob], `${sim.name.replace(/\s+/g, "-")}-${stamp}.png`, { type: "image/png" })]);
        A.toast(t("wb.sim.shot.done"));
      }
      return true;
    } catch (e) {
      A.toast(errWords(e as { error: WbError; message?: string }));
      return false;
    } finally {
      setBusy("");
    }
  };
  const dark = sim.appearance === "dark";
  const rail: { key: string; label: string; mark: preact.JSX.Element; on?: boolean; run: () => void; about?: string }[] = [
    { key: "home", label: t("wb.sim.home"), mark: <HomeMark />, run: () => void act("home") },
    { key: "appearance", label: t(dark ? "wb.sim.light" : "wb.sim.dark"), mark: <LookMark dark={dark} />, run: () => void act("appearance", dark ? "light" : "dark") },
    { key: "text", label: t("wb.sim.text"), mark: <TextMark />, on: menu === "text", run: () => setMenu(menu === "text" ? "" : "text") },
    { key: "link", label: t("wb.sim.link"), mark: <LinkMark />, on: menu === "link", run: () => setMenu(menu === "link" ? "" : "link") },
    { key: "shot", label: t("wb.sim.shot"), about: t("wb.sim.shot.about"), mark: <ShotMark />, run: () => void act("shot") },
  ];
  const ratio = live.w && live.h ? `${live.w} / ${live.h}` : "9 / 19.5";
  return (
    <div class="sim">
      <div class="sim-main">
        <div class="sim-stage" ref={stage}>
          {live.src && !live.off ? (
            <img class="sim-screen" src={live.src} alt={sim.name} draggable={false} style={{ aspectRatio: ratio }} />
          ) : (
            <p class="bench-note quiet sim-wait">{live.off ? t("wb.sim.off") : live.err ?? t("wb.sim.loading")}</p>
          )}
        </div>
        <div class="sim-rail" role="toolbar" aria-label={t("wb.sim.rail")} aria-orientation="vertical">
          {rail.map((r) => (
            <button key={r.key} class={`sim-btn${r.on ? " on" : ""}${busy === r.key ? " busy" : ""}`} aria-label={r.label} title={r.about ?? r.label} aria-expanded={r.key === "text" || r.key === "link" ? !!r.on : undefined} disabled={!!busy && busy === r.key} onClick={r.run}>
              {r.mark}
            </button>
          ))}
        </div>
      </div>
      {menu === "text" && (
        <div class="sim-pop" role="radiogroup" aria-label={t("wb.sim.text")}>
          {(["small", "default", "large", "xlarge"] as SimText[]).map((k) => (
            <button key={k} role="radio" aria-checked={sim.text === k} class={sim.text === k ? "on" : ""} onClick={() => void act("text", k).then((ok) => ok && setMenu(""))}>
              {t(`wb.sim.text.${k}`)}
            </button>
          ))}
        </div>
      )}
      {menu === "link" && (
        <form
          class="sim-link"
          onSubmit={(e) => {
            e.preventDefault();
            const v = link.trim();
            if (!simLinkOk(v)) return A.toast(t("wb.sim.link.bad"));
            void act("url", v).then((ok) => ok && (setLink(""), setMenu("")));
          }}
        >
          <input class="sim-link-in" type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder={t("wb.sim.link.hint")} aria-label={t("wb.sim.link")} value={link} onInput={(e) => setLink(e.currentTarget.value)} autoFocus />
          <button class="btn secondary sm" type="submit" disabled={!link.trim() || busy === "url"}>
            {t("wb.sim.link.go")}
          </button>
        </form>
      )}
      <p class="bench-note quiet sim-note">{t("wb.sim.viewonly", where)}</p>
    </div>
  );
}
