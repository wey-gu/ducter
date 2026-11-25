#!/usr/bin/env bun
// A FAKE `nmem` for D566 (keeping files in Nowledge Mem): Artifacts and their folders in one JSON
// file, so tests and the partner eval never write to the person's Mem. It implements only what
// core/src/mem-files.ts runs, after nmem 0.10.123's help (research/231):
//   status · artifacts folders ls|mk · artifacts add · artifacts update · artifacts history · artifacts show
// The read shapes (list/show/history/folders ls, status) copy the REAL ones seen on 2026-11-25
// (packages/core/test/fixtures/mem-artifacts.json, VERIFIED). add, update and folders mk were never
// run against the real Mem: their answers here are GUESSES from the CLI's own strings (an
// ArtifactRevisionOutcome of created|unchanged with document_id, source_id, revision; update's
// refusal "<n> is now current, not <base>; nothing was changed.").
//
//   NMEM_FAKE_ARTIFACTS=/path/state.json   the state (made on first use)
//   NMEM_FAKE_ARGV_LOG=/path                every call's argv, one JSON line each
//   NMEM_FAKE_SIGNED_OUT=1                  every call answers Mem's 401
//   NMEM_FAKE_DOWN=1                        every call answers a connection failure
//   NMEM_FAKE_REFUSE="<words>"              add and update answer Mem's 400 with those words
//   NMEM_FAKE_BACKEND=local                 status says a local Mem (no web link)
// state.bump = <doc id>: someone saved a newer version of it in Mem (the next update is stale).
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";

interface Rev { source_id: string; revision: number; sha256: string; size_bytes: number; origin: string; created_at: string }
interface Doc { id: string; name: string; folder_id: string | null; space_id: string; labels: string[]; comment?: string; revs: Rev[] }
interface Folder { id: string; name: string; parent_id: string | null; space_id: string }
interface State { docs: Doc[]; folders: Folder[]; seq: number; bump?: string }

const argv = process.argv.slice(2);
if (process.env.NMEM_FAKE_ARGV_LOG) appendFileSync(process.env.NMEM_FAKE_ARGV_LOG, JSON.stringify(argv) + "\n");
const file = process.env.NMEM_FAKE_ARTIFACTS;
if (!file) {
  console.error("NMEM_FAKE_ARTIFACTS is not set");
  process.exit(2);
}
const load = (): State => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { docs: [], folders: [], seq: 0 });
const save = (s: State) => writeFileSync(file, JSON.stringify(s, null, 2));
const out = (v: unknown) => (console.log(JSON.stringify(v, null, 2)), process.exit(0));
const fail = (msg: string, code = 1) => (console.error(`error: ${msg} (Request ID: 00000000-0000-0000-0000-00000000fake)`), process.exit(code));
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const now = () => new Date().toISOString();
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

if (process.env.NMEM_FAKE_SIGNED_OUT === "1") fail("/sources returned 401: Invalid or missing API key. Run `nmem connect <link>`.");
if (process.env.NMEM_FAKE_DOWN === "1") fail("error sending request: connection refused (os error 61)");

const words = argv.filter((a) => a !== "--json" && a !== "-j");
const [cmd, sub, verb] = words;
const space = opt("--space") ?? "default";

const sourceOf = (d: Doc, r = d.revs.at(-1)!) => ({
  id: r.source_id,
  source_type: "file",
  original_name: d.name,
  mime_type: "text/markdown",
  file_path: null,
  parsed_path: null,
  source_url: null,
  has_original: true,
  sha256: r.sha256,
  size_bytes: r.size_bytes,
  version: 1,
  space_id: d.space_id,
  lifecycle_state: "parsed",
  chunk_count: 1,
  memory_count: 0,
  section_tree: null,
  summary: null,
  error_message: null,
  created_at: d.revs[0]!.created_at,
  updated_at: r.created_at,
  metadata: {},
  label_ids: d.labels,
  folder_id: d.folder_id,
  document_id: d.id,
  created_by_member_id: "00000000-0000-0000-0000-000000000000",
  revision: r.revision,
  latest_revision: d.revs.at(-1)!.revision,
  is_latest: r === d.revs.at(-1),
  superseded_by: null,
  revision_count: d.revs.length,
});

if (cmd === "status") out({ status: "ok", cli_version: "0.10.123", api_url: process.env.NMEM_FAKE_BACKEND === "local" ? "http://127.0.0.1:14242" : "https://cloud.nowledge.co/remote-api", mode: "remote", backend: process.env.NMEM_FAKE_BACKEND ?? "cloud" });
if (cmd !== "artifacts") fail(`the subcommand '${cmd}' wasn't recognized`, 2);

