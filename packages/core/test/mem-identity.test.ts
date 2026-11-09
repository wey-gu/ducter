// D141: the persona's Mem AI Identity is bound once, kept in persona.json, never taken from the
// ambient environment by surprise, and renamed (display name only) when Ducter enrolled it.
// Against a STUB nmem; nothing here reaches the user's real Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindMemIdentity, identityIdFor, nmemRunner, readMemIdentity, renameMemIdentity } from "../src/mem-identity.ts";
import { keepMemIdentity } from "../src/main.ts";
import { openSettings } from "../src/settings.ts";
import { openPushStore } from "../src/push.ts";
import { openLog } from "../src/log.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-mem-identity-"));

/** A fake nmem: logs each call's argv (one line, tab-separated), answers `agents show` from $SHOW. */
function fakeNmem(show: string, opts: { failEnroll?: boolean; enroll?: string } = {}) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(
    bin,
    `#!/bin/sh
(IFS="$(printf '\\t')"; echo "$*") >> "${dir}/calls"
case "$2 $3" in
  "agents show") echo '${show}'; case '${show}' in *not_found*) exit 1;; esac ;;
  "agents enroll") ${opts.enroll ?? (opts.failEnroll ? "echo 'boom' >&2; exit 2" : `echo '{"ok":true}'`)} ;;
  "agents set") echo '{"ok":true}' ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  const calls = () => (existsSync(join(dir, "calls")) ? readFileSync(join(dir, "calls"), "utf8").trim().split("\n").filter(Boolean).map((l) => l.split("\t")) : []);
  return { run: nmemRunner({ bin, env: { PATH: process.env.PATH } }), calls };
}

const NOT_FOUND = '{"error":"not_found","id":"ducter"}';

describe("binding the persona's identity", () => {
  test("none in Mem and none set: Ducter enrolls `ducter` with the partner's name, once, and keeps the name in persona.json", async () => {
    const dataDir = tmp();
    writeFileSync(join(dataDir, "persona.json"), JSON.stringify({ name: "小鸭", askedAt: "2026-11-09T00:00:00Z" }));
    const n = fakeNmem(NOT_FOUND);
    const mem = await bindMemIdentity({ dataDir, personaId: "default", name: "小鸭", run: n.run, env: {} });
    expect(mem).toEqual({ agentId: "ducter", owned: true });
    const enroll = n.calls().find((c) => c[1] === "agents" && c[2] === "enroll")!;
    expect(enroll.slice(0, 6)).toEqual(["--json", "agents", "enroll", "ducter", "--name", "小鸭"]);
    expect(enroll.join(" ")).toContain("--source-app ducter");
    expect(enroll).not.toContain("--default-space"); // Mem's default write Space stays the user's call
    const file = JSON.parse(readFileSync(join(dataDir, "persona.json"), "utf8"));
    expect(file).toMatchObject({ name: "小鸭", mem: { agentId: "ducter", owned: true } });
    // Every later start: read from the file, no Mem call.
    const again = await bindMemIdentity({ dataDir, personaId: "default", name: "小鸭", run: n.run, env: { NMEM_AGENT_ID: "x" } });
    expect(again).toEqual(mem!);
    expect(n.calls().length).toBe(2);
    expect(readMemIdentity(dataDir)).toEqual(mem!);
  });

  test("the user already set NMEM_AGENT_ID for Ducter: adopted with their Space, never enrolled or edited", async () => {
    const dataDir = tmp();
    const n = fakeNmem('{"id":"weyl-main","display_name":"Weyl agent","source_app":"claude-code"}');
    const mem = await bindMemIdentity({ dataDir, personaId: "default", name: "Ducter", run: n.run, env: { NMEM_AGENT_ID: "weyl-main", NMEM_SPACE: "Work" } });
    expect(mem).toEqual({ agentId: "weyl-main", owned: false, space: "Work", label: "Weyl agent" });
    expect(n.calls().map((c) => c.slice(1, 3).join(" "))).toEqual(["agents show"]);
    expect(await renameMemIdentity(n.run, mem!, "小鸭")).toBe(false);
    expect(n.calls().length).toBe(1);
  });

  test("`ducter` already in Mem (another Ducter of the same user): adopted; owned only when Ducter made it", async () => {
    const mine = fakeNmem('{"agent":{"id":"ducter","display_name":"小鸭","source_app":"ducter"}}');
    expect(await bindMemIdentity({ dataDir: tmp(), personaId: "default", name: "小鸭", run: mine.run, env: {} })).toEqual({ agentId: "ducter", owned: true });
    const theirs = fakeNmem('{"id":"ducter","display_name":"Some tool","source_app":"other"}');
    expect(await bindMemIdentity({ dataDir: tmp(), personaId: "default", name: "小鸭", run: theirs.run, env: {} })).toEqual({ agentId: "ducter", owned: false, label: "Some tool" });
    for (const n of [mine, theirs]) expect(n.calls().some((c) => c[2] === "enroll")).toBe(false);
  });

  test("Mem down or enroll refused: nothing bound, nothing saved (bound on a later start)", async () => {
    const dataDir = tmp();
    const down = fakeNmem("not json");
    expect(await bindMemIdentity({ dataDir, personaId: "default", name: "D", run: down.run, env: {} })).toBeUndefined();
    const refused = fakeNmem(NOT_FOUND, { failEnroll: true });
    expect(await bindMemIdentity({ dataDir, personaId: "default", name: "D", run: refused.run, env: {} })).toBeUndefined();
    expect(readMemIdentity(dataDir)).toBeUndefined();
    const missing = nmemRunner({ bin: join(tmp(), "no-nmem") });
    expect(await bindMemIdentity({ dataDir, personaId: "default", name: "D", run: missing, env: {} })).toBeUndefined();
  });

  test("a key that may not make profiles (Cloud team member, 403): the id is bound anyway, as Mem records it on writes", async () => {
    const dataDir = tmp();
    const n = fakeNmem(NOT_FOUND, { enroll: `echo "Error: /settings/agent-profiles returned 403: scope 'default' is not granted to this member" >&2; exit 1` });
    expect(await bindMemIdentity({ dataDir, personaId: "default", name: "小鸭", run: n.run, env: {} })).toEqual({ agentId: "ducter", owned: true });
    expect(readMemIdentity(dataDir)).toEqual({ agentId: "ducter", owned: true });
  });

  test("another persona gets its own identity id", () => {
    expect(identityIdFor("default")).toBe("ducter");
    expect(identityIdFor("work")).toBe("ducter-work");
  });
});

describe("the identity on the Partner page and through a rename", () => {
  function fakeCoreFor(dataDir: string) {
    const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
    const persona: { id: string; name: string; identity: string; mem?: any } = { id: "default", name: "小鸭", identity: "You are 小鸭." };
    const settings = openSettings({ dataDir, log, push: openPushStore(dataDir), persona });
    settings.setMemState("connected");
    return { core: { dataDir, persona, settings } as any, settings, persona };
  }

  test("bound on first connect: keptUnder is the partner's name and follows a rename; the identity id stays", async () => {
    const dataDir = tmp();
    const { core, settings, persona } = fakeCoreFor(dataDir);
    expect((await settings.view()).mem.keptUnder).toBeUndefined();
    const n = fakeNmem(NOT_FOUND);
    let changes = 0;
    settings.onChange(() => changes++);
    keepMemIdentity(core, true, n.run);
    for (let i = 0; i < 50 && !persona.mem; i++) await Bun.sleep(20);
    expect(persona.mem).toEqual({ agentId: "ducter", owned: true });
    expect(changes).toBeGreaterThan(0); // clients are told
    expect((await settings.view()).mem.keptUnder).toBe("小鸭");

    settings.set({ name: "阿福" });
    for (let i = 0; i < 50 && !n.calls().some((c) => c[2] === "set"); i++) await Bun.sleep(20);
    expect(n.calls().find((c) => c[2] === "set")).toEqual(["--json", "agents", "set", "ducter", "--name", "阿福"]);
    expect((await settings.view()).mem.keptUnder).toBe("阿福");
    expect(readMemIdentity(dataDir)).toEqual({ agentId: "ducter", owned: true });
    expect(JSON.parse(readFileSync(join(dataDir, "persona.json"), "utf8")).name).toBe("阿福");
  });

  test("an adopted identity shows its own name, and memory switched off binds nothing", async () => {
    const a = fakeCoreFor(tmp());
    a.persona.mem = { agentId: "weyl-main", owned: false, label: "Weyl agent" };
    expect((await a.settings.view()).mem.keptUnder).toBe("Weyl agent");
    const b = fakeCoreFor(tmp());
    b.settings.set({ memory: false });
    const n = fakeNmem(NOT_FOUND);
    keepMemIdentity(b.core, true, n.run);
    await Bun.sleep(50);
    expect(n.calls()).toEqual([]);
    expect((await b.settings.view()).mem.keptUnder).toBeUndefined();
  });
});
