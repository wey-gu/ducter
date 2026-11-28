// D646: Mem's state is never a dead end. One table (mem-view.ts) gives every state its
// Overview line, its pane line and at most one action; Overview, Memory and Agent messaging read it
// the same. Refusals keep the persona's name and Mem's "workspace admin" behind 详情, and a zh line
// carries no English beyond product names.
import { describe, expect, test } from "bun:test";
import type { BridgeView, MemView } from "@ducter/protocol";
import { memNeeds, memStateView } from "../src/mem-view.ts";
import { strings, TABLES } from "../src/i18n.ts";

const b = (x: Partial<BridgeView> = {}): BridgeView => ({ state: "connected", identity: "ducter", home: "hel", ...x });
const mem = (issue?: string, fresh = false): MemView => ({ state: "connected", health: issue ? { issue, ...(fresh ? { fresh: true as const } : {}) } : {}, noted: [] });
const REASONS = ["authority_missing", "custody_birth_missing", "lifetime_inactive", "attachment_mismatch", "control_denied", "revoked", "conflict", "unavailable", "unknown", "policy_invalid"] as const;
const ACTIONS = ["sign_in", "open_mem", "check_again", "update", "retry"];

type Case = { name: string; m?: MemView; v: BridgeView; state: string; action: string; args?: string[] };

const CASES: Case[] = [
  { name: "signed out", m: mem("signed_out"), v: b(), state: "signed_out", action: "sign_in" },
  { name: "closed, the home can open it", v: b({ state: "mem_closed", canOpen: true }), state: "closed", action: "open_mem" },
  { name: "closed, elsewhere", v: b({ state: "mem_closed" }), state: "closed", action: "none" },
  { name: "out of reach", m: mem("unreachable"), v: b(), state: "unreachable", action: "check_again" },
  { name: "old, Ducter can update it", m: mem("old"), v: b({ canRun: true }), state: "old", action: "update" },
  { name: "old, only its computer can", m: mem("old"), v: b(), state: "old_elsewhere", action: "none" },
  { name: "local Mem", v: b({ state: "local_mem" }), state: "local_mem", action: "retry" },
  { name: "no Space", v: b({ state: "no_space" }), state: "no_space", action: "check_again" },
  { name: "failed", v: b({ state: "failed", detail: "timed out" }), state: "failed", action: "retry", args: ["mem"] },
  { name: "unconfirmed", v: b({ state: "unconfirmed" }), state: "unconfirmed", action: "retry" },
  ...REASONS.map((reason) => ({ name: `refused ${reason}`, v: b({ state: "refused", reason }), state: "refused", action: reason === "lifetime_inactive" || reason === "conflict" || reason === "policy_invalid" ? "none" : "retry" })),
];

const words = (x: { key: string; args: string[] }, lang: "zh" | "en") => strings(lang).t(x.key, ...x.args);

