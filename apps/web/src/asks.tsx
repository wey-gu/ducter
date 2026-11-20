// D426: several things in one message, line by line under the person's own words: each thing in
// their words with its mark (the same tick, working bars, flag and cross On hand's groups draw),
// one quiet note of what came of it, and from four lines a count. Changes in place, never posts.
// A row opens the task that does it. Who does it (the agent) is never in the conversation; on a
// pointer device it shows quietly on hover, at the row's end (D426 (3)). The Mac draws the same
// (apps/desktop/internal/views/asks.go).
import type { AskLine, AsksBody } from "@ducter/protocol";
import { asksCount } from "@ducter/protocol";
import { A } from "./app.ts";
import { harnessName } from "./format.ts";
import { harnessOf } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The line's mark: drawn, never a dot that means nothing (D69). */
export function AskMark({ state }: { state: AskLine["state"] }) {
  if (state === "working")
    return (
      <span class="amark s-working" aria-hidden="true">
        <span class="pulse">
          <i />
          <i />
          <i />
        </span>
      </span>
    );
  const path = state === "done" ? "M5 10.5l3.2 3.2L15 7" : state === "failed" ? "M6.5 6.5l7 7M13.5 6.5l-7 7" : "M10 5.5v5.5M10 14.2v.3";
  return (
    <span class={`amark s-${state}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18">
        <circle cx="10" cy="10" r="8.4" />
        <path d={path} fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  );
}

/** What the row says under its words: the task's note, else the state when it needs saying. */
export function askNote(l: AskLine): string {
  if (l.note) return l.note;
  if (l.state === "needs_you") return t("asks.needs");
  if (l.state === "failed") return t("asks.failed");
  return "";
}

/** The lines under one message: shown from two lines (one thing asked looks as it always did). */
export function AskLines({ a }: { a: AsksBody }) {
  if (a.lines.length < 2) return null;
  const count = asksCount(a.lines);
  return (
    <div class="asked" data-asks={a.msgSeq}>
      <ul>
        {a.lines.map((l, i) => {
          const task = l.taskId ? A.S.tasks.get(l.taskId) : undefined;
          const who = task ? harnessName(harnessOf(task)) : "";
          const note = askNote(l);
          return (
            <li key={i} class={`asked-line s-${l.state}`}>
              <button type="button" class="ask-row" disabled={!l.taskId} aria-label={`${l.words}${note ? `: ${note}` : ""}`} onClick={() => l.taskId && A.openTaskPage(l.taskId)}>
                <AskMark state={l.state} />
                <span class="ask-text">
                  <span class="ask-words" dir="auto">
                    {l.words}
                  </span>
                  {note && (
                    <span class="ask-note" dir="auto">
                      {note}
                    </span>
                  )}
                </span>
                {who && (
                  <span class="ask-who" aria-hidden="true">
                    {who}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {count && <div class="asks-count">{t("asks.count", count.done, count.left)}</div>}
    </div>
  );
}

/** The newest message whose lines include this task: its lines (all of them), for the opened task. */
export function asksOfTask(id: string): AsksBody | undefined {
  for (let i = A.S.channel.length - 1; i >= 0; i--) {
    const a = A.S.channel[i]!.asks;
    if (a && a.lines.length >= 2 && a.lines.some((l) => l.taskId === id)) return a;
  }
  return undefined;
}

/** In the opened task: the things of that message it does, with their marks (the agent is in its meta). */
export function TaskAsks({ id }: { id: string }) {
  const a = asksOfTask(id);
  if (!a) return null;
  const mine = a.lines.filter((l) => l.taskId === id);
  return (
    <div class="asked task-asked">
      <ul>
        {mine.map((l, i) => {
          const note = askNote(l);
          return (
            <li key={i} class={`asked-line s-${l.state}`}>
              <div class="ask-row">
                <AskMark state={l.state} />
                <span class="ask-text">
                  <span class="ask-words" dir="auto">
                    {l.words}
                  </span>
                  {note && (
                    <span class="ask-note" dir="auto">
                      {note}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
