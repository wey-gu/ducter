// Time and place wording, the same rules as the desktop (views/app.go formatting).
import type { AgentModels, DeviceHarness, DeviceUpdate, MemPluginView, ModelChoice } from "@ducter/protocol";
import { undomainedName } from "@ducter/protocol";
import { compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import type { Strings } from "./i18n.ts";
import { words } from "@ducter/protocol/src/lang.ts";

export function duration(L: Strings, ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return L.t("time.min", min);
  return L.t("time.hour", Math.round(min / 60));
}

export function ago(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return L.t("time.now");
  if (s < 3600) return L.t("time.ago.min", Math.round(s / 60));
  // From a day and a half on, days ("9 天前", never "220 小时前"; the Mac's rule too).
  if (s >= 36 * 3600) return L.t("time.ago.day", Math.round(s / 86400));
  return L.t("time.ago.hour", Math.round(s / 3600));
}

// Human times (packages/protocol/fixtures/when.json, the same rule as the desktop's
// i18n/when.go): a time of day without a leading zero; today / tomorrow / yesterday by name; the
// next six days by weekday; else the date in words ("12 月 1 日" / "Dec 1"), with the year only
// when it isn't this one. Never "12-01 09:00".
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
interface DayWords {
  rel: Record<"0" | "1" | "-1", string>;
  wd: string[];
  date(d: Date, year: boolean): string;
  /** Between a far day and its time: " " / ", ". */
  farSep: string;
}
const DAY: { en: DayWords; zh: DayWords } = {
  zh: {
    rel: { "0": "今天", "1": "明天", "-1": "昨天" },
    wd: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    date: (d, year) => `${year ? `${d.getFullYear()} 年 ` : ""}${d.getMonth() + 1} 月 ${d.getDate()} 日`,
    farSep: " ",
  },
  en: {
    rel: { "0": "today", "1": "tomorrow", "-1": "yesterday" },
    wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    date: (d, year) => `${EN_MON[d.getMonth()]} ${d.getDate()}${year ? ` ${d.getFullYear()}` : ""}`,
    farSep: ", ",
  },
};
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (d: Date, now: Date) => Math.round((midnight(d) - midnight(now)) / 86_400_000);

export function clock(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The date in words: 今天 / 明天 / 昨天, a weekday within six days ahead, else "12 月 1 日" / "Dec 1". */
export function day(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const w = words(DAY, L.lang);
  const d = new Date(iso), n = new Date(now);
  const k = dayDiff(d, n);
  if (k === 0 || k === 1 || k === -1) return w.rel[String(k) as "0" | "1" | "-1"];
  if (k > 1 && k < 7) return w.wd[d.getDay()]!;
  return w.date(d, d.getFullYear() !== n.getFullYear());
}

/** D304: a calendar day always as a date, never "yesterday": "11 月 10 日" / "Nov 10" (the year only when not this one). YYYY-MM-DD is a local day. */
export function calDay(L: Strings, ymd: string | undefined, now = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return words(DAY, L.lang).date(d, d.getFullYear() !== new Date(now).getFullYear());
}

/** A moment: "今天 18:00", "明天 9:00", "周五 9:00", "12 月 1 日 9:00" / "today 18:00", "Dec 1, 9:00". */
export function when(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const dd = day(L, iso, now);
  const named = dayDiff(new Date(iso), new Date(now));
  const sep = named > 6 || named < -1 ? words(DAY, L.lang).farSep : " ";
  return `${dd}${sep}${clock(iso)}`;
}

/** D325: a moment in a list of today's things: today its time alone ("9:47"), else with its day ("昨天 9:47"). */
export function stamp(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  return dayDiff(new Date(iso), new Date(now)) === 0 ? clock(iso) : when(L, iso, now);
}

/**
 * D325: from one moment to another, always in order (the earlier first, whichever came in first):
 * within a day "10:32–10:46" (its day before it when not today, "昨天 10:32–10:46"); across days,
 * each with its own ("昨天 22:10–今天 1:05" / "yesterday 22:10–today 1:05"). Never "10:46–10:32".
 */
export function span(L: Strings, a: string | undefined, b: string | undefined, now = Date.now()): string {
  if (!a || !b) return stamp(L, a || b, now);
  if (Date.parse(b) < Date.parse(a)) [a, b] = [b, a];
  const da = new Date(a), db = new Date(b);
  if (midnight(da) !== midnight(db)) return `${when(L, a, now)}–${when(L, b, now)}`;
  // Within the same minute it is one moment.
  if (clock(a) === clock(b)) return stamp(L, a, now);
  const range = `${clock(a)}–${clock(b)}`;
  if (dayDiff(da, new Date(now)) === 0) return range;
  const named = dayDiff(da, new Date(now));
  return `${day(L, a, now)}${named > 6 || named < -1 ? words(DAY, L.lang).farSep : " "}${range}`;
}

/** A date on a strip of beads: "11/16". */
export function md(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}


export function deviceLabel(L: Strings, d: string | undefined): string {
  if (!d || d === "local" || d === "this") return L.t("device.local");
  return d;
}


/** A reason's first clause: up to its first comma or full stop outside quotes. */
export function firstClause(s: string): string {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if ("「“(（".includes(c)) depth++;
    else if ("」”)）".includes(c)) depth--;
    else if (c === '"') depth += depth > 0 ? -1 : 1;
    else if (depth <= 0 && ("，。；".includes(c) || (",;.".includes(c) && (i + 1 === s.length || s[i + 1] === " ")))) return s.slice(0, i).trim();
  }
  return s.trim();
}

export function harnessName(h: string): string {
  return { "claude-code": "Claude Code", codex: "Codex", pi: "pi", "deepseek-harness": "DeepSeek Harness" }[h] ?? h;
}

/** The words each agent lists its models with, learned from its lists (the computers' accounts, the
 *  New task lists), so a model is said as its agent says it ("GPT-6.2-Sol"), never its raw id. */
const modelLabels = new Map<string, string>();

/** Learns the labels in agents' model lists (a device's harnesses, the New task lists' rows). */
export function learnModelLabels(lists: readonly { models?: readonly { id: string; label?: string }[] }[] | undefined): void {
  for (const l of lists ?? []) for (const m of l.models ?? []) if (m.label && m.label !== m.id) modelLabels.set(m.id, m.label);
}

/** A model as people say it (D355): its agent's own word for it when a list said it; else Claude
 *  Code's aliases capitalized, an OpenAI id in its own casing ("gpt-6.2-sol" is "GPT-6.2-Sol", as
 *  Codex lists it), anything else as it is. */
export function modelName(m: string): string {
  const known = modelLabels.get(m);
  if (known) return known;
  if (["opus", "sonnet", "haiku"].includes(m)) return m[0]!.toUpperCase() + m.slice(1);
  if (!m.startsWith("gpt-")) return m;
  return m
    .split("-")
    .map((p, i) => (i === 0 ? "GPT" : /^[a-z]/.test(p) ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("-");
}

/**
 * D282/D352: the in-place Model and Effort rows of 换谁来做 / Switch who does it, for the agent
 * doing a task: its live row on that computer (the agent's own list, so a model it added since
 * this Ducter was built is there), the model it's on always a chip even past the row's first
 * few, and the effort it runs at (its own, else the model's default). Undefined: no live list.
 */
export function inPlaceTune(rows: readonly AgentModels[], harness: string, device: string | undefined, now: string | undefined, effortNow: string | undefined): { models: ModelChoice[]; model?: ModelChoice; effort: string } | undefined {
  const row = rows.find((m) => m.harness === harness && (m.device ?? "") === (device ?? "")) ?? rows.find((m) => m.harness === harness);
  if (!row?.models.length || row.from !== "live") return undefined;
  const models = now && !row.models.some((m) => m.id === now) ? [...row.models, { id: now, label: modelName(now) }] : row.models;
  const model = models.find((m) => m.id === now) ?? (now ? undefined : models.find((m) => m.default));
  return { models, ...(model ? { model } : {}), effort: effortNow || model?.defaultEffort || "" };
}

/** A Latin word in Chinese text gets a space on each side ("在 MacBook 上"). */
export function cjkPad(L: Strings, s: string): string {
  if (L.style.spaced || !s) return s;
  if (s.charCodeAt(0) < 0x80) s = " " + s;
  if (s.charCodeAt(s.length - 1) < 0x80) s += " ";
  return s;
}

/** A status line that only repeats the title says nothing (ignoring case, spaces, end punctuation). */
export const sameWords = (detail: string | undefined, title: string) => {
  const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(" ").replace(/[.。…]+$/, "").toLowerCase();
  return !!detail && norm(detail) !== "" && norm(detail) === norm(title);
};

/** The outcome said once (D74): its first sentence as the headline, the rest in the partner's
 *  voice under it. A one-sentence report is all headline. */
export function splitOutcome(summary: string): [string, string] {
  const text = summary.trim();
  const m = /^(.+?(?:[。！？]|[.!?](?=\s|$)))\s*/su.exec(text);
  if (m && m[1]!.length < text.length && m[1]!.length <= 90) return [m[1]!, text.slice(m[0].length)];
  return text.length <= 90 ? [text, ""] : ["", text];
}

// D148: an update under way; a device that is behind (one quiet dot); the step in words.
export const updating = (u?: DeviceUpdate) => !!u && ["downloading", "verifying", "waiting", "restarting"].includes(u.phase ?? "");
export const behind = (u?: DeviceUpdate) => !!u && u.available && !updating(u) && u.phase !== "failed";
/**
 * D167: "didn't update" stands only while the device still runs what it started from (its start
 * unknown: while it is below the target). A home older than the rule can still send one.
 */
export function failureStands(u: DeviceUpdate): boolean {
  if (u.phase !== "failed" || !u.to) return true;
  if (compareVersions(u.current, u.to) === 0) return false;
  return isVersion(u.from) ? compareVersions(u.current, u.from) === 0 : compareVersions(u.current, u.to) < 0;
}
/** A device's update as shown: a failure it has moved past is dropped. */
export function withoutStaleFailure(u: DeviceUpdate | undefined): DeviceUpdate | undefined {
  if (!u || failureStands(u)) return u;
  const { phase: _p, from: _f, to: _t, reason: _r, detail: _d, rolledBack: _b, at: _a, ...rest } = u;
  return rest;
}
/**
 * The same rule for an AI agent's own update (D156), judged against the version installed now: on
 * the target it is done whatever was said; still where it started, a failure stands; anywhere
 * else it is gone. "Nothing newer" (no_update) is never a failure. A home older than the rule
 * can still send one.
 */
export function withoutStaleAgentUpdate(h: DeviceHarness): DeviceHarness {
  const u = h.update;
  if (!u || (u.phase !== "failed" && u.phase !== "done") || !h.version) return h;
  if (u.to && compareVersions(h.version, u.to) === 0) {
    if (u.phase === "done") return h;
    const { reason: _r, detail: _d, rolledBack: _b, ...rest } = u;
    return { ...h, update: { ...rest, phase: "done" } };
  }
  if (u.phase === "failed" && u.reason !== "no_update" && u.from && compareVersions(h.version, u.from) === 0) return h;
  const { update: _u, ...rest } = h;
  return rest;
}
export function phaseLine(L: Strings, u: DeviceUpdate): string {
  switch (u.phase) {
    case "downloading":
      return u.progress && u.progress > 0.01 ? L.t("devup.phase.downloading.pct", u.to, Math.round(u.progress * 100)) : L.t("devup.phase.downloading", u.to);
    case "verifying":
      return L.t("devup.phase.verifying", u.to);
    case "waiting":
      return L.t("devup.phase.waiting");
    case "restarting":
      return L.t("devup.phase.restarting");
    case "done":
      return L.t("devup.phase.done", u.to || u.current);
    case "failed":
      return u.rolledBack ? L.t("devup.phase.rolledback", u.from) : L.t("devup.phase.failed");
  }
  return "";
}

/** D169: an agent's Nowledge Mem line and its action's words, from Mem's own check (never "working"). */
export function memWords(L: Strings, m: MemPluginView): { line: string; action?: string } {
  if (m.taskId) return { line: L.t("memp.setting") };
  switch (m.state) {
    case "installed":
      return { line: m.version ? L.t("memp.installed", m.version) : L.t("memp.installed.bare") };
    case "absent":
      return { line: L.t("memp.absent"), action: L.t("memp.btn.install") };
    case "update":
      return { line: L.t("memp.update"), action: L.t("memp.btn.update") };
    case "review":
      return { line: L.t(m.why === "multiple" ? "memp.review.multiple" : "memp.review.unclear"), action: L.t("memp.btn.review") };
  }
}

/** An accessible name made of several facts, said the way a person reads a list aloud (D291):
 *  "，" in Chinese, ", " in English. Only for aria-label and title; on screen each fact is its own
 *  element (Facts in controls.tsx), never one string joined by a separator. */
export function spoken(L: Pick<Strings, "t">, ...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join(L.t("spoken.sep"));
}

/** A device's name as the person sees it (D291): a phone or iPad paired through the Ducter app
 *  before D291 was named "<model> · Ducter"; the art and the platform already say it is the app.
 *  A computer paired before D310 by its host name shows it without the network's domain ("Mac.lan"
 *  → "Mac", D310). */
export const shownDeviceName = (name: string) => undomainedName(name.replace(/ · Ducter$/, ""));
