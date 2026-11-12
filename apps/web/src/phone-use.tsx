// D217, 用手机 / Use a phone: Ducter's own phone on a Mac, everywhere the web client shows it.
//   - <PhoneBlock>: the phone's block on its computer's card (installing, running, Open the phone,
//     the tasks using it with Watch, Erase in ⓘ);
//   - <PhoneInstallSheet>: what adding it downloads, where it lives, and Google's licenses, accepted once;
//   - <PhoneLivePanel>: the live view, self-contained (props in, turn changes out), so it mounts
//     standalone as a full-screen sheet (<PhoneLiveSheet>) and later in the opened task's side panel;
//   - <PhoneAskBody>: a phone task's decision cards (a Go for one tap; the user's own turn).
// The live view is D190's browser live view for the phone: the same classes, bars, band and calm
// line, so it reads as the same thing. Nothing here is kept: frames are shown and dropped.
import type { DeviceView, PhoneDoingView, PhoneInput, PhoneKey, PhoneMode, PhoneServerFrame, PhoneTerms } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn } from "./controls.tsx";
import { EyeShut } from "./live.tsx";
import { finished, type Task } from "./store.ts";
import { registerScreen } from "./workbench-screens.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const zh = () => A.L.lang === "zh";

// ---------- state (this module's own; app.ts hands it the phone_* frames) ----------

export interface PhoneViewState {
  id: string;
  state: "opening" | "starting" | "open" | "closed";
  mode: PhoneMode;
  turn: "agent" | "you";
  here: boolean;
  device: string;
  taskId?: string;
  task?: { title: string; harness: string };
  decisionId?: string;
  src?: string;
  seq?: number;
  w?: number;
  h?: number;
  app?: string;
  doing?: PhoneDoingView;
  doingAt?: number;
}

export const PU: {
  /** The full-screen live view (the standalone mount). */
  sheet?: { device: string; taskId?: string; mode: PhoneMode; decisionId?: string };
  view?: PhoneViewState;
  install?: { device: string; terms?: PhoneTerms; accepted: boolean; sending?: boolean; error?: string };
} = {};

const changed = () => A.changed();

/** Every phone_* frame from the home. */
export function phoneFrame(f: PhoneServerFrame): void {
  switch (f.t) {
    case "phone_terms":
      if (PU.install) PU.install.terms = f;
      return changed();
    case "phone_install_result":
      if (!PU.install) return;
      PU.install.sending = false;
      if (f.ok) PU.install = undefined;
      else PU.install.error = f.reason === "space" || f.reason === "license" ? t(`phoneuse.install.${f.reason}`, f.message ?? "") : t("phoneuse.install.failed", f.message ?? "");
      return changed();
    case "phone_erase_result":
      if (!f.ok && f.message) A.toast(f.message);
      return changed();
    case "phone_view": {
      const v = PU.view;
      if (f.state === "closed") {
        if (v && (v.id === f.id || !f.id || v.state === "opening")) {
          if (f.reason === "failed" && f.message) A.toast(t("phoneuse.live.failed", f.message));
          if (f.reason === "replaced") A.toast(t("live.replaced"));
          PU.view = undefined;
          PU.sheet = undefined;
        }
        return changed();
      }
      if (!v) return;
      Object.assign(v, { id: f.id, state: f.state, mode: f.mode, turn: f.turn, here: f.here, device: f.device, ...(f.taskId ? { taskId: f.taskId } : {}), ...(f.task ? { task: f.task } : {}), ...(f.decisionId ? { decisionId: f.decisionId } : {}) });
      return changed();
    }
    case "phone_frame": {
      const v = PU.view;
      if (!v || v.id !== f.id) return;
      v.src = `data:image/jpeg;base64,${f.data}`;
      v.seq = f.seq;
      v.w = f.width;
      v.h = f.height;
      if (f.app) v.app = f.app;
      return changed();
    }
    case "phone_doing": {
      const v = PU.view;
      if (!v || v.id !== f.id) return;
      if (f.doing) (v.doing = f.doing), (v.doingAt = Date.now());
      else v.doing = undefined;
      return changed();
    }
  }
}

const send = (f: Parameters<typeof A.send>[0]) => A.send(f);

/** Opens the live view in the full-screen sheet (the device card, a card, the opened task). */
export function openPhone(o: { device: string; taskId?: string; mode: PhoneMode; decisionId?: string }): void {
  PU.sheet = o;
  changed();
}

