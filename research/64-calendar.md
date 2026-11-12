# 64. Calendars through oo: the real actions, two accounts, and what a calendar partner owes

> 2026-11-12 · For D221 (`design/calendar.md`). The author connected Google Calendar for two
> Google accounts in oomol's oo; until now Ducter's watcher guessed calendar action names and
> nothing in the product was designed for calendars. Labels: **VERIFIED** run on this Mac this
> session (read-only actions only) · **DOCUMENTED** a vendor's documentation says so ·
> **INFERRED** judgment. Nothing below quotes an event, a calendar name, an attendee or an
> address from the real account: shapes and counts only. No write action was run.

## 1. What oo offers for calendars (VERIFIED, `oo connector search`, oo CLI as installed)

Services: `googlecalendar` (connected, two accounts), `outlook_calendar` and `cal` (Cal.com)
listed but not connected here.

`googlecalendar` actions found (27): `list_calendars`, `get_calendar_list_entry`,
`add_calendar_to_list`, `update_calendar_list_entry`, `patch_calendar_list_entry`,
`create_calendar`, `delete_calendar`, `get_calendar`, `patch_calendar`, `list_events`,
`get_event`, `list_event_instances`, `create_event`, `quick_add_event`, `import_event`,
`update_event`, `patch_event`, `delete_event`, `move_event`, `add_attendee`, `free_busy_query`,
`find_free_slots`, `get_colors`, `list_settings`, `get_setting`, and ACL rules (`list_acl`,
`get_acl_rule`, `create_acl_rule`, `patch_acl_rule`, `update_acl_rule`, `delete_acl_rule`).
There is **no "respond to invitation" action**: answering is a `patch_event` of the attendee
list with one's own `responseStatus` changed (DOCUMENTED, Google Calendar API: patch replaces the
array it is given).

Input shapes that matter (VERIFIED, `oo connector schema … --json`):
- `list_events`: `calendarId` (omit for primary), `timeMin`, `timeMax` (RFC 3339),
  `singleEvents`, `orderBy`, `timeZone`, `maxResults` (≤ 2500), `q`, `showDeleted`, `syncToken`.
- `create_event` / `patch_event`: `calendarId`, `eventId` (patch), `event` {summary,
  description, location, start/end {date | dateTime, timeZone}, attendees[{email,
  responseStatus, optional, …}], conferenceData{createRequest{requestId,
  conferenceSolutionKey}}, reminders, transparency, visibility, …}, `sendUpdates` (`all` ·
  `externalOnly` · `none`). **No `conferenceDataVersion`** is exposed; Google documents that a
  Meet link is created only with `conferenceDataVersion=1` (DOCUMENTED), so whether oo adds it is
  unknown until a real write (INFERRED: owed).
- `delete_event`: `calendarId`, `eventId`, `sendUpdates`.
- `find_free_slots` and `free_busy_query`: `items` (calendar ids), `timeMin`, `timeMax`,
  `timeZone`.

## 2. Two accounts of one service (VERIFIED, `oo connector apps googlecalendar --json`)

Each account is a row with `connectionName` (a slug of the address), `accountLabel` (the
address), `isDefault` (one of them), scopes including `…/auth/calendar` (read and write), status
active. A run picks the account with `--connection-name <name>`; without it, the default.
Ducter's broker already passes the account this way (`oo-link.ts`): no change needed.

## 3. What came back (VERIFIED, read-only runs on both accounts; shapes only)

- **`list_calendars`** returns `{ data: { items }, meta: { executionId, … } }`. One account had
  7 calendars, the other 2. Each entry has `id`, `summary`, `accessRole` (owner · writer ·
  reader), `primary` (on one), `selected` (absent on calendars the person hid in Google's own
  list), `backgroundColor` (#rrggbb), `timeZone`, `defaultReminders`; some have `dataOwner`.
  Kinds seen by id: the main one (the address), a country's holidays
  (`…#holiday@group.v.calendar.google.com`, reader, selected), the person's own extra calendars
  (`…@group.calendar.google.com`, owner or writer; two of four not selected), and a calendar of
  another Google account shared with owner access.
- **The two accounts' own zones differ** (one Hong Kong, one Tokyo, `get_setting timezone`),
  while the Mac is in Tokyo. A merged day must be in the person's zone, not an account's.
- **`list_events`** (`singleEvents`, `orderBy=startTime`) over two weeks: a few events per
  account. Fields seen beyond the schema: `iCalUID`, `hangoutLink`, `sequence`,
  `guestsCanModify`, `privateCopy`, and **`self: true` on the person's own attendee row** (the
  schema omits it; it is what tells their answer). `start.timeZone` varied: `Asia/Tokyo` on one,
  **`UTC` on another made by a tool**, so UTC can't be read as "the other side's zone". An
  all-day event carried `start.date` only and `eventType: fromGmail` (made from a mail).
  `conferenceData.entryPoints` types: video, more, phone.
