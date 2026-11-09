// Time and place wording, the same rules as the desktop (views/app.go formatting).
import type { Place } from "@ducter/protocol";
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

export function clock(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "18:30", or "明天 08:00" when it isn't today. */
export function when(L: Strings, iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return clock(iso);
  const tomorrow = new Date(now + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return L.t("time.tomorrow", clock(iso));
  return `${d.getMonth() + 1}/${d.getDate()} ${clock(iso)}`;
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
  return { "claude-code": "Claude Code", codex: "Codex", pi: "pi" }[h] ?? h;
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
