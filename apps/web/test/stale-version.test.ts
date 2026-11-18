// A page left open across a home update (the phone app in the background) loads the home's page
// again once nothing would be lost, once per version.
import { afterAll, expect, test } from "bun:test";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";

const g = globalThis as any;
const had = { location: g.location, sessionStorage: g.sessionStorage };
let reloads = 0;
const store = new Map<string, string>();

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  A.staleFor = "";
  A.sheet = null;
  A.draft = "";
  g.location = had.location;
  g.sessionStorage = had.sessionStorage;
});

test("a welcome from a newer home reloads, after the sheet closes and the words are sent, once", async () => {
  // Set here, not at the file's top: other files in the same run set their own location and
  // sessionStorage (newtask, web, updateall), and CI ran one of them between this file's load and
  // this test (2026-11-19, 0.0.82 and 0.0.84).
  g.location = { reload: () => void reloads++ };
  g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const { A } = await import("../src/app.ts");
  // The app is one module for the whole run: another file may have left a live view, a sheet or a
  // draft behind, each of which (rightly) holds the reload.
  A.live = undefined;
  A.sheet = null;
  A.draft = "";
  A.staleFor = "";
  A.send = () => {};
  A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0, version: DUCTER_VERSION } as any);
  expect(A.staleFor).toBe("");
  A.sheet = { kind: "newtask" } as any;
  A.draft = "还没发";
  A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0, version: "9.9.9" } as any);
  expect(A.staleFor).toBe("9.9.9");
  expect(reloads).toBe(0); // a sheet is open
  A.sheet = null;
  A.reloadIfStale(); // what changed() runs; changed() may wait for a frame when another file defined requestAnimationFrame (CI, 2026-11-19)
  expect(reloads).toBe(0); // words not sent yet
  A.draft = "";
  A.reloadIfStale(); // what changed() runs; changed() may wait for a frame when another file defined requestAnimationFrame (CI, 2026-11-19)
  // If this ever fails again, say which guard held it (CI only, 2026-11-19).
  expect({ stale: A.staleFor, sheet: A.sheet, live: A.live?.id ?? null, draft: A.draft, kept: store.get("ducter.reloadedFor") ?? null, hasReload: typeof (globalThis as any).location?.reload }).toEqual({ stale: "9.9.9", sheet: null, live: null, draft: "", kept: "9.9.9", hasReload: "function" });
  expect(reloads).toBe(1);
  A.reloadIfStale(); // what changed() runs; changed() may wait for a frame when another file defined requestAnimationFrame (CI, 2026-11-19)
  expect(reloads).toBe(1); // once per version
});