const s = load();
if (sub === "folders" && (verb === "ls" || verb === undefined)) {
  out({ folders: s.folders.filter((f) => f.space_id === space).map((f) => ({ id: f.id, name: f.name, parent_id: f.parent_id, space_id: f.space_id, children: [] })), next_cursor: null, folder_view: "tree" });
}
if (sub === "folders" && verb === "mk") {
  const name = words[3]!;
  const id = opt("--id") ?? `fold_${++s.seq}`;
  const had = s.folders.find((f) => f.id === id);
  if (!had) s.folders.push({ id, name, parent_id: opt("--parent") ?? null, space_id: space });
  save(s);
  out({ folder: { id, name, parent_id: null, space_id: space } });
}
if (sub === "add") {
  if (process.env.NMEM_FAKE_REFUSE) fail(`/sources/ingest/file returned 400: ${process.env.NMEM_FAKE_REFUSE}`);
  const path = words[2]!;
  if (!existsSync(path)) fail(`${path}: No such file or directory`);
  const folder = opt("--folder") ?? null;
  if (folder && !s.folders.some((f) => f.id === folder)) fail(`Folder '${folder}' not found, or you don't have access to it`);
  const fs = folder ? s.folders.find((f) => f.id === folder)!.space_id : space;
  const labels: string[] = [];
  argv.forEach((a, i) => (a === "-l" || a === "--label") && labels.push(argv[i + 1]!));
  const id = `src_${(++s.seq).toString(16).padStart(12, "0")}`;
  const d: Doc = { id, name: basename(path), folder_id: folder, space_id: fs, labels, ...(opt("-c") ? { comment: opt("-c")! } : {}), revs: [{ source_id: id, revision: 1, sha256: sha(path), size_bytes: statSync(path).size, origin: "upload", created_at: now() }] };
  s.docs.push(d);
  save(s);
  out({ sources: [sourceOf(d)], added: 1 });
}
if (sub === "update") {
  if (process.env.NMEM_FAKE_REFUSE) fail(`/sources returned 400: ${process.env.NMEM_FAKE_REFUSE}`);
  const id = words[2]!;
  const d = s.docs.find((x) => x.id === id || x.revs.some((r) => r.source_id === id));
  if (!d) fail(`/sources/${id} returned 404: not found, or you don't have access to it`);
  if (s.bump === d!.id) {
    const last = d!.revs.at(-1)!;
    d!.revs.push({ ...last, source_id: `${d!.id}_r${last.revision + 1}`, revision: last.revision + 1, origin: "edit", created_at: now() });
    delete s.bump;
    save(s);
  }
  const base = Number(opt("--base"));
  const latest = d!.revs.at(-1)!.revision;
  if (base !== latest) fail(`${latest} is now current, not ${base}; nothing was changed. Re-read it (nmem artifacts read ${d!.id} --latest) and retry with its --base.`);
  const path = opt("--file")!;
  const h = sha(path);
  if (h === d!.revs.at(-1)!.sha256) out({ outcome: "unchanged", document_id: d!.id, source_id: d!.revs.at(-1)!.source_id, revision: latest, latest_revision: latest });
  const rev: Rev = { source_id: `${d!.id}_r${latest + 1}`, revision: latest + 1, sha256: h, size_bytes: statSync(path).size, origin: "replace", created_at: now() };
  d!.revs.push(rev);
  save(s);
  out({ outcome: "created", document_id: d!.id, source_id: rev.source_id, sha256: rev.sha256, size_bytes: rev.size_bytes, created_at: rev.created_at, revision: rev.revision, latest_revision: rev.revision });
}
if (sub === "history") {
  const d = s.docs.find((x) => x.id === words[2]);
  if (!d) fail(`/sources/${words[2]}/revisions returned 404: not found`);
  out({ document_id: d!.id, latest_revision: d!.revs.at(-1)!.revision, revisions: [...d!.revs].reverse().map((r) => ({ ...r, created_by_member_id: "00000000-0000-0000-0000-000000000000", created_by_agent_key_id: null })), next_cursor: null });
}
if (sub === "show") {
  const d = s.docs.find((x) => x.id === words[2]);
  if (!d) fail(`/sources/${words[2]} returned 404: not found`);
  out({ source: sourceOf(d!), memories: [], revisions: [] });
}
fail(`unsupported in the fake: ${words.join(" ")}`, 2);