export function closePhone(done = false): void {
  const v = PU.view;
  if (v?.id) send({ t: "phone_close", id: v.id, done });
  PU.view = undefined;
  PU.sheet = undefined;
  changed();
}

// ---------- drawn marks (never characters: D73) ----------

const BackMark = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const HomeMark = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="5.6" fill="none" stroke="currentColor" stroke-width="2.2" />
  </svg>
);
const RecentsMark = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="5" y="5" width="10" height="10" rx="2.4" fill="none" stroke="currentColor" stroke-width="2.2" />
  </svg>
);
const KeysMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <rect x="1.5" y="4.5" width="15" height="9.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M4.5 7.5h1M8.5 7.5h1M12.5 7.5h1M5.5 11h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

// ---------- the live view ----------

const DOING_MS = 6_000;

export function doingPhoneWords(d: PhoneDoingView): string {
  switch (d.kind) {
    case "tap":
      return d.label ? t("phoneuse.doing.tap", d.label.split(" · ")[0]) : t("phoneuse.doing.tap.0");
    case "type":
      return d.label ? t("phoneuse.doing.type", d.label.split(" · ")[0]) : t("phoneuse.doing.type.0");
    case "open":
      return t("phoneuse.doing.open", d.app ?? "");
    case "key":
      return t("phoneuse.doing.key", t(`phoneuse.key.${d.label ?? "back"}`));
    default:
      return t(`phoneuse.doing.${d.kind}`);
  }
}

/**
 * The live view of Ducter's phone, self-contained: it opens its view on mount and closes it on
 * unmount. mode: watch (a task's turn; My turn takes it), takeover (the user's turn from the
 * start), signin (a card's own turn: Done answers the card). onTurn fires when the turn changes
 * here; onClose when the view is gone (closed, done, replaced, failed).
 */
