// D238, 用这台手机 / Use this phone: a task borrows the person's own Android phone through the Ducter
// app on it. This page, when it runs inside that app, is the phone's link: it says what the app can
// do (handset_hello), relays the home's calls to the app's accessibility bridge and back, and passes
// on 停下 from the app's pill. It also draws the chip on the phone's card, the guide to Android's one
// switch (a clay miniature of each settings page with the fingertip where to tap, research/74 §7),
// the short demo of how a loan looks, the card that asks to borrow the phone, and 停下 rows.
// The same rules as the Mac (apps/desktop/internal/views/handset.go).
import type { CallPlan, DialHow, DialSheet, HandsetServerFrame, HandsetState, TaskCard } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Chip, StepRow } from "./controls.tsx";
import { TABLES } from "./i18n.ts";
import { shownDeviceName } from "./format.ts";
import { nativeCall, nativeInfo } from "./native.ts";
import type { Client } from "./sheet.ts";
import { finished, title, type DecisionState, type Task } from "./store.ts";
import { SheetFrame } from "./sheet-frame.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const ACTIVE = ["working", "queued", "needs_you", "blocked"];

/** What this page knows about its own phone's app, and the guide's place. */
export const H: { state?: HandsetState; guide?: Guide; demo?: boolean } = {};

/**
 * The guide's place. Two steps (D246): 1 allow restricted settings (only where Android restricts a
 * sideloaded Ducter), 2 turn on Ducter. Android's App info shows its Allow item only after the
 * person has met the block once, so step 1 has two parts: "try" (tap the grey Ducter row once,
 * then OK) and "allow" (App info › ⋮ › Allow restricted settings). Step 2 opens once step 1 is done.
 */
export type Part = "try" | "allow" | "on";
export type Guide = { visited: Set<string>; away?: string; added?: boolean; steps?: ("allow" | "on")[] };

const androidHere = () => nativeInfo()?.platform === "android";

/** Asks the app where it stands and tells the home (on every welcome, and on each change). */
export async function handsetHello(): Promise<void> {
  if (!androidHere()) return;
  const s = await nativeCall<HandsetState>({ t: "handset.state" });
  if (!s || typeof s !== "object" || typeof s.bridge !== "number") return; // an app from before D238
  took(s);
}

function took(s: HandsetState) {
  const was = H.state;
  H.state = s;
  if (A.S.welcomed) A.send({ t: "handset_hello", state: s });
  const g = H.guide;
  if (g && g.away) g.visited.add(g.away), (g.away = undefined);
  // The switch went on while the guide was open: add it, then show how a loan looks.
  if (g && s.service && !was?.service && !g.added) {
    g.added = true;
    A.send({ t: "handset_set", on: true });
    H.demo = true;
  }
  A.changed();
}

// ---------- D278: 你来打 / You call: a call sheet's number, dialled by the app on the person's phone ----------

/** Where one sheet's dial stands, on this page: asking the phone, or how the phone took it. */
export type DialNow = { phase: "asking"; phone: string } | { phase: "done"; phone: string; how: DialHow } | { phase: "failed"; phone: string; reason: "no_phone" | "no_sheet" | "failed" | "timeout" };
export const DIAL = new Map<string, DialNow>();

/** This page runs in the Ducter app on an Android phone that can dial (an app from D278 on). */
export const dialsHere = () => androidHere() && !!H.state?.dial;

/** The app dials the sheet's number itself, and keeps the sheet in a notification during the call. */
async function appDial(d: { callId: string; to: string; name: string; sheet: DialSheet }): Promise<{ ok: boolean; how?: DialHow; error?: string }> {
  const r = await nativeCall<{ ok?: boolean; how?: DialHow; error?: string }>({ t: "phone.dial", callId: d.callId, to: d.to, name: d.name, sheet: d.sheet, lang: A.L.lang });
  // The permission may have changed with the answer: say so to the home on the next hello.
  void handsetHello();
  return r && r.ok === true ? { ok: true, how: r.how === "dialer" || r.how === "note" ? r.how : "rang" } : { ok: false, error: r?.error ?? "the Ducter app didn't answer" };
}

