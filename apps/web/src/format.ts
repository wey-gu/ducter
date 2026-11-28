// Time and place wording, the same rules as the desktop (views/app.go formatting).
import type { AgentModels, BridgeReceipt, DeviceHarness, DeviceUpdate, MemPluginView, ModelChoice } from "@ducter/protocol";
import { MEM_CONNECT_TOOLS, undomainedName } from "@ducter/protocol";
import { compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import type { Strings } from "./i18n.ts";
import { words } from "@ducter/protocol/src/lang.ts";

/** D619: how a sent message reads beside its time: 已送达 / Delivered while nobody has opened it,
 *  已读 / Read once one has, 「{n}/{m} 已读」 in a Space with several readers. Absent: no words at all
 *  (Mem gave no receipt, so nothing is known and "unread" is never invented). */
export function receiptWords(r: BridgeReceipt | undefined, L: Strings): string {
  if (!r) return "";
  const n = r.count;
  if (n !== undefined && n <= 0) return L.t("bridge.receipt.delivered");
  if (n !== undefined && r.total !== undefined && r.total > 1 && n < r.total) return L.t("bridge.receipt.partly", n, r.total);
  if (n === undefined && r.state === "unread") return L.t("bridge.receipt.delivered");
  return L.t("bridge.receipt.read");
}

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

/** D519: a moment in a list's time column: today its clock ("14:28"), else its day alone (昨天, 周一,
 *  "11 月 22 日" / "Nov 22"): one short line that never wraps. The Mac's i18n.ColTime says the same. */
export function colTime(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  return dayDiff(new Date(iso), new Date(now)) === 0 ? clock(iso) : day(L, iso, now);
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


/**
 * D556, as the Mac's keepClauses: a sentence's Chinese words kept whole where a break reads worst.
 * A run of up to four characters stays together, and in a longer run the last four before a clause's
 * punctuation (or the end): never 「…后天到」 with 「期，」 next. Word joiners (U+2060), which every
 * browser honours; a long run still wraps anywhere else. Latin keeps its last two words together.
 */
export function keepClauses(s: string): string {
  const rs = [...keepTokens(s)];
  const han = (c: string | undefined) => !!c && /\p{Script=Han}/u.test(c);
  const punct = "\uff0c\u3002\uff1b\uff1a\uff1f\uff01\u3001";
  const gluePunct = "\uff0c\u3002\uff1b\uff1a\uff1f\uff01\u3001\uff09\u300d\u300f\u3011\u300b\u3009";
  let out = "";
  for (let i = 0; i < rs.length; ) {
    let j = i;
    while (j < rs.length && han(rs[j])) j++;
    if (j === i) {
      const ch = rs[i++]!;
      out += ch;
      // Glue CJK clause/closing punctuation to any preceding non-space character (Latin, digit, 」, ）),
      // not only Han, so word-break: keep-all can never start a line with punctuation.
      if (!/\s/.test(ch) && i < rs.length && gluePunct.includes(rs[i]!)) out += "\u2060";
      continue;
    }
    const end = j === rs.length || punct.includes(rs[j]!);
    const n = j - i;
    // D583: Settings sets keep-all (D561), so a long run had no break inside it and Chrome's emergency
    // break fell anywhere: mid-word (\u7535 / \u8bdd) or before the clause's \u300c\u3002\u300d, alone on a line. A run over six
    // now breaks only between its words (Intl.Segmenter, a zero-width space), and its kept tail starts
    // at a word: the last word start at or before its last four characters.
    const starts = n > 6 ? wordStarts(rs.slice(i, j).join("")) : [];
    const tail = n <= 4 ? 0 : end && n > 6 ? Math.max(0, ...starts.filter((w) => w <= n - 4)) || n - 4 : end ? 0 : n;
    for (let k = 0; k < n; k++) {
      if (k > 0 && ((k < tail && starts.includes(k)) || (k === tail && n > 6))) out += "\u200b";
      out += rs[i + k] + (k < n - 1 && k >= tail ? "\u2060" : "");
    }
    // D583: the clause's punctuation stays with its last character.
    if (j < rs.length && gluePunct.includes(rs[j]!)) out += "\u2060";
    i = j;
  }
  // Latin: the last two words together (a no-break space), never one word alone on the last line.
  if (rs.length > 1 && !han(rs[rs.length - 1]) && !han(rs[rs.length - 2])) out = out.replace(/ (\S+)$/, "\u00a0$1");
  return out;
}

/** D583: where Chinese words start in a run of Han characters (code point indexes, never 0), by the
 *  platform's own segmenter; none where it has none. */
function wordStarts(run: string): number[] {
  type Seg = new (l: string, o: { granularity: "word" }) => { segment(s: string): Iterable<{ index: number }> };
  const Segmenter = (Intl as unknown as { Segmenter?: Seg }).Segmenter;
  if (!Segmenter) return [];
  const byUnit = new Map<number, number>();
  let u = 0;
  [...run].forEach((c, k) => (byUnit.set(u, k), (u += c.length)));
  const at: number[] = [];
  for (const seg of new Segmenter("zh", { granularity: "word" }).segment(run)) {
    const k = byUnit.get(seg.index);
    if (k) at.push(k);
  }
  return at;
}

/** D561, as the Mac's keepTokens: a short Latin token with a hyphen (GPT-6.2-Sol, gpt-5-codex) never breaks
 *  at its hyphen; word joiners (U+2060) around it. A long one (over 24) may still wrap there. */
export function keepTokens(s: string): string {
  return s.replace(/[A-Za-z0-9][A-Za-z0-9._]*(?:-[A-Za-z0-9._]+)+/g, (tok) => (tok.length <= 24 ? tok.replaceAll("-", "\u2060-\u2060") : tok));
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
  return { "claude-code": "Claude Code", codex: "Codex", pi: "pi", "deepseek-harness": "DeepSeek Harness", antigravity: "Antigravity", cursor: "Cursor", devin: "Devin CLI", kimi: "Kimi Code CLI", opencode: "OpenCode", dim: "Dim" }[h] ?? h;
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
/** D372: a name before Chinese words: a space only after a Latin end ("Codex 留给", "（Opus）留给"). */
export function padEnd(L: Strings, s: string): string {
  return L.style.spaced || !s || s.charCodeAt(s.length - 1) >= 0x80 ? s : s + " ";
}

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
export function memWords(L: Strings, m: MemPluginView, agent = "", harness = ""): { line: string; action?: string; busy?: string } {
  // D466: an open task says what it is doing: updating (to which version), keeping one, else installing.
  // D552: from the tap on (busy), and its button stays where it was, saying so (更新中…), never gone.
  if (m.taskId || m.busy) {
    // D597: the direct update didn't take and a task finishes it: said in one plain line.
    if (m.handed && m.state === "update") return { line: L.t("memp.handed"), busy: L.t("memp.btn.updating") };
    if (m.state === "update") return { line: m.available ? L.t("memp.setting.update.to", m.available) : L.t("memp.setting.update"), busy: L.t("memp.btn.updating") };
    if (m.state === "review" && m.why === "multiple") return { line: L.t("memp.setting.tidy"), busy: L.t("memp.btn.tidying") };
    if (m.state === "review") return { line: L.t("memp.setting"), busy: L.t("memp.btn.reviewing") };
    // D375: Mem's own command putting it in now, where Mem has one for this agent.
    return { line: L.t(!m.taskId && MEM_CONNECT_TOOLS[harness] ? "memp.busy" : "memp.setting"), busy: L.t("memp.btn.installing") };
  }
  // D552: an update that took, until the next check.
  if (m.updated && m.version) return { line: L.t("memp.updated", m.version, agent) };
  // D597: it didn't take and nothing could pick it up: one line, and 更新 stays.
  if (m.stuck && m.state === "update") return { line: L.t("memp.stuck"), action: L.t("memp.btn.update") };
  if (m.fresh && m.state !== "absent") return { line: L.t("memp.fresh", agent) };
  switch (m.state) {
    case "installed":
      return { line: m.version ? L.t("memp.installed", m.version) : L.t("memp.installed.bare") };
    case "absent":
      return { line: L.t("memp.absent"), action: L.t("memp.btn.install") };
    case "update":
      // D466: from the version there to the one out, when both are known.
      return { line: m.version && m.available ? L.t("memp.update.to", m.version, m.available) : L.t("memp.update"), action: L.t("memp.btn.update") };
    case "review":
      if (m.why === "multiple") return { line: m.versions?.length === 2 ? L.t("memp.review.two", m.versions[0], m.versions[1]) : L.t("memp.review.multiple"), action: L.t("memp.btn.tidy") };
      return { line: L.t("memp.review.unclear"), action: L.t("memp.btn.review") };
  }
}

/**
 * D466: the in-place ask before the tap does anything: its question, what changes and where, and
 * its button, by what the line says (install, update from to, keep one, sort out). direct: Mem's own
 * command puts it in (D375: Claude Code and Codex, absent).
 */
export function memAsk(L: Strings, m: MemPluginView, agent: string, device: string, direct: boolean): { ask: string; means: string; ok: string } {
  if (m.state === "update") return { ask: m.available ? L.t("memp.ask.update", agent, device, m.available) : L.t("memp.ask.update.bare", agent, device), means: L.t("memp.means.update", agent, device), ok: L.t("memp.ok.update") };
  if (m.state === "review" && m.why === "multiple") return { ask: L.t("memp.ask.tidy", agent, device), means: L.t("memp.means.tidy", agent, device), ok: L.t("memp.ok.tidy") };
  if (m.state === "review") return { ask: L.t("memp.ask.review", agent, device), means: L.t("memp.means.review", agent, device), ok: L.t("memp.ok.review") };
  return { ask: L.t("memp.ask", agent, device), means: L.t(direct ? "memp.means.direct" : "memp.means", agent, device), ok: L.t("memp.ok") };
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

/** D291: two facts kept apart, whether the source joined them with " · " or ", ". */
export const splitFacts = (s: string): string[] => s.split(/ \u00b7 |, /).map((x) => x.trim()).filter(Boolean);
