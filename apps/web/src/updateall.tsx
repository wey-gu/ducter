// 全部更新 / Update all (D224): one card at the top of Settings › 你的设备 whenever anything is
// behind. Before: how many, the first few with from → to, the order in one line, what can't take
// part and why, one button. Under way: one calm list that ticks itself off, each step in the
// single update's own words, 停止剩下的. After: what happened, why for what didn't, 再试一次, and
// the offer to keep everything up to date. The plan lives on the home; this only shows it. Every
// control is a shared one (controls.tsx); the marks are drawn.
import type { UpdateAllItem, UpdateAllPlan, UpdateAllView } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn, Toggle } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { nativeInfo } from "./native.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const SHOWN = 4;

export const itemName = (i: Pick<UpdateAllItem, "kind" | "deviceName" | "harness">) => (i.kind === "ducter" ? t("upall.item.ducter", i.deviceName) : t("upall.item.agent", harnessName(i.harness ?? ""), i.deviceName));

/** A running step in the single update's own words (devup.phase.*, agentv.phase.*); D227: or what it waits on. */
function runningWords(i: UpdateAllItem): string {
  if (i.wait === "reconnect") return t("upall.state.reconnect", i.deviceName);
  if (i.kind === "agent" && i.retried && (!i.phase || i.phase === "updating")) return t("upall.state.retry", i.to);
  if (i.kind === "ducter") {
    switch (i.phase) {
      case "downloading":
        return i.progress && i.progress > 0.01 ? t("devup.phase.downloading.pct", i.to, Math.round(i.progress * 100)) : t("devup.phase.downloading", i.to);
      case "verifying":
        return t("devup.phase.verifying", i.to);
      case "waiting":
        return t("devup.phase.waiting");
      case "restarting":
        return t("devup.phase.restarting");
    }
    return t("devup.phase.downloading", i.to);
  }
  switch (i.phase) {
    case "waiting":
      return t("agentv.phase.waiting");
    case "checking":
      return t("agentv.phase.checking", i.to);
  }
  return t("agentv.phase.updating", i.to);
}

/** Where one step stands, in words. */
export function stateWords(i: UpdateAllItem): string {
  switch (i.state) {
    case "queued":
      return t("upall.state.queued");
    case "waiting":
      if (i.wait === "ducter") return t("upall.state.ducter", i.deviceName);
      return (i.busy ?? 1) <= 1 ? t("upall.state.waiting.one") : t("upall.state.waiting", i.busy);
    case "running":
      return runningWords(i);
    case "done":
      return t("upall.state.done", i.to);
    case "failed":
      return i.rolledBack ? t("upall.state.rolledback", i.from) : t("upall.state.failed");
    case "skipped":
      return i.reason === "home" ? t("upall.state.home", i.detail ?? "") : i.reason === "offline" ? t("upall.state.offline") : t("upall.state.stopped");
  }
}

/** Why a step didn't update, in one plain line (none for a step that only waited on another). */
export function whyWords(i: UpdateAllItem): string {
  if (i.state !== "failed") return "";
  if (i.reason === "no_answer") return t("upall.why.no_answer");
  if (i.reason === "interrupted") return t("upall.why.interrupted", i.deviceName);
  const key = i.kind === "ducter" ? `devup.why.${i.reason ?? "failed"}` : `agentv.why.${i.reason ?? "failed"}`;
  const s = t(key);
  return s === key ? t("devup.why.failed") : s;
}

/** The card's title for a plan. */
export function planTitle(p: UpdateAllPlan): string {
  if (!p.finishedAt) return t(p.items.length === 1 ? "upall.running.one" : "upall.running");
  const done = p.items.filter((i) => i.state === "done").length;
  const failed = p.items.filter((i) => i.state === "failed").length;
  if (p.stopped) return t("upall.done.stopped", done);
  return failed ? t("upall.done.some", done, failed) : t("upall.done.all");
}

