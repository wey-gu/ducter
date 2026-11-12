// D233: 密钥 / Keys in Autofill's store: kept encrypted with everything else, never a value in a
// view (a known head at most, D152), one value per variable, grants per task (a kept key by id,
// a once value only in its grant), every value in the scrub lists, the switch, remove.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileKey } from "../src/saved/key.ts";
import { checkEnv, keyHint, openSaved, scrub } from "../src/saved/store.ts";
import { tempDir } from "./helpers.ts";

const DO = "dop_v1_3f9a1c2b7e8d4f60a1b2c3d4e5f60718293a4b5c6d7e8f9";
const PLAIN = "Zq8vT2mLw9xR4kPj";
const open = (dir: string) => openSaved({ dataDir: dir, persona: "default", key: fileKey(join(dir, "saved")) });

describe("密钥 / Keys", () => {
  test("kept encrypted; a view shows the name, the variable and a head at most", () => {
    const td = tempDir();
    try {
      const s = open(td.dir);
      const v = s.put({ kind: "key", name: "DigitalOcean deploy token", env: "DO_TOKEN", value: `  ${DO}\n` }) as { id: string; hint?: string; env: string };
      expect(v.env).toBe("DO_TOKEN");
      expect(v.hint).toBe("dop_v1_••••••");
      s.put({ kind: "key", name: "Plain one", env: "PLAIN_KEY", value: PLAIN });
      const view = s.view();
      expect(view.keys.map((k) => k.env)).toEqual(["DO_TOKEN", "PLAIN_KEY"]);
      expect(view.keys[1]!.hint).toBeUndefined(); // the client says only "kept"
      expect(JSON.stringify(view)).not.toContain(DO);
      expect(JSON.stringify(view)).not.toContain(PLAIN);
      expect(readFileSync(join(td.dir, "saved", "default.enc"), "utf8")).not.toContain("DO_TOKEN");
      // A fresh store reads it back (the value trimmed of what pasting added).
      const again = open(td.dir);
      expect(again.keyFor("DO_TOKEN")?.name).toBe("DigitalOcean deploy token");
      again.grant({ taskId: "t1", env: "DO_TOKEN", keyId: v.id, name: "DigitalOcean deploy token" });
      expect(again.grantsFor("t1")).toEqual([{ env: "DO_TOKEN", value: DO }]);
    } finally {
      td.cleanup();
    }
  });

  test("one value per variable: saving the same env again replaces it; empty keeps it", () => {
    const td = tempDir();
    try {
      const s = open(td.dir);
      const a = s.put({ kind: "key", name: "Old", env: "API_TOKEN", value: "first-value-123456" }) as { id: string };
      const b = s.put({ kind: "key", name: "New name", env: "API_TOKEN", value: "second-value-654321" }) as { id: string };
      expect(b.id).toBe(a.id);
      s.put({ kind: "key", id: a.id, name: "Renamed", env: "API_TOKEN" });
      s.grant({ taskId: "t1", env: "API_TOKEN", keyId: a.id, name: "Renamed" });
      expect(s.grantsFor("t1")[0]!.value).toBe("second-value-654321");
      expect(s.view().keys).toHaveLength(1);
      expect(s.view().keys[0]!.name).toBe("Renamed");
    } finally {
      td.cleanup();
    }
  });

  test("variable names: capitals only, and never one that changes how a shell starts", () => {
    expect(checkEnv("DO_TOKEN")).toBe("DO_TOKEN");
    for (const bad of ["do_token", "1TOKEN", "A-B", "", "PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS", "BASH_ENV", "DUCTER_PORT", "NMEM_AGENT_ID"]) expect(() => checkEnv(bad)).toThrow();
    const td = tempDir();
    try {
      expect(() => open(td.dir).put({ kind: "key", name: "x", env: "PATH", value: "nope-nope-nope" })).toThrow();
      expect(() => open(td.dir).put({ kind: "key", name: "x", env: "MULTI", value: "line-one\nline-two" })).toThrow();
    } finally {
      td.cleanup();
    }
  });

  test("just this once: the value lives in the task's grant only, and goes when the task ends", () => {
    const td = tempDir();
    try {
      const s = open(td.dir);
      s.grant({ taskId: "t9", env: "STRIPE_KEY", value: "sk_live_onceonlyvalue123", name: "Stripe key", task: "Ship the shop" });
      expect(s.view().keys).toHaveLength(0);
      expect(s.keyFor("STRIPE_KEY")).toBeUndefined();
      expect(s.grantsFor("t9")).toEqual([{ env: "STRIPE_KEY", value: "sk_live_onceonlyvalue123" }]);
      expect(s.keyValues()).toContain("sk_live_onceonlyvalue123");
      expect(s.scrubList()).toContain("sk_live_onceonlyvalue123");
      const use = s.view().uses[0]!;
      expect(use).toMatchObject({ handle: "key:STRIPE_KEY", what: "given", once: true, task: "Ship the shop" });
      expect(JSON.stringify(s.view())).not.toContain("onceonlyvalue");
      s.endGrants("t9");
      expect(s.grantsFor("t9")).toEqual([]);
      expect(s.keyValues()).not.toContain("sk_live_onceonlyvalue123");
      expect(s.grantedTasks()).toEqual([]);
    } finally {
      td.cleanup();
    }
  });

  test("remove: the key and every task's hold on it go at once; its history stays", () => {
    const td = tempDir();
    try {
      const s = open(td.dir);
      const k = s.put({ kind: "key", name: "Deploy", env: "DEPLOY_PAT", value: "ghp_abcdefghijklmnop1234" }) as { id: string };
      s.grant({ taskId: "t1", env: "DEPLOY_PAT", keyId: k.id, name: "Deploy" });
      s.remove(k.id);
      expect(s.view().keys).toHaveLength(0);
      expect(s.grantsFor("t1")).toEqual([]);
      expect(s.keyValues()).toEqual([]);
      expect(s.view().uses).toHaveLength(1);
    } finally {
      td.cleanup();
    }
  });

  test("the switch: on unless turned off", () => {
    const td = tempDir();
    try {
      const s = open(td.dir);
      expect(s.askKeys()).toBe(true);
      expect(s.view().askKeys).toBe(true);
      s.setAskKeys(false);
      expect(open(td.dir).askKeys()).toBe(false);
      s.setAskKeys(true);
      expect(open(td.dir).view().askKeys).toBe(true);
    } finally {
      td.cleanup();
    }
  });

  test("a hint only for a known head; scrub hides the value", () => {
    expect(keyHint(DO)).toBe("dop_v1_••••••");
    expect(keyHint("ghp_abcdefghijklmnop1234")).toBe("ghp_••••••");
    expect(keyHint(PLAIN)).toBeUndefined();
    expect(scrub(`token is ${PLAIN}.`, [PLAIN])).toBe("token is ••••••.");
  });
});
