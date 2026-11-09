// The D63 live check, as D141 closes it: one real Mem write through Ducter's own memory_add path,
// as the persona's identity, into a scratch Space, read back, then removed.
//
//   bun packages/partner/eval/mem-live.ts            # dry: prints what it would do, touches nothing
//   bun packages/partner/eval/mem-live.ts --real     # the user's real nmem (Cloud or local)
//
// - Never touches the user's own memories, identity or default Space: it creates a Space named
//   `ducter-scratch` and an identity `ducter-scratch` (both clearly named), writes only there,
//   and deletes all three things it made at the end (the memory, the identity, the Space).
// - The write goes through the real partner (createPartner) and its memory_add tool, with the real
//   nmem client (createNmemClient) and the identity bound by core's own bindMemIdentity. Only the
//   harness is scripted (it calls memory_add once, as a model would).
// - Exit 0 only when the stored memory reads back with the identity, source_app=ducter, the Space,
//   and the Log pointer in metadata.source_message_id.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { bindMemIdentity, nmemRunner, renameMemIdentity } from "../../core/src/mem-identity.ts";
import { createNmemClient, createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner } from "../test/fakes.ts";

const SCRATCH = "ducter-scratch";
const real = process.argv.includes("--real");
const run = nmemRunner({ timeoutMs: 30_000 });
const json = async (args: string[]) => {
  const r = await run(args);
  if (!r) throw new Error("nmem is not installed");
  try {
    return { code: r.code, j: JSON.parse(r.out) };
  } catch {
    return { code: r.code, j: { raw: r.out.slice(0, 400) } };
  }
};
const checks: { name: string; ok: boolean; got?: unknown }[] = [];
const check = (name: string, ok: boolean, got?: unknown) => {
  checks.push({ name, ok, got });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`);
};

/** The full memory record (with metadata) from Mem's REST API, over nmem's own connection settings. */
async function restMemory(id: string): Promise<any> {
  const env = process.env;
  let url = env.NMEM_API_URL;
  let key = env.NMEM_API_KEY;
  if (!url || !key) {
    try {
      const c = JSON.parse(readFileSync(join(homedir(), ".nowledge-mem", "config.json"), "utf8"));
      url ||= c.apiUrl;
      key ||= c.apiKey;
    } catch {
      /* local Mem without a key */
    }
  }
  if (!url) throw new Error("no Mem API URL to read the record back");
  const res = await fetch(`${url.replace(/\/$/, "")}/memories/${encodeURIComponent(id)}`, { headers: { ...(key ? { Authorization: `Bearer ${key}`, "X-API-Key": key } : {}), "User-Agent": "nmem-cli (ducter mem-live)" } });
  if (!res.ok) throw new Error(`reading the record back: HTTP ${res.status}`);
  const j: any = await res.json();
  return j?.memory ?? j;
}

if (!real) {
  console.log(`dry run. With --real this creates Space "${SCRATCH}" and identity "${SCRATCH}", writes one memory there through memory_add, reads it back, then deletes all three.`);
  process.exit(0);
}

const dataDir = mkdtempSync(join(tmpdir(), "ducter-mem-live-"));
let memoryId: string | undefined;
let madeSpace = false;
let madeAgent = false;
try {
  // 1. The scratch Space (never the user's own).
  const spaces = (await json(["spaces", "list"])).j;
  const have = (spaces?.spaces ?? []).find((s: any) => s?.name === SCRATCH || s?.key === SCRATCH || (s?.aliases ?? []).includes(SCRATCH));
  let space: string | undefined = SCRATCH;
  if (!have) {
    const c = await json(["spaces", "create", SCRATCH, "--description", "Ducter's live provenance check (D63). Safe to delete."]);
    if (c.code === 0) madeSpace = true;
    else if (/403|forbidden|insufficient/i.test(JSON.stringify(c.j))) {
      // A team workspace member may not create Spaces. Then the write goes to the user's own
      // Personal zone (private to them, Mem's default write Space) under the scratch identity,
      // and is deleted at the end like the rest.
      space = undefined;
      console.log(`Space ${SCRATCH}: this key may not create Spaces; writing to the Personal zone under the scratch identity instead`);
    } else throw new Error(`could not create the scratch Space: ${JSON.stringify(c.j).slice(0, 300)}`);
  }
  if (space) console.log(`Space ${SCRATCH}: ${madeSpace ? "created" : "already there"}`);

  // 2. The identity, bound by core's own code (enrolled: it does not exist yet).
  const mem = await bindMemIdentity({ dataDir, personaId: "default", name: "小鸭 (scratch)", run, env: {}, agentId: SCRATCH, ...(space ? { space } : {}) });
  if (!mem) throw new Error("binding the scratch identity failed");
  check("bound as Ducter's own identity", mem.agentId === SCRATCH && mem.owned, mem);
  // Did Mem keep a profile? A team member's key may not make one (403); the id binds regardless.
  const profiled = (await json(["agents", "show", SCRATCH])).j?.error === undefined;
  madeAgent = profiled;
  console.log(`identity ${SCRATCH}: ${profiled ? "enrolled with a profile" : "bound without a profile (this key may not make Agent profiles)"}`);

  // 3. One memory_add through the real partner tool and the real nmem client.
  const clock = new FakeClock();
  const fc = fakeCore(clock, dataDir);
  (fc.core.persona as any).mem = mem;
  let r: any;
  const fr = fakeRunner(async (_i, s) => {
    r = await fc.callTool("memory_add", { title: "Ducter live check (D63)", content: "Scratch memory written by Ducter's live provenance check. Safe to delete.", importance: 0.1 });
    s.say("好。");
    s.end();
  });
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: (e) => console.warn(e), memory: createNmemClient({ timeoutMs: 30_000, identity: () => (fc.core.persona as any).mem }) });
  const u = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "记一下：这是一次记忆的现场检查。" } });
  partner.onTrigger(u);
  await partner.idle();
  const noted = fc.events.find((e) => e.kind === "memory_noted")?.body as { memoryId?: string } | undefined;
  memoryId = noted?.memoryId;
  check("memory_add answered ok with an id", r?.ok === true && !!memoryId, { r, noted });
  if (!memoryId) throw new Error("no memory id came back");

  // 4. Read it back. `nmem m show` (0.10.116) leaves metadata out, so the full record is read from
  // the same REST endpoint nmem uses, with nmem's own connection (never printed).
  const shown = (await json(["m", "show", memoryId])).j;
  check("nmem m show finds it", shown?.id === memoryId, shown);
  const m = await restMemory(memoryId);
  const meta = m?.metadata ?? {};
  const agent = m?.agent_id ?? m?.agentId ?? meta.agent_id ?? m?.provenance?.agent_id;
  const sourceApp = m?.source_app ?? m?.sourceApp ?? meta.source_app ?? m?.provenance?.source_app;
  const stored = m?.space_id ?? m?.spaceId ?? m?.space;
  const pointer = meta.source_message_id ?? m?.source_message_id;
  console.log("read back:", JSON.stringify({ id: m?.id, agent_id: agent, source_app: sourceApp, source: m?.source, space: stored, source_message_id: pointer }));
  check("identity is the persona's (agent_id)", agent === SCRATCH, agent);
  check("source_app is ducter", sourceApp === "ducter", sourceApp);
  if (space) check("in the scratch Space", typeof stored === "string" && stored.length > 0 && !/^personal-/.test(stored) && stored !== "default", stored);
  else check("in the user's private Personal zone (no Space could be created)", typeof stored === "string" && /^personal-/.test(stored), stored);
  check("Log pointer in metadata.source_message_id", pointer === `ducter;persona=${fc.core.persona.id};log=${u.seq}`, pointer);

  // 5. A rename keeps the identity and updates its display name (only where a profile exists).
  if (profiled) {
    const renamed = await renameMemIdentity(run, mem, "阿福 (scratch)");
    const prof = (await json(["agents", "show", SCRATCH])).j;
    const a = prof?.agent ?? prof?.profile ?? prof;
    check("rename: same id, new display name", renamed && (a?.display_name ?? a?.displayName ?? a?.name) === "阿福 (scratch)", prof);
  } else console.log("rename: skipped (no profile to rename; the id stays the same either way)");
} catch (err) {
  check("ran to the end", false, (err as Error).message);
} finally {
  // 6. Remove what this run made, and only that.
  if (memoryId) console.log(`delete memory ${memoryId}:`, (await json(["m", "delete", "--force", memoryId])).code === 0 ? "done" : "FAILED");
  if (madeAgent) console.log(`delete identity ${SCRATCH}:`, (await json(["agents", "delete", "--yes", SCRATCH])).code === 0 ? "done" : "FAILED");
  if (madeSpace) {
    const d = await json(["spaces", "delete", "--force", SCRATCH]);
    if (d.code === 0) console.log(`delete Space ${SCRATCH}: done`);
    else console.log(`delete Space ${SCRATCH}: not deleted (${JSON.stringify(d.j).slice(0, 200)}); archive:`, (await json(["spaces", "archive", SCRATCH, "--confirm"])).code === 0 ? "done" : "FAILED");
  }
  rmSync(dataDir, { recursive: true, force: true });
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