describe("Mem's states, one table (D646)", () => {
  test("every state has a line, an Overview line and at most one action", () => {
    for (const c of CASES) {
      const v = memStateView(c.m, c.v, "hel", c.args?.[0] ?? "");
      expect(v, c.name).toBeDefined();
      expect([c.name, v!.state], c.name).toEqual([c.name, c.state]);
      if (v!.action === "none") expect([c.name, v!.act], c.name).toEqual([c.name, ""]);
      else {
        expect([c.name, ACTIONS.includes(v!.action)], c.name).toEqual([c.name, true]);
        expect([c.name, v!.act.length > 0], c.name).toEqual([c.name, true]);
      }
      for (const lang of ["zh", "en"] as const) {
        for (const w of [v!.title, v!.line, v!.overview, v!.need]) {
          const text = words(w, lang);
          expect([c.name, lang, w.key, text.includes("%!")], `${c.name} ${lang} ${w.key}`).toEqual([c.name, lang, w.key, false]);
          expect([c.name, lang, text === w.key], `${c.name} ${lang} ${w.key}`).toEqual([c.name, lang, false]);
        }
      }
    }
  });

  test("nothing wrong, a first sign-in, or a plugin offer is not a problem", () => {
    expect(memStateView(mem(), b(), "hel")).toBeUndefined();
    expect(memStateView(undefined, b({ state: "sign_in" }), "hel")).toBeUndefined();
    expect(memStateView(undefined, b({ state: "install_mem" }), "hel")).toBeUndefined();
    expect(memStateView(mem("plugin"), b(), "hel")).toBeUndefined();
    // A Mem never signed in is a setup step, never a lapsed sign-in.
    expect(memStateView(mem("signed_out", true), b({ state: "sign_in" }), "hel")).toBeUndefined();
  });

  test("a refusal's name and Mem's admin are behind 详情, never in the lines", () => {
    for (const reason of REASONS) {
      const v = memStateView(mem(), b({ state: "refused", reason }), "hel")!;
      expect(v.fact, reason).toBeDefined();
      for (const lang of ["zh", "en"] as const) {
        for (const w of [v.title, v.line, v.overview, v.need]) {
          const text = words(w, lang);
          // policy_invalid is about the workspace's own setting, which the line must name; it still
          // never names the persona's identity or Mem's administrator.
          const names = reason === "policy_invalid" ? /ducter|管理员|admin|owner/i.test(text) : /ducter|管理员|admin|workspace|owner/i.test(text);
          expect([reason, lang, names], `${reason} ${lang} ${w.key}`).toEqual([reason, lang, false]);
        }
        expect([reason, lang, words(v.fact!, lang).includes("ducter")]).toEqual([reason, lang, true]);
      }
    }
  });

  test("Overview's needs: one per state, to the pane with its fix", () => {
    for (const c of CASES) {
      const v = memStateView(c.m, c.v, "hel", c.args?.[0] ?? "")!;
      expect(memNeeds(c.m, c.v, "hel"), c.name).toEqual([v.need]);
      expect([c.name, v.need.page === (c.state === "local_mem" || c.state === "no_space" || c.state === "refused" || c.state === "failed" || c.state === "unconfirmed" ? "peers" : "memory")], c.name).toEqual([c.name, true]);
    }
  });

  test("a zh state line carries no English beyond product names", () => {
    // Product names (and Mem's own command) may stay; "agent" is Ducter's glossary word.
    const allowed = new Set(["Nowledge", "Mem", "Ducter", "nmem", "agent"]);
    for (const c of CASES) {
      const v = memStateView(c.m, c.v, "hel", c.args?.[0] ?? "")!;
      for (const w of [v.title, v.line, v.overview, v.need, ...(v.fact ? [v.fact] : [])]) {
        const text = (TABLES.zh[w.key] ?? "").replace(/%\[?\d*\]?[a-z]/g, "");
        for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9.+#-]*/g)) expect([c.name, w.key, m[0], allowed.has(m[0])]).toEqual([c.name, w.key, m[0], true]);
      }
    }
  });
});

describe("Overview says the same states (D646)", () => {
  test("the 记得 line and the one need, for every state", async () => {
    const { A } = await import("../src/app.ts");
    const h = await import("../src/settings-home.tsx");
    A.L = strings("zh");
    A.send = () => {};
    A.S.welcomed = true;
    A.S.personaName = "Duckie";
    A.settings = { name: "Duckie", memory: true, peers: { reach: "own", trusted: [], muted: [] } } as never;
    A.agents = [{ harness: "codex", installed: true, loggedIn: true, canBePartner: true }] as never;
    A.brainNow = { harness: "codex", model: "x", models: [{ id: "x", label: "X", default: true }] } as never;
    A.devices = [{ id: "local", name: "hel", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [] }] as never;
    A.connections = [] as never;
    A.updateAll = undefined;
    for (const c of CASES) {
      A.mem = c.m as never;
      A.bridge = c.v as never;
      const v = memStateView(c.m, c.v, "hel", c.args?.[0] ?? "")!;
      const needs = h.setNeeds().filter((n) => n.key.startsWith("need.mem."));
      expect([c.name, needs.map((n) => n.key)]).toEqual([c.name, [v.need.key]]);
      expect([c.name, needs[0]!.page]).toEqual([c.name, v.need.page]);
      expect([c.name, needs[0]!.go]).toEqual([c.name, strings("zh").t(v.need.key === "need.mem.signed_out" ? "need.go.signin" : "need.go.look")]);
      const line = h.homeLines().find((l) => l.key === "mem");
      expect([c.name, line?.text]).toEqual([c.name, strings("zh").t(v.overview.key, ...v.overview.args)]);
      // Mem closed is never said as 「还没连上」.
      expect([c.name, line?.text === strings("zh").t("home.mem.none")]).toEqual([c.name, false]);
    }
  });
});
