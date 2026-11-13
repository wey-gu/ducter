// D243 (research/81): the day dots spoke four times and Ducter said nothing, rebuilt as synthetic
// mail and calendar (no real mail: every company, person and address is made up, example.com).
// What dots said on 2026-11-12/13: a billing change starting on the 15th; a flight on Saturday
// (when, terminal, when to be at the airport); a correction to a shutdown it had mentioned; two
// production database maintenance windows on the flight's day. What Ducter found when asked:
// an early user stuck in onboarding, a production stats job failing again and again, an office
// carpet cleaning. And the usual noise: a newsletter, marketing, a CI run failing on a branch, a
// receipt, a usage digest.
//
// The person lives in Asia/Shanghai here (the rig's zone). The run starts Wednesday 2026-11-11
// 07:00; `later` mail arrives at its `at` during the run. Each mail comes with what a cheap model
// would say of it (recorded, so the test never calls a model).
import type { FakeEvent, FakeMail, Fixture, Triaged } from "./inbox.ts";
import { ME } from "./inbox.ts";

export const DOTS_START = Date.parse("2026-11-11T07:00:00+08:00");
const T = (s: string) => new Date(Date.parse(s)).toISOString();
const none: Triaged = { person: false, needsAnswer: false, facts: [] };

export interface Later {
  at: string;
  mail: FakeMail;
  triage: Triaged;
}

