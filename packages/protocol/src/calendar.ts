// D222 (design/calendar.md): the person's calendars, read through their accounts (oo, OOMOL or
// their own OpenConnector), merged across every account into one day. Shared by core and every
// client. Times are ISO strings with the offset of the person's zone (all-day: YYYY-MM-DD).

/** One calendar inside a calendar account, as Settings › 账号 / Accounts lists it under the tile. */
export interface CalendarRow {
  /** The provider's calendar id (never shown). */
  id: string;
  /** Its name as the person named it; "" for the account's main calendar (主日历 / Main calendar). */
  name: string;
  /**
   * main      the account's own calendar
   * own       one more the person made in that account
   * shared    someone else's, shared with them (a family or team calendar)
   * holidays  a country's holidays: read as day names, never as busy time
   * birthdays contacts' birthdays: day names too
   */
  kind: "main" | "own" | "shared" | "holidays" | "birthdays";
  /** The provider's colour for it (#rrggbb): a data colour, drawn only as a small dot or rail. */
  color?: string;
  /** Ducter may propose changes here (the person owns it or can write to it). */
  canEdit: boolean;
  /** Ducter reads it. Default: what the person shows in that calendar app themselves. */
  seen: boolean;
}

export type CalResponse = "accepted" | "declined" | "tentative" | "needsAction";

/** One event as a glance shows it: never a description, never an attendee's address. */
export interface CalEvent {
  /** c_xxxxxxxx: how the partner names it to propose a change (stable for the event). */
  ref: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  /** The event's own zone when it differs from the person's (never UTC, which tools write by default). */
  zone?: string;
  /** The calendar's name ("" = the account's main calendar). */
  calendar: string;
  /** Whose account, when more than one calendar account is read (the account's label). */
  account?: string;
  color?: string;
  /** Where, short (a room or an address); online when it carries a video link. */
  where?: string;
  online?: boolean;
  /** Opens the event in the calendar's own app or site. */
  link?: string;
  /** Other people on it (not the person), and up to three of their names (never addresses). */
  people?: number;
  with?: string[];
  /** The person's own answer to the invitation. */
  me?: CalResponse;
  /** The person organizes it. */
  mine?: boolean;
  /** It shows as free (the person marked it so): never busy, never a clash. */
  free?: boolean;
  recurring?: boolean;
}

/** One day of a glance, in the person's zone. */
export interface CalDay {
  date: string; // YYYY-MM-DD
  /** Holidays and birthdays: names only, a quiet line at the top. */
  marks?: string[];
  events: CalEvent[];
}

/**
 * 日程 / A day's glance (or a few days'): put under the partner's words when it answers "what's my
 * day / week", one card, merged across every calendar account. clashes: pairs of refs that overlap.
 */
export interface CalGlance {
  zone: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD, inclusive
  days: CalDay[];
  clashes?: [string, string][];
  /** How many calendar accounts this read (2: each row says whose). */
  accounts: number;
  at: string; // when it was read
}

/**
 * The Go card of a calendar change (D189's rails, D222): what will change, where, when in the
 * person's zone (and the other side's when it differs), and who will hear about it. Go runs it
 * once; there is never a default and never "don't ask next time".
 */
export interface CalChange {
  kind: "create" | "move" | "cancel" | "respond";
  title: string;
  /** The calendar it lands in or lives in ("" = the main calendar), its account and colour. */
  calendar: string;
  account?: string;
  color?: string;
  start: string;
  end: string;
  allDay?: boolean;
  /** move: where it was. */
  was?: { start: string; end: string };
  /** The other side's zone (IANA) and who, when it differs from the person's. */
  theirZone?: string;
  theirName?: string;
  /** Who gets an email from the calendar about it (names, else the part before @); [] = nobody. */
  notify: string[];
  /** respond: the answer, and whose invitation it is. */
  response?: "accepted" | "declined" | "tentative";
  organizer?: string;
  where?: string;
  /** create: a video link is added. */
  online?: boolean;
  /** Something already on at that time (its title): said on the card, never blocks. */
  clash?: string;
}

/** FirstScreen.today (D149, D222): one quiet line under the greeting, from the last look only. */
export interface CalToday {
  /** Timed events still ahead today. */
  left: number;
  next?: { title: string; start: string };
  /** Two of today's events overlap. */
  clash?: boolean;
}
