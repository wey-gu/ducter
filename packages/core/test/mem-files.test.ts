// D566: what Ducter made, kept in the person's Nowledge Mem, over a fake nmem (never the real Mem):
// one 「Ducter」 folder, a new version of the same artifact for a newer file, Mem's own reasons,
// the Settings default for a finished task's documents only, and files of secrets never sent.
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, MediaRef } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createMediaStore } from "../src/media.ts";
import { artifactOf, confirmFrom, createMemFiles, currentOf, placeFrom, spacesFrom, whyOf, writeTargetFrom } from "../src/mem-files.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dir, "../../partner/eval/fake-artifacts-nmem.ts");
/** The fake's personal Space (its "Only me"), as Mem's passive setup lists it. */
const PERSONAL = "personal-00000000-0000-0000-0000-00000000fake";

function seed(o: { space?: string; auto?: boolean; env?: Record<string, string> } = {}) {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann", clock: { now: () => Date.now(), setTimeout: () => 0, clearTimeout: () => {} } as never });
  const media = createMediaStore(t.dir);
  const state = join(t.dir, "fake-mem.json");
  const argvLog = join(t.dir, "argv.jsonl");
  writeFileSync(argvLog, "");
  const env: Record<string, string> = { NMEM_FAKE_ARTIFACTS: state, NMEM_FAKE_ARGV_LOG: argvLog, ...(o.env ?? {}) };
  let changes = 0;
  let memory = true;
  const mf = createMemFiles({
    dataDir: t.dir,
    log,
    media,
    memory: () => memory,
    autoOn: () => !!o.auto,
    memState: () => "connected",
    identity: () => ({ agentId: "ducter", ...(o.space ? { space: o.space } : {}) }),
    taskTitle: (id) => (id === "kyoto" ? "排 12 月京都三日行程" : undefined),
    changed: () => changes++,
    run: async (argv, ms) => {
      const p = Bun.spawn(["bun", FAKE, "--json", ...argv], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
      const timer = setTimeout(() => p.kill(), ms);
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      clearTimeout(timer);
      return { code, out, err };
    },
  });
  const put = (name: string, text: string, taskId = "kyoto", type = "text/markdown"): MediaRef => media.put(new TextEncoder().encode(text), { files: true, name, from: { taskId } } as never);
  const calls = () => readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
  const mem = () => JSON.parse(readFileSync(state, "utf8")) as { docs: { id: string; name: string; folder_id: string; space_id: string; labels: string[]; revs: unknown[] }[]; folders: { id: string; name: string }[]; bump?: string };
  return { t, log, media, mf, put, calls, mem, env, state, changes: () => changes, setMemory: (v: boolean) => (memory = v) };
}

test("a tap keeps the file in one 「Ducter」 folder; saving it again changes nothing in Mem", async () => {
  const s = seed();
  const m = s.put("kyoto-itinerary.md", "# Kyoto, three days\n\nDay 1: Fushimi Inari.");
  const r = await s.mf.save(m.id);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.saved.uri).toMatch(/^nowledgemem:\/\/source\/src_/);
  expect(r.saved.rev).toBe(1);
  expect(r.saved.web).toBe("https://cloud.nowledge.co/app");
  const mem = s.mem();
  expect(mem.folders.map((f) => f.name)).toEqual(["Ducter"]);
  expect(mem.docs).toHaveLength(1);
  expect(mem.docs[0]!.name).toBe("kyoto-itinerary.md"); // its own name, not the store's hash
  expect(mem.docs[0]!.folder_id).toBe(mem.folders[0]!.id);
  expect(mem.docs[0]!.labels).toEqual(["ducter"]);
  // Shown as kept, and a second tap is the same answer without asking Mem again.
  expect(s.mf.view()[m.id]?.uri).toBe(r.saved.uri);
  const n = s.calls().length;
  expect((await s.mf.save(m.id)).ok).toBe(true);
  expect(s.calls().length).toBe(n);
  // D572, D575: the persona is bound to none, so the Space Mem names: the person's personal one (this
  // Mac's write target, personal_zone), by its exact id, for the folder and the file.
  const mk = s.calls().find((c) => c.includes("mk"))!;
  expect(mk[mk.indexOf("--space-id") + 1]).toBe(PERSONAL);
  const add = s.calls().find((c) => c.includes("add"))!;
  expect(add[add.indexOf("--space-id") + 1]).toBe(PERSONAL);
  expect(mem.docs[0]!.space_id).toBe(PERSONAL);
  expect(s.calls().flat()).not.toContain("all");
  expect(s.calls().some((c) => c.includes("--enable"))).toBe(false); // the setup read is passive
  // Never a delete, a move or a rename.
  expect(s.calls().some((c) => c.some((a) => ["delete", "move", "rename", "rm", "mv"].includes(a)))).toBe(false);
});

