// D362: a running AI agent update in words that move: 正在下载（12 / 98 MB）while Ducter fetches
// the new copy, 正在装好… while its own updater puts it in place, the elapsed time where the bytes
// can't be seen (正在下载… 1 分 20 秒, 正在更新到 0.170.0… 2 分 5 秒), and whether it is slower than
// usual there. The same on the Mac (internal/views/agentprogress.go); keys in i18n-updateall.ts.
import type { AgentProgress } from "@ducter/protocol";
import { A } from "./app.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Whole MB (decimal, as Finder counts), at least 1 once anything came. */
export const mb = (bytes: number) => Math.max(bytes > 0 ? 1 : 0, Math.round(bytes / 1_000_000));

/** 1 分 20 秒 / 1 min 20 s; under a minute only the seconds. */
export function elapsedWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? t("upall.elapsed.s", s) : t("upall.elapsed.m", Math.floor(s / 60), s % 60);
}

export const elapsedMs = (p: AgentProgress, now = Date.now()) => (p.since ? Math.max(0, now - Date.parse(p.since)) : 0);

/** The running update's line (phase "updating"); undefined: not one this knows, say the plain words. */
export function updatingWords(p: AgentProgress, to: string, now = Date.now()): string | undefined {
  const el = elapsedMs(p, now);
  if (p.step === "downloading") {
    if (p.got && p.size) return t("upall.step.download", mb(p.got), mb(p.size));
    if (p.got) return t("upall.step.download.got", mb(p.got));
    return t("upall.step.download.time", elapsedWords(el));
  }
  if (p.step === "installing") return t("upall.step.install");
  // A channel Ducter can't see inside: the time, once it is worth saying.
  if (p.since && el >= 10_000) return t("upall.step.updating.time", to, elapsedWords(el));
  return undefined;
}

/** 再等等: per step, the elapsed time at the tap; the line comes back after another slow stretch. */
const waited = new Map<string, number>();

export function isSlow(key: string, p: AgentProgress, now = Date.now()): boolean {
  if (!p.since || !p.slowMs) return false;
  const el = elapsedMs(p, now);
  const w = waited.get(`${key}@${p.since}`);
  return el > p.slowMs && (w === undefined || el > w + p.slowMs);
}

export function keepWaiting(key: string, p: AgentProgress, now = Date.now()) {
  if (p.since) waited.set(`${key}@${p.since}`, elapsedMs(p, now));
}
