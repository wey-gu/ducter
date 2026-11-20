// D410: 小应用 / Apps, the empty shelf's ideas (design/apps.md). While the person has no app, the
// shelf offers up to three things they could say for a first one: first what the home already
// knows (a trip coming up, from the bookings Ducter noted), then everyday ones. A tap sends the
// words as the person's own; nothing is made until the partner hears them.
import type { AppIdea } from "@ducter/protocol";

type Booking = { type: "booking"; what: "flight" | "hotel" | "train" | "other"; name: string; place?: string; start: string; end?: string };

const EVERYDAY: AppIdea[] = [
  { say: { zh: "做个小应用，记一下这个月的花销，按类别加总", en: "Make me an app for this month's spending, totalled by category" }, icon: "coins" },
  { say: { zh: "做个习惯打卡：每天读书、跑步、11 点后不看手机", en: "A habit tracker: reading, a run, no phone after 11" }, icon: "check" },
  { say: { zh: "做个小清单，记下这周要买的东西", en: "A little list of what to buy this week" }, icon: "list" },
];

const md = (iso: string, zone?: string) => {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", ...(zone ? { timeZone: zone } : {}) }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("month")}/${v("day")}`;
};

/** A trip's place: the booking's, else a city a hotel's or a train's name gives (北京南 → 北京). */
const placeOf = (b: Booking) => {
  let p = (b.place ?? "").trim().replace(/站$/, "").replace(/(首都|大兴|浦东|虹桥)?(国际)?机场$/, "");
  // A station's name is its city and a side: 北京南 → 北京, 上海虹桥 stays (no side to drop).
  if (b.what === "train" && [...p].length > 2) p = p.replace(/[东南西北]$/, "");
  p = p.replace(/\s+(South|North|East|West)$/i, "");
  return p.trim();
};

/**
 * Up to three ideas: a trip in the next three weeks (or under way) first, then everyday ones.
 * `facts` are the noted facts (proactive ledger); only bookings with a place are read.
 */
export function appIdeas(facts: readonly { type: string }[], now: number, zone?: string): AppIdea[] {
  const out: AppIdea[] = [];
  const trips = facts
    .filter((f): f is Booking => f.type === "booking")
    .filter((b) => b.what !== "other" && placeOf(b))
    .filter((b) => {
      const s = Date.parse(b.start);
      const e = b.end ? Date.parse(b.end) : s + 86_400_000;
      return e >= now - 86_400_000 && s <= now + 21 * 86_400_000;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const seen = new Set<string>();
  for (const b of trips) {
    const place = placeOf(b);
    if (seen.has(place) || out.length >= 1) continue;
    seen.add(place);
    const on = md(b.start, zone);
    out.push({
      say: { zh: `做个小应用，记一下这趟${place}出差的花销`, en: `Make me an app to keep my ${place} trip's costs` },
      why: { zh: `你 ${on} 去${place}`, en: `You're in ${place} from ${on}` },
      icon: "coins",
    });
  }
  for (const e of EVERYDAY) {
    if (out.length >= 3) break;
    if (out.some((x) => x.icon === e.icon)) continue;
    out.push(e);
  }
  return out.slice(0, 3);
}
