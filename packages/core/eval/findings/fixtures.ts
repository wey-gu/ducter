// D502: the cross-source findings eval's ledgers. Each is a home's open facts as the triage would
// have noted them (types, dates, places, names, labels; never a body), invented but plausible, on
// 2026-11-24 in Asia/Shanghai. Three groups:
//   t-*  true conflicts: the motivation's two stories in their detector shape, and their variants (a few
//        a detector has too: a wrong day, a meeting in the air; most none: a wrong city, two hotels one night, a plan
//        while away, a changed flight that strands a hotel, a card that can't pay, a passport
//        against a trip, a renewal of something shutting down, two plans at one time)
//   f-*  look-alikes that are fine (a red-eye, a late landing that is covered, a two-city trip …)
//   n-*  noise only
// Each fixture also carries a few everyday facts (a receipt, a usage line, a meeting this week) so
// no ledger is only its story. `expect` names the facts a finding must cite: all of `all`, and one
// of `any` when given. Ids are opaque (a hash of the fixture and the name), so a name can't hint.
import { createHash } from "node:crypto";
import type { Fact } from "../../src/proactive/ledger.ts";

export const TODAY = "2026-11-24";
export const ZONE = "Asia/Shanghai";
export const NOW = Date.parse("2026-11-24T09:00:00+08:00");

export interface Expect {
  all: string[];
  any?: string[];
  what: string;
}

export interface Fixture {
  id: string;
  note: string;
  facts: Fact[];
  expect: Expect[];
}

type Typed = Fact extends infer F ? (F extends Fact ? Omit<F, "id" | "ref" | "date" | "at" | "label"> : never) : never;
interface Spec {
  name: string;
  label: string;
  sender?: string;
  at?: string;
  service?: string;
  fact: Typed;
}

const idOf = (fx: string, name: string) => `f_${createHash("sha256").update(`${fx}/${name}`).digest("hex").slice(0, 10)}`;

function dateOf(f: Typed, at: string): string {
  switch (f.type) {
    case "booking":
      return f.end ?? f.start;
    case "renewal":
      return f.due;
    case "commitment":
      return f.by;
    case "change":
      return f.on;
    case "meeting":
      return f.end ?? f.start;
    case "service":
      return f.end ?? f.start ?? at;
    case "billing":
      return f.on;
    case "plan":
      return f.day;
    default:
      return at;
  }
}

function build(fx: string, specs: Spec[]): { facts: Fact[]; id: (name: string) => string } {
  const facts = specs.map((s) => {
    const at = s.at ?? "2026-11-20T10:00:00+08:00";
    const service = s.service ?? (s.fact.type === "meeting" || (s.fact.type === "plan" && s.fact.src === "calendar") ? "google_calendar" : "gmail");
    return { id: idOf(fx, s.name), ref: { connectionId: "conn_home", service, id: `m_${idOf(fx, s.name).slice(2, 8)}` }, label: s.label, ...(s.sender ? { sender: s.sender } : {}), at, date: dateOf(s.fact, at), ...s.fact } as Fact;
  });
  return { facts, id: (name) => idOf(fx, name) };
}

/** The everyday facts every home has this week (nothing in them meets a trip). */
const everyday = (): Spec[] => [
  { name: "e-coffee", label: "Your receipt from Manner Coffee", sender: "Manner", at: "2026-11-23T08:40:00+08:00", fact: { type: "payment", name: "Manner Coffee", amount: "¥22" } },
  { name: "e-github", label: "[GitHub] Payment receipt for wey-gu", sender: "GitHub", at: "2026-11-21T03:12:00+08:00", fact: { type: "payment", name: "GitHub Pro", amount: "$4.00" } },
  { name: "e-standup", label: "Weekly sync: Nowledge", fact: { type: "meeting", title: "Weekly sync: Nowledge", start: "2026-11-25T10:00:00+08:00", end: "2026-11-25T10:30:00+08:00", with: ["Weizhen", "Lin"] } },
  { name: "e-openai", label: "You've used 82% of your monthly API budget", sender: "OpenAI", at: "2026-11-23T22:00:00+08:00", fact: { type: "billing", what: "near_limit", name: "OpenAI API", on: "2026-11-30", used: "82%", resets: "2026-12-01" } },
];

