# Calendars

> Draft 1 · 2026-11-12 · Status: **D221, built 2026-11-12 with fakes; defaults taken while the
> author was away, for review.** Evidence: `research/64-calendar.md` (the real Google Calendar
> actions through oo, read live on two accounts). Builds on D96 and D122 (the broker, oo), D165
> and D173 (proactive kinds and restraint), D189 (Go cards), D192 (tiles), D149 (the greeting),
> D212 (Chinese controls), D115 (time is drawn). Labels: **VERIFIED** run or read this session ·
> **INFERRED** judgment.

## 1. User first

| Who | Before | After | First time, zero setup |
|---|---|---|---|
| The heavy developer (the author): a personal Gmail and a work Google account, each with its own calendar, in different zones (one set to Hong Kong, one to Tokyo, living in Tokyo; research/64) | Two calendars that can't see each other. "What's on tomorrow" means opening both; a dentist at 10:00 in one and a team call at 10:30 in the other collide unnoticed | One day, both accounts merged, in one sentence and one card; the clash said once, in the morning; "find me an hour with Lina" is one card naming which calendar and that Lina gets an invitation | oo already holds both accounts: the tiles show **日历 · weyl.gu** and **日历 · nowledge-labs**, connected, with one line of what it can do now |
| The consumer personal-AI user | Asks a bot to "put it in my calendar" and isn't sure it did, or where | Says it; sees exactly what will land where and who hears; one tap; the card ticks itself off with a link to the event | The empty conversation offers **明天我都有什么安排？** |
| The fresh user | Has never connected anything | Asks "我今天忙吗" and gets the day | Accounts says, under the Gmail tile, **加上 Google 日历，它就能看日程、帮你约时间。** with the one button that opens oo's page |

**Feel (D36):** 好用: one sentence for a day across every account. 顺滑: no "which calendar?"
question when the guests' domain or the person's words already say it. 赏心悦目: a day drawn as
a quiet column of time, each calendar's own colour as a thin rail, now as a line. 放心: nothing
changes without a card that names the calendar, the time in both zones and everyone who'll get an
email; reading never marks anything. 惊喜: the clash between two calendars that no calendar app
shows, said once, the morning it matters.

## 2. First principles

1. **A person has one day, not N calendars.** Every calendar account is read and merged before
   anything is said; an invitation sent to both of their addresses is one event (same iCalUID and
   start). Which account an event lives in is a small label, not a section.
2. **Read what they already chose to see.** Google's own "shown in my calendar list" (`selected`)
   is the default for which calendars Ducter reads; the person can change it per calendar in
   Accounts. Holidays and birthdays are day names, never busy time and never a clash. A declined
   invitation isn't on their day; one shown as free never blocks a slot or clashes.
