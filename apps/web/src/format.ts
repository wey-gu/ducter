// Time and place wording, the same rules as the desktop (views/app.go formatting).
import type { DeviceUpdate, Place } from "@ducter/protocol";
import type { Strings } from "./i18n.ts";

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
  return L.t("time.ago.hour", Math.round(s / 3600));
}

// Human times (packages/protocol/fixtures/when.json, the same rule as the desktop's
// i18n/when.go): a time of day without a leading zero; today / tomorrow / yesterday by name; the
// next six days by weekday; else the date in words ("12 月 1 日" / "Dec 1"), with the year only
// when it isn't this one. Never "12-01 09:00".
const ZH_WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  const zh = L.lang === "zh";
  const d = new Date(iso), n = new Date(now);
  const k = dayDiff(d, n);
  if (k === 0) return zh ? "今天" : "today";
  if (k === 1) return zh ? "明天" : "tomorrow";
  if (k === -1) return zh ? "昨天" : "yesterday";
  if (k > 1 && k < 7) return (zh ? ZH_WD : EN_WD)[d.getDay()]!;
  const year = d.getFullYear() !== n.getFullYear();
  if (zh) return `${year ? `${d.getFullYear()} 年 ` : ""}${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return `${EN_MON[d.getMonth()]} ${d.getDate()}${year ? ` ${d.getFullYear()}` : ""}`;
}

/** A moment: "今天 18:00", "明天 9:00", "周五 9:00", "12 月 1 日 9:00" / "today 18:00", "Dec 1, 9:00". */
export function when(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const dd = day(L, iso, now);
  const named = dayDiff(new Date(iso), new Date(now));
  const sep = L.lang !== "zh" && (named > 6 || named < -1) ? ", " : " ";
  return `${dd}${sep}${clock(iso)}`;
}

/** A date on a strip of beads: "11/16". */
export function md(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const lastPath = (p: string) => p.replace(/\/+$/, "").split("/").pop() ?? p;

export function deviceLabel(L: Strings, d: string | undefined): string {
  if (!d || d === "local" || d === "this") return L.t("device.local");
  return d;
}

export function placeLine(L: Strings, p: Place): string {
  switch (p.kind) {
    case "repo":
      return [lastPath(p.repoPath), p.branch, deviceLabel(L, p.device)].filter(Boolean).join(" · ");
    case "folder":
      return `${lastPath(p.path)} · ${deviceLabel(L, p.device)}`;
    case "browser":
      return deviceLabel(L, p.device);
  }
  return L.t("place.none");
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

/** A model as people say it: Claude Code's aliases capitalized, other ids as they are. */
export function modelName(m: string): string {
  return ["opus", "sonnet", "haiku"].includes(m) ? m[0]!.toUpperCase() + m.slice(1) : m;
}

/** A Latin word in Chinese text gets a space on each side ("在 MacBook 上"). */
export function cjkPad(L: Strings, s: string): string {
  if (L.lang !== "zh" || !s) return s;
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
