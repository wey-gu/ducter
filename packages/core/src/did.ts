// D300: 替你做过的 / Done for you (design/did.md). Every outward action Ducter took on the
// person's behalf, read at query time from the Log and the Autofill uses: nothing new is stored,
// so the record can't drift from what happened (principle 1). Each item says who asked, the Go
// that allowed it, where it happened, its task, and an Undo only where one truly exists.
//
// It never carries a secret (Autofill uses carry none), a read's content (reads are counts), or a
// message's whole text (DID_LINE characters of its start).
import type { Bodies, CalChange, EventKind, DidGo, DidItem, DidKind, DidQuery, DidSub, DidWhere, DidWho, DetailKey, FolderSummary, LogEvent, SavedUse } from "@ducter/protocol";
import { DETAIL_KEYS, DID_KINDS, DID_LINE, OWN_PHONE } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";

const isDetailKey = (k: string): k is DetailKey => (DETAIL_KEYS as string[]).includes(k);

export interface DidDeps {
  log: LogStore;
  tasks: TaskRegistry;
  /** Autofill's 用在了哪儿 / Where it was used (newest first or oldest first; order is not relied on). */
  uses?: () => SavedUse[];
  /** A device's name by its id; "local" is the home. */
  deviceName?: (device: string) => string | undefined;
  /** A folder task's current folder state (D142), fresher than its last report. */
  folder?: (taskId: string) => FolderSummary | undefined;
  now?: () => number;
}

export interface DidResult {
  items: DidItem[];
  counts: Partial<Record<DidKind, number>>;
  since: string;
  before: string;
  more?: boolean;
}

export interface Did {
  query(q: DidQuery): DidResult;
}

const WEEK = 7 * 24 * 3600_000;
const KINDS: EventKind[] = ["decision", "decision_resolved", "connection_call", "bridge_msg", "phone_call", "job_status", "report", "source_write", "tool_install"];

const clip = (s: string | undefined, n = DID_LINE): string | undefined => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** The local day of an ISO time, "2026-11-17", on this machine's clock. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Where a phone or computer Go landed, from the gate's effect word (android/gate.ts Effect). */
function byEffect(effect: string): { kind: DidKind; sub: DidSub } | undefined {
  switch (effect) {
    case "send":
      return { kind: "sent", sub: "message" };
    case "post":
      return { kind: "sent", sub: "post" };
    case "pay":
    case "buy":
      return { kind: "paid", sub: "buy" };
    case "call":
      return { kind: "called", sub: "call" };
    case "account":
      return { kind: "filled", sub: "account" };
    case "delete":
      return { kind: "deleted", sub: "item" };
    case "setting":
      return { kind: "changed", sub: "setting" };
    case "install":
      return { kind: "changed", sub: "install" };
    case "confirm":
    case "record":
      return { kind: "changed", sub: "write" };
    default:
      return undefined;
  }
}

const SENDS = /(^|[._\-/])(send|reply|forward|post_?message|chat_?post|message|draft_send|sendmail|send_email|send_message|post)([._\-/]|$)/i;
const DELETES = /(^|[._\-/])(delete|remove|trash|destroy|archive|unsubscribe)([._\-/]|$)/i;
const MAILY = /mail|gmail|outlook|imap|smtp|email/i;
const POSTY = /(^|[._\-/])(post|tweet|publish|status)([._\-/]|$)/i;

/** A connection write's kind, by its action's name (gmail.send_message, slack.chat_post_message, notion.delete_page). */
export function writeKind(action: string, connection: string): { kind: DidKind; sub: DidSub } {
  if (DELETES.test(action)) return { kind: "deleted", sub: "item" };
  if (SENDS.test(action)) {
    if (MAILY.test(action) || MAILY.test(connection)) return { kind: "sent", sub: "mail" };
    if (POSTY.test(action) && !/message/i.test(action)) return { kind: "sent", sub: "post" };
    return { kind: "sent", sub: "message" };
  }
  return { kind: "changed", sub: "write" };
}