/** A drawn mark for a step's state (never a symbol a phone might draw as an emoji). */
export function Mark({ state }: { state: UpdateAllItem["state"] }) {
  const ring = <circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--line)" stroke-width="1.8" />;
  return (
    <svg class={`ua-mark ${state}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {state === "done" ? (
        <>
          <circle cx="9" cy="9" r="8" fill="var(--done-surface)" />
          <path d="M5.4 9.3l2.4 2.4 4.8-5.2" fill="none" stroke="var(--done-ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </>
      ) : state === "failed" ? (
        <>
          <circle cx="9" cy="9" r="8" fill="var(--failed-surface)" />
          <path d="M9 5v4.6" stroke="var(--failed-ink)" stroke-width="1.9" stroke-linecap="round" />
          <circle cx="9" cy="12.4" r="1.1" fill="var(--failed-ink)" />
        </>
      ) : state === "running" ? (
        <>
          {ring}
          <path class="spin" d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="var(--working-ink)" stroke-width="1.8" stroke-linecap="round" />
        </>
      ) : state === "waiting" ? (
        <>
          {ring}
          <path d="M7.4 6.6v4.8M10.6 6.6v4.8" stroke="var(--ink-muted)" stroke-width="1.6" stroke-linecap="round" />
        </>
      ) : state === "skipped" ? (
        <>
          {ring}
          <path d="M6.2 9h5.6" stroke="var(--ink-muted)" stroke-width="1.6" stroke-linecap="round" />
        </>
      ) : (
        ring
      )}
    </svg>
  );
}

function Row({ i, words }: { i: UpdateAllItem; words?: boolean }) {
  const why = words ? whyWords(i) : "";
  return (
    <div class={`ua-row ${i.state}`} role="listitem" aria-label={`${itemName(i)}, ${t("upall.versions", i.from, i.to)}${words ? `, ${stateWords(i)}` : ""}`}>
      <Mark state={i.state} />
      <span class="ua-what">
        <span class="ua-name">{itemName(i)}</span>
        <span class="ua-ver">{t("upall.versions", i.from, i.to)}</span>
      </span>
      {words && <span class={`ua-state ${i.state}`}>{stateWords(i)}</span>}
      {why && <span class="ua-why">{why}</span>}
    </div>
  );
}

/** What the apps do themselves at the end: the phone page reloads, the Android app checks. */
function clientLine(v: UpdateAllView): string {
  const items = v.plan?.items ?? v.offer;
  if (nativeInfo()?.platform === "android") return t("upall.android");
  return items.some((i) => i.kind === "ducter" && i.device === "local") ? t("upall.page.reload") : "";
}

export function UpdateAllCard() {
  const v = A.updateAll;
  if (!v) return null;
  const p = v.plan;
  if (!p && !v.offer.length) return null;
  const items = p?.items ?? v.offer;
  const home = A.devices?.find((d) => d.home)?.name ?? "";
  const computers = new Set(items.map((i) => i.device)).size + v.notNow.length;
  const foot = clientLine(v);
  if (!p) {
    const n = items.length;
    return (
      <section class="ua" aria-label={t(n === 1 ? "upall.title.one" : "upall.title", n)}>
        <div class="ua-head">
          <b>{t(n === 1 ? "upall.title.one" : "upall.title", n)}</b>
        </div>
        <div class="ua-list" role="list">
          {items.slice(0, SHOWN).map((i) => (
            <Row key={i.key} i={i} />
          ))}
          {n > SHOWN && <div class="ua-more">{t("upall.more", n - SHOWN)}</div>}
        </div>
        <div class="ua-note">{computers > 1 && home ? t("upall.order", home) : t("upall.order.solo")}</div>
        {v.notNow.map((x) => (
          <div class="ua-note quiet" key={x.device}>
            {t(x.why === "offline" ? "upall.notnow.offline" : x.why === "app_old" ? "upall.notnow.app_old" : "upall.notnow.other", x.deviceName)}
          </div>
        ))}
        {foot && <div class="ua-note quiet">{foot}</div>}
        <div class="ua-act">
          <Btn kind="primary" grow label={t(n === 1 ? "upall.button.one" : "upall.button")} onClick={() => A.startUpdateAll()} />
        </div>
      </section>
    );
  }
  const over = !!p.finishedAt;
  const failed = p.items.some((i) => i.state === "failed");
  return (
    <section class={`ua${over ? " over" : ""}`} aria-label={planTitle(p)} aria-live="polite">
      <div class="ua-head">
        <b>{planTitle(p)}</b>
      </div>
      <div class="ua-list" role="list">
        {p.items.map((i) => (
          <Row key={i.key} i={i} words />
        ))}
      </div>
      {!over && foot && <div class="ua-note quiet">{foot}</div>}
      <div class="ua-act">
        {!over && p.items.some((i) => i.state === "queued" || i.state === "waiting") && <Btn kind="text" size="sm" label={t("upall.stop")} onClick={() => A.stopUpdateAll()} />}
        {over && failed && <Btn kind="secondary" size="sm" label={t("upall.retry")} onClick={() => A.startUpdateAll()} />}
        {over && <Btn kind="text" size="sm" label={t("upall.dismiss")} onClick={() => A.dismissUpdateAll()} />}
      </div>
      {over && A.settings && !A.settings.autoUpdate && <Toggle label={t("upall.auto")} help={t("upall.auto.note")} checked={false} onChange={(on) => A.setSettings({ autoUpdate: on })} />}
    </section>
  );
}