test("the newer version of the same file is a new version of the same artifact, never a duplicate", async () => {
  const s = seed();
  const v1 = s.put("report.md", "# Load test\n\np99 210 ms");
  const r1 = await s.mf.save(v1.id);
  const v2 = s.put("report.md", "# Load test\n\np99 180 ms after the fix");
  const r2 = await s.mf.save(v2.id);
  expect(r1.ok && r2.ok).toBe(true);
  if (!r1.ok || !r2.ok) return;
  expect(r2.saved.uri).toBe(r1.saved.uri);
  expect(r2.saved.rev).toBe(2);
  expect(s.mem().docs).toHaveLength(1);
  expect(s.mem().docs[0]!.revs).toHaveLength(2);
  const up = s.calls().find((c) => c.includes("update"))!;
  expect(up).toContain("--base");
  expect(up[up.indexOf("--base") + 1]).toBe("1");
  expect(up).toContain("--file");
  // The same name from another task is another file.
  const other = s.put("report.md", "# Another report", "visa");
  await s.mf.save(other.id);
  expect(s.mem().docs).toHaveLength(2);
});

test("a newer version saved in Mem since: on a tap, saved on top (both stay in its history)", async () => {
  const s = seed();
  const v1 = s.put("notes.md", "one");
  const r1 = await s.mf.save(v1.id);
  if (!r1.ok) throw new Error("not saved");
  const st = s.mem();
  st.bump = st.docs[0]!.id;
  writeFileSync(s.state, JSON.stringify(st));
  const v2 = s.put("notes.md", "two");
  const r2 = await s.mf.save(v2.id, "tap");
  expect(r2.ok).toBe(true);
  if (r2.ok) expect(r2.saved.rev).toBe(3);
  expect(s.mem().docs[0]!.revs).toHaveLength(3);
});

test("in the persona's Space when it is bound to one", async () => {
  const s = seed({ space: "Work" });
  const m = s.put("plan.md", "# plan");
  expect((await s.mf.save(m.id)).ok).toBe(true);
  const add = s.calls().find((c) => c.includes("add"))!;
  expect(add[add.indexOf("--space") + 1]).toBe("Work");
  expect(s.calls().find((c) => c.includes("mk"))).toContain("--space");
  expect(s.mem().docs[0]!.space_id).toBe("Work");
});

test("an existing top-level 「Ducter」 folder is used, not a second one", async () => {
  const s = seed();
  writeFileSync(s.state, JSON.stringify({ docs: [], folders: [{ id: "fold_mine", name: "Ducter", parent_id: null, space_id: PERSONAL }], seq: 0 }));
  const m = s.put("a.md", "a");
  await s.mf.save(m.id);
  expect(s.mem().folders).toHaveLength(1);
  expect(s.mem().docs[0]!.folder_id).toBe("fold_mine");
});

