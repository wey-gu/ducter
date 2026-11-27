// D623: the day after the first run. The first time the person opens Ducter on the day
// after they set it up, the partner says one short recap of what was set up yesterday and the app
// carries one offer of a cadence, with a default. The facts are code's (the Log and the home's own
// records); the words are the partner's.
//
// Each item is one true fact about something the person set up yesterday, and the thing it opens:
// a task that finished, a Keep that started looking after something, an account or a chat app they
// connected, an app they made. At most DAY_AFTER_MAX of them, never a feature tour.
import type { ChannelKind } from "./channels.ts";

/** At most this many facts in the recap; the rest are not said (never a feature tour). */
export const DAY_AFTER_MAX = 3;

/**
 * One thing the person set up, and where it opens. `title` is the task's, the Keep's, the app's or
 * the account's own name; code never invents one.
 */
export type DayAfterItem =
  | { kind: "task"; id: string; title: string }
  | { kind: "keep"; id: string; title: string }
  | { kind: "account"; id: string; title: string }
  | { kind: "chat"; id: ChannelKind; title: string }
  | { kind: "app"; id: string; title: string };

/** What the partner reads and what the message carries under its words. */
export interface DayAfter {
  items: DayAfterItem[];
}