/** 拨打, tapped on the phone itself: the app dials (no round trip through the home). */
export async function dialHere(callId: string, plan: CallPlan): Promise<void> {
  const s = plan.sheet;
  if (!s) return;
  const phone = H.state?.model || "";
  DIAL.set(callId, { phase: "asking", phone });
  A.changed();
  const r = await appDial({ callId, to: plan.to, name: plan.name, sheet: { goal: plan.goal, open: s.open, ask: s.ask, dont: s.dont, note: s.note } });
  DIAL.set(callId, r.ok ? { phase: "done", phone, how: r.how ?? "rang" } : { phase: "failed", phone, reason: "failed" });
  A.changed();
}

/** 在 Pixel Fold 上拨打, tapped in another window: the home asks that phone's app. */
export function dialOn(callId: string, device: string, phone: string): void {
  DIAL.set(callId, { phase: "asking", phone });
  A.send({ t: "handset_dial", callId, device });
  A.changed();
}

/** One of the home's calls, relayed to the app and answered. */
export function handsetFrame(f: HandsetServerFrame): void {
  // D278: dial a call sheet's number here (asked from another window), and answer how it went.
  if (f.t === "handset_dial_req") {
    if (!androidHere()) return void A.send({ t: "handset_dial_res", id: f.id, ok: false, error: "not the Android app" });
    void appDial(f).then((r) => A.send({ t: "handset_dial_res", id: f.id, ok: r.ok, ...(r.how ? { how: r.how } : {}), ...(r.error ? { error: r.error } : {}) }));
    return;
  }
  if (f.t === "handset_dial_result") {
    const was = DIAL.get(f.callId);
    const phone = f.phone ?? (was?.phone || "");
    DIAL.set(f.callId, f.ok ? { phase: "done", phone, how: f.how ?? "rang" } : { phase: "failed", phone, reason: f.reason ?? "failed" });
    return void A.changed();
  }
  // D247: a task's card asked to turn 用这台手机 on here (tapped on this phone or in another window).
  if (f.t === "handset_guide") return void (androidHere() && openHandsetGuide());
  if (f.t === "handset_req") {
    void nativeCall<{ ok: boolean; result?: unknown; error?: string }>({ t: "handset.call", m: f.m, a: f.a }).then((r) => {
      const ok = !!r && r.ok === true;
      A.send({ t: "handset_res", id: f.id, ok, ...(ok ? { result: r!.result ?? null } : { error: r?.error ?? "the Ducter app on this phone didn't answer" }) });
    });
    return;
  }
  if (f.t === "handset_set_result" && !f.ok && f.on && H.guide) return void ((H.guide.added = false), A.changed());
  A.changed();
}

// The app tells the page when its switch, a loan or its pill's 停下 changed.
if (typeof addEventListener === "function")
  addEventListener("ducterhandset", (e: Event) => {
    const d = (e as CustomEvent).detail as { state?: HandsetState; stop?: boolean; why?: string; native?: boolean } | undefined;
    // D253: the app says why it ended the loan (Stop, the phone locked, its switch went off, the home went quiet).
    // D255: network (its own link couldn't reach the home); and when its own link is up it says so there itself.
    const why = d?.why === "locked" || d?.why === "service" || d?.why === "lost" || d?.why === "network" ? d.why : "stop";
    if (d?.stop && !d.native) A.send({ t: "handset_stop", from: "phone", why });
    if (d?.state) took(d.state);
  });

/**
 * The steps this phone needs, fixed once the guide knows (so step 1 stays, ticked, after restricted
 * settings are allowed): Android 13+ with restricted settings on has two, else one.
 */
export function steps(s: HandsetState | undefined, g: Guide): ("allow" | "on")[] {
  if (g.steps) return g.steps;
  const all: ("allow" | "on")[] = s && s.sdk >= 33 && s.restricted !== false ? ["allow", "on"] : ["on"];
  if (s) g.steps = all;
  return all;
}
/** Where the person is: a part of step 1, step 2, or done. */
export function current(s: HandsetState | undefined, g: Guide): Part | "done" {
  if (s?.service) return "done";
  if (!steps(s, g).includes("allow")) return "on";
  if (s?.restricted === false) return "on";
  // The app says whether the block was met (D246); an older app can't: then the visits say.
  if (s?.restricted === true && typeof s.seen === "boolean") return s.seen ? "allow" : "try";
  if (g.visited.has("allow")) return "on";
  return g.visited.has("try") ? "allow" : "try";
}