test("why it wasn't kept, from Mem's own facts; the file stays", async () => {
  const signedOut = seed({ env: { NMEM_FAKE_SIGNED_OUT: "1" } });
  const a = signedOut.put("a.md", "a");
  expect(await signedOut.mf.save(a.id)).toMatchObject({ ok: false, why: "signed_out" });
  expect(signedOut.media.path(a.id)).toBeTruthy();
  const down = seed({ env: { NMEM_FAKE_DOWN: "1" } });
  expect((await down.mf.save(down.put("b.md", "b").id)).ok).toBe(false);
  expect(((await down.mf.save(down.put("c.md", "c").id)) as { why: string }).why).toBe("unreachable");
  const refused = seed({ env: { NMEM_FAKE_REFUSE: "this file type is not supported" } });
  const r = await refused.mf.save(refused.put("d.md", "d").id);
  expect(r).toEqual({ ok: false, why: "refused", message: "this file type is not supported" });
  const off = seed();
  off.setMemory(false);
  expect(await off.mf.save(off.put("e.md", "e").id)).toEqual({ ok: false, why: "off" });
  expect((await off.mf.save("f".repeat(64))) as unknown).toEqual({ ok: false, why: "off" });
  const on = seed();
  expect(await on.mf.save("f".repeat(64))).toEqual({ ok: false, why: "gone" });
});

test("a file of secrets is never sent to Mem, on a tap or by itself", async () => {
  const s = seed({ auto: true });
  const key = "sk-ant-api03-" + "Zq7".repeat(14);
  const leaky = s.put("setup-notes.md", `Use this key: ${key}`);
  expect(await s.mf.save(leaky.id)).toEqual({ ok: false, why: "secret" });
  const env = s.put("prod.env.txt", "NOTHING=here");
  expect(await s.mf.save(env.id)).toEqual({ ok: false, why: "secret" });
  expect(s.calls().filter((c) => c.includes("add"))).toHaveLength(0);
});

test("the Settings default keeps a finished task's documents only, once", async () => {
  const s = seed({ auto: true });
  const doc = s.put("trip.md", "# Trip");
  const log = s.put("run.log", "ok", "kyoto", "text/plain");
  const code = s.put("fix.ts", "export {}", "kyoto", "text/plain");
  const pic = s.media.put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde]), { files: true, name: "shot.png" } as never);
  const report = (state: Bodies["report"]["state"], media: MediaRef[]) => s.log.append({ stream: "task:kyoto", origin: "task", kind: "report", body: { taskId: "kyoto", state, summary: "", questions: [], evidence: [], media } as Bodies["report"] });
  report("progress", [doc]); // a draft along the way: not yet
  await Bun.sleep(50);
  expect(s.mf.view()[doc.id]).toBeUndefined();
  report("done", [doc, log, code, pic]);
  for (let i = 0; i < 60 && !s.mf.view()[doc.id]; i++) await Bun.sleep(50);
  expect(s.mf.view()[doc.id]).toBeTruthy();
  expect(s.mem().docs.map((d) => d.name)).toEqual(["trip.md"]);
});

test("Mem's answers, read: add and update shapes, the stale refusal, the reasons", () => {
  expect(artifactOf(JSON.stringify({ sources: [{ id: "src_1", document_id: "src_1", revision: 1 }] }))).toEqual({ doc: "src_1", rev: 1 });
  expect(artifactOf(JSON.stringify({ outcome: "unchanged", document_id: "src_1", source_id: "src_1_r2", revision: 2, latest_revision: 2 }))).toEqual({ doc: "src_1", rev: 2, outcome: "unchanged" });
  expect(artifactOf("not json")).toBeUndefined();
  expect(currentOf("error: 3 is now current, not 2; nothing was changed.")).toBe(3);
  expect(whyOf({ missing: true })).toEqual({ why: "missing" });
  expect(whyOf({ code: 1, out: "", err: "error: /sources returned 401: Invalid API key" }).why).toBe("signed_out");
  expect(whyOf({ code: 1, out: "", err: "error: /sources/ingest/file returned 413: file exceeds the upload limit (Request ID: x)" })).toEqual({ why: "refused", message: "file exceeds the upload limit" });
});