- **Holidays** (8 in two months): all-day, `transparency: transparent`: names for a day, not
  busy time.
- **`free_busy_query`** over the main calendar and the holidays calendar: busy for the main one;
  the holidays calendar came back with an `errors` entry (no free/busy for it).
  **`find_free_slots`** returned one free span over the whole window, ignoring working hours:
  slots must be worked out by Ducter itself to respect a day's hours and merge both accounts.
- **Errors:** a wrong calendar id exits non-zero with `Connector action list_events returned HTTP
  404 (errorCode: provider_error): Not Found`, distinct from oo's message for an action that
  doesn't exist (`The connector action metadata request returned HTTP 404`). The old watcher
  treated any "not found" as "try the next action name".

## 4. What was wrong in Ducter before

- `proactive/watch.ts` tried four guessed names (`googlecalendar.list_events` was right, three
  were invented) and read **only the default calendar** (no `calendarId`), so a family or team
  calendar was never seen, and only the default account's zone setting applied.
- `ooOp` (oo-link.ts) decides read or write from an action's first word: `free_busy_query` read
  as a write (it would have needed a Go to look at busy times).
- An event's `transparency`, the person's own answer and all-day were dropped, so "before a
  meeting" could fire on a declined invitation or a holiday.
- Accounts said **今天和明天的日程** for what it reads and had nowhere to choose calendars; the
  conversation had no way to show a day; a change was a generic `connection_call` card whose
  question the model wrote.

## 5. What a calendar partner owes (prior art, INFERRED unless marked)

- **Merged accounts are the norm in good calendar apps** (Apple Calendar, Fantastical, Notion
  Calendar/Cron show several accounts in one view, each calendar coloured; DOCUMENTED in their
  help pages). What none of them does is *tell* you that your personal 10:00 and your work 10:30
  collide: the clash is only visible if you look at the right day. That is the proactive gap.
- **Google's own assistant flows** confirm a new event by showing the event card (title, time,
  calendar) before saving; notifying guests is a separate checkbox (DOCUMENTED, Google Calendar's
  "Send invitation emails?" prompt). Ducter's card puts both on one card: what, where, when, who
  hears.
- **Time zones:** Google shows a second zone only when the person turns it on; airline and
  meeting tools (Calendly) show the invitee's zone beside the host's. Showing the other side's
  zone only when it differs keeps the card short (INFERRED).
- **RSVP:** Google notifies the organizer of a guest's answer (DOCUMENTED); "cancel" on someone
  else's meeting in Google's UI is "remove from my calendar / decline" (DOCUMENTED). Ducter maps
  cancel to decline for others' meetings.

## Implications for Ducter

1. Use the real actions: `list_calendars`, then `list_events` per calendar the person reads
   (`primary` for the main one), with the person's zone; `create_event`, `patch_event`,
   `delete_event` for changes; never `find_free_slots` for options.
2. Default the calendars it reads to Google's own `selected`; holidays and birthdays are day
   names, never busy time; a declined or free-shown event is never a meeting or a clash.
3. Merge accounts and deduplicate by `iCalUID` + start; say whose only when there are two.
4. Free time is computed by Ducter over the merged busy times, within a day's hours.
5. One partner tool for calendars, listed only when a calendar is connected; every change is a
   structured Go card that core stages and runs once on Go, with the account, calendar, times
   (both zones when they differ) and who gets an email.
6. Treat `free_busy_query` as a read (a checked list beside the name rule).
7. Owed live: one real Go (create, move, answer, cancel) on a test calendar, including whether a
   Meet link appears; Outlook through `outlook_calendar` once someone has it connected.

**Summary.** oo exposes Google Calendar fully (27 actions, both accounts by connection name); the
answers carry what a merged, zone-correct day needs (`selected`, colours, `self`,
`transparency`, `iCalUID`), with two traps (UTC as an event zone, and free-slot search that
ignores hours). Ducter now reads every chosen calendar in every account, merges them, finds
clashes across accounts, and makes changes only through a structured card run once on Go.
