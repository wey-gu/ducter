// research/199: a second, smaller week written after the spotter's prompt was tuned on corpus.ts,
// and never tuned on: the honest measure. Same shape: g-* planted good offers, n-* noise.
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { MemLookHit, MemLookPort, MemLookThread } from "@ducter/protocol/src/internal.ts";
import type { RefState, Upcoming, WiderInput } from "../../src/proactive/wider.ts";

export const ZONE = "Asia/Shanghai";
export const NOW = Date.parse("2026-11-21T08:00:00+08:00");
const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const ducter = { kind: "repo" as const, device: "local", repoPath: "/Users/wey/code/ducter", branch: "main" };

function card(p: Partial<TaskCard> & { taskId: string; title: string; ended: number; summary: string; state?: "done" | "failed" }): TaskCard {
  const { ended, summary, state = "done", ...rest } = p;
  return { persona: "default", project: "ducter", place: ducter as never, harness: "claude-code", attention: state, residency: "parked", openedAt: iso(ended - 2 * H), updatedAt: iso(ended), lastReport: { taskId: p.taskId, state, summary, questions: [], evidence: [] } as Bodies["report"], ...rest } as TaskCard;
}

const TASKS: TaskCard[] = [
  card({ taskId: "g-h1", title: "Add retries to the oo connector", ended: NOW - 16 * H, summary: "oo calls now retry twice with backoff on 5xx. Separately, the Slack adapter swallows 429s without retrying; worth fixing." }),
  card({ taskId: "g-h2a", title: "Weekly dependency audit", ended: NOW - 7 * D, fromRoutine: { routineId: "g-h2", name: "Weekly dependency audit" }, summary: "No advisories in any workspace." }),
  card({ taskId: "g-h2b", title: "Weekly dependency audit", ended: NOW - 10 * H, fromRoutine: { routineId: "g-h2", name: "Weekly dependency audit" }, summary: "2 high advisories: undici 6.19 (request smuggling) and tar 7.2 (path traversal), both in apps/web." }),
  card({ taskId: "g-h4-ev", title: "Android app approved in Play review", ended: NOW - 1 * D, summary: "Google Play approved Ducter for Android 0.1.9; it is live in the open testing track." }),
  card({ taskId: "n-h1", title: "Rename the settings pane", ended: NOW - 12 * H, summary: "Renamed to 伙伴. I noticed the pane already had tests; they all pass." }),
  card({ taskId: "n-h2", title: "Fix the iOS keyboard inset", ended: NOW - 14 * H, integrated: { act: "merge", at: iso(NOW - 14 * H) }, summary: "Merged PR #820, which closes #812." }),
];
const REFS: RefState[] = [{ ref: "wey-gu/ducter#812", label: "#812", title: "Keyboard covers the composer", state: "closed", updatedAt: iso(NOW - 14 * H) }];
const UPCOMING: Upcoming[] = [{ name: "G7 上海虹桥—杭州东", start: iso(NOW + 1 * D + 2 * H), what: "train" }];

const MEMS: Record<string, MemLookHit> = {
  "g-h3": { id: "g-h3", title: "高铁座位", content: "坐高铁二等座就行，但要靠窗的 F 座。", date: "2026-09-30", kind: "preference" },
  "g-h4": { id: "g-h4", title: "Android launch", content: "Once the Android app passes Play review, announce it on the site and in the README.", date: "2026-11-02", kind: "decision", source: "claude-code" },
  "n-h3": { id: "n-h3", title: "收费", content: "等用户到 1000 再考虑收费。", date: "2026-10-01", kind: "decision" },
};
const THREADS: Record<string, MemLookThread> = {
  "n-h4": { id: "n-h4", title: "CSS grid question", source: "cursor", date: "2026-11-14", lines: [{ who: "user", text: "ok that works, thanks. maybe next time I'll look at subgrid, no rush" }, { who: "assistant", text: "Sounds good." }] },
};

function fakeMem(): MemLookPort {
  return {
    async search(q) {
      if (/train|火车|高铁/.test(q)) return [MEMS["g-h3"]!];
      if (/decision|决定/.test(q)) return [MEMS["g-h4"]!, MEMS["n-h3"]!];
      return [];
    },
    async threads() {
      return [THREADS["n-h4"]!];
    },
  };
}

const TALK: { id: string; text: string; at: number }[] = [
  { id: "g-h5", text: "At some point I need to rotate the Cloudflare API token on hel.", at: NOW - 3 * D },
  { id: "g-h6", text: "回头把 Ducter 的 README 截图换成新版的", at: NOW - 2 * D },
  { id: "n-h5", text: "I'll check later whether you're right about that", at: NOW - 2 * D - 7 * 60_000 },
  { id: "n-h6", text: "好的，回头见", at: NOW - 3 * D - 8 * 60_000 },
  { id: "n-h7", text: "有空的时候多休息吧", at: NOW - 4 * D },
];

export function corpus(): WiderInput {
  return { now: NOW, zone: ZONE, tasks: TASKS, talk: TALK.map(({ text, at }) => ({ text, at })), refs: REFS, upcoming: UPCOMING, focus: ["Ducter"], mem: fakeMem() };
}

export function fixtureOf(key: string): string | undefined {
  const m = /^(?:task|routine):([^:]+)/.exec(key) ?? /^mem:([^:]+)/.exec(key) ?? /^thread:([^:|]+)/.exec(key);
  if (m) return m[1];
  const t = /^talk:(\d+):/.exec(key);
  if (t) return TALK.find((x) => x.at === Number(t[1]))?.id;
  return undefined;
}

export const GOOD = ["g-h1", "g-h2", "g-h3", "g-h4", "g-h5", "g-h6"];