// D566 (rev.): saved only once Mem's own list shows it; the write's raw answer is in the Log.
test("the read-back reads the VERIFIED list shape: by artifact, else by folder and name, these bytes", () => {
  const fixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/mem-artifacts.json"), "utf8"));
  const src = fixture.list.sources[0];
  const out = JSON.stringify(fixture.list);
  expect(confirmFrom(out, { doc: "src_0a1b2c3d4e5f", name: "kyoto-3-days.md" })).toEqual({ doc: "src_0a1b2c3d4e5f", rev: 1 });
  expect(confirmFrom(out, { folder: null as never, name: "kyoto-3-days.md", sha256: src.sha256 })).toEqual({ doc: "src_0a1b2c3d4e5f", rev: 1 });
  expect(confirmFrom(out, { folder: "fold_ducter", name: "kyoto-3-days.md" })).toBeUndefined(); // not in the Ducter folder
  expect(confirmFrom(out, { name: "kyoto-3-days.md", sha256: "f".repeat(64) })).toBeUndefined(); // other bytes
  expect(confirmFrom(out, { name: "something-else.md" })).toBeUndefined();
  // Newest first among two versions listed.
  const two = JSON.stringify({ sources: [{ ...src, revision: 1 }, { ...src, id: "src_0a1b2c3d4e5f_r2", revision: 2, updated_at: "2026-11-25T08:00:00+00:00" }] });
  expect(confirmFrom(two, { doc: "src_0a1b2c3d4e5f", name: "kyoto-3-days.md" })).toEqual({ doc: "src_0a1b2c3d4e5f", rev: 2 });
  expect(confirmFrom("not json", { name: "x" })).toBeUndefined();
});

test("an answer Ducter can't parse still saves once Mem lists the file; the raw answer goes to the Log", async () => {
  const s = seed({ env: { NMEM_FAKE_BARE: "1" } });
  const m = s.put("trip.md", "# Trip");
  const r = await s.mf.save(m.id);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.saved.uri).toBe(`nowledgemem://source/${s.mem().docs[0]!.id}`);
  const ev = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 });
  expect(ev).toHaveLength(1);
  const b = ev[0]!.body as Bodies["mem_file"];
  expect(b).toMatchObject({ op: "add", ok: true, by: "tap", name: "trip.md" });
  expect(b.raw).toContain("Added 1 artifact");
  expect(b.raw).not.toContain("# Trip"); // never the file's contents
});

test("a write Mem never lists is not called saved: said in Mem's words, logged", async () => {
  const s = seed({ env: { NMEM_FAKE_UNLISTED: "1" } });
  const m = s.put("trip.md", "# Trip");
  const r = await s.mf.save(m.id);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.why).toBe("refused");
  expect(s.mf.view()[m.id]).toBeUndefined();
  const b = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 })[0]!.body as Bodies["mem_file"];
  expect(b.ok).toBe(false);
});

// D572: the author's refusal on hel 0.1.68 (folders mk with no Space), and where a file goes now.
test("the fake refuses D566's call exactly as hel's Mem did: a folder needs a Space", async () => {
  const t = tempDir();
  const p = Bun.spawn(["bun", FAKE, "--json", "artifacts", "folders", "mk", "Ducter", "--id", "11111111-1111-4111-8111-111111111111"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NMEM_FAKE_ARTIFACTS: join(t.dir, "m.json") } });
  const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
  expect(code).not.toBe(0);
  expect(err).toContain("Pass --space (or --parent) to choose where the folder goes.");
});

test("Mem marks no Space as theirs or as its default: not saved, said once as no_space, Mem's words kept for 原话, logged", async () => {
  const s = seed({ env: { NMEM_FAKE_SPACES: "none" } });
  const m = s.put("gtm-plan.md", "# GTM plan");
  const r = await s.mf.save(m.id);
  expect(r).toMatchObject({ ok: false, why: "no_space" });
  if (!r.ok) expect(r.message).toContain("Pass --space");
  expect(s.calls().some((c) => c.includes("add"))).toBe(false); // nothing written
  // No Space picked for Mem: the folder names none, and Mem's own refusal is what is said.
  expect(s.calls().find((c) => c.includes("mk"))!.some((a) => a.startsWith("--space"))).toBe(false);
  if (!r.ok) expect(r.message).toBe("Pass --space (or --parent) to choose where the folder goes.");
  const ev = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 });
  expect(ev).toHaveLength(1);
  expect(ev[0]!.body).toMatchObject({ op: "folder", ok: false, why: "no_space", name: "gtm-plan.md" });
  expect(s.mf.view()[m.id]).toBeUndefined();
});

