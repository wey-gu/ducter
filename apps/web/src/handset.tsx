// D238, 用这台手机 / Use this phone: a task borrows the person's own Android phone through the Ducter
// app on it. This page, when it runs inside that app, is the phone's link: it says what the app can
// do (handset_hello), relays the home's calls to the app's accessibility bridge and back, and passes
// on 停下 from the app's pill. It also draws the chip on the phone's card, the guide to Android's one
// switch (a clay miniature of each settings page with the fingertip where to tap, research/74 §7),
// the short demo of how a loan looks, the card that asks to borrow the phone, and 停下 rows.
// The same rules as the Mac (apps/desktop/internal/views/handset.go).
import type { HandsetServerFrame, HandsetState, TaskCard } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Chip } from "./controls.tsx";
import { nativeCall, nativeInfo } from "./native.ts";
import type { Client } from "./sheet.ts";
import { finished, title, type DecisionState, type Task } from "./store.ts";

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

/** One of the home's calls, relayed to the app and answered. */
export function handsetFrame(f: HandsetServerFrame): void {
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
    const d = (e as CustomEvent).detail as { state?: HandsetState; stop?: boolean; why?: string } | undefined;
    // D253: the app says why it ended the loan (Stop, the phone locked, its switch went off, the home went quiet).
    const why = d?.why === "locked" || d?.why === "service" || d?.why === "lost" ? d.why : "stop";
    if (d?.stop) A.send({ t: "handset_stop", from: "phone", why });
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

export function HandsetChip({ cl }: { cl: Client }) {
  const [info, setInfo] = useState(false);
  const h = cl.handset;
  const mine = A.me?.deviceId === cl.id && androidHere();
  if (!h && !mine) return null;
  const on = !!h?.added;
  const service = mine ? !!H.state?.service : !!h?.state?.service;
  const look = on ? (service ? "on" : "fail") : mine && H.state ? "add" : "off";
  const name = cl.name.replace(/\s*·\s*Ducter$/, "");
  return (
    <>
      <div class="dc-chips">
        <Chip
          label={t("chip.handset")}
          art="app/art/ab_phone.webp"
          look={look}
          infoOpen={info}
          onInfo={() => setInfo(!info)}
          onClick={() => {
            if (look === "add" || (look === "fail" && mine)) return openHandsetGuide();
            setInfo(!info);
          }}
        />
      </div>
      {info && (
        <div class="dc-note">
          {!on && !mine && <div>{t("handset.elsewhere", name)}</div>}
          {!on && mine && !H.state && <div>{t("handset.old")}</div>}
          {!on && mine && H.state && <div>{t("ability.handset.about")}</div>}
          {on && <div>{t("handset.where", name)}</div>}
          {on && !service && <div>{t("handset.switch_off")}</div>}
          {on && !h?.linked && <div class="small sub">{t("handset.away")}</div>}
          {on && (
            <div class="acts">
              {mine && !service && <Btn kind="secondary" size="sm" label={t("handset.reopen")} onClick={openHandsetGuide} />}
              <Btn kind="text" size="sm" label={t("handset.remove")} about={t("handset.remove.means")} onClick={() => A.send({ t: "handset_set", device: cl.id, on: false })} />
            </div>
          )}
        </div>
      )}
      {h?.using && (
        <div class="dev-browsing">
          <div class="dev-site">
            <div class="dev-site-what">
              <div class="small">{t("handset.using", h.using.title)}</div>
              {h.using.quiet && <div class="small sub" role="status">{t("handset.quiet", name)}</div>}
            </div>
            <Btn kind="secondary" size="sm" label={t("handset.stop")} about={h.using.title} onClick={() => A.send({ t: "handset_stop", taskId: h.using!.taskId })} />
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
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet handset-guide" role="dialog" aria-modal="true" aria-label={t("handset.guide.title")}>
        <div class="grab" />
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
      </div>
    </>
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
  const open = !d.resolved;
  const cl = A.reach?.clients.find((c) => c.id === h.device);
  const name = (cl?.name ?? h.name).replace(/\s*·\s*Ducter$/, "");
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
          {d.resolved?.option === "go" ? t(`${k}.done`, name) : t(`${k}.held`)}
        </div>
      )}
    </>
  );
}

/** The card's title line for the ask. */
export const handsetAskTitle = (d: DecisionState): string => {
  const h = d.handset!;
  const tk = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  const task = (tk && title(tk)) || "";
  const name = ((A.reach?.clients.find((c) => c.id === h.device)?.name ?? h.name) || "").replace(/\s*·\s*Ducter$/, "");
  return task ? t(h.kind === "setup" ? "handset.setup.title" : "handset.ask.title", task, name) : d.question;
};

/** A phone task's name for the person's phone ("Pixel Fold"). */
export const phoneName = (device: string, fallback = "") => ((A.reach?.clients.find((c) => c.id === device)?.name ?? fallback) || "").replace(/\s*·\s*Ducter$/, "");

/** On the opened task: it is on the person's phone now, with 停下 / Stop. */
export function HandsetLine({ task }: { task: Task }) {
  if (finished(task)) return null;
  const c: TaskCard | undefined = A.S.onHand?.tasks.find((x) => x.taskId === task.id);
  const hs = c?.handset;
  if (!hs || !ACTIVE.includes(c!.attention)) return null;
  const line = t("handset.task", phoneName(hs.device, "phone"));
  return (
    <div class="outcome watch-row">
      <div class="said">
        {line}
        {hs.quiet && <div class="small sub" role="status">{t("handset.quiet", phoneName(hs.device, "phone"))}</div>}
      </div>
      <Btn kind="secondary" size="sm" label={t("handset.stop")} about={line} onClick={() => A.send({ t: "handset_stop", taskId: task.id })} />
    </div>
  );
}