export function openHandsetGuide() {
  H.guide = { visited: new Set() };
  H.demo = false;
  void handsetHello();
  A.changed();
}

// ---------- the chip on a phone's card ----------

/**
 * D398: 用这台手机 is the phone's chip. On while it is added: a tap asks in one line before turning
 * it off (Android's own switch goes off with it). Not added: dashed; on this phone it opens the
 * guide, elsewhere a tap says where it is added. Can't be reached: the failed tint and why.
 */
export function HandsetChip({ cl }: { cl: Client }) {
  const [info, setInfo] = useState(false);
  const [asking, setAsking] = useState(false);
  const h = cl.handset;
  const mine = A.me?.deviceId === cl.id && androidHere();
  if (!h && !mine) return null;
  const on = !!h?.added;
  const service = mine ? !!H.state?.service : !!h?.state?.service;
  const look = on ? (service && h?.linked !== false ? "on" : "fail") : "add";
  const name = shownDeviceName(cl.name);
  return (
    <>
      <div class="dc-chips">
        <Chip
          // D398: the phone on the card, never "this computer" when the card is read on one (D330 renames only the reader's own).
          label={mine ? t("chip.handset") : (TABLES[A.L.lang]["chip.handset"] ?? t("chip.handset"))}
          art="app/art/ab_phone.webp"
          look={look}
          state={on && !h?.linked ? t("card.status.away") : undefined}
          infoOpen={info}
          onInfo={() => setInfo(!info)}
          onClick={() => {
            if (!on && mine && H.state) return openHandsetGuide();
            if (look === "fail" && mine) return openHandsetGuide();
            if (on && look === "on") return setAsking(!asking);
            setInfo(!info);
          }}
        />
      </div>
      {asking && on && (
        <div class="dc-note hs-off" role="group" aria-label={t("handset.off.ask")}>
          <b>{t("handset.off.ask")}</b>
          <div class="small sub">{t("handset.remove.means")}</div>
          <div class="acts">
            <Btn kind="text" size="sm" label={t("handset.off.keep")} onClick={() => setAsking(false)} />
            <Btn kind="secondary" size="sm" label={t("handset.off.go")} about={name} onClick={() => (setAsking(false), A.send({ t: "handset_set", device: cl.id, on: false }))} />
          </div>
        </div>
      )}
      {info && (
        <div class="dc-note">
          {!on && !mine && <div>{t("handset.elsewhere", name)}</div>}
          {!on && mine && !H.state && <div>{t("handset.old")}</div>}
          {!on && mine && H.state && <div>{t("ability.handset.about")}</div>}
          {on && service && h?.linked !== false && <div>{t("handset.chip.about")}</div>}
          {on && !service && <div>{t("handset.switch_off")}</div>}
          {on && !h?.linked && <div class="small sub">{t("handset.away")}</div>}
          {on && mine && !service && (
            <div class="acts">
              <Btn kind="secondary" size="sm" label={t("handset.reopen")} onClick={openHandsetGuide} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * D398: under the chip, once the phone is added: the task using it now and 停下 (the one action the
 * moment calls for), what it can and can't touch as two plain sentences (D420), and the optional lock step
 * as a row that opens in place. The same as the Mac's handsetCard (views/handset.go).
 */
export function HandsetBody({ cl }: { cl: Client }) {
  const h = cl.handset;
  if (!h?.added) return null;
  const name = shownDeviceName(cl.name);
  return (
    <>
      {h.using && (
        <div class="hs-using" role="status">
          <span class="grow">
            <b>{t("handset.using", h.using.title)}</b>
            {h.using.paused === "locked" && <small>{t("handset.paused", name)}</small>}
            {h.using.paused === "asking" && <small>{t("handset.paused.asking", name)}</small>}
            {h.using.quiet && !h.using.paused && <small>{t("handset.quiet", name)}</small>}
          </span>
          <Btn kind="primary" size="sm" label={t("handset.stop")} about={h.using.title} onClick={() => A.send({ t: "handset_stop", taskId: h.using!.taskId })} />
        </div>
      )}
      <Guard words={t("handset.g")} />
      <LockStep />
    </>
  );
}

/** The lock step's drawn mark (never a symbol from a font, D211). */
function MoonMark() {
  const s = { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
  return (
    <svg class="pm" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M11 2C3 2.5 3 15.5 11 16c2 0 4-1 5-2.5C10 14 6.5 9.5 7 6.5 7.4 4 9 2.5 11 2Z" {...s} />
    </svg>
  );
}

/**
 * D420: what a device uses and what stays private, said once as plain sentences in one soft tray:
 * no marks, no list. The same on every kind of device, as the Mac's guard (views/devguard.go).
 */
export function Guard({ words }: { words: string }) {
  return <p class="dc-guard">{words}</p>;
}

/** 锁屏时也能借给任务 › (D339, D398): one optional row; open, three steps with the setting's real names. */
function LockStep() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <StepRow mark={<MoonMark />} title={t("handset.lock.row")} sub={t("handset.lock.sub")} open={open} onClick={() => setOpen(!open)} />
      {open && (
        <div class="hs-lock-steps" role="group" aria-label={t("handset.lock.row")}>
          <div class="small sub">{t("handset.lock.why")}</div>
          <ol>
            <li>
              <b>{t("handset.lock.s1")}</b>
              <small>{t("handset.lock.s1.alt")}</small>
            </li>
            <li>
              <b>{t("handset.lock.s2")}</b>
            </li>
            <li>
              <b>{t("handset.lock.s3")}</b>
            </li>
          </ol>
          <div class="hs-never">
            <small class="grow">{t("handset.lock.never")}</small>
            <Btn kind="secondary" size="sm" label={t("handset.user.done")} onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

// ---------- the guide, and the demo ----------

/** A clay miniature of one of Android's own pages, the fingertip where to tap (literal: research/74 §7). */
function Mini({ step }: { step: Part }) {
  if (step === "allow")
    return (
      <div class="hs-mini allow" aria-hidden="true">
        <div class="hs-bar">
          <span>{t("android.appinfo")}</span>
          <b class="hs-kebab" />
        </div>
        <div class="hs-app">
          <img src="app/art/idle.webp" alt="" />
          <span>Ducter</span>
        </div>
        <div class="hs-menu">{t("android.allow_restricted")}</div>
        <i class="hs-tip" />
      </div>
    );
  return (
    <div class={`hs-mini ${step}`} aria-hidden="true">
      <div class="hs-bar">
        <span>{t("android.a11y")}</span>
      </div>
      <div class="hs-sec">{t("android.downloaded")}</div>
      <div class="hs-row">
        <img src="app/art/idle.webp" alt="" />
        <span>Ducter</span>
        <small>{step === "try" ? t("android.controlled") : t("android.off")}</small>
      </div>
      <div class="hs-switch">
        <span>{t("android.use")}</span>
        <i class="hs-toggle" />
      </div>
      <div class="hs-dialog">
        <b>{step === "try" ? t((H.state?.sdk ?? 0) >= 35 ? "android.denied" : "android.restricted") : t("android.full")}</b>
        <span>{step === "try" ? t((H.state?.sdk ?? 0) >= 35 ? "android.close" : "android.ok") : t("android.allow")}</span>
      </div>
      <i class="hs-tip" />
    </div>
  );
}

/** The demo: a small clay phone in a loan (the pill, a tap's ring, a Go card, Stop), looping. */
function Demo() {
  return (
    <div class="hs-demo" aria-hidden="true">
      <div class="hs-phone">
        <div class="hs-pill">
          <img src="app/art/idle.webp" alt="" />
          <span>
            <b>{t("handset.pill", A.S.personaName || "Ducter")}</b>
            <small>{t("handset.demo.step")}</small>
          </span>
          <em>{t("handset.stop")}</em>
        </div>
        <div class="hs-chat">
          <div class="hs-msg">{t("handset.demo.app")}</div>
          <div class="hs-input">
            <span>{t("handset.demo.typed")}</span>
            <i class="hs-send" />
          </div>
        </div>
        <i class="hs-ring" />
        <div class="hs-go">
          <span>{t("handset.demo.go")}</span>
          <b>{t("phoneuse.go.go")}</b>
        </div>
      </div>
      <ol class="hs-caps">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} style={{ "--i": n - 1 }}>
            {t(`handset.demo.${n}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HandsetGuideSheet() {
  const g = H.guide;
  useEffect(() => {
    if (!g) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [!!g]);
  if (!g) return null;
  const close = () => ((H.guide = undefined), (H.demo = false), A.changed());
  const s = H.state;
  const all = steps(s, g);
  const now = current(s, g);
  /** Which numbered step a part belongs to: try and allow are step 1's two parts. */
  const stepOf = (p: Part | "done") => (p === "done" ? all.length : p === "on" ? all.indexOf("on") : 0);
  const go = (part: Part) => {
    g.away = part;
    void nativeCall({ t: "handset.settings", step: part === "allow" ? "restricted" : "service" });
  };
  return (
    <SheetFrame label={t("handset.guide.title")} class="handset-guide" onScrim={close}>
      {now === "done" || H.demo ? (
        <>
          <h2>{t("handset.done.title")}</h2>
          <Demo />
          <div class="btns">
            <Btn kind="primary" label={t("handset.done.ok")} onClick={close} />
          </div>
        </>
      ) : (
        <>
          <h2>{t("handset.guide.title")}</h2>
          <p class="lede">{t("handset.guide.lede")}</p>
          <ol class="hs-steps">
            {all.map((step, i) => {
              const done = stepOf(now) > i;
              const here = stepOf(now) === i;
              const part = now as Part;
              return (
                <li key={step} class={done ? "done" : here ? "here" : "next"} aria-current={here ? "step" : undefined}>
                  <div class="hs-n">{done ? "" : i + 1}</div>
                  <div class="hs-what">
                    <div class="small sub">{t("handset.step", i + 1)}</div>
                    <b>{t(`handset.step.${step}.title`)}</b>
                    {here && (
                      <>
                        {step === "allow" && (
                          <ol class="hs-parts">
                            {(["try", "allow"] as const).map((p) => (
                              <li key={p} class={p === part ? "here" : p === "try" ? "done" : "next"}>
                                {t(`handset.part.${p}`)}
                              </li>
                            ))}
                          </ol>
                        )}
                        <Mini step={part} />
                        <p class="small">{t(`handset.step.${part}.body`)}</p>
                        {g.visited.has(part) && <p class="small sub" role="status">{t("handset.step.back")}</p>}
                        <Btn kind="primary" label={t(g.visited.has(part) ? "handset.step.again" : "handset.step.go")} onClick={() => go(part)} />
                        {part === "on" && all.length > 1 && s?.restricted !== false && (
                          // Android 16 doesn't tell the app whether Allow was chosen: the guide moved on by the
                          // visit, so if the row is still grey, step 1 is one tap away.
                          <Btn kind="text" size="sm" label={t("handset.step.grey")} onClick={() => (g.visited.clear(), A.changed())} />
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div class="btns">
            <Btn kind="text" label={t("handset.guide.later")} onClick={close} />
          </div>
        </>
      )}
    </SheetFrame>
  );
}

// ---------- the cards ----------

/**
 * May this task borrow the person's phone? One card, no default; Go lends it. D247 (setup): the task
 * needs a phone and 用这台手机 isn't on there yet; Go opens its guide on that phone (from any window),
 * and once it is on the task goes on by itself.
 */
export function HandsetAskBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const h = d.handset!;
  if (h.kind === "record") return <HandsetRecordBody d={d} compact={compact} />;
  const open = !d.resolved;
  const cl = A.reach?.clients.find((c) => c.id === h.device);
  const name = shownDeviceName(cl?.name ?? h.name);
  const k = h.kind === "setup" ? "handset.setup" : "handset.ask";
  return (
    <>
      {!compact && <div class="q">{d.question}</div>}
      {open && <div class="dl">{t(`${k}.what`, name)}</div>}
      {open && cl?.handset && !cl.handset.linked && <div class="dl">{t(`${k}.away`, name)}</div>}
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          {compact && <span class="grow" />}
          <Btn kind="secondary" size={compact ? "sm" : undefined} label={t(`${k}.hold`)} onClick={() => A.decide(d.decisionId, "hold")} />
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t(`${k}.go`)} onClick={() => A.decide(d.decisionId, "go")} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" ? (k === "handset.ask" && d.taskId && A.S.onHand?.tasks.find((x) => x.taskId === d.taskId)?.handset?.wait ? t("handset.ask.waiting") : t(`${k}.done`, name)) : t(`${k}.held`)}
        </div>
      )}
    </>
  );
}

/** D280: how long Android's recording prompt on the phone still waits ("1:42"), or "" once it gave up. */
export function recordLeft(until: string | undefined, now = Date.now()): string {
  const at = until ? Date.parse(until) : NaN;
  if (!Number.isFinite(at) || at <= now) return "";
  const s = Math.floor((at - now) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * D280: Android's prompt to allow a recording shows only on the phone, so it is the person's turn
 * there: every window says to tap Start now on it, counts down its 2 minutes, and offers only 不录了 /
 * Skip recording. It resolves by itself when the phone answers or gives up.
 */
function HandsetRecordBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const h = d.handset!;
  const open = !d.resolved && !d.pending;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [open]);
  const left = open ? recordLeft(h.until) : "";
  const done = d.resolved?.option === "go" ? "handset.record.on" : d.resolved?.by === "default" ? "handset.record.gave_up" : "handset.record.skipped";
  return (
    <>
      {!compact && <div class="q">{handsetAskTitle(d)}</div>}
      {open && <div class="dl">{t("handset.record.what")}</div>}
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          {left && (
            <span class="small sub" role="timer">
              {t("handset.record.left", left)}
            </span>
          )}
          <span class="grow" />
          <Btn kind="secondary" size={compact ? "sm" : undefined} label={t("handset.record.hold")} onClick={() => A.decide(d.decisionId, "hold")} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {t(done)}
        </div>
      )}
    </>
  );
}

/** The card's title line for the ask. */
export const handsetAskTitle = (d: DecisionState): string => {
  const h = d.handset!;
  if (h.kind === "record") return t("handset.record.title", shownDeviceName(A.reach?.clients.find((c) => c.id === h.device)?.name ?? h.name ?? ""));
  const tk = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  const task = (tk && title(tk)) || "";
  const name = shownDeviceName(A.reach?.clients.find((c) => c.id === h.device)?.name ?? h.name ?? "");
  return task ? t(h.kind === "setup" ? "handset.setup.title" : "handset.ask.title", task, name) : d.question;
};

/** A phone task's name for the person's phone ("Pixel Fold"). */
export const phoneName = (device: string, fallback = "") => shownDeviceName(A.reach?.clients.find((c) => c.id === device)?.name ?? fallback);

/** On the opened task: it is on the person's phone now, with 停下 / Stop. */
export function HandsetLine({ task }: { task: Task }) {
  if (finished(task)) return null;
  const c: TaskCard | undefined = A.S.onHand?.tasks.find((x) => x.taskId === task.id);
  const hs = c?.handset;
  if (!hs || !ACTIVE.includes(c!.attention)) return null;
  const phone = phoneName(hs.device, "phone");
  const line = handsetTaskLine(hs, phone);
  const why = handsetTaskWhy(hs, phone);
  return (
    <div class="outcome watch-row">
      <div class="said" role={hs.wait || hs.paused ? "status" : undefined}>
        {line}
        {why && <div class="small sub">{why}</div>}
      </div>
      <Btn kind="secondary" size="sm" label={t(hs.wait ? "handset.withdraw" : "handset.stop")} about={line} onClick={() => A.send({ t: "handset_stop", taskId: task.id })} />
    </div>
  );
}

type HandsetCard = NonNullable<TaskCard["handset"]>;

/**
 * D331: the opened task's line for the person's phone, as the loan stands: lent, paused by their lock
 * (or asking on the phone after the unlock), or a Go given and the loan not on yet (waiting for the
 * unlock, the phone out of reach, starting).
 */
export function handsetTaskLine(hs: HandsetCard, phone: string): string {
  if (hs.wait === "unlock") return t("handset.wait.unlock", phone);
  if (hs.wait === "away") return t("handset.wait.away", phone);
  if (hs.wait === "starting") return t("handset.wait.starting", phone);
  if (hs.paused === "asking") return t("handset.paused.asking", phone);
  if (hs.paused) return t("handset.paused", phone);
  return t("handset.task", phone);
}

/** D331: the line under it: why the phone can't be reached, what a pause means, or that it isn't answering. */
export function handsetTaskWhy(hs: HandsetCard, phone: string): string {
  if (hs.wait === "away") return t(`handset.away.${hs.away ?? "unknown"}`);
  if (hs.paused === "locked") return t("handset.paused.why");
  if (hs.quiet && !hs.wait && !hs.paused) return t("handset.quiet", phone);
  return "";
}
