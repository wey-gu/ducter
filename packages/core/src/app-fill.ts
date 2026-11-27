// D624: boards are no longer offered. A small app the person asks for can still be kept
// current by a task (app_data, data only, never the file); an app a task or Keep already has is
// left exactly as it is. The Keep page carries the PR facts a board used to repeat.
import { APP_TASK_KEYS_PER_CALL, type AppMeta, type AppTask, type Bodies } from "@ducter/protocol";
import { jsonText } from "@ducter/protocol/src/tool-schema.ts";
import type { AppsStore } from "./apps.ts";

export interface AppFillDeps {
  apps: AppsStore;
  persona: () => string;
  /** D612: the Keep a task's rounds belong to, when the app follows a Keep. */
  keepOf: (taskId: string) => AppTask | undefined;
  /** D612: the tasks a Keep's rounds run in now (told how to fill its app). */
  tasksOfKeep: (keepId: string) => AppTask[];
  /** Says something to a task (its next turn reads it). */
  tell: (taskId: string, text: string) => void;
}

export interface AppFill {
  /** The app a task keeps current (the Ongoing card opens it). */
  appOf(taskId: string): AppMeta | undefined;
  /** D612: what a round of this task should write into the app it was given (a task's or its Keep's), or "". */
  appNote(taskId: string): string;
  /**
   * A round's done report from a task that keeps one of the person's apps current wakes nobody: the
   * app is the news (D394's silence at the source). A question, a block or a failure still does.
   */
  wakes(e: import("@ducter/protocol").LogEvent): boolean;
}

export function createAppFill(d: AppFillDeps): AppFill {
  const appOf = (taskId: string) => d.apps.byTask(taskId).find((a) => a.persona === d.persona()) ?? d.apps.byTask(taskId)[0];
  const appNote = (taskId: string): string => {
    const keep = d.keepOf(taskId);
    // D624: an app made before boards were retired (kind reviews) is left as it is: its data
    // is not written by a task, and it is not migrated.
    const apps = [...d.apps.byTask(taskId), ...(keep ? d.apps.byKeep(keep.id) : [])].filter((a) => !a.kind);
    if (!apps.length) return "";
    return apps
      .map((a) => {
        const keys = [...new Set([...(d.apps.html(a.id) ?? "").matchAll(/ducter\.get\(\s*["'`]([^"'`]{1,64})["'`]/g)].map((x) => x[1]!))].slice(0, 12);
        return `[Ducter] The person keeps this work's rounds in their small app "${a.name}" (app ${a.id}). Each round, write what stands now into it with app_data (app ${a.id}, set {key: value}; null removes a key)${keys.length ? `; the app reads the keys ${keys.join(", ")}` : ""}. Write whole values, once a round; a round that only updated it needs no report_to_main.`;
      })
      .join("\n");
  };
  // A task given an app (made for it, or given later) hears how to fill it, once.
  d.apps.onChange((c) => {
    if (c.kind !== "give" || (!c.task && !c.keep)) return;
    const a = d.apps.get(c.id);
    if (!a || a.kind) return;
    if (!c.task) {
      // D612: an app given to a Keep: every task its rounds run in hears how to fill it.
      for (const t of c.keep ? d.tasksOfKeep(c.keep.id) : []) {
        const text = appNote(t.id);
        if (text) d.tell(t.id, text);
      }
      return;
    }
    const keys = [...new Set([...(d.apps.html(a.id) ?? "").matchAll(/ducter\.get\(\s*["'`]([^"'`]{1,64})["'`]/g)].map((x) => x[1]!))].slice(0, 12);
    d.tell(
      c.task.id,
      `[Ducter] The person now keeps this work's rounds in their small app "${a.name}" (app ${a.id}). Each round, write what stands now into it with app_data (app ${a.id}, set {key: value}; null removes a key)${keys.length ? `; the app reads the keys ${keys.join(", ")}` : ""}. Write whole values (a key's value is replaced), once a round. Then don't report_to_main for a round that only updated it: report only when something needs the person.`,
    );
  });
  return {
    appOf,
    appNote,
    wakes(e) {
      if (e.kind !== "report") return true;
      const b = e.body as Bodies["report"];
      const keep = d.keepOf(b.taskId);
      // D624: an old review board is not filled any more, so it never silences a round's report.
      const follows = d.apps.byTask(b.taskId).some((a) => !a.kind) || (!!keep && d.apps.byKeep(keep.id).some((a) => !a.kind));
      return !(b.state === "done" && !b.questions?.length && follows);
    },
  };
}

/** The app_data task tool's input (data only: keys and JSON values). */
export const APP_DATA_SCHEMA = {
  type: "object",
  properties: {
    app: { type: "string", description: "The app's id (from the message that gave it to you)" },
    set: jsonText(`Keys to write, each a whole JSON value (null removes the key); at most ${APP_TASK_KEYS_PER_CALL}`),
  },
  required: ["app", "set"],
} as const;
