// D541's budget on the web: a partner switch shows the other partner's conversation in the frame
// it is picked in, with nothing from the link (a fake socket that answers nothing): a partner shown
// before as it was left (its draft, its place), one never shown from its peek. The hello asks only
// for what is newer; frames of the conversation left that were on their way never land in the new
// one; the bar and the composer are never made anew.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ClientFrame, LogEvent, ServerFrame } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";

const talk = (tag: string, from: number, n: number): LogEvent[] =>
  Array.from({ length: n }, (_, i) => [
    { seq: from + 2 * i, ts: new Date(Date.UTC(2026, 10, 24, 8, i)).toISOString(), persona: "default", stream: "channel", origin: "user", kind: "user_msg", body: { text: `${tag} 问 ${i}` } },
    { seq: from + 2 * i + 1, ts: new Date(Date.UTC(2026, 10, 24, 8, i)).toISOString(), persona: "default", stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `${tag} 答 ${i}`, replyTo: from + 2 * i } },
  ]).flat() as LogEvent[];

const partners = [
  { id: "default", name: "Ducter", look: "sand" },
  { id: "p2", name: "小家", look: "sage" },
  { id: "p3", name: "多比", look: "sky" },
  { id: "p4", name: "小新", look: "plum" },
];

async function rig() {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  const sent: ClientFrame[] = [];
  let hellos = 0;
  const fresh = A as unknown as { convs: Map<string, unknown>; peeked: Set<string>; switchTo?: string };
  // Another test file may have stubbed A.send on the instance: frames go through the socket here.
  delete (A as unknown as { send?: unknown }).send;
  fresh.convs = new Map();
  fresh.peeked = new Set();
  fresh.switchTo = undefined;
  A.S = new Store();
  A.L = strings("zh");
  A.partnerShown = "default";
  (A as unknown as { conn: object }).conn = { send: (f: ClientFrame) => sent.push(f), rehello: () => hellos++ };
  A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 900 } as ServerFrame);
  A.receive({ t: "partners", partners, shown: "default" } as unknown as ServerFrame);
  A.receive({ t: "events", events: talk("工作", 100, 200) } as ServerFrame);
  A.receive({ t: "on_hand", onHand: { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as unknown as ServerFrame);
  const last = () => A.rows().rows.at(-1)?.ai?.text ?? A.rows().rows.at(-1)?.user?.text;
  return { A, sent, hellos: () => hellos, last };
}

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  (A as unknown as { convs: Map<string, unknown> }).convs = new Map();
  A.partners = undefined;
  A.partnerShown = "default";
  A.S = new Store();
  A.draft = "";
  (A as unknown as { conn?: object }).conn = undefined;
});

describe("D541: a partner switch draws at once", () => {
  test("once connected, each other partner's newest stretch is asked for, once", async () => {
    const { sent } = await rig();
    const peeks = sent.filter((f) => f.t === "partner_peek") as Extract<ClientFrame, { t: "partner_peek" }>[];
    expect(peeks.map((p) => p.persona).sort()).toEqual(["p2", "p3", "p4"]);
    expect(peeks.every((p) => p.limit === 50)).toBe(true);
  });

  test("a partner never shown, from its peek, with nothing from the link; its hello asks from the peek's end", async () => {
    const { A, hellos, last } = await rig();
    A.receive({ t: "partner_peek", persona: "p3", events: talk("多比", 5000, 25), headSeq: 9000, more: true } as ServerFrame);
    expect(last()).toBe("工作 答 199"); // a peek never changes what is shown
    const h = hellos();
    A.switchPartner("p3");
    expect(hellos()).toBe(h + 1);
    expect(last()).toBe("多比 答 24");
    expect(A.S.personaName).toBe("多比");
    expect(A.S.cursor).toBe(5049); // the hello's cursor: only what is newer comes
    expect(A.S.onHand).toBeDefined(); // On hand is the person's: it never goes blank
  });

  test("a partner shown before, as it was left: its draft back, the other's left behind; late frames of the one left never land", async () => {
    const { A, last } = await rig();
    A.draft = "明早的站会";
    A.switchPartner("p2");
    expect(A.draft).toBe("");
    expect(A.rows().rows.length).toBe(0); // never shown, not peeked: nothing of another's is painted
    // The default's conversation was still sending: not 小家's.
    A.receive({ t: "events", events: talk("迟到", 2000, 1) } as ServerFrame);
    expect(A.rows().rows.length).toBe(0);
    A.receive({ t: "welcome", persona: "p2", personaName: "小家", headSeq: 3000 } as ServerFrame);
    A.receive({ t: "events", events: talk("家里", 2500, 30) } as ServerFrame);
    expect(last()).toBe("家里 答 29");
    A.draft = "周六的号";
    A.switchPartner("default");
    expect(last()).toBe("工作 答 199");
    expect(A.draft).toBe("明早的站会");
    expect(A.S.cursor).toBe(499);
    A.switchPartner("p2");
    expect(last()).toBe("家里 答 29");
    expect(A.draft).toBe("周六的号");
  });

  test("the bar and the composer stay mounted; only the messages are the partner's own", () => {
    const v = readFileSync(new URL("../src/views.tsx", import.meta.url), "utf8");
    const conv = v.slice(v.indexOf("export function Conversation()"), v.indexOf("function ConvBody()"));
    expect(conv).toContain("<Top />");
    expect(conv).toContain('<ConvBody key={A.S.persona || "shown"} />');
    expect(conv).toContain("<Composer />");
    const m = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    expect(m).not.toContain("conv:${A.S.persona");
  });
});
