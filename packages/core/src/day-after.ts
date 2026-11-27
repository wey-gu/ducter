// D623: the day after the first run. The first time the person opens Ducter on the day after
// they set it up, the partner says one short recap of what was set up yesterday, with at most three
// true facts (each a link) and one offer of a cadence. Code answers "what happened" from the Log and
// the home's own records; the partner answers "what to say", in its own words.
//
// Nothing to set up: nothing. Not the day after, or already said: nothing. Never a feature tour.
import type { AppMeta, Bodies, ChannelKind, ChannelView, ConnectionView, DayAfterItem, KeepBody, LangTag, LogEvent, TaskCard } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { DAY_AFTER_MAX, words } from "@ducter/protocol";

const DAY = 86_400_000;

/** Local calendar day of a time, in the person's zone (the same rule first-words.ts uses). */
export function dayIn(at: number, tz?: string): number {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
    return Math.floor(Date.parse(`${p}T00:00:00Z`) / DAY);
  } catch {
    return Math.floor(at / DAY);
  }
}

export interface DayAfterPorts {
  log: Pick<LogStore, "read">;
  /** The home's tasks, by id (a finished one is still the person's). */
  task: (id: string) => TaskCard | undefined;
  /** The home's Keeps, each with its creation time. */
  keeps: KeepBody[];
  connections: ConnectionView[];
  channels: ChannelView[];
  apps: AppMeta[];
  /** The default partner's id: only this conversation's setup is recapped. */
  persona: string;
}

const chatName = (kind: ChannelKind) => (kind === "telegram" ? "Telegram" : kind === "slack" ? "Slack" : kind === "wechat" ? "WeChat" : kind);

/**
 * What the person set up on the day before today, newest first, at most DAY_AFTER_MAX: a task that
 * finished, a Keep that started, an account or a chat app they connected, an app they made. Undefined
 * when Ducter first ran on some other day, or nothing was set up yesterday.
 */
export function dayAfterFacts(o: DayAfterPorts, at: number, tz?: string): DayAfterItem[] | undefined {
  const first = o.log.read({ fromSeq: 0, limit: 1 })[0] as LogEvent | undefined;
  if (!first) return undefined;
  const today = dayIn(at, tz);
  const firstDay = dayIn(Date.parse(first.ts), tz);
  if (today !== firstDay + 1) return undefined; // only the first open on the day after the first run
  const yesterday = firstDay;
  const on = (ms: number) => dayIn(ms, tz) === yesterday;
  const items: { at: number; item: DayAfterItem }[] = [];
  const seen = new Set<string>();

  // A task that finished: its done state is the Log's own line, its title the home's.
  for (const e of o.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_state"] })) {
    const b = e.body as Bodies["task_state"];
    if (b.attention !== "done" || !on(Date.parse(e.ts))) continue;
    const task = o.task(b.taskId);
    if (!task || task.title.trim() === "" || seen.has(`task:${task.taskId}`)) continue;
    seen.add(`task:${task.taskId}`);
    items.push({ at: Date.parse(e.ts), item: { kind: "task", id: task.taskId, title: task.title } });
  }

  // A Keep that started looking after something: its creation time is its own.
  for (const k of o.keeps) {
    if (!on(Date.parse(k.createdAt)) || seen.has(`keep:${k.keepId}`)) continue;
    if ((k.persona && k.persona !== o.persona) || !k.title.trim()) continue;
    seen.add(`keep:${k.keepId}`);
    items.push({ at: Date.parse(k.createdAt), item: { kind: "keep", id: k.keepId, title: k.title } });
  }

  // An account connected, or a chat app linked: the home's record carries when. An OpenConnector
  // holds its accounts inside it (Gmail, Calendar): name the app, never the connector.
  for (const c of o.connections) {
    if (!on(Date.parse(c.addedAt))) continue;
    if (c.apps?.length) {
      for (const app of c.apps) {
        const id = `${app.service}:${app.accounts[0] ?? ""}`;
        if (seen.has(`account:${id}`) || !app.title.trim()) continue;
        seen.add(`account:${id}`);
        items.push({ at: Date.parse(c.addedAt), item: { kind: "account", id, title: app.title } });
      }
      continue;
    }
    // The connector itself (oo, a self-hosted one) is a source, not an account the person connected.
    if (c.source === "oo" || seen.has(`account:${c.id}`) || !c.name.trim()) continue;
    seen.add(`account:${c.id}`);
    items.push({ at: Date.parse(c.addedAt), item: { kind: "account", id: c.id, title: c.name } });
  }
  for (const c of o.channels) {
    const at = c.linked?.at ? Date.parse(c.linked.at) : NaN;
    if (!Number.isFinite(at) || !on(at) || seen.has(`chat:${c.kind}`)) continue;
    seen.add(`chat:${c.kind}`);
    items.push({ at, item: { kind: "chat", id: c.kind, title: chatName(c.kind) } });
  }

  // An app they made: its own made time.
  for (const a of o.apps) {
    if (a.persona !== o.persona || !on(Date.parse(a.made)) || seen.has(`app:${a.id}`)) continue;
    seen.add(`app:${a.id}`);
    items.push({ at: Date.parse(a.made), item: { kind: "app", id: a.id, title: a.name } });
  }

  if (!items.length) return undefined;
  return items
    .sort((a, b) => b.at - a.at)
    .slice(0, DAY_AFTER_MAX)
    .map((x) => x.item);
}

