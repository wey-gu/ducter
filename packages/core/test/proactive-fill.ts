// Fills a ledger from a synthetic fixture the way the engine does (stage 1, recorded triage,
// facts): shared by the detector tests and the triage-bar eval.
import { itemsOf, type Item, type Target } from "../src/proactive/items.ts";
import type { Ledger } from "../src/proactive/ledger.ts";
import { stage1 } from "../src/proactive/stage1.ts";
import { eventFact, factsOf, recordedTriage } from "../src/proactive/triage.ts";
import { ME, type Fixture } from "./fixtures/inbox.ts";

export function fixtureItems(fx: Fixture, connectionId = "conn_oo"): Item[] {
  const t = (service: string, title: string, account: string): Target => ({ connectionId, source: "oo", service, title, account, me: [account] });
  return [
    ...itemsOf(t("gmail", "Gmail", ME), "mail", { threads: fx.mail.map((m) => ({ ...m, ...(m.listUnsubscribe ? { headers: [{ name: "List-Unsubscribe", value: "<mailto:u@x>" }] } : {}) })) }),
    ...itemsOf(t("googlecalendar", "Google Calendar", ME), "event", { items: fx.events }),
    ...itemsOf(t("github", "GitHub", "wey"), "github", fx.github),
    ...itemsOf(t("discord", "Discord", "wey"), "chat", { messages: fx.chat }).filter((i) => i.mention || i.dm),
  ];
}

export async function fill(ledger: Ledger, fx: Fixture, today = "2026-11-10"): Promise<{ left: ReturnType<typeof stage1>["left"]; triaged: number }> {
  const s = stage1(fixtureItems(fx));
  ledger.add(s.events.map(eventFact).filter((f): f is NonNullable<typeof f> => Boolean(f)));
  const tri = recordedTriage(fx.triage);
  const items = [...s.pass, ...s.sent];
  const r = await tri(items, { today, zone: "Asia/Shanghai" });
  ledger.add(items.flatMap((i) => factsOf(i, r.out.find((o) => o.id === i.id))));
  return { left: s.left, triaged: items.length };
}
