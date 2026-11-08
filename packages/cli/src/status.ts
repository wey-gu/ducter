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
      else if (f.t === "on_hand") done({ personaName, url, onHand: f.onHand, decisions: openDecisions(events) });
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

const LANES: { key: "status.needsYou" | "status.working" | "status.waiting"; match: (c: TaskCard) => boolean }[] = [
  { key: "status.needsYou", match: (c) => c.attention === "needs_you" },
  { key: "status.working", match: (c) => c.attention === "working" || c.attention === "queued" || c.attention === "done_claimed" },
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
  if (done) lines.push(`${t("status.doneToday")}: ${done}`);
  if (!any && !done) lines.push(t("status.noTasks"));
  return lines.join("\n").trimEnd();
}
