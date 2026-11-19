// D388 (research/154): the moments a good personal AI gives, rebuilt as synthetic mail, calendar
// and the person's own words, shaped like the author's real week of 2026-11-18 (no real mail: every
// company, person, domain and address is made up; example.com/.org/.net).
//
//   1. 两件事对不上 / the plan sheet: the calendar holds "AGI Bar 北京分享" all day Saturday 11-21,
//      time not set; a colleague's weekly report (a mail that mentions it, not its confirmation)
//      says Friday 11-20. Said before travel is booked, with what it doesn't know (the time).
//   2. The follow-up that fills the gap it named: half an hour or more later a quick web look finds
//      the event page: Sat 11-21 19:00, and that 19:00 is the doors. Said once, linked.
//   3. A quota mail at 95% that says neither what is left nor when it resets: said plainly, the
//      unknowns named, beside the other things in one calm morning note.
//   4. The aha moments the author had with another app (Mem, 2026-11-09): a domain renewal with the
//      card on file expired, and a flight that lands the night before the hotel starts.
//   Negatives: a meetup whose calendar event and confirmation agree (no find, no question, no
//   look); the person's own words against their own calendar only (they know: no find); the noise.
//
// The person lives in Asia/Shanghai (the rig's zone, quiet hours 23:00–08:00). The run starts
// Wednesday 2026-11-18 07:00 and ends Friday 2026-11-20 12:00; `later` mail arrives at its `at`.
import type { FakeEvent, FakeMail, Fixture, Triaged } from "./inbox.ts";
import { ME } from "./inbox.ts";

export const AHA_START = Date.parse("2026-11-18T07:00:00+08:00");
export const AHA_END = Date.parse("2026-11-20T12:00:00+08:00");
const T = (s: string) => new Date(Date.parse(s)).toISOString();
const none: Triaged = { person: false, needsAnswer: false, facts: [] };

export interface Later {
  at: string;
  mail: FakeMail;
  triage: Triaged;
}

/** The person's own line in the conversation, at its time. */
export interface Said {
  at: string;
  text: string;
}

/** The public event page a web look reads (a fake: the look never reaches the web). */
export const AGIBAR_PAGE = "https://agibar.example.com/events/2026-11-21-beijing";

const allDay = (id: string, summary: string, day: string, next: string, updated: string): FakeEvent =>
  ({ id, summary, start: { date: day }, end: { date: next }, updated: T(updated), transparency: "transparent" }) as unknown as FakeEvent;

