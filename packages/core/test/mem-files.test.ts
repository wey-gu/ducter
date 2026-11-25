// D566: what Ducter made, kept in the person's Nowledge Mem, over a fake nmem (never the real Mem):
// one 「Ducter」 folder, a new version of the same artifact for a newer file, Mem's own reasons,
// the Settings default for a finished task's documents only, and files of secrets never sent.
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, MediaRef } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createMediaStore } from "../src/media.ts";
import { artifactOf, confirmFrom, createMemFiles, currentOf, whyOf } from "../src/mem-files.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dir, "../../partner/eval/fake-artifacts-nmem.ts");

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
  // No --space: the persona is bound to none, so Mem's own default (never a guessed Space).
  expect(s.calls().some((c) => c.includes("--space"))).toBe(false);
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
  writeFileSync(s.state, JSON.stringify({ docs: [], folders: [{ id: "fold_mine", name: "Ducter", parent_id: null, space_id: "default" }], seq: 0 }));
  const m = s.put("a.md", "a");
  await s.mf.save(m.id);
  expect(s.mem().folders).toHaveLength(1);
  expect(s.mem().docs[0]!.folder_id).toBe("fold_mine");
});

test("why it wasn't kept, from Mem's own facts; the file stays", async () => {
  const signedOut = seed({ env: { NMEM_FAKE_SIGNED_OUT: "1" } });
  const a = signedOut.put("a.md", "a");
  expect(await signedOut.mf.save(a.id)).toEqual({ ok: false, why: "signed_out" });
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