function fx(id: string, note: string, specs: Spec[], expect: (id: (n: string) => string) => Expect[]): Fixture {
  const b = build(id, [...specs, ...everyday()]);
  return { id, note, facts: b.facts, expect: expect(b.id) };
}

export function fixtures(): Fixture[] {
  return [
    // ---------- true conflicts ----------
    fx(
      "t-story-late-flight",
      "The motivation's story in the detector's shape: lands 21:40 in Tokyo, the hotel starts the next day.",
      [
        { name: "fl", label: "Your e-ticket receipt: Shanghai to Tokyo", sender: "ANA", fact: { type: "booking", what: "flight", name: "NH 920", from: "PVG", place: "Tokyo Haneda", start: "2026-12-03T17:35:00+08:00", end: "2026-12-03T21:40:00+09:00" } },
        { name: "ht", label: "Booking confirmed: Hotel Gracery Shinjuku", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Hotel Gracery Shinjuku", place: "Tokyo", start: "2026-12-04", end: "2026-12-07" } },
      ],
      (i) => [{ all: [i("fl"), i("ht")], what: "no hotel the night of 12/3" }],
    ),
    fx(
      "t-wrong-day",
      "Lands at 14:20 on 12/3, the hotel is booked from 12/4: a whole night uncovered, but not after 18:00.",
      [
        { name: "fl", label: "Flight confirmation MU523 Shanghai–Osaka", sender: "China Eastern", fact: { type: "booking", what: "flight", name: "MU 523", from: "PVG", place: "Osaka Kansai", start: "2026-12-03T10:50:00+08:00", end: "2026-12-03T14:20:00+09:00" } },
        { name: "ht", label: "Your reservation at Cross Hotel Osaka", sender: "Agoda", fact: { type: "booking", what: "hotel", name: "Cross Hotel Osaka", place: "Osaka", start: "2026-12-04", end: "2026-12-07" } },
        { name: "back", label: "Flight confirmation MU516 Osaka–Shanghai", sender: "China Eastern", fact: { type: "booking", what: "flight", name: "MU 516", from: "KIX", place: "Shanghai Pudong", start: "2026-12-07T12:30:00+09:00", end: "2026-12-07T14:10:00+08:00" } },
      ],
      (i) => [{ all: [i("fl"), i("ht")], what: "arrives a day before the hotel" }],
    ),
    fx(
      "t-wrong-city",
      "Flies into Osaka, the hotel for that night is in Tokyo.",
      [
        { name: "fl", label: "Your trip to Osaka: booking reference K7QX2M", sender: "Trip.com", fact: { type: "booking", what: "flight", name: "HO 1333", from: "PVG", place: "Osaka Kansai", start: "2026-12-10T08:05:00+08:00", end: "2026-12-10T11:30:00+09:00" } },
        { name: "ht", label: "Reservation confirmed: Shibuya Stream Excel Hotel Tokyu", sender: "Hotels.com", fact: { type: "booking", what: "hotel", name: "Shibuya Stream Excel Hotel", place: "Tokyo", start: "2026-12-10", end: "2026-12-13" } },
      ],
      (i) => [{ all: [i("fl"), i("ht")], what: "lands in Osaka, sleeps in Tokyo" }],
    ),
    fx(
      "t-two-hotels",
      "Two hotels in Singapore for the nights of 12/16 and 12/17, booked on two sites.",
      [
        { name: "fl", label: "Booking confirmed: SQ 833 to Singapore", sender: "Singapore Airlines", fact: { type: "booking", what: "flight", name: "SQ 833", from: "PVG", place: "Singapore Changi", start: "2026-12-15T09:20:00+08:00", end: "2026-12-15T14:55:00+08:00" } },
        { name: "h1", label: "Booking confirmed: Parkroyal Collection Marina Bay", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Parkroyal Collection Marina Bay", place: "Singapore", start: "2026-12-15", end: "2026-12-18" } },
        { name: "h2", label: "Your Agoda booking at Hotel G Singapore is confirmed", sender: "Agoda", at: "2026-11-22T23:10:00+08:00", fact: { type: "booking", what: "hotel", name: "Hotel G Singapore", place: "Singapore", start: "2026-12-16", end: "2026-12-19" } },
      ],
      (i) => [{ all: [i("h1"), i("h2")], what: "paying twice for two nights" }],
    ),
    fx(
      "t-meeting-in-air",
      "A customer call at 10:00 on 12/5 while the flight to San Francisco left at 09:30.",
      [
        { name: "fl", label: "Your United itinerary: Beijing to San Francisco", sender: "United Airlines", fact: { type: "booking", what: "flight", name: "UA 889", from: "PEK", place: "San Francisco", start: "2026-12-05T09:30:00+08:00", end: "2026-12-05T06:05:00-08:00" } },
        { name: "mt", label: "Q4 review: Acme × Nowledge", fact: { type: "meeting", title: "Q4 review: Acme × Nowledge", start: "2026-12-05T10:00:00+08:00", end: "2026-12-05T11:00:00+08:00", with: ["Dana (Acme)", "Weizhen"], location: "Zoom" } },
      ],
      (i) => [{ all: [i("fl"), i("mt")], what: "in the air during the review" }],
    ),
    fx(
      "t-plan-while-away",
      "A birthday dinner in Shanghai on 12/12 while the hotel and flights put them in Berlin.",
      [
        { name: "out", label: "Your booking confirmation: Shanghai to Berlin", sender: "Lufthansa", fact: { type: "booking", what: "flight", name: "LH 729", from: "PVG", place: "Berlin", start: "2026-12-10T12:10:00+08:00", end: "2026-12-10T18:25:00+01:00" } },
        { name: "ht", label: "Booking confirmed: Hotel Zoo Berlin", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Hotel Zoo Berlin", place: "Berlin", start: "2026-12-10", end: "2026-12-14" } },
        { name: "back", label: "Your booking confirmation: Berlin to Shanghai", sender: "Lufthansa", fact: { type: "booking", what: "flight", name: "LH 728", from: "BER", place: "Shanghai Pudong", start: "2026-12-14T20:40:00+01:00", end: "2026-12-15T15:05:00+08:00" } },
        { name: "pl", label: "Lena's birthday dinner", fact: { type: "plan", name: "Lena's birthday dinner", day: "2026-12-12", time: "19:00", place: "Lost Heaven, Shanghai", src: "calendar" } },
      ],
      (i) => [{ all: [i("pl")], any: [i("ht"), i("out"), i("back")], what: "a dinner in Shanghai while in Berlin" }],
    ),
    fx(
      "t-changed-flight",
      "The airline moved the flight to 12/9; the hotel still starts 12/8 (a paid night lost).",
      [
        { name: "fl", label: "Itinerary: CA 931 Beijing–Frankfurt", sender: "Air China", fact: { type: "booking", what: "flight", name: "CA 931", from: "PEK", place: "Frankfurt", start: "2026-12-08T01:50:00+08:00", end: "2026-12-08T06:10:00+01:00" } },
        { name: "ch", label: "Important: your flight CA 931 has been rescheduled", sender: "Air China", at: "2026-11-23T16:20:00+08:00", fact: { type: "change", what: "flight_changed", name: "CA 931", on: "2026-12-09" } },
        { name: "ht", label: "Your stay at Moxy Frankfurt East", sender: "Marriott Bonvoy", fact: { type: "booking", what: "hotel", name: "Moxy Frankfurt East", place: "Frankfurt", start: "2026-12-08", end: "2026-12-11" } },
      ],
      (i) => [{ all: [i("ch"), i("ht")], what: "the hotel's first night is lost" }],
    ),
    fx(
      "t-story-domain",
      "The motivation's other story: a domain on autopay whose card has expired.",
      [{ name: "rn", label: "Your domain ducter.dev renews on Nov 30", sender: "Cloudflare", fact: { type: "renewal", name: "ducter.dev", due: "2026-11-30", amount: "$12.20", autopay: true, cardExpired: true } }],
      (i) => [{ all: [i("rn")], what: "the renewal will fail" }],
    ),
    fx(
      "t-card-cant-pay",
      "The renewal is on autopay; another mail says the card it uses failed (no cardExpired flag on the renewal).",
      [
        { name: "rn", label: "Your 1Password Families membership renews soon", sender: "1Password", fact: { type: "renewal", name: "1Password Families", due: "2026-12-01", amount: "$59.88", autopay: true } },
        { name: "bf", label: "Payment failed: update your card ending 4417", sender: "1Password", at: "2026-11-22T07:30:00+08:00", fact: { type: "billing", what: "payment_failed", name: "1Password Families", on: "2026-11-22", amount: "$59.88" } },
      ],
      (i) => [{ all: [i("rn"), i("bf")], what: "the renewal will fail again" }],
    ),
    fx(
      "t-passport",
      "The passport expires on 12/20, the trip to Bangkok is 12/18 to 12/27.",
      [
        { name: "pp", label: "Reminder: your passport expires on 20 December 2026", sender: "Exit & Entry Administration", at: "2026-11-18T09:00:00+08:00", fact: { type: "renewal", name: "Passport", due: "2026-12-20" } },
        { name: "out", label: "Booking confirmed: FD 545 Shanghai–Bangkok", sender: "AirAsia", fact: { type: "booking", what: "flight", name: "FD 545", from: "PVG", place: "Bangkok", start: "2026-12-18T21:15:00+08:00", end: "2026-12-19T00:55:00+07:00" } },
        { name: "back", label: "Booking confirmed: FD 544 Bangkok–Shanghai", sender: "AirAsia", fact: { type: "booking", what: "flight", name: "FD 544", from: "DMK", place: "Shanghai Pudong", start: "2026-12-27T14:05:00+07:00", end: "2026-12-27T19:20:00+08:00" } },
        { name: "ht", label: "Your booking at Ad Lib Bangkok", sender: "Agoda", fact: { type: "booking", what: "hotel", name: "Ad Lib Bangkok", place: "Bangkok", start: "2026-12-18", end: "2026-12-27" } },
      ],
      (i) => [{ all: [i("pp")], any: [i("out"), i("back"), i("ht")], what: "the passport expires mid-trip" }],
    ),
    fx(
      "t-renew-shutting-down",
      "An annual renewal of a service that shuts down before the year is out.",
      [
        { name: "rn", label: "Your Omnivore Premium renews on Dec 15", sender: "Omnivore", fact: { type: "renewal", name: "Omnivore Premium", due: "2026-12-15", amount: "$49.99", autopay: true } },
        { name: "sv", label: "Omnivore is shutting down", sender: "Omnivore", at: "2026-11-19T02:00:00+08:00", fact: { type: "service", what: "shutdown", name: "Omnivore", end: "2027-01-31", effect: "all data deleted after Jan 31" } },
      ],
      (i) => [{ all: [i("rn"), i("sv")], what: "paying a year for something that ends in two months" }],
    ),
    fx(
      "t-two-at-once",
      "A meetup talk at 19:00 and an investors' dinner at 19:30 the same evening, across town.",
      [
        { name: "pl", label: "Speaker confirmation: Shanghai AI Builders meetup", sender: "Meetup", fact: { type: "plan", name: "Talk at Shanghai AI Builders meetup", day: "2026-12-02", time: "19:00", place: "Xuhui, Shanghai", src: "mail" } },
        { name: "mt", label: "Dinner with Sequoia", fact: { type: "meeting", title: "Dinner with Sequoia", start: "2026-12-02T19:30:00+08:00", end: "2026-12-02T21:30:00+08:00", with: ["Alex (Sequoia)"], location: "The Bund, Shanghai" } },
      ],
      (i) => [{ all: [i("pl"), i("mt")], what: "two places at once" }],
    ),
    fx(
      "t-buried",
      "A busy month (a dozen facts) with one wrong-day hotel inside.",
      [
        { name: "fl", label: "Your trip to Chengdu", sender: "Ctrip", fact: { type: "booking", what: "flight", name: "3U 8960", from: "SHA", place: "Chengdu Tianfu", start: "2026-12-11T08:00:00+08:00", end: "2026-12-11T11:15:00+08:00" } },
        { name: "ht", label: "预订成功：成都博舍", sender: "携程", fact: { type: "booking", what: "hotel", name: "The Temple House", place: "Chengdu", start: "2026-12-12", end: "2026-12-14" } },
        { name: "back", label: "Your trip from Chengdu", sender: "Ctrip", fact: { type: "booking", what: "flight", name: "3U 8963", from: "TFU", place: "Shanghai Hongqiao", start: "2026-12-14T15:30:00+08:00", end: "2026-12-14T18:10:00+08:00" } },
        { name: "rn1", label: "Your iCloud+ plan renews Dec 3", sender: "Apple", fact: { type: "renewal", name: "iCloud+ 2TB", due: "2026-12-03", amount: "¥68", autopay: true } },
        { name: "rn2", label: "Notion Plus renews on Dec 20", sender: "Notion", fact: { type: "renewal", name: "Notion Plus", due: "2026-12-20", amount: "$96", autopay: true } },
        { name: "mt1", label: "1:1 with Lin", fact: { type: "meeting", title: "1:1 with Lin", start: "2026-11-27T15:00:00+08:00", end: "2026-11-27T15:30:00+08:00", with: ["Lin"] } },
        { name: "mt2", label: "HawDB design review", fact: { type: "meeting", title: "HawDB design review", start: "2026-12-01T14:00:00+08:00", end: "2026-12-01T15:00:00+08:00", with: ["Weizhen"] } },
        { name: "sv", label: "Scheduled maintenance: Neon us-east-2", sender: "Neon", fact: { type: "service", what: "maintenance", name: "Neon us-east-2", start: "2026-11-29T02:00:00Z", end: "2026-11-29T03:00:00Z" } },
        { name: "cm", label: "Re: the RFC draft", sender: "Weizhen", fact: { type: "commitment", to: "Weizhen", what: "send the RFC draft", by: "2026-11-28" } },
        { name: "pay", label: "Your Uber receipt", sender: "Uber", fact: { type: "payment", name: "Uber", amount: "¥64" } },
      ],
      (i) => [{ all: [i("fl"), i("ht")], what: "no hotel the night of 12/11" }],
    ),

    // ---------- look-alikes that are fine ----------
    fx(
      "f-red-eye",
      "A red-eye lands at 06:10 on 12/4 and the hotel starts 12/4: fine.",
      [
        { name: "fl", label: "Your e-ticket: Shanghai to Tokyo", sender: "Spring Airlines", fact: { type: "booking", what: "flight", name: "9C 6217", from: "PVG", place: "Tokyo Narita", start: "2026-12-04T02:05:00+08:00", end: "2026-12-04T06:10:00+09:00" } },
        { name: "ht", label: "Booking confirmed: Mitsui Garden Hotel Ginza", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Mitsui Garden Hotel Ginza", place: "Tokyo", start: "2026-12-04", end: "2026-12-08" } },
      ],
      () => [],
    ),
    fx(
      "f-late-covered",
      "Lands at 22:30 on 12/3 and the hotel starts 12/3: covered.",
      [
        { name: "fl", label: "Your e-ticket receipt: Shanghai to Tokyo", sender: "JAL", fact: { type: "booking", what: "flight", name: "JL 876", from: "PVG", place: "Tokyo Haneda", start: "2026-12-03T18:40:00+08:00", end: "2026-12-03T22:30:00+09:00" } },
        { name: "ht", label: "Booking confirmed: Hotel Allcot Ginza", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Hotel Allcot Ginza", place: "Tokyo", start: "2026-12-03", end: "2026-12-06" } },
      ],
      () => [],
    ),
    fx(
      "f-return-on-checkout",
      "The return flight leaves on the hotel's last day.",
      [
        { name: "out", label: "Flight confirmation: Shanghai to Seoul", sender: "Korean Air", fact: { type: "booking", what: "flight", name: "KE 894", from: "PVG", place: "Seoul Incheon", start: "2026-12-10T13:00:00+08:00", end: "2026-12-10T16:05:00+09:00" } },
        { name: "ht", label: "Reservation confirmed: L7 Myeongdong", sender: "Hotels.com", fact: { type: "booking", what: "hotel", name: "L7 Myeongdong", place: "Seoul", start: "2026-12-10", end: "2026-12-13" } },
        { name: "back", label: "Flight confirmation: Seoul to Shanghai", sender: "Korean Air", fact: { type: "booking", what: "flight", name: "KE 893", from: "ICN", place: "Shanghai Pudong", start: "2026-12-13T15:00:00+09:00", end: "2026-12-13T16:10:00+08:00" } },
      ],
      () => [],
    ),
    fx(
      "f-two-cities",
      "Osaka then Tokyo by train: each night has its hotel in the right city.",
      [
        { name: "fl", label: "Your trip to Osaka", sender: "Trip.com", fact: { type: "booking", what: "flight", name: "MU 515", from: "PVG", place: "Osaka Kansai", start: "2026-12-10T09:00:00+08:00", end: "2026-12-10T12:20:00+09:00" } },
        { name: "h1", label: "Your reservation at Hotel Hankyu RESPIRE Osaka", sender: "Agoda", fact: { type: "booking", what: "hotel", name: "Hotel Hankyu Respire Osaka", place: "Osaka", start: "2026-12-10", end: "2026-12-12" } },
        { name: "tr", label: "Shinkansen reservation: Shin-Osaka → Tokyo", sender: "SmartEX", fact: { type: "booking", what: "train", name: "Nozomi 22", from: "Shin-Osaka", place: "Tokyo", start: "2026-12-12T10:00:00+09:00", end: "2026-12-12T12:27:00+09:00" } },
        { name: "h2", label: "Booking confirmed: Hotel Niwa Tokyo", sender: "Booking.com", fact: { type: "booking", what: "hotel", name: "Hotel Niwa Tokyo", place: "Tokyo", start: "2026-12-12", end: "2026-12-15" } },
        { name: "back", label: "Your trip from Tokyo", sender: "Trip.com", fact: { type: "booking", what: "flight", name: "MU 524", from: "HND", place: "Shanghai Pudong", start: "2026-12-15T16:30:00+09:00", end: "2026-12-15T18:40:00+08:00" } },
      ],
      () => [],
    ),
    fx(
      "f-licence-later",
      "A driving licence renewal due in February, a trip in December: nothing meets.",
      [
        { name: "lc", label: "Your driving licence renewal is due 2027-02-01", sender: "交管12123", fact: { type: "renewal", name: "Driving licence", due: "2027-02-01" } },
        { name: "out", label: "Booking confirmed: FD 545 Shanghai–Bangkok", sender: "AirAsia", fact: { type: "booking", what: "flight", name: "FD 545", from: "PVG", place: "Bangkok", start: "2026-12-18T21:15:00+08:00", end: "2026-12-19T00:55:00+07:00" } },
        { name: "ht", label: "Your booking at Ad Lib Bangkok", sender: "Agoda", fact: { type: "booking", what: "hotel", name: "Ad Lib Bangkok", place: "Bangkok", start: "2026-12-18", end: "2026-12-23" } },
        { name: "back", label: "Booking confirmed: FD 544 Bangkok–Shanghai", sender: "AirAsia", fact: { type: "booking", what: "flight", name: "FD 544", from: "DMK", place: "Shanghai Pudong", start: "2026-12-23T14:05:00+07:00", end: "2026-12-23T19:20:00+08:00" } },
      ],
      () => [],
    ),
    fx(
      "f-autopay-fine",
      "Two renewals on autopay with nothing against them, and a paid invoice.",
      [
        { name: "rn1", label: "Your domain wey.gu renews on Dec 5", sender: "Cloudflare", fact: { type: "renewal", name: "wey.gu", due: "2026-12-05", amount: "$28.00", autopay: true } },
        { name: "rn2", label: "Your Raycast Pro subscription renews soon", sender: "Raycast", fact: { type: "renewal", name: "Raycast Pro", due: "2026-12-09", amount: "$96.00", autopay: true } },
        { name: "pay", label: "Receipt for your Cloudflare invoice", sender: "Cloudflare", fact: { type: "payment", name: "Cloudflare Workers Paid", amount: "$5.00" } },
      ],
      () => [],
    ),
    fx(
      "f-same-day-apart",
      "A morning meeting and an evening dinner in Shanghai the day before a flight: no overlap.",
      [
        { name: "mt", label: "Board prep", fact: { type: "meeting", title: "Board prep", start: "2026-12-02T10:00:00+08:00", end: "2026-12-02T11:30:00+08:00", with: ["CFO"], location: "Office" } },
        { name: "pl", label: "Dinner with Mom", fact: { type: "plan", name: "Dinner with Mom", day: "2026-12-02", time: "19:00", place: "Jing'an, Shanghai", src: "calendar" } },
        { name: "fl", label: "Booking confirmed: MU 5101 Shanghai–Beijing", sender: "China Eastern", fact: { type: "booking", what: "flight", name: "MU 5101", from: "SHA", place: "Beijing Capital", start: "2026-12-03T08:00:00+08:00", end: "2026-12-03T10:15:00+08:00" } },
        { name: "ht", label: "预订成功：北京宝格丽酒店", sender: "携程", fact: { type: "booking", what: "hotel", name: "Bulgari Hotel Beijing", place: "Beijing", start: "2026-12-03", end: "2026-12-05" } },
      ],
      () => [],
    ),

    // ---------- noise ----------
    fx(
      "n-receipts",
      "Receipts, a maintenance window, an invoice, a usage warning, a webinar: nothing conflicts.",
      [
        { name: "p1", label: "Your Meituan order receipt", sender: "美团", fact: { type: "payment", name: "Meituan", amount: "¥86" } },
        { name: "p2", label: "Your Apple receipt", sender: "Apple", fact: { type: "payment", name: "App Store", amount: "¥25" } },
        { name: "sv", label: "Scheduled maintenance: Vercel build infrastructure", sender: "Vercel", fact: { type: "service", what: "maintenance", name: "Vercel builds", start: "2026-11-28T18:00:00Z", end: "2026-11-28T19:00:00Z" } },
        { name: "bl", label: "Your AWS invoice is available", sender: "AWS", fact: { type: "billing", what: "other", name: "AWS", on: "2026-12-02", amount: "$31.40" } },
        { name: "pl", label: "Webinar: Building agents with MCP", sender: "Anthropic Events", fact: { type: "plan", name: "Webinar: Building agents with MCP", day: "2026-12-04", time: "01:00", src: "mail" } },
      ],
      () => [],
    ),
    fx(
      "n-quiet-week",
      "Only the everyday facts and a commitment due Friday.",
      [{ name: "cm", label: "Re: intro to the Mem team", sender: "Lin", fact: { type: "commitment", to: "Lin", what: "intro Lin to the Mem team", by: "2026-11-27" } }],
      () => [],
    ),
  ];
}
