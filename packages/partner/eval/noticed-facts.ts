// D243 (research/81): the facts Ducter noted by itself on the day dots spoke four times, dated
// around now, for the partner eval's "anything worth telling me?" scenarios. Synthetic: every
// company, person and address is made up. Written as findings.json before the home starts.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const H = 3_600_000;

/** Tomorrow at hh:mm in this machine's zone. */
function tomorrowAt(hh: number, mm: number, now = Date.now()): Date {
  const d = new Date(now + 24 * H);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function writeDotsFacts(dataDir: string, now = Date.now()) {
  const iso = (d: Date | number) => new Date(d).toISOString();
  const ref = (id: string, service = "gmail") => ({ connectionId: "conn_oo", service, account: "wey@example.com", id });
  const fly = tomorrowAt(19, 40, now);
  const facts = [
    { id: "f_book", ref: ref("m_book"), label: "ANA · Your booking is confirmed: NH 920", at: iso(now - 12 * 24 * H), date: iso(fly), type: "booking", what: "flight", name: "NH 920", from: "Shanghai Pudong T2", place: "Tokyo Haneda", start: iso(fly), end: iso(fly.getTime() + 2.8 * H) },
    { id: "f_ps1", ref: ref("m_ps"), label: "PlanetScale · Scheduled maintenance for 2 production databases", at: iso(now - 1 * H), date: iso(tomorrowAt(13, 30, now)), type: "service", what: "maintenance", name: "PlanetScale prod-db-1", start: iso(tomorrowAt(13, 0, now)), end: iso(tomorrowAt(13, 30, now)), effect: "restarts may drop connections", prod: true },
    { id: "f_ps2", ref: ref("m_ps"), label: "PlanetScale · Scheduled maintenance for 2 production databases", at: iso(now - 1 * H), date: iso(tomorrowAt(15, 30, now)), type: "service", what: "maintenance", name: "PlanetScale prod-db-2", start: iso(tomorrowAt(15, 0, now)), end: iso(tomorrowAt(15, 30, now)), effect: "restarts may drop connections", prod: true },
    { id: "f_cf", ref: ref("m_cfai"), label: "Cloudflare · Upcoming billing change for AI Search", at: iso(now - 15 * H), date: iso(now + 2 * 24 * H), type: "billing", what: "starts_charging", name: "Cloudflare AI Search", on: iso(now + 2 * 24 * H) },
    ...[10, 9, 8].map((h, i) => ({ id: `f_st${i}`, ref: ref(`m_st${i}`), label: "GitHub · Run failed: nightly-stats - main", at: iso(now - h * H), date: iso(now - h * H), type: "service", what: "failing", name: "nightly-stats on main", prod: true })),
    { id: "f_mia", ref: { ...ref("m_user"), thread: "t_user" }, label: "Mia Chen · Stuck at the second onboarding step", at: iso(now - 3 * 24 * H), date: iso(now - 3 * 24 * H), type: "ask_in", from: "mia@example.org", name: "Mia Chen", what: "stuck at the second onboarding step", person: true },
    { id: "f_ww", ref: ref("m_wework"), label: "WeWork · Scheduled maintenance: carpet cleaning", at: iso(now - 30 * H), date: iso(tomorrowAt(12, 0, now)), type: "service", what: "maintenance", name: "WeWork carpet cleaning", start: iso(tomorrowAt(9, 0, now)), end: iso(tomorrowAt(12, 0, now)) },
  ];
  writeFileSync(join(dataDir, "findings.json"), JSON.stringify({ facts }), { mode: 0o600 });
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ proactive: "urgent" }), { mode: 0o600 });
}
