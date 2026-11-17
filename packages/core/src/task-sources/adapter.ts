// D340: 待办来源 / To-do sources. One adapter per outside app: GitHub and Obsidian now, Jira and a
// company's own tracker later (design/task-sources.md §8). An adapter only reads its app and does
// the one write it is asked for; the gate (who allowed it), the Log and the bindings are the
// service's (index.ts), so a new app never decides consent by itself.
import type { SourceItem, SourceKind, SourceOp, SourceView } from "@ducter/protocol";

export interface AdapterStatus {
  state: SourceView["state"];
  /** github: the login; obsidian: the vault's name. */
  account?: string;
  error?: string;
}

export interface WriteResult {
  ok: boolean;
  /** What the app gave back (a comment's address). */
  link?: string;
  /** A short reason in English (Details only), or one of the known refusals below. */
  error?: string;
  /**
   * busy      the file changed while it was being written (someone is editing it): try later
   * repeats   an Obsidian Tasks 🔁 line: the person ticks it in Obsidian (the plugin makes the next one)
   * changed   the line isn't what was bound any more (ticked, edited or moved by hand)
   * offline   the file isn't on this computer right now (iCloud kept it in the cloud)
   */
  refused?: "busy" | "repeats" | "changed" | "offline";
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  /** Can it read now, and as whom. Cheap; called on every look. */
  status(): Promise<AdapterStatus>;
  /** Open items in scope, newest first. */
  list(): Promise<SourceItem[]>;
  /** One item by its ref, closed ones too; undefined when it is gone (deleted, the line removed). */
  get(ref: string): Promise<SourceItem | undefined>;
  /** What it can write. */
  readonly ops: readonly SourceOp[];
  /** One write. comment carries text. Never more than asked: no other line, field or label. */
  write(ref: string, op: SourceOp, text?: string): Promise<WriteResult>;
}

/** The comment's last line, so whoever reads the issue knows an AI wrote it for the person. */
export const SIGNATURE = "\n\n<sub>Written with Ducter</sub>";