export function PhoneLivePanel(p: { device: string; taskId?: string; mode: PhoneMode; decisionId?: string; embedded?: boolean; onClose?: () => void; onTurn?: (mine: boolean) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; at: number; moved: boolean } | undefined>(undefined);
  const composing = useRef(false);
  const [, tick] = useState(0);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    PU.view = { id: "", state: "opening", mode: p.mode, turn: p.mode === "watch" ? "agent" : "you", here: p.mode !== "watch", device: p.device, ...(p.taskId ? { taskId: p.taskId } : {}), ...(p.decisionId ? { decisionId: p.decisionId } : {}) };
    send({ t: "phone_open", device: p.device, mode: p.mode, ...(p.taskId ? { taskId: p.taskId } : {}), ...(p.decisionId ? { decisionId: p.decisionId } : {}) });
    changed();
    const onVis = () => PU.view?.id && send({ t: "phone_pause", id: PU.view.id, paused: document.visibilityState === "hidden" });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (PU.view?.id) send({ t: "phone_close", id: PU.view.id });
      PU.view = undefined;
    };
  }, []);
  const v = PU.view;
  const mineNow = !!v && v.turn === "you" && v.here;
  const lastTurn = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (lastTurn.current !== undefined && lastTurn.current !== mineNow) p.onTurn?.(mineNow);
    lastTurn.current = mineNow;
  }, [mineNow]);
  useEffect(() => {
    if (!v?.doingAt) return;
    const left = v.doingAt + DOING_MS - Date.now();
    if (left <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [v?.doingAt]);
  // Text in the user's turn: committed text only (an IME's words once, never its letters).
  useEffect(() => {
    const el = keys.current;
    if (!el) return;
    const start = () => (composing.current = true);
    const end = () => {
      composing.current = false;
      if (el.value) type(el.value);
      el.value = "";
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    return () => (el.removeEventListener("compositionstart", start), el.removeEventListener("compositionend", end));
  }, [!!v]);
  if (!v) return null;

  const input = (i: PhoneInput) => v.id && send({ t: "phone_input", id: v.id, input: i });
  const type = (s: string) => input({ kind: "text", text: s }); // 中文 too: the home pastes it in
  const key = (k: PhoneKey) => input({ kind: "key", key: k });
  const mine = mineNow;
  const elsewhere = v.turn === "you" && !v.here;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const doing = !mine && v.doing && v.doingAt && Date.now() - v.doingAt < DOING_MS ? v.doing : undefined;
  const at = (e: { clientX: number; clientY: number }) => {
    const r = img.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const close = () => (p.onClose ? (p.onClose(), closePhone()) : closePhone());
  const title = t("phoneuse.title");

  const sub = v.mode === "watch" && v.task ? (
    <>
      {v.task.harness && <Coin harness={v.task.harness} size={16} />}
      <span class="live-task">{v.task.title}</span>
    </>
  ) : (
    <span>{t("phoneuse.on", v.device || A.homeName || "Mac")}</span>
  );

  const ring = (() => {
    if (!doing || doing.x == null || doing.y == null || !img.current) return null;
    const el = img.current;
    return <span key={v.doingAt} class="live-ring" aria-hidden="true" style={{ left: `${el.offsetLeft + doing.x * el.clientWidth}px`, top: `${el.offsetTop + doing.y * el.clientHeight}px` }} />;
  })();

  return (
    <div class={`live phone-live${p.embedded ? " embedded" : ""}${mine && v.mode === "watch" ? " yours" : ""}`} role="dialog" aria-modal={p.embedded ? undefined : "true"} aria-label={title}>
      <div class="live-top">
        <span class="live-nav" />
        <div class="live-where">
          <div class="live-host">{title}</div>
          <div class="live-sub">{sub}</div>
        </div>
        {v.mode === "signin" || p.embedded ? <span class="live-nav" /> : <Btn kind="text" size="sm" label={t("live.close")} onClick={close} />}
      </div>
      {mine && (v.mode === "watch" || v.mode === "takeover") && (
        <div class="live-band" role="status">
          <EyeShut />
          <span>{t("phoneuse.yourturn")}</span>
        </div>
      )}
      <div class={`live-page phone-page${mine ? "" : " watching"}`} onClick={() => mine && keys.current?.focus({ preventScroll: true })}>
        {v.src && v.state === "open" ? (
          <img
            ref={img}
            class="phone-screen"
            src={v.src}
            alt={v.app ?? title}
            draggable={false}
            onLoad={() => v.seq != null && v.id && send({ t: "phone_ack", id: v.id, seq: v.seq })}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (!mine) return;
              e.preventDefault();
              const a = at(e);
              drag.current = { ...a, at: Date.now(), moved: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!mine || !d) return;
              const a = at(e);
              if (Math.abs(a.x - d.x) > 0.02 || Math.abs(a.y - d.y) > 0.015) d.moved = true;
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = undefined;
              if (!mine || !d) return;
              const a = at(e);
              const ms = Date.now() - d.at;
              if (d.moved) input({ kind: "swipe", x1: d.x, y1: d.y, x2: a.x, y2: a.y, ms: Math.min(800, Math.max(120, ms)) });
              else input({ kind: "tap", x: a.x, y: a.y, ...(ms > 550 ? { long: true } : {}) });
            }}
            onWheel={(e) => {
              if (!mine) return;
              e.preventDefault();
              const a = at(e);
              const dy = Math.max(-0.4, Math.min(0.4, e.deltaY / 1200));
              input({ kind: "swipe", x1: a.x, y1: 0.5 + dy / 2, x2: a.x, y2: 0.5 - dy / 2, ms: 200 });
            }}
          />
        ) : (
          <div class="live-wait">{v.state === "starting" ? t("phoneuse.starting") : t("phoneuse.opening")}</div>
        )}
        {ring}
        <input
          ref={keys}
          class="live-keys"
          aria-label={t("live.keyboard")}
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
          disabled={!mine}
          onInput={(e) => {
            if (composing.current || (e as unknown as InputEvent).isComposing) return;
            const el = e.currentTarget as HTMLInputElement;
            if (el.value) type(el.value);
            el.value = "";
          }}
          onKeyDown={(e) => {
            if (composing.current || e.isComposing) return;
            if (e.key === "Enter") (e.preventDefault(), key("enter"));
            else if (e.key === "Backspace") (e.preventDefault(), key("delete"));
            else if (e.key === "Escape") (e.preventDefault(), key("back"));
          }}
        />
      </div>
      {mine && v.state === "open" && (
        <div class="phone-keys" role="group" aria-label={t("phoneuse.keys")}>
          <button class="btn text sm" aria-label={t("phoneuse.key.back")} onClick={() => key("back")}>
            <BackMark />
          </button>
          <button class="btn text sm" aria-label={t("phoneuse.key.home")} onClick={() => key("home")}>
            <HomeMark />
          </button>
          <button class="btn text sm" aria-label={t("phoneuse.key.recents")} onClick={() => key("recents")}>
            <RecentsMark />
          </button>
        </div>
      )}
      <div class="live-bottom">
        {mine && coarse && (
          <button class="btn secondary sm live-kbd" aria-label={t("live.keyboard")} onClick={() => keys.current?.focus()}>
            <KeysMark />
          </button>
        )}
        {v.mode === "signin" && <div class="live-note">{t("phoneuse.signin.note")}</div>}
        {v.mode !== "signin" && !mine && (
          <div class={`live-doing${doing ? " on" : ""}`} role="status" aria-live="polite">
            {doing ? (
              <>
                <span class="live-pulse" aria-hidden="true" />
                <span>{doingPhoneWords(doing)}</span>
              </>
            ) : elsewhere ? (
              <span>{t("live.elsewhere")}</span>
            ) : (
              <span>{v.taskId ? t("phoneuse.idle.task") : t("phoneuse.idle")}</span>
            )}
          </div>
        )}
        <div class="btns">
          {v.mode === "signin" ? (
            <>
              <Btn kind="secondary" label={t("phoneuse.notnow")} onClick={() => closePhone(false)} />
              <Btn kind="primary" label={t("live.done")} onClick={() => closePhone(true)} />
            </>
          ) : mine ? (
            v.mode === "watch" || v.taskId ? <Btn kind="primary" label={t("live.handback")} onClick={() => v.id && send({ t: "phone_turn", id: v.id, mine: false })} /> : <Btn kind="primary" label={t("live.done")} onClick={close} />
          ) : (
            <Btn kind="primary" label={t("live.myturn")} onClick={() => v.id && send({ t: "phone_turn", id: v.id, mine: true })} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- in the opened task's workbench (D220) ----------

const phoningOf = (task: Task) => (finished(task) ? undefined : A.S.onHand?.tasks.find((c) => c.taskId === task.id)?.phoning);

/** The workbench's Phone page while the task uses Ducter's phone: the live view, watching it, inside
 *  the page. It streams only while its page is the one shown; the full-screen sheet, when open, keeps it. */
function PhoneScreen({ task, active }: { task: Task; active?: boolean }) {
  const ph = phoningOf(task);
  if (!ph) return null;
  if (!active || PU.sheet) return <div class="screen-wait"><p class="bench-note quiet">{t("phoneuse.idle.task")}</p></div>;
  return <PhoneLivePanel key={`${ph.device}:${task.id}`} device={ph.device} taskId={task.id} mode="watch" embedded />;
}
registerScreen("phone", { has: (task) => !!phoningOf(task), view: PhoneScreen });

/** The standalone mount: the live view as a full-screen sheet (the phone, and the Mac's window). */
export function PhoneLiveSheet() {
  const s = PU.sheet;
  if (!s) return null;
  return <PhoneLivePanel key={`${s.device}:${s.taskId ?? ""}:${s.mode}:${s.decisionId ?? ""}`} {...s} />;
}

// ---------- the device card ----------

const gb = (n: number | undefined) => (n ? String(Math.round(n / 1e8) / 10) : "?");

/** The phone's block on its computer's card, under the chips: what it is doing, and the way in. */
export function PhoneBlock({ dv }: { dv: DeviceView }) {
  const ab = dv.abilities.find((a) => a.id === "phone");
  if (!ab) return null;
  if (ab.setup === "installing") {
    const s = ab.step;
    const pct = s?.step === "download" && s.total ? Math.floor(((s.done ?? 0) / s.total) * 100) : undefined;
    return (
      <div class="dc-note phone-block" role="status">
        <div>{s?.step === "unpack" ? t("phoneuse.installing.unpack") : s?.step === "phone" ? t("phoneuse.installing.phone") : t("phoneuse.installing.download", pct ?? 0)}</div>
        <div class="phone-bar" aria-hidden="true">
          <span style={{ width: `${s?.step === "download" ? (pct ?? 0) : 100}%` }} />
        </div>
        <div class="small sub">{t("phoneuse.installing.away")}</div>
      </div>
    );
  }
  if (ab.state === "unavailable")
    return (
      <div class="dc-note">
        {t("phoneuse.failed", ab.detail ?? "")}
        <div class="acts">
          <Btn kind="secondary" size="sm" label={t("web.retry")} onClick={() => startInstall(dv.id)} />
        </div>
      </div>
    );
  if (ab.state !== "on") return null;
  const busy = (A.S.onHand?.tasks ?? []).filter((c) => c.phoning?.device === dv.id && ["working", "queued", "needs_you", "blocked"].includes(c.attention));
  return (
    <div class="dev-browsing phone-block">
      <div class="dev-try">
        <div class="small">{ab.running ? t("phoneuse.running") : t("phoneuse.asleep")}</div>
        {dv.state === "awake" && <Btn kind="secondary" size="sm" label={t("phoneuse.open")} about={t("phoneuse.title")} onClick={() => openPhone({ device: dv.id, mode: "takeover" })} />}
      </div>
      {busy.map((c) => (
        <div class="dev-site" key={c.taskId}>
          <Coin harness={c.harness} size={20} motion={c.attention === "working" ? "working" : "still"} />
          <div class="dev-site-what">
            <div class="small">{t("live.using", c.title)}</div>
          </div>
          <Btn kind="secondary" size="sm" label={t("live.watch")} about={c.title} onClick={() => openPhone({ device: dv.id, taskId: c.taskId, mode: "watch" })} />
        </div>
      ))}
    </div>
  );
}

/** In 用手机's ⓘ: where it lives, and Erase (asked in place, never a dialog). */
export function PhoneInfo({ dv }: { dv: DeviceView }) {
  const [asking, setAsking] = useState(false);
  const ab = dv.abilities.find((a) => a.id === "phone");
  return (
    <>
      <div class="small sub">{t("phoneuse.where", dv.name)}</div>
      {ab?.state === "on" && !ab.setup && (asking ? (
        <>
          <div class="small">{t("phoneuse.erase.ask")}</div>
          <div class="btns">
            <Btn kind="secondary" size="sm" label={t("phoneuse.erase.keep")} onClick={() => setAsking(false)} />
            <Btn kind="primary" size="sm" label={t("phoneuse.erase.go")} onClick={() => (setAsking(false), send({ t: "phone_erase", device: dv.id, keepSdk: true }))} />
          </div>
        </>
      ) : (
        <Btn kind="text" size="sm" label={t("phoneuse.erase")} onClick={() => setAsking(true)} />
      ))}
    </>
  );
}

/** + 用手机: the install sheet, with what it costs and Google's licenses. */
export function startInstall(device: string): void {
  PU.install = { device, accepted: false };
  send({ t: "phone_terms", device });
  changed();
}

export function PhoneInstallSheet() {
  const s = PU.install;
  const [open, setOpen] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!s) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && ((PU.install = undefined), changed());
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [!!s]);
  if (!s) return null;
  const close = () => ((PU.install = undefined), changed());
  const dv = (A.devices ?? []).find((d) => d.id === s.device);
  const tm = s.terms;
  const lang = zh() ? "zh" : "en";
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet phone-install" role="dialog" aria-modal="true" aria-label={t("phoneuse.install.title", dv?.name ?? "")}>
        <div class="grab" />
        <img class="phone-install-art" src="app/art/ab_phone.webp" alt="" />
        <h2>{t("phoneuse.install.title", dv?.name ?? "")}</h2>
        <p class="lede">{t("phoneuse.install.lede")}</p>
        {!tm ? (
          <div class="small">{t("conn.connecting")}</div>
        ) : !tm.ok ? (
          <div class="dc-note">{tm.reason === "not_mac_arm" ? t("phoneuse.install.unsupported") : t("phoneuse.install.offline", tm.message ?? "")}</div>
        ) : (
          <>
            <dl class="phone-facts">
              <dt>{t("phoneuse.install.download")}</dt>
              <dd>{t("phoneuse.install.gb", gb(tm.download))}</dd>
              <dt>{t("phoneuse.install.disk")}</dt>
              <dd>{t("phoneuse.install.gb", gb(tm.disk))}</dd>
              <dt>{t("phoneuse.install.what")}</dt>
              <dd>{t("phoneuse.install.what.v")}</dd>
              <dt>{t("phoneuse.install.runs")}</dt>
              <dd>{t("phoneuse.install.runs.when")}</dd>
            </dl>
            <div class="phone-lic">
              <div class="small">{t("phoneuse.install.licenses")}</div>
              {(tm.licenses ?? []).map((l) => (
                <div class="phone-lic-one" key={l.id}>
                  <button class="phone-lic-head" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? undefined : l.id)}>
                    <span>{l.title[lang]}</span>
                    <small>{open === l.id ? t("phoneuse.install.fold") : t("phoneuse.install.read")}</small>
                  </button>
                  {open === l.id && <pre class="phone-lic-text">{l.text}</pre>}
                </div>
              ))}
              <label class="phone-agree">
                <input type="checkbox" checked={s.accepted} onChange={(e) => ((s.accepted = (e.currentTarget as HTMLInputElement).checked), changed())} />
                <span>{t("phoneuse.install.agree")}</span>
              </label>
            </div>
            {s.error && <div class="dc-note warn">{s.error}</div>}
          </>
        )}
        <div class="btns">
          <Btn kind="secondary" label={t("phoneuse.notnow")} onClick={close} />
          <Btn
            kind="primary"
            label={t("phoneuse.install.go")}
            disabled={!tm?.ok || !s.accepted || s.sending}
            onClick={() => {
              s.sending = true;
              s.error = undefined;
              send({ t: "phone_install", device: s.device, accepted: (tm?.licenses ?? []).map((l) => ({ id: l.id, sha256: l.sha256 })) });
              changed();
            }}
          />
        </div>
      </div>
    </>
  );
}