export function dotsDay(): { fx: Fixture; later: Later[] } {
  const fx: Fixture = {
    mail: [
      // The booking, from a no-reply sender in Updates: stage 1 used to leave it out.
      {
        id: "m_book",
        threadId: "t_book",
        from: "ANA <noreply@ana.example.jp>",
        to: [ME],
        subject: "Your booking is confirmed: NH 920 Shanghai – Tokyo, 14 Nov",
        snippet: "NH 920 departs Shanghai Pudong Terminal 2 at 19:40 on Sat 14 Nov 2026 and arrives Tokyo Haneda at 23:30 local time. Booking reference ABC123.",
        date: T("2026-11-01T10:00:00+08:00"),
        labelIds: ["CATEGORY_UPDATES"],
      },
      // A tool the person uses announces a shutdown (a list mail).
      {
        id: "m_cond1",
        threadId: "t_cond1",
        from: "Conductor <hello@conductor.example.com>",
        to: [ME],
        subject: "Conductor is shutting down on December 1",
        snippet: "We have decided to shut down Conductor on December 1, 2026. Export your workspaces before then.",
        date: T("2026-11-10T18:00:00+08:00"),
        listUnsubscribe: true,
      },
      // An early user, a real person, stuck and waiting.
      {
        id: "m_user",
        threadId: "t_user",
        from: "Mia Chen <mia@example.org>",
        to: [ME],
        subject: "Stuck at the second onboarding step",
        snippet: "Hi, I installed Ducter yesterday and I'm stuck at the second onboarding step: the accounts page keeps spinning. What should I do?",
        date: T("2026-11-09T21:00:00+08:00"),
      },
      // The office: a building's routine notice, on the day of the flight.
      {
        id: "m_wework",
        threadId: "t_wework",
        from: "WeWork <community@wework.example.com>",
        to: [ME],
        subject: "Scheduled maintenance: carpet cleaning on Saturday",
        snippet: "Carpets on floor 7 will be cleaned on Saturday 14 Nov from 09:00 to 12:00.",
        date: T("2026-11-10T09:00:00+08:00"),
        listUnsubscribe: true,
      },
      // Noise.
      { id: "m_news", from: "AI Weekly <newsletter@aiweekly.example.com>", to: [ME], subject: "This week in AI: the agent wars", snippet: "This week: …", date: T("2026-11-10T21:00:00+08:00"), listUnsubscribe: true },
      { id: "m_promo", from: "Shop <deals@shop.example.com>", to: [ME], subject: "Singles' Day: 50% off everything", snippet: "Don't miss out", date: T("2026-11-10T22:00:00+08:00"), labelIds: ["CATEGORY_PROMOTIONS"] },
      { id: "m_ci", threadId: "t_ci", from: "GitHub <notifications@github.example.com>", to: [ME], subject: "Run failed: CI - feat/onboarding-copy (4f2a9c1)", snippet: "The CI workflow failed on branch feat/onboarding-copy.", date: T("2026-11-10T16:30:00+08:00"), labelIds: ["CATEGORY_UPDATES"] },
      { id: "m_rcpt", from: "Linear <no-reply@linear.example.app>", to: [ME], subject: "Your receipt from Linear #2219", snippet: "Amount paid $8.00", date: T("2026-11-10T22:10:00+08:00"), labelIds: ["CATEGORY_UPDATES"] },
      { id: "m_digest", from: "Vercel <notifications@vercel.example.com>", to: [ME], subject: "Your weekly usage digest", snippet: "Bandwidth 3.1 GB, builds 41.", date: T("2026-11-10T08:00:00+08:00"), labelIds: ["CATEGORY_UPDATES"] },
    ],
    events: [
      // Gmail puts the flight in the calendar from the booking mail.
      { id: "ev_flight", summary: "Flight to Tokyo (NH 920)", start: { dateTime: "2026-11-14T19:40:00+08:00" }, end: { dateTime: "2026-11-14T22:30:00+08:00" }, location: "Shanghai Pudong T2", updated: T("2026-11-01T10:01:00+08:00") } as FakeEvent & { location: string },
      { id: "ev_sync", summary: "Weekly sync", start: { dateTime: "2026-11-12T10:00:00+08:00" }, end: { dateTime: "2026-11-12T10:30:00+08:00" }, attendees: [{ email: "lina@example.org" }] },
    ],
    github: [],
    chat: [],
    triage: {
      m_book: { person: false, needsAnswer: false, facts: [{ type: "booking", what: "flight", name: "NH 920", from: "Shanghai Pudong T2", place: "Tokyo Haneda", start: "2026-11-14T19:40:00+08:00", end: "2026-11-14T23:30:00+09:00" }] },
      m_cond1: { person: false, needsAnswer: false, facts: [{ type: "service", what: "shutdown", name: "Conductor", start: "2026-12-01" }] },
      m_user: { person: true, needsAnswer: true, facts: [{ type: "ask", what: "stuck at the second onboarding step" }] },
      m_wework: { person: false, needsAnswer: false, facts: [{ type: "service", what: "maintenance", name: "WeWork carpet cleaning", start: "2026-11-14T09:00:00+08:00", end: "2026-11-14T12:00:00+08:00" }] },
      m_news: none,
      m_promo: none,
      m_ci: none,
      m_rcpt: { person: false, needsAnswer: false, facts: [{ type: "payment", name: "Linear", amount: "$8.00" }] },
      m_digest: none,
    },
  };
  const later: Later[] = [
    {
      at: "2026-11-12T19:10:00+08:00",
      mail: { id: "m_cfai", threadId: "t_cfai", from: "Cloudflare <noreply@notify.cloudflare.example.com>", to: [ME], subject: "Upcoming billing change for AI Search", snippet: "Starting November 15, AI Search instances are billed. Usage above the free tier of your plan will be charged.", date: "", labelIds: ["CATEGORY_UPDATES"] },
      triage: { person: false, needsAnswer: false, facts: [{ type: "billing", what: "starts_charging", name: "Cloudflare AI Search", on: "2026-11-15" }] },
    },
    ...["22:05", "23:05"].map((hm, i) => ({
      at: `2026-11-12T${hm}:00+08:00`,
      mail: { id: `m_st${i + 1}`, threadId: `t_st${i + 1}`, from: "GitHub <notifications@github.example.com>", to: [ME], subject: "Run failed: nightly-stats - main", snippet: "The scheduled workflow nightly-stats failed on main (production).", date: "", labelIds: ["CATEGORY_UPDATES"] },
      triage: { person: false, needsAnswer: false, facts: [{ type: "service", what: "failing", name: "nightly-stats on main", prod: true }] },
    })),
    {
      at: "2026-11-13T00:05:00+08:00",
      mail: { id: "m_st3", threadId: "t_st3", from: "GitHub <notifications@github.example.com>", to: [ME], subject: "Run failed: nightly-stats - main", snippet: "The scheduled workflow nightly-stats failed on main (production).", date: "", labelIds: ["CATEGORY_UPDATES"] },
      triage: { person: false, needsAnswer: false, facts: [{ type: "service", what: "failing", name: "nightly-stats on main", prod: true }] },
    },
    {
      at: "2026-11-13T07:20:00+08:00",
      mail: { id: "m_cond2", threadId: "t_cond2", from: "Conductor <hello@conductor.example.com>", to: [ME], subject: "Update: Conductor is staying open", snippet: "We heard you. Conductor is not shutting down; nothing changes for your workspaces.", date: "", labelIds: [] , listUnsubscribe: true },
      triage: { person: false, needsAnswer: false, facts: [{ type: "service", what: "resolved", name: "Conductor shutdown", effect: "it is staying open" }] },
    },
    {
      at: "2026-11-13T10:20:00+08:00",
      mail: { id: "m_ps", threadId: "t_ps", from: "PlanetScale <notifications@planetscale.example.com>", to: [ME], subject: "Scheduled maintenance for 2 production databases on Sat 14 Nov", snippet: "prod-db-1 13:00–13:30 and prod-db-2 15:00–15:30 (UTC+8) on 14 Nov. Restarts may drop open connections.", date: "", labelIds: ["CATEGORY_UPDATES"] },
      triage: {
        person: false,
        needsAnswer: false,
        facts: [
          { type: "service", what: "maintenance", name: "PlanetScale prod-db-1", start: "2026-11-14T13:00:00+08:00", end: "2026-11-14T13:30:00+08:00", effect: "restarts may drop connections", prod: true },
          { type: "service", what: "maintenance", name: "PlanetScale prod-db-2", start: "2026-11-14T15:00:00+08:00", end: "2026-11-14T15:30:00+08:00", effect: "restarts may drop connections", prod: true },
        ],
      },
    },
  ];
  return { fx, later };
}

/** What a good partner says on its own over the run (kind, words it must contain), and what it never says. */
export const DOTS_SAY: { kind: string; contains: string; by: string }[] = [
  { kind: "service", contains: "Conductor", by: "2026-11-11T09:00:00+08:00" },
  { kind: "update", contains: "更正", by: "2026-11-13T09:00:00+08:00" },
  { kind: "deadline", contains: "Cloudflare AI Search", by: "2026-11-14T09:00:00+08:00" },
  { kind: "coming_up", contains: "NH 920", by: "2026-11-13T15:00:00+08:00" },
  { kind: "service", contains: "PlanetScale", by: "2026-11-13T11:00:00+08:00" },
  { kind: "service", contains: "nightly-stats", by: "2026-11-13T09:00:00+08:00" },
  { kind: "waiting_on_you", contains: "Mia", by: "2026-11-12T12:00:00+08:00" },
];
/** Never said: the noise, the building's carpets. */
export const DOTS_NEVER = ["WeWork", "AI Weekly", "50%", "feat/onboarding-copy", "Linear", "digest"];
