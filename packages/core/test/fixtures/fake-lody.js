// A fake `lody` for tests and demo cores, shaped from Lody's own CLI (research/246 §4.2 and the
// CLI's sources read on 2026-11-28). NEVER the real binary: the reader tests put this on a temp PATH.
//
// State (DUCTER_FAKE_LODY_STATE, JSON):
//   { signedIn, workspaces: [{id,name,slug,encrypted?}], pageSize?,
//     sessions: { "<slug>": [ { show?: {...}, history: [entry...],
//                               items?: [session item...] } ] } }
// Each session item is the SessionMeta shape the real `session list --json` prints; `history` is
// the SessionEntry shape `session history --jsonl` prints (`items: [{type:"text",text}]`).
// `show` overrides what `session show --json` adds (the binding the list didn't carry).
const fs = require("node:fs");

const statePath = process.env.DUCTER_FAKE_LODY_STATE;
const read = () => JSON.parse(fs.readFileSync(statePath, "utf8"));
// Output is gathered and written once, and the process exits only after it drained: a large
// `history` written then cut short by process.exit() arrives truncated through a pipe on a slow
// machine (CI read 2,700 of 4,002 messages).
const buf = [];
const out = (s) => buf.push(`${s}\n`);
const finish = () => process.stdout.write(buf.join(""), () => process.exit(0));
const fail = (s, code = 1) => {
  process.stderr.write(`${s}\n`);
  process.exit(code);
};
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes(name);

const st = (() => {
  try {
    return read();
  } catch {
    return fail("fake lody: no state", 2);
  }
})();
if (st.signedIn === false) fail("Not logged in. Run `lody login` first.");

function main() {
const [group, sub, ...rest] = process.argv.slice(2);
const workspaceOf = (slug) => (st.workspaces || []).find((w) => w.slug === slug || w.id === slug);

if (group === "workspace" && sub === "list") {
  out(JSON.stringify({ ok: true, workspaces: (st.workspaces || []).map(({ id, name, slug }) => ({ id, name, slug })) }));
  return finish();
}

if (group !== "session") fail(`fake lody: unknown command ${group} ${sub ?? ""}`, 2);

if (sub === "list") {
  const slug = arg("--workspace");
  const w = workspaceOf(slug);
  if (!w) fail(`No workspace found for ${slug}`);
  if (w.encrypted) fail("Update the owner machine to access encrypted Roost history.");
  const all = st.sessions?.[slug] ?? [];
  const size = Math.max(1, st.pageSize ?? 50);
  const cursor = arg("--cursor");
  const from = cursor ? Number(String(cursor).replace(/^p:/, "")) : 0;
  const page = all.slice(from, from + size).map((s) => {
    const { history, show, ...meta } = s;
    return { id: s.id, ...meta };
  });
  const next = from + size;
  const more = next < all.length;
  out(JSON.stringify({ ok: true, workspaceId: w.id, items: page, ...(more ? { hasMore: true, nextCursor: `p:${next}` } : { hasMore: false }) }));
  return finish();
}

const id = rest[0];
const found = Object.entries(st.sessions || {})
  .flatMap(([slug, list]) => (list || []).map((s) => ({ slug, s, sid: s.id })))
  .find((x) => x.sid === id);
if (!found) fail(`Session not found: ${id}`);
const w = workspaceOf(found.slug);
if (w && w.encrypted) fail("Update the owner machine to access encrypted Roost history.");

if (sub === "history") {
  if (!has("--all")) fail("fake lody: the reader asks for --all");
  for (const e of found.s.history || []) out(JSON.stringify({ workspaceId: w?.id, sessionId: id, ...e }));
  return finish();
}

if (sub === "show") {
  const { history, show, ...own } = found.s;
  const meta = { id, machineId: "machine_home", createdAt: "2026-01-01T00:00:00.000Z", userId: "u1", ...own, ...(show ?? {}) };
  out(JSON.stringify({ ok: true, workspace: { id: w?.id, name: w?.name, slug: w?.slug }, session: meta, historyCount: (found.s.history || []).length, latestHistoryAt: (found.s.history || []).at(-1)?.timestamp, messageQueueCount: 0 }));
  return finish();
}

fail(`fake lody: unknown session command ${sub}`, 2);
}
main();