/** Who a send reached, read only from the input's addressing fields (never its content). */
function addressee(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  for (const k of ["to", "recipient", "recipients", "channel", "email", "user", "chat"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return clip(v, 80);
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return clip((v as string[]).join(", "), 80);
  }
  return undefined;
}

export function createDid(d: DidDeps): Did {
  const now = d.now ?? Date.now;

  const who = (taskId: string | undefined): DidWho => {
    if (!taskId) return { by: "you" };
    const c = d.tasks.get(taskId);
    if (c?.fromRoutine) return { by: "routine", taskId, routine: c.fromRoutine.name, ...(c.title ? { title: c.title } : {}) };
    return { by: "task", taskId, ...(c?.title ? { title: c.title } : {}) };
  };

  const deviceOf = (taskId: string | undefined): DidWhere | undefined => {
    if (!taskId) return undefined;
    const c = d.tasks.get(taskId);
    const dev = c && "device" in c.place ? c.place.device : "local";
    const name = d.deviceName?.(dev || "local");
    return { kind: "computer", ...(name ? { name } : {}) };
  };

  return {
    query(q) {
      const before = q.before && !Number.isNaN(Date.parse(q.before)) ? q.before : new Date(now() + 1).toISOString(); // through this very millisecond
      const since = q.since && !Number.isNaN(Date.parse(q.since)) ? q.since : new Date(Date.parse(before) - WEEK).toISOString();
      const lo = Date.parse(since);
      const hi = Date.parse(before);
      const inRange = (iso: string) => {
        const t = Date.parse(iso);
        return t >= lo && t < hi;
      };

      // One pass over the kinds that can hold an action. Decisions and their answers are kept
      // whatever their time: a Go may come before the window opens.
      const events = d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: KINDS as never });
      const decisions = new Map<string, LogEvent<"decision">>();
      const answers = new Map<string, LogEvent<"decision_resolved">>();
      for (const e of events) {
        if (e.kind === "decision") decisions.set((e.body as Bodies["decision"]).decisionId, e as LogEvent<"decision">);
        else if (e.kind === "decision_resolved") {
          const b = e.body as Bodies["decision_resolved"];
          if (!answers.has(b.decisionId)) answers.set(b.decisionId, e as LogEvent<"decision_resolved">);
        }
      }
      const goOf = (decisionId: string | undefined): DidGo | undefined => {
        if (!decisionId) return undefined;
        const a = answers.get(decisionId);
        if (!a) return undefined;
        const b = a.body as Bodies["decision_resolved"];
        if (b.option !== "go") return undefined;
        // D499: answered for them under what they said: their words.
        if (b.by === "said") return { by: "said", at: a.ts, ...(b.said ? { words: b.said } : {}) };
        return { by: b.by === "default" ? "default" : "you", at: a.ts };
      };

      const items: DidItem[] = [];
      const reads = new Map<string, DidItem>();
      const calls = new Map<string, LogEvent<"phone_call">>();
      const bridge = new Map<string, { e: LogEvent<"bridge_msg">; sent: boolean; unsure?: DidItem["unsure"] }>();
      const folders = new Map<string, LogEvent<"report">>();

      for (const e of events) {
        switch (e.kind) {
          case "connection_call": {
            const b = e.body as Bodies["connection_call"];
            if (b.state !== "done" || !inRange(e.ts)) break;
            if (b.op === "read") {
              const key = `${localDay(e.ts)}:${b.connectionId}:${b.taskId ?? ""}`;
              const r = reads.get(key);
              if (r) {
                r.count = (r.count ?? 1) + 1;
                r.at = e.ts;
              } else
                reads.set(key, { id: `r${key}`, kind: "read", sub: "account", at: e.ts, via: b.connection, count: 1, who: who(b.taskId), where: { kind: "home", name: b.connection }, ...(b.taskId ? { taskId: b.taskId } : {}) });
              break;
            }
            const card = b.decisionId ? decisions.get(b.decisionId)?.body : undefined;
            const cal: CalChange | undefined = card?.cal;
            const go = goOf(b.decisionId);
            const base = { id: `e${e.seq}`, at: e.ts, via: b.connection, who: who(b.taskId), where: { kind: "home" as const, name: b.connection }, ...(go ? { go } : {}), ...(b.taskId ? { taskId: b.taskId } : {}), ...(b.link ? { link: b.link } : {}) };
            if (cal) {
              items.push({ ...base, kind: cal.kind === "cancel" ? "deleted" : "changed", sub: "calendar", cal: cal.kind, ...(cal.title ? { line: clip(cal.title) } : {}), ...(cal.calendar ? { to: cal.calendar } : {}) });
              break;
            }
            const k = writeKind(b.action, b.connection);
            const to = k.kind === "sent" ? addressee(b.input) : undefined;
            const line = clip(b.summary);
            items.push({ ...base, ...k, ...(to ? { to } : {}), ...(line ? { line } : {}) });
            break;
          }
          case "decision": {
            const b = e.body as Bodies["decision"];
            const go = goOf(b.decisionId);
            if (!go || !inRange(go.at!)) break;
            if (b.pay) {
              items.push({ id: `e${e.seq}`, kind: "paid", sub: "card", at: go.at!, to: b.pay.site, amount: `${b.pay.currency} ${b.pay.amount}`, via: b.pay.card, ...(b.pay.what ? { line: clip(b.pay.what) } : {}), who: who(b.taskId), go, where: { kind: "browser", ...(deviceOf(b.taskId)?.name ? { name: deviceOf(b.taskId)!.name } : {}) }, ...(b.taskId ? { taskId: b.taskId } : {}) });
            } else if (b.checkout) {
              // D436: the errand stopped at the checkout and the person paid there themselves (付好了).
              const c = b.checkout;
              const amount = c.total ? `${c.currency ?? ""} ${c.total}`.trim() : undefined;
              items.push({ id: `e${e.seq}`, kind: "paid", sub: "checkout", at: go.at!, to: c.site, ...(amount ? { amount } : {}), ...(clip(c.what) ? { line: clip(c.what) } : {}), who: who(b.taskId), go: { by: "paid", at: go.at! }, where: { kind: "browser", ...(deviceOf(b.taskId)?.name ? { name: deviceOf(b.taskId)!.name } : {}) }, ...(b.taskId ? { taskId: b.taskId } : {}) });
            } else if (go.by === "said" && b.taskId) {
              // D499: a task's own step Ducter said Go to for them (a rerun, a comment, a push of its branch).
              const r = answers.get(b.decisionId)!.body as Bodies["decision_resolved"];
              const k: { kind: DidKind; sub: DidSub } = r.action === "branch_push" ? { kind: "changed", sub: "pr" } : { kind: "sent", sub: "post" };
              const c = d.tasks.get(b.taskId);
              const branch = r.action === "branch_push" && c?.place.kind === "repo" ? c.place.branch : undefined;
              items.push({ id: `e${e.seq}`, ...k, at: go.at!, ...(branch ? { to: branch } : {}), via: "GitHub", ...(clip(b.question) ? { line: clip(b.question) } : {}), who: who(b.taskId), go, ...(deviceOf(b.taskId) ? { where: deviceOf(b.taskId)! } : {}), taskId: b.taskId });
            } else if (b.phone?.kind === "go" || b.computer?.kind === "go") {

              const ask = (b.phone ?? b.computer) as { app: string; name?: string; label: string; effect: string };
              const k = byEffect(ask.effect);
              if (!k) break;
              const via = (b.phone ? ask.name : ask.app) || undefined;
              const where: DidWhere | undefined = b.phone ? (b.phone.on ? { kind: "phone", name: b.phone.on.name } : { kind: "ducter_phone" }) : deviceOf(b.taskId);
              items.push({ id: `e${e.seq}`, ...k, at: go.at!, ...(via ? { via } : {}), ...(clip(b.question) ? { line: clip(b.question) } : {}), who: who(b.taskId), go, ...(where ? { where } : {}), ...(b.taskId ? { taskId: b.taskId } : {}) });
            }
            break;
          }
          case "bridge_msg": {
            const b = e.body as Bodies["bridge_msg"];
            if (b.direction !== "out") break;
            // One op is logged once per state it passes through (D106): it counts once, as sent
            // when any state says so, as not confirmed when only unknown/unconfirmed do.
            const key = b.opId ?? `m${e.seq}`;
            const st = b.state ?? "sent";
            const cur = bridge.get(key) ?? { e: e as LogEvent<"bridge_msg">, sent: false };
            if (st === "sent" || st === "followed") {
              if (!cur.sent || cur.unsure) cur.e = { ...e, body: { ...cur.e.body, ...b } } as LogEvent<"bridge_msg">;
              cur.sent = true;
              delete cur.unsure;
            } else if ((st === "unknown" || st === "unconfirmed") && !(cur.sent && !cur.unsure)) {
              cur.sent = true;
              cur.unsure = "unconfirmed";
            }
            bridge.set(key, cur);
            break;
          }
          case "phone_call": {
            const b = e.body as Bodies["phone_call"];
            calls.set(b.callId, e as LogEvent<"phone_call">);
            break;
          }
          case "job_status": {
            const b = e.body as Bodies["job_status"];
            if (!b.act || b.state !== "done" || !inRange(e.ts)) break;
            const c = b.taskId ? d.tasks.get(b.taskId) : undefined;
            const branch = c && c.place.kind === "repo" ? c.place.branch : undefined;
            // D596: a PR Ducter opened under the person's standing go: the task did it, on their words.
            const rule = b.by === "rule";
            items.push({ id: `e${e.seq}`, kind: "changed", sub: b.act === "merge" ? "merge" : "pr", at: e.ts, ...(branch ? { to: branch } : {}), who: rule ? who(b.taskId) : { by: "you", ...(b.taskId ? { taskId: b.taskId } : {}), ...(c?.title ? { title: c.title } : {}) }, go: rule ? { by: "said", at: e.ts, ...(b.said ? { words: b.said } : {}) } : { by: "you", at: e.ts }, ...(rule ? { via: "GitHub" } : {}), ...(deviceOf(b.taskId) ? { where: deviceOf(b.taskId)! } : {}), ...(b.taskId ? { taskId: b.taskId } : {}), ...(b.act === "open_pr" && b.ref && /^https:\/\//.test(b.ref) ? { link: b.ref } : {}) });
            break;
          }
          case "report": {
            const b = e.body as Bodies["report"];
            if (b.folder) folders.set(b.taskId, e as LogEvent<"report">);
            break;
          }
          // D345: a tool put on the home because the person tapped for it (gh for GitHub's sign-in).
          case "tool_install": {
            const b = e.body as Bodies["tool_install"];
            if (b.phase !== "done" || !inRange(e.ts)) break;
            const name = d.deviceName?.(b.device || "local");
            items.push({
              id: `e${e.seq}`,
              kind: "changed",
              sub: "install",
              at: e.ts,
              to: b.tool,
              via: b.how === "brew" ? "Homebrew" : "GitHub",
              ...(clip(b.where) ? { line: clip(b.where) } : {}),
              who: { by: "you" },
              go: { by: "you", at: e.ts },
              where: { kind: "computer", ...(name ? { name } : {}) },
            });
            break;
          }
          // D341: a write to a to-do's app: a comment is sent (to the issue), a close or a tick changes it.
          case "source_write": {
            const b = e.body as Bodies["source_write"];
            if (b.state !== "done" || !inRange(e.ts)) break;
            const app = b.item.kind === "github" ? "GitHub" : b.item.kind === "obsidian" ? "Obsidian" : "Jira";
            const go: DidGo | undefined = b.by === "go" ? goOf(b.decisionId) : b.by === "rule" ? (b.said ? { by: "said", words: b.said } : { by: "before" }) : undefined;
            const to = b.item.kind === "github" ? `${b.item.where ?? ""}${b.item.label}` : b.item.title;
            // D359: a review sent on a PR is sent too (its first comment is the line).
            const reviewLine = () => {
              try {
                return (JSON.parse(b.text ?? "{}") as { notes?: { text?: string }[] }).notes?.[0]?.text;
              } catch {
                return undefined;
              }
            };
            const line = b.op === "comment" ? clip(b.text) : b.op === "review" ? clip(reviewLine()) : clip(b.item.title);
            items.push({
              id: `e${e.seq}`,
              kind: b.op === "comment" || b.op === "review" ? "sent" : "changed",
              sub: b.op === "comment" || b.op === "review" ? "post" : "write",
              at: e.ts,
              to: clip(to, 80) ?? to,
              via: app,
              ...(line ? { line } : {}),
              who: who(b.taskId),
              ...(go ? { go } : {}),
              where: b.item.kind === "obsidian" ? (deviceOf(b.taskId) ?? { kind: "computer" }) : { kind: "home", name: app },
              ...(b.taskId ? { taskId: b.taskId } : {}),
              ...((b.link ?? (b.item.kind === "github" ? b.item.url : undefined)) ? { link: b.link ?? b.item.url } : {}),
            });
            break;
          }
        }
      }

      for (const [, x] of bridge) {
        if (!x.sent || !inRange(x.e.ts)) continue;
        const b = x.e.body;
        const to = b.to ?? b.agent;
        // D596: a PR handed to the person's helper with no card, under their standing go: their words.
        const go = b.said ? { by: "said" as const, at: x.e.ts, words: b.said } : (goOf(b.decisionId) ?? (b.decisionId ? undefined : { by: "before" as const }));
        items.push({ id: `e${x.e.seq}`, kind: "sent", sub: "agent", at: x.e.ts, ...(to ? { to } : {}), via: "Nowledge Bridge", ...(clip(b.text) ? { line: clip(b.text) } : {}), ...(x.unsure ? { unsure: x.unsure } : {}), who: who(b.taskId), ...(go ? { go } : {}), where: { kind: "home" }, ...(b.taskId ? { taskId: b.taskId } : {}) });
      }

      for (const [, e] of calls) {
        const b = e.body;
        if (!b.placedAt || b.plan.from === "self" || !inRange(b.placedAt)) continue;
        const unsure = b.state === "no_answer" ? "no_answer" : b.state === "uncertain" ? "uncertain" : undefined;
        const where: DidWhere = b.plan.from === "own" || b.plan.provider === OWN_PHONE ? { kind: "own_number" } : { kind: "line", name: b.plan.provider };
        const go = goOf(b.decisionId);
        items.push({ id: `e${e.seq}`, kind: "called", sub: "call", at: b.placedAt, to: b.plan.name, ...(clip(b.plan.goal) ? { line: clip(b.plan.goal) } : {}), ...(unsure ? { unsure } : {}), who: who(b.taskId), ...(go ? { go } : {}), where, ...(b.taskId ? { taskId: b.taskId } : {}) });
      }

      for (const [taskId, e] of folders) {
        if (!inRange(e.ts)) continue;
        const f = d.folder?.(taskId) ?? e.body.folder!;
        const n = f.added + f.changed + f.removed + f.moved + f.renamed;
        if (!n) continue;
        const open = f.undo === "open" && f.undoUntil && Date.parse(f.undoUntil) > now();
        items.push({ id: `e${e.seq}`, kind: "changed", sub: "files", at: e.ts, count: n, files: { added: f.added, changed: f.changed + f.moved + f.renamed, removed: f.removed }, who: who(taskId), ...(deviceOf(taskId) ? { where: deviceOf(taskId)! } : {}), taskId, ...(open ? { undo: { kind: "folder" as const, taskId, until: f.undoUntil! } } : {}) });
      }

      // Autofill: a sign-in or a detail filled on a site, a key given. A card's fill is its Pay above.
      const uses = d.uses?.() ?? [];
      const oks = uses.filter((u) => u.what === "ok");
      uses.forEach((u, i) => {
        if (!inRange(u.at)) return;
        if (u.what === "filled" && !u.handle.startsWith("card:")) {
          const ok = oks.find((o) => o.handle === u.handle && o.site === u.site && o.taskId === u.taskId);
          const go: DidGo = ok ? { by: "you", at: ok.at } : { by: "before" };
          const signin = u.handle.startsWith("signin:");
          items.push({ id: `u${u.at}:${i}`, kind: "filled", sub: signin ? "signin" : "detail", at: u.at, to: u.site, ...(!signin && u.label ? { line: clip(u.label) } : {}), ...(!signin && u.handle.startsWith("me.") && isDetailKey(u.handle.slice(3)) ? { detail: u.handle.slice(3) as DetailKey } : {}), who: u.taskId ? who(u.taskId) : { by: "you" }, go, where: { kind: "browser", ...(deviceOf(u.taskId)?.name ? { name: deviceOf(u.taskId)!.name } : {}) }, ...(u.taskId ? { taskId: u.taskId } : {}) });
        } else if (u.what === "given") {
          items.push({ id: `u${u.at}:${i}`, kind: "filled", sub: "key", at: u.at, to: u.label, who: u.taskId ? who(u.taskId) : { by: "you" }, go: { by: "you", at: u.at }, ...(u.taskId ? { taskId: u.taskId } : {}) });
        }
      });

      items.push(...reads.values());

      const counts: Partial<Record<DidKind, number>> = {};
      for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;

      const kinds = (q.kinds ?? []).filter((k) => (DID_KINDS as readonly string[]).includes(k));
      const words = (q.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const hay = (it: DidItem) => [it.line, it.to, it.via, it.amount, it.who.title, it.who.routine, it.where?.name].filter(Boolean).join("\n").toLowerCase();
      const matched = items
        .filter((it) => !kinds.length || kinds.includes(it.kind))
        .filter((it) => !words.length || words.every((w) => hay(it).includes(w)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : -1));
      const limit = Math.max(1, Math.min(q.limit ?? 500, 2000));
      return { items: matched.slice(0, limit), counts, since, before, ...(matched.length > limit ? { more: true } : {}) };
    },
  };
}

/** The partner's range words: today, yesterday, this week, as local times. */
export function rangeOf(when: string | undefined, nowMs: number): { since: string; before: string } {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const day = 24 * 3600_000;
  const t0 = start.getTime();
  if (when === "yesterday") return { since: new Date(t0 - day).toISOString(), before: new Date(t0).toISOString() };
  if (when === "week") return { since: new Date(t0 - 6 * day).toISOString(), before: new Date(nowMs + 1).toISOString() };
  return { since: new Date(t0).toISOString(), before: new Date(nowMs + 1).toISOString() };
}