3. **Times are the person's.** Everything is in their zone; the other side's zone is said only
   when it really differs (an event made in Los Angeles, a guest's zone the person named). UTC,
   which tools write by default, is never "the other side".
4. **Every change is a card, run by code.** Add, move, cancel and answering an invitation are
   staged as one write and run once on Go by core (never by a model's second call), with no
   default and no "don't ask next time" (D189's rails). Cancelling someone else's meeting is
   declining it. Moving someone else's meeting is refused with the reason (only the organizer
   can). The card is the confirmation: on success nobody speaks (silence means success); a
   failure wakes the partner to say it in one line.
5. **No new read for show.** The greeting's "today" line comes from the last read; a fresh read on
   opening the app happens only when today was not read in the last half hour, in the background,
   after the greeting is already on screen.

## 3. Metaphor (AGENTS.md's bar)

No new metaphor: a day is drawn **literally**, as a calendar app would, because the thing is
already a calendar and every user knows how one reads. Candidates considered:

| Candidate | False implications | Verdict |
|---|---|---|
| Literal agenda: a time column, a rail per calendar, now as a line | None worth naming; reads like Apple's and Google's day views | **Chosen** |
| A clay day-planner page with stickers | Stickers suggest Ducter decorated or rated events | No |
| A river or track the little Ducter walks along | Implies Ducter moves through the day itself, or automation | No |
| Beads on a string (D115's routine strip) | Beads are runs of a routine; mixing would blur both | No |
| Blocks stacked like a building | Taller = more important, false | No |
| No visual at all, only words | Fails 赏心悦目 and scannability for a week | Words carry the gist; the card carries the list |

The rubric (legibility without labels, fidelity, scale to a week, state: past / now / clash /
unanswered, emotional fit, distinctiveness, feasibility) favours the literal agenda on every row
except distinctiveness, which the Pebble clay card, its ledge and the hand-drawn now line carry.
A naive-rater comprehension test is owed with the prototype review (todo).

## 4. Settings › 账号 / Accounts

Per D166 and D192: a tile per calendar account, **日历 / Calendar**, then whose (**weyl.gu**,
**nowledge-labs**) when there are two.

**Tile detail** (three bands, then a fourth for calendars):
- **会看 / Reads:** **你选的日历里的日程：时间、标题、地点和参加的人** / **Events in the calendars
  you pick: time, title, place and who's coming**.
- **先问你 / Asks first:** **添加、更改、取消日程，回复邀请** / **Adding, moving or cancelling events,
  answering invitations**.
- 自己留意 / Watch on its own, as for every tile.
- **看哪些日历 / Calendars it reads:** one row per calendar inside the account: the calendar's own
  colour as an 8 px dot (a data colour, never a fill), its name (the main one is **主日历 / Main
  calendar**), a muted note for **节假日 · 只显示名字 / Holidays · names only**, **生日 · 只显示名字 /
  Birthdays · names only**, **共享 / Shared**, and a switch. Before the list arrives: **正在读取日历…
  / Reading calendars…**. Turning one off: Ducter stops reading it at once (watching and asks).

**The first time (zero setup):** when a calendar tile is new to this client (first seen in the
last 7 days and its detail never opened), one line under the tray: **日历已连接：可以问它“今天有
什么安排”，也能帮你约时间；改日程前都会先问你。 / Your calendar is connected: ask “what's on today?”
or have it find a time. It asks before changing anything.** and a text button **试试 / Try it**
that fills the composer with **我今天都有什么安排？ / What's on today?** (never sends). Opening the
tile or Try it retires the line.

**Gmail but no calendar:** under the tray of an oo or OOMOL card holding Gmail and no calendar:
**加上 Google 日历，它就能看日程、帮你约时间。 / Add Google Calendar and it can read your schedule
and find times.** · **在 oo 中添加 / Add in oo** (OOMOL: **在 OOMOL 中添加 / Add in OOMOL**; opens
`console.oomol.com/app-connections`, accounts are connected there) · **以后再说 / Not now** (kept
per client).

## 5. The partner's one tool

`calendar`, listed only while a calendar account is connected (so it costs nothing otherwise):

- `do=agenda` (from, to; default today): the merged day(s). `show=true` puts the **day card**
  under the partner's next message (for "what's my day / week"); the partner then says the gist in
  a line, never the list. The model gets refs, times, titles, whose, who's on it, the person's
  answer, place, online, overlaps.
- `do=free` (minutes; from, to; 09:00–18:00 on weekdays unless told): up to 5 options spread over
  the days, never over a busy time in any account, from half an hour from now.
- `do=propose` (change = create · move · cancel · respond; ref from agenda): core works out the
  account (named; else the one whose domain the guests share; else the default), the calendar,
  the clash at that time, who gets an email, and the other side's zone; stages one write; logs the
  card. The partner ends its turn.

Actions (VERIFIED in oo's catalog, research/64): `list_calendars`, `list_events`
(`singleEvents`, `orderBy=startTime`, `timeZone`), `create_event` (`sendUpdates` all when there
are guests, else none), `patch_event` (move: start and end in the event's own zone; answer: the
whole guest list back with only their own `responseStatus` changed), `delete_event`. Multiple
accounts of one service are addressed with oo's `--connection-name`. `free_busy_query` is a read
(oo's name-based rule called it a write; fixed with a checked list). No write was ever run on the
real account.

## 6. How calendar things look

Theme tokens only (Pebble, both themes); the calendar's colour is data, drawn only as a dot or a
3 px rail. zh and en designed together; phone (one column, full width) and wide (the bubble
column's measure, at most 560 px).

### 6.1 The day card (under a partner message)

- A `--surface` card with the clay ledge (`--base`), radius `--r-md`, padding `--s4`, inside the
  partner's column. With no words of its own it stands alone in that column.
- **Head:** the day, **今天 · 11月18日 周三 / Today · Wed, Nov 18** (今天 / 明天 / 昨天 by the
  person's date, else the weekday), at `--md` in the head font. Under it, quiet, the day's marks
  (holidays, birthdays) at `--xs` muted.
- **Rows**, three columns: the time (start at `--sm`, tabular, ink-soft; the end under it at
  `--xs` muted), the calendar's rail (3 px, rounded, its colour), then the title (`--md`, weight
  600, one line, clipped) and one meta line at `--xs` muted: whose (only when two accounts are
  read: the short form of D192), the people (**和 Lina Chen、alice / with Lina Chen, alice**, **等 5
  人 / +3**), the place or **线上 / Online**. All-day events first, as one line each: **全天 /
  All day** in the time column.
- **States:** past rows at 55 % opacity; **now** a 1.5 px `--accent` line with a 6 px dot across
  the rows at the current time (today only, labelled for screen readers **现在 / Now**); an
  unanswered invitation carries a small **未回复 / Not answered** chip (waiting tokens); tentative
  **可能参加 / Maybe**; shown-as-free rows in ink-soft with **空闲 / Free** in the meta line.
- **Another zone:** the meta line adds **当地 11月17日 21:00 · 洛杉矶 / 21:00 Nov 17 in Los
  Angeles** (common cities named in Chinese; else the zone's own city).
- **A clash:** both rows carry a **时间重叠 / Overlaps** chip in the failed tokens, and a thin
  `--failed-dot` bracket joins them at the time column's edge.
- **A week:** one card, a small head per day; an empty day **没有安排 / Nothing on**, a run of
  empty days one line (**11月21日–22日 没有安排**). Up to 14 days.
- **Tap a row:** opens the event in Google Calendar (its own link) in a new tab or the browser.
  Its accessible name says it all: "10:30 到 11:30，HawDB 周会，nowledge-labs，和 Lina Chen、alice，
  与看牙时间重叠".
- **Motion:** the card enters with the bubble (220 ms rise); the now line fades in 120 ms after;
  reduced motion: none.

### 6.2 The change card (a decision with `cal`)

The bubble says the question (**添加「和 Lina 对一下 HawDB 发布」？ / Add “…”?**, **更改「…」的
时间？**, **取消「…」？**, **接受 / 拒绝「…」的邀请？**, **对「…」回复可能参加？**). Under it, one
sunken block (`--sunken`, `--r-sm`, `--s3`):

1. the rail in the calendar's colour and the title;
2. **when**: **明天 11月19日 周四 15:00–15:30 / Tomorrow, Thu Nov 19, 15:00–15:30**; a move shows
   **原来 / Was** with the old time struck through and muted, a drawn arrow, then the new time;
3. **the other side**, when their zone differs: **Lina 那边是 11月19日 周四 00:00（洛杉矶） /
   That's 00:00 Thu Nov 19 for Lina (Los Angeles)**;
4. **放在 / In** (create) or **在 / In**: the dot, **主日历 / Main calendar** or the calendar's name, ·
   whose;
5. **who hears**: create with guests **会发邀请给 Lina / Lina gets an invitation**; move or cancel
   **会通知 Lina Chen、alice / Lina Chen and alice are told**; an answer **会告诉组织者 Sam Lee /
   Sam Lee (the organizer) is told**; none **不会通知任何人 / Nobody is notified**;
6. **a clash** in the failed ink: **那时已经有「HawDB 周会」/ “HawDB weekly” is already on then**;
7. **线上 · 会加上视频会议链接 / Online · with a video call link** when asked.

Buttons (D76 order, D212 words): **回复… / Reply…** · Hold · Go. Hold is **暂不添加 / Not now**,
**暂不更改 / Not now**, **保留日程 / Keep it** (a cancel's dismiss never reads 取消), **暂不回复 /
Not now**. Go is the action: **添加到日历 / Add to calendar**, **更改时间 / Move it**, **取消日程
/ Cancel event**, **接受 / Accept**, **拒绝 / Decline**, **可能参加 / Maybe**. No default line
(there is none).

**After Go**, the card settles in place from the run's own record (the `connection_call` with its
decision id): **正在添加… / Adding…** (D212 progress), then **已添加到日历 / Added** with **在 Google
日历中打开 / Open in Google Calendar** (its link), **已更改时间 / Moved**, **已取消日程 /
Cancelled**, **已接受 / Accepted**, **已拒绝 / Declined**, **已回复可能参加 / Replied maybe**; a
failure **没能添加 / Couldn't add** (**没能更改 / 没能取消 / 没能回复**) and one short reason in the
failed ink. Hold settles as **没有改动 / Nothing changed**.

**On hand** lists an open change card like any ask (D216), by its question.

### 6.3 The greeting (D149)

Under the greeting's line, when the last read shows something still ahead today: one quiet row
with a small drawn calendar glyph: **今天还有 3 件事，下一件 14:00「Design sync」 / 3 more today ·
next at 14:00, Design sync**; with a clash today: **，有两件时间重叠 / · two overlap**. Tap fills
the composer with **我今天还有什么安排？ / What's left today?**. Nothing when nothing is ahead
(silence). The morning note gets no calendar-only line: a calendar speaks there only through a
find (a clash, a plan that changed, before a meeting).

### 6.4 Proactive

- **两件事对不上 / Two things don't match** gains the clash: two busy timed events overlapping
  today or tomorrow, in any calendars (one event in both calendars is not a clash), worded
  **明天 10:00「HawDB 周会」和「看牙」撞了。 / “HawDB weekly” and “Dentist” overlap tomorrow at
  10:00.** Same-day clashes are urgent (cost 75), tomorrow's go to the morning note (65). No next
  step (the person replies "把看牙挪一下" and the partner proposes the move).
- The watcher reads every calendar the person lets it read, with the real action (`list_events`
  per calendar; the main one as `primary`), every 15 minutes while watching is on. All-day,
  free-shown and declined events are never meetings (no "before a meeting", no clash).

## 7. Not built, honestly

- Outlook and other calendar services are listed as accounts and read through `connection_call`;
  the merged day, free time and change cards are Google Calendar only (oo's `outlook_calendar`
  was not connected to read live).
- The video link on create (`conferenceData.createRequest`) follows Google's documented shape; oo
  exposes no `conferenceDataVersion`, so whether a Meet link appears is unverified until a real Go.
- A moved recurring event moves that one occurrence (the instance from `singleEvents`); "every
  week from now on" is not offered.
- A guest's zone is said only when the partner names it (`theirZone`); Ducter doesn't guess it
  from an address.