test("a folder Mem refuses is logged too (D566 logged writes only, so hel's Log held nothing)", async () => {
  const s = seed({ env: { NMEM_FAKE_SIGNED_OUT: "1" } });
  await s.mf.save(s.put("a.md", "a").id);
  const b = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 })[0]!.body as Bodies["mem_file"];
  expect(b).toMatchObject({ op: "folder", ok: false, why: "signed_out" });
  expect(b.raw).toContain("401");
});

test("where Mem's personal Space is its write default (this Mac), and where Spaces are off", async () => {
  const mac = seed({ env: { NMEM_FAKE_SPACES: "mac" } });
  expect((await mac.mf.save(mac.put("a.md", "a").id)).ok).toBe(true);
  expect(mac.mem().docs[0]!.space_id).toBe(PERSONAL);
  const off = seed({ env: { NMEM_FAKE_SPACES: "off" } });
  expect((await off.mf.save(off.put("b.md", "b").id)).ok).toBe(true);
  expect(off.calls().some((c) => c.includes("--space") || c.includes("--space-id"))).toBe(false);
  // Mem's facts are read once a run, not before every file.
  await mac.mf.save(mac.put("c.md", "c").id);
  expect(mac.calls().filter((c) => c[1] === "context")).toHaveLength(1);
});

// D575: Mem's own write target (`context`'s active_space.write_target), as Mem's Bridge owner said.
test("write target personal_zone (this Mac): the personal Space by its id, bridge setup never asked, the target logged", async () => {
  const s = seed();
  const r = await s.mf.save(s.put("gtm-plan.md", "# GTM plan").id);
  expect(r.ok).toBe(true);
  const ctx = s.calls().find((c) => c.includes("context"))!;
  expect(ctx).toEqual(["--json", "context", "--no-ensure", "--no-working-memory"]); // read-only
  expect(s.calls().some((c) => c.includes("setup"))).toBe(false);
  for (const c of s.calls().filter((c) => c.includes("mk") || c.includes("add"))) expect(c[c.indexOf("--space-id") + 1]).toBe(PERSONAL);
  const b = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 })[0]!.body as Bodies["mem_file"];
  expect(b).toMatchObject({ op: "add", ok: true, space: PERSONAL });
  expect(JSON.parse(b.target!)).toEqual({ space_id: PERSONAL, reason: "personal_zone" });
});

