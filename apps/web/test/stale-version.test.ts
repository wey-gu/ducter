// A page left open across a home update (the phone app in the background) loads the home's page
// again once nothing would be lost, once per version.
import { afterAll, expect, test } from "bun:test";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";

const g = globalThis as any;
const had = { location: g.location, sessionStorage: g.sessionStorage };
let reloads = 0;
const store = new Map<string, string>();
g.location = { reload: () => void reloads++ };
g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  A.staleFor = "";
  A.sheet = null;
  A.draft = "";
  g.location = had.location;
  g.sessionStorage = had.sessionStorage;
});

test("a welcome from a newer home reloads, after the sheet closes and the words are sent, once", async () => {
  const { A } = await import("../src/app.ts");
  A.send = () => {};
  A.receive({ t: "welcome", persona: "p", personaName: "Ducter", headSeq: 0, version: DUCTER_VERSION } as any);
  expect(A.staleFor).toBe("");
  A.sheet = { kind: "newtask" } as any;
  A.draft = "还没发";
  A.receive({ t: "welcome", persona: "p", personaName: "Ducter", headSeq: 0, version: "9.9.9" } as any);
  expect(A.staleFor).toBe("9.9.9");
  expect(reloads).toBe(0); // a sheet is open
  A.sheet = null;
  A.changed();
  expect(reloads).toBe(0); // words not sent yet
  A.draft = "";
  A.changed();
  expect(reloads).toBe(1);
  A.changed();
  expect(reloads).toBe(1); // once per version
});