// ---------- a phone task's cards ----------

type Ask = { decisionId: string; taskId?: string; question: string; phone?: import("@ducter/protocol").PhoneAsk; resolved?: { option: string }; pending?: unknown };

/** A Go for one tap (what it will do, where), or the user's own turn on the phone. */
export function PhoneAskBody({ d, compact }: { d: Ask; compact?: boolean }) {
  const ph = d.phone!;
  const open = !d.resolved && !d.pending;
  // D234: the phone of the computer the task runs on (empty: the home finds it from the task).
  const home = (d.taskId ? A.S.onHand?.tasks.find((c) => c.taskId === d.taskId)?.phoning?.device : undefined) ?? (d.taskId ? "" : ((A.devices ?? []).find((x) => x.home)?.id ?? "local"));
  // D238: on the person's own phone there is no live view: they do it in their hand, then 好了.
  const mine = ph.on ? ph.on.name.replace(/\s*·\s*Ducter$/, "") : "";
  if (ph.kind === "user" && mine)
    return (
      <>
        {!compact && <div class="q">{d.question}</div>}
        <div class="signin-why">
          <EyeShut />
          <span>{t("handset.user.why", mine)}</span>
        </div>
        {open ? (
          <div class={compact ? "tray" : "btns decide"}>
            <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("signin.later")} onClick={() => A.decide(d.decisionId, "hold")} />
            {compact && <span class="grow" />}
            <Btn kind="primary" size={compact ? "sm" : undefined} label={t("handset.user.done")} onClick={() => A.decide(d.decisionId, "go")} />
          </div>
        ) : (
          <div class={compact ? "said" : "resolved"} role="status">
            {d.resolved?.option === "hold" ? t("signin.resolved.hold") : t("phoneuse.user.done")}
          </div>
        )}
      </>
    );
  if (ph.kind === "user")
    return (
      <>
        {!compact && <div class="q">{d.question}</div>}
        <div class="signin-why">
          <EyeShut />
          <span>{t("phoneuse.user.why")}</span>
        </div>
        {open ? (
          <div class={compact ? "tray" : "btns decide"}>
            <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("signin.later")} onClick={() => A.decide(d.decisionId, "hold")} />
            {compact && <span class="grow" />}
            <Btn kind="primary" size={compact ? "sm" : undefined} label={t("phoneuse.user.open")} onClick={() => openPhone({ device: home, mode: "signin", decisionId: d.decisionId, ...(d.taskId ? { taskId: d.taskId } : {}) })} />
          </div>
        ) : (
          <div class={compact ? "said" : "resolved"} role="status">
            {d.resolved?.option === "hold" ? t("signin.resolved.hold") : t("phoneuse.user.done")}
          </div>
        )}
      </>
    );
  return (
    <>
      {!compact && <div class="q">{d.question}</div>}
      {open && mine && <div class="dl">{t("handset.go.on", mine)}</div>}
      {open && <div class="dl">{ph.name ? t("phoneuse.go.what", ph.label.split(" · ")[0], ph.name) : t("phoneuse.go.what.0", ph.label.split(" · ")[0])}</div>}
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          {d.taskId && !mine && <Btn kind="text" size={compact ? "sm" : undefined} label={t("phoneuse.go.look")} onClick={() => openPhone({ device: home, taskId: d.taskId, mode: "watch" })} />}
          {compact && <span class="grow" />}
          <Btn kind="secondary" size={compact ? "sm" : undefined} label={t("phoneuse.go.hold")} onClick={() => A.decide(d.decisionId, "hold")} />
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t("phoneuse.go.go")} onClick={() => A.decide(d.decisionId, "go")} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" ? t("phoneuse.go.done") : t("phoneuse.go.held")}
        </div>
      )}
    </>
  );
}