test("write target key_write_space (hel, Everyone): nothing goes to `all` until the person chooses; personal is the default", async () => {
  const s = seed({ env: { NMEM_FAKE_SPACES: "hel" } });
  const m = s.put("gtm-plan.md", "# GTM plan");
  // The first save asks, once, in the person's words: nothing written anywhere.
  const r = await s.mf.save(m.id);
  expect(r).toEqual({ ok: false, why: "shared_space", shared: { label: "Everyone", readers: 10, personal: true } });
  expect(s.calls().some((c) => c.includes("mk") || c.includes("add"))).toBe(false);
  const ask = s.log.read({ stream: "mem", kinds: ["mem_file"], limit: 10 })[0]!.body as Bodies["mem_file"];
  expect(ask).toMatchObject({ op: "space", ok: false, why: "shared_space", space: "all" });
  expect(JSON.parse(ask.target!)).toEqual({ space_id: "all", reason: "key_write_space" });
  // The partner and the Settings default never choose for them either.
  expect((await s.mf.save(m.id, "partner")).ok).toBe(false);
  expect((await s.mf.save(m.id, "auto")).ok).toBe(false);
  expect(s.calls().flat()).not.toContain("all");
  // Their answer, the default: their own Space; remembered, so the next file isn't asked again.
  expect((await s.mf.save(m.id, "tap", "personal")).ok).toBe(true);
  expect((await s.mf.save(s.put("q4.md", "# Q4").id, "partner")).ok).toBe(true);
  expect(s.mem().docs.map((d) => d.space_id)).toEqual([PERSONAL, PERSONAL]);
  expect(s.calls().flat()).not.toContain("all");
  expect(JSON.parse(readFileSync(join(s.t.dir, "mem-files.json"), "utf8")).choice).toMatchObject({ target: "all", pick: "personal" });
  // Chosen the other way, Mem's target it is, by its id.
  const t = seed({ env: { NMEM_FAKE_SPACES: "hel" } });
  expect((await t.mf.save(t.put("team-notes.md", "# Team").id, "tap", "shared")).ok).toBe(true);
  expect(t.mem().docs[0]!.space_id).toBe("all");
  expect(t.calls().find((c) => c.includes("add"))!).toContain("all");
});

test("only a shared target and no personal Space: asked, never saved there without a yes", async () => {
  const s = seed({ env: { NMEM_FAKE_SPACES: "commons" } });
  const m = s.put("gtm-plan.md", "# GTM plan");
  expect(await s.mf.save(m.id)).toEqual({ ok: false, why: "shared_space", shared: { label: "Everyone", readers: 10, personal: false } });
  // "Personal" can't be honoured: asked again, nothing remembered or written.
  expect((await s.mf.save(m.id, "tap", "personal")).ok).toBe(false);
  expect(s.calls().some((c) => c.includes("add"))).toBe(false);
  expect((await s.mf.save(m.id, "tap", "shared")).ok).toBe(true);
  expect(s.mem().docs[0]!.space_id).toBe("all");
});

test("write target missing, asking for a choice, or unknown to this nmem: the personal candidate, never write_default, never a guess", async () => {
  for (const how of ["missing", "choose", "old"]) {
    const s = seed({ env: { NMEM_FAKE_SPACES: "hel", NMEM_FAKE_CONTEXT: how } });
    expect((await s.mf.save(s.put("a.md", "a").id)).ok).toBe(true);
    expect(s.mem().docs[0]!.space_id).toBe(PERSONAL); // hel's write_default (all) is no longer borrowed
    expect(s.calls().some((c) => c.includes("setup"))).toBe(true);
    // No personal Space either: no Space named, and Mem's own refusal is what is said.
    const n = seed({ env: { NMEM_FAKE_SPACES: "commons", NMEM_FAKE_CONTEXT: how } });
    const r = await n.mf.save(n.put("b.md", "b").id);
    expect(r).toMatchObject({ ok: false, why: "no_space" });
    expect(n.calls().flat()).not.toContain("all");
  }
});

