// `ducter status`: one look at the running process over its client WebSocket.
import type { Bodies, LogEvent, OnHand, ServerFrame, TaskCard } from "@ducter/protocol";
import type { T } from "./i18n.ts";
import { plainStyle, type Style } from "./doctor.ts";

export interface Snapshot {
  personaName: string;
  url: string;
  onHand: OnHand;
  decisions: Bodies["decision"][]; // still open
}

/** Says hello, collects welcome + replayed events + on_hand, then closes. */
export async function fetchSnapshot(port: number, timeoutMs = 3000): Promise<Snapshot | undefined> {
  const url = `ws://127.0.0.1:${port}/ws`;
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return resolve(undefined);
    }
    let personaName = "Ducter";
    let events: LogEvent[] = [];
    let settled = false;
    const done = (v: Snapshot | undefined) => {
      if (settled) return; // Bun fires onclose synchronously inside close()
      settled = true;
      clearTimeout(timer);
      resolve(v);
      try {
        ws.close();
      } catch {}
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello" }));
    ws.onerror = () => done(undefined);
    ws.onclose = () => done(undefined);
    ws.onmessage = (m) => {
      let f: ServerFrame;
      try {
        f = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (f.t === "welcome") personaName = f.personaName;
      else if (f.t === "events") events = events.concat(f.events);
      // The header shows what a person opens, not the client socket.
      else if (f.t === "on_hand") done({ personaName, url: `http://127.0.0.1:${port}/app`, onHand: f.onHand, decisions: openDecisions(events) });
    };
  });
}

export function openDecisions(events: LogEvent[]): Bodies["decision"][] {
  const open = new Map<string, Bodies["decision"]>();
  for (const e of events) {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      open.set(b.decisionId, b);
    } else if (e.kind === "decision_resolved") open.delete((e.body as Bodies["decision_resolved"]).decisionId);
  }
  return [...open.values()];
}

/** A finished repo task whose commits aren't merged yet: it waits for the user's Merge. */
export function toMerge(c: TaskCard): boolean {
  if (c.place.kind !== "repo" || c.residency === "archived") return false;
  if (c.attention !== "done" && c.attention !== "done_claimed") return false;
  const r = c.lastReport;
  if (r?.branch) return r.branch.commits > 0;
  return Boolean(r?.evidence?.some((e) => e.kind === "diff"));
}

/** The tasks a name picks: its id, else a case-insensitive part of its title. */
export function pickTask(cards: TaskCard[], name: string): TaskCard[] {
  const n = name.trim().toLowerCase();
  if (!n) return [];
  const byId = cards.filter((c) => c.taskId.toLowerCase() === n);
  return byId.length ? byId : cards.filter((c) => c.title.toLowerCase().includes(n));
}

type ActionResult = { ok: boolean; message?: string; ref?: string; confirm?: { count: number; files: string[] } };

/** Sends one task_action over the client socket and waits for its action_result. */
export async function taskAction(port: number, taskId: string, action: "merge" | "undo", timeoutMs = 5 * 60_000, extra: { force?: boolean } = {}): Promise<ActionResult | undefined> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    } catch {
      return resolve(undefined);
    }
    let settled = false;
    const done = (v: ActionResult | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
      try {
        ws.close();
      } catch {}
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "hello" }));
      ws.send(JSON.stringify({ t: "task_action", taskId, action, ...extra }));
    };
    ws.onerror = () => done(undefined);
    ws.onclose = () => done(undefined);
    ws.onmessage = (m) => {
      let f: ServerFrame;
      try {
        f = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (f.t === "action_result" && f.taskId === taskId && f.action === action) done({ ok: f.ok, ...(f.message ? { message: f.message } : {}), ...(f.ref ? { ref: f.ref } : {}), ...(f.confirm ? { confirm: f.confirm } : {}) });
    };
  });
}

const LANES: { key: "status.needsYou" | "status.toMerge" | "status.working" | "status.waiting"; match: (c: TaskCard) => boolean; hint?: true }[] = [
  { key: "status.needsYou", match: (c) => c.attention === "needs_you" },
  // Fresh-user QA: finished work nobody merged was invisible here.
  { key: "status.toMerge", match: toMerge, hint: true },
  { key: "status.working", match: (c) => !toMerge(c) && (c.attention === "working" || c.attention === "queued" || c.attention === "done_claimed") },
  { key: "status.waiting", match: (c) => c.attention === "blocked" },
];

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function formatSnapshot(s: Snapshot, t: T, style: Style = plainStyle): string {
  const lines = [style.bold(t("status.header", { name: s.personaName, url: s.url })), ""];
  let any = false;
  for (const lane of LANES) {
    const cards = s.onHand.tasks.filter(lane.match);
    if (!cards.length) continue;
    any = true;
    lines.push(`${t(lane.key)} (${cards.length})`);
    for (const c of cards) {
      const why = c.reason || c.lastReport?.summary;
      lines.push(`  • ${c.title}${c.project ? style.dim(`  ${c.project}`) : ""}`);
      if (why) lines.push(`    ${style.dim(why.split("\n")[0]!.slice(0, 100))}`);
    }
    if (lane.hint) lines.push(style.dim(`  ${t("status.mergeHint")}`));
    lines.push("");
  }
  if (s.decisions.length) {
    any = true;
    lines.push(`${t("status.decisions")} (${s.decisions.length})`);
    for (const d of s.decisions) {
      lines.push(`  ? ${d.question}`);
      const go = `${t("status.go")}: ${d.goLabel}`;
      const def = d.defaultAt ? `  ${style.dim(t("status.default", { option: d.defaultOption === "go" ? t("status.go") : t("status.hold"), time: hhmm(d.defaultAt) }))}` : "";
      lines.push(`    [${go}] [${t("status.hold")}]${def}`);
    }
    lines.push("");
  }
  const done = s.onHand.counts.done_today;
  if (done) lines.push(t("status.doneLine", { n: done }));
  if (!any && !done) lines.push(t("status.noTasks"));
  return lines.join("\n").trimEnd();
}