export function ahaDays(): { fx: Fixture; later: Later[]; said: Said[] } {
  const fx: Fixture = {
    mail: [
      // 4a: the renewal, a week ahead, the card on file expired (a no-reply sender in Updates).
      {
        id: "m_domain",
        threadId: "t_domain",
        from: "Registrar Example <billing@registrar.example.net>",
        to: [ME],
        subject: "ducter-demo.example renews on November 23",
        snippet: "Your domain ducter-demo.example renews on Nov 23, 2026 for $12.98. The card on file (ending 4242) has expired; update it to avoid losing the domain.",
        date: T("2026-11-16T09:00:00+08:00"),
        labelIds: ["CATEGORY_UPDATES"],
      },
      // 4b: the flight lands late on the 26th; the hotel starts on the 27th (two mails a week apart).
      {
        id: "m_flight",
        threadId: "t_flight",
        from: "Air Example <noreply@air.example.com>",
        to: [ME],
        subject: "Booking confirmed: CA929 Shanghai – Tokyo Narita, 26 Nov",
        snippet: "CA929 departs Shanghai Pudong T2 at 17:30 on 26 Nov and arrives Tokyo Narita at 21:40 local time.",
        date: T("2026-11-05T10:00:00+08:00"),
        labelIds: ["CATEGORY_UPDATES"],
      },
      {
        id: "m_hotel",
        threadId: "t_hotel",
        from: "Stays Example <reservations@stays.example.com>",
        to: [ME],
        subject: "Your stay at Hotel Shinjuku Example is confirmed",
        snippet: "Check-in Fri 27 Nov 2026, check-out Mon 30 Nov 2026. 3 nights.",
        date: T("2026-11-12T20:00:00+08:00"),
        labelIds: ["CATEGORY_UPDATES"],
      },
      // Negative: the meetup's confirmation agrees with the calendar (Sunday 19:00).
      {
        id: "m_rust",
        threadId: "t_rust",
        from: "Rust Beijing Example <events@rustbj.example.org>",
        to: [ME],
        subject: "You're registered: Rust Beijing Meetup, Sun 22 Nov 19:00",
        snippet: "See you on Sunday 22 Nov at 19:00.",
        date: T("2026-11-14T12:00:00+08:00"),
      },
      // Negative (D388): a stranger's pitch, asked twice, the person never wrote to them.
      { id: "m_pitch1", threadId: "t_pitch", from: "Dana Growth <dana@growth.example.com>", to: [ME], subject: "Quick call next week?", snippet: "Could we book 15 minutes to talk about a partnership?", date: T("2026-11-15T10:00:00+08:00") },
      { id: "m_pitch2", threadId: "t_pitch", from: "Dana Growth <dana@growth.example.com>", to: [ME], subject: "Re: Quick call next week?", snippet: "Just following up: here is my booking link.", date: T("2026-11-17T10:00:00+08:00") },
      // A colleague's real question, unanswered for two working days: still said.
      { id: "m_ask", threadId: "t_ask", from: "Mia Chen <mia@example.org>", to: [ME], subject: "Which release has the export fix?", snippet: "Hi, which release will have the export fix? A user is asking.", date: T("2026-11-16T09:00:00+08:00") },
      // Noise.
      { id: "m_news", from: "AI Weekly <newsletter@aiweekly.example.com>", to: [ME], subject: "This week in AI: agents everywhere", snippet: "This week: …", date: T("2026-11-17T21:00:00+08:00"), listUnsubscribe: true },
      { id: "m_promo", from: "Shop <deals@shop.example.com>", to: [ME], subject: "Black Friday early access: 40% off", snippet: "Don't miss out", date: T("2026-11-17T22:00:00+08:00"), labelIds: ["CATEGORY_PROMOTIONS"] },
      { id: "m_rcpt", from: "Linear <no-reply@linear.example.app>", to: [ME], subject: "Your receipt from Linear #2301", snippet: "Amount paid $8.00", date: T("2026-11-17T22:10:00+08:00"), labelIds: ["CATEGORY_UPDATES"] },
    ],
    events: [
      // 1: the hold the person made weeks ago, no time yet.
      allDay("ev_agibar", "AGI Bar 北京分享", "2026-11-21", "2026-11-22", "2026-11-12T10:00:00+08:00"),
      // Negative: the person's own words against their own calendar only (they said Saturday; the hold is Sunday).
      allDay("ev_westlake", "西湖音乐节", "2026-11-22", "2026-11-23", "2026-11-10T10:00:00+08:00"),
      // Negative: the meetup in the calendar, the same day as its confirmation.
      { id: "ev_rust", summary: "Rust Beijing Meetup", start: { dateTime: "2026-11-22T19:00:00+08:00" }, end: { dateTime: "2026-11-22T21:00:00+08:00" }, updated: T("2026-11-14T12:05:00+08:00") },
    ],
    github: [],
    chat: [],
    triage: {
      m_domain: { person: false, needsAnswer: false, facts: [{ type: "renewal", name: "ducter-demo.example domain", due: "2026-11-23", amount: "$12.98", cardExpired: true }] },
      m_flight: { person: false, needsAnswer: false, facts: [{ type: "booking", what: "flight", name: "CA929", from: "Shanghai Pudong T2", place: "Tokyo Narita", start: "2026-11-26T17:30:00+08:00", end: "2026-11-26T21:40:00+09:00" }] },
      m_hotel: { person: false, needsAnswer: false, facts: [{ type: "booking", what: "hotel", name: "Hotel Shinjuku Example", place: "Tokyo", start: "2026-11-27", end: "2026-11-30" }] },
      m_rust: { person: false, needsAnswer: false, facts: [{ type: "booking", what: "other", name: "Rust Beijing Meetup", start: "2026-11-22T19:00:00+08:00" }] },
      m_pitch1: { person: true, needsAnswer: true, facts: [{ type: "ask", what: "book a call about a partnership" }] },
      m_pitch2: { person: true, needsAnswer: true, again: true, facts: [{ type: "ask", what: "book a call via the link" }] },
      m_ask: { person: true, needsAnswer: true, facts: [{ type: "ask", what: "which release has the export fix" }] },
      m_news: none,
      m_promo: none,
      m_rcpt: { person: false, needsAnswer: false, facts: [{ type: "payment", name: "Linear", amount: "$8.00" }] },
    },
  };
  const later: Later[] = [
    // 1: the colleague's weekly report names the talk on Friday (it mentions it; it doesn't confirm it).
    {
      at: "2026-11-18T18:00:00+08:00",
      mail: { id: "m_weekly", threadId: "t_weekly", from: "Lina Zhou <lina@example.org>", to: [ME], subject: "本周周报 W47", snippet: "下周安排：周五（11/20）Wey 去北京 AGI Bar 做分享；周一评审 Q4 路线图。", date: "" },
      triage: { person: true, needsAnswer: false, facts: [{ type: "plan", name: "AGI Bar 北京分享", day: "2026-11-20", place: "北京" }] },
    },
    // 3: the quota at 95%, with neither what is left nor when it resets.
    {
      at: "2026-11-18T21:00:00+08:00",
      mail: { id: "m_quota", threadId: "t_quota", from: "Lumen Cloud <noreply@lumen.example.net>", to: [ME], subject: "流量包使用已达 95%", snippet: "您的「CDN 流量包」本月已使用 95%。超出后将按量计费。", date: "", labelIds: ["CATEGORY_UPDATES"] },
      triage: { person: false, needsAnswer: false, facts: [{ type: "billing", what: "near_limit", name: "Lumen Cloud CDN 流量包", used: "95%" }] },
    },
  ];
  // The person's own words (the negative: only against their own calendar).
  const said: Said[] = [{ at: "2026-11-18T09:30:00+08:00", text: "我周六去西湖音乐节，晚上回来。" }];
  return { fx, later, said };
}

/** What a good partner says by itself over the run (kind, words it must contain, by when), and what it never says. */
export const AHA_SAY: { kind: string; contains: string[]; by: string; case: string }[] = [
  { case: "agibar-contradiction", kind: "mismatch", contains: ["AGI Bar", "11/21", "11/20"], by: "2026-11-19T08:30:00+08:00" },
  { case: "agibar-fill", kind: "update", contains: ["补上", "19:00", "开门"], by: "2026-11-19T12:00:00+08:00" },
  { case: "quota-95", kind: "deadline", contains: ["95%", "没写"], by: "2026-11-19T08:30:00+08:00" },
  { case: "domain-renewal", kind: "deadline", contains: ["ducter-demo.example"], by: "2026-11-19T08:30:00+08:00" },
  { case: "flight-hotel", kind: "mismatch", contains: ["CA929"], by: "2026-11-20T08:30:00+08:00" },
  { case: "colleague-waiting", kind: "waiting_on_you", contains: ["Mia"], by: "2026-11-20T08:30:00+08:00" },
];
/** Never said: the agreeing meetup, the person's own words against their own calendar, the noise. */
export const AHA_NEVER = ["Rust", "西湖", "AI Weekly", "40%", "Linear", "Dana"];