test("Mem's facts, read: the write target, the Spaces, and where that puts a file", () => {
  const ctx = (wt: unknown) => JSON.stringify({ active_space: { primary_space_id: "x", read_scope: "all-readable", ...(wt === undefined ? {} : { write_target: wt }) } });
  expect(writeTargetFrom(ctx({ space_id: "personal-1", reason: "personal_zone" }))).toEqual({ target: { id: "personal-1", reason: "personal_zone" }, raw: '{"space_id":"personal-1","reason":"personal_zone"}' });
  expect(writeTargetFrom(ctx({ space_id: "all", reason: "key_write_space" })).target).toEqual({ id: "all", reason: "key_write_space" });
  expect(writeTargetFrom(ctx(undefined))).toEqual({ raw: "(none)" });
  expect(writeTargetFrom(ctx({ space_id: null, reason: "explicit_choice_required" })).target).toBeUndefined();
  expect(writeTargetFrom(ctx({ space_id: "all", reason: "explicit_choice_required" })).target).toBeUndefined();
  expect(writeTargetFrom(ctx({ space_id: "--space x", reason: "key_write_space" })).target).toBeUndefined(); // never an argument
  expect(writeTargetFrom("not json")).toEqual({ raw: "(not json)" });
  const c = (o: object) => JSON.stringify({ state: "selection_needed", candidates: [{ id: "all", label: "Everyone", kind: "commons", readers: 10, write_default: true }, o] });
  const spaces = spacesFrom(c({ id: "personal-1", label: "Only me", kind: "personal", readers: 1, write_default: false }));
  expect(spaces).toEqual([
    { id: "all", label: "Everyone", kind: "commons", readers: 10 },
    { id: "personal-1", label: "Only me", kind: "personal", readers: 1 },
  ]);
  expect(spacesFrom(JSON.stringify({ state: "candidates_unavailable", candidates: [] }))).toBe("off");
  expect(spacesFrom("not json")).toBe("off");
  expect(spacesFrom(JSON.stringify({ candidates: [{ id: "--space x", kind: "personal" }] }))).toBe("off");
  const team = spacesFrom(c({ id: "codex", kind: "team", write_default: false }));
  expect(placeFrom({ id: "p", reason: "personal_zone" }, undefined)).toEqual({ personal: "p" });
  expect(placeFrom({ id: "all", reason: "key_write_space" }, spaces)).toEqual({ shared: { id: "all", label: "Everyone", kind: "commons", readers: 10 }, personal: "personal-1" });
  expect(placeFrom({ id: "personal-1", reason: "key_write_space" }, spaces)).toEqual({ personal: "personal-1" }); // a key bound to their own Space
  expect(placeFrom({ id: "all", reason: "key_write_space" }, team)).toEqual({ shared: { id: "all", label: "Everyone", kind: "commons", readers: 10 } });
  expect(placeFrom(undefined, spaces)).toEqual({ personal: "personal-1" });
  expect(placeFrom(undefined, team)).toBe("none"); // write_default is never borrowed (D575)
  expect(placeFrom(undefined, "off")).toBe("off");
  expect(whyOf({ code: 1, out: "", err: "error: Pass --space (or --parent) to choose where the folder goes." })).toEqual({ why: "no_space", message: "Pass --space (or --parent) to choose where the folder goes." });
});

// D594: nmem 0.10.124's passive `bridge setup` marks the one personal candidate Mem attests as its write
// default `recommended: true` (#11283; VERIFIED read-only 2026-11-26, 8 candidates, one recommended).
// It is taken first; an older nmem without the field reads as before (the kind).
test("Mem's recommended personal Space is the personal one; without it, the kind", () => {
  const setup = (cands: object[]) => JSON.stringify({ state: "selection_needed", candidates: cands });
  const everyone = { id: "all", label: "Everyone", kind: "commons", readers: 10, write_default: false };
  const desk = { id: "personal-old", label: "Desktop", kind: "personal", readers: 1, write_default: false };
  const mine = { id: "personal-m", label: "Only me", kind: "personal", readers: 1, write_default: true, recommended: true };
  const now = spacesFrom(setup([everyone, desk, mine]));
  expect(now).toContainEqual({ id: "personal-m", label: "Only me", kind: "personal", readers: 1, recommended: true });
  expect(placeFrom(undefined, now)).toEqual({ personal: "personal-m" });
  expect(placeFrom({ id: "all", reason: "key_write_space" }, now)).toEqual({ shared: { id: "all", label: "Everyone", kind: "commons", readers: 10 }, personal: "personal-m" });
  // 0.10.123: no `recommended` anywhere: the first personal, as D575 read it.
  const old = spacesFrom(setup([everyone, desk, { ...mine, recommended: undefined }]));
  expect(placeFrom(undefined, old)).toEqual({ personal: "personal-old" });
  // A recommended Space that isn't personal is never taken as the person's own.
  expect(placeFrom(undefined, spacesFrom(setup([{ ...everyone, recommended: true }])))).toBe("none");
});
