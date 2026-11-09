// D142: a non-git folder's copy, what changed against it, and putting it back exactly.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assess, cloudOf, createFolderStore, diffTrees, hashFile, mountOf, walk, type AssessOptions } from "../src/folder.ts";

let dir: string;
let folder: string;
let root: string;
let clock: number;
const DAY = 24 * 60 * 60 * 1000;
// No xattr probes up a temp path (fast, and the same on every machine).
const quiet: AssessOptions = { xattrs: () => [] };

function invoices(n: number) {
  for (let i = 1; i <= n; i++) {
    const month = ((i - 1) % 3) + 1;
    writeFileSync(join(folder, `invoice-2026-0${month}-${String(i).padStart(2, "0")}.pdf`), `%PDF invoice ${i} month ${month}\n`);
  }
}

/** Every entry with its bytes (files), its target (links), or "dir". */
function picture(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, e] of walk(root)!) out[p] = e.t === "f" ? readFileSync(join(root, p), "utf8") : e.t === "l" ? `-> ${e.target}` : "dir";
  return out;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-folder-test-")));
  folder = join(dir, "Invoices");
  root = join(dir, "data", "snapshots");
  mkdirSync(folder, { recursive: true });
  clock = Date.parse("2026-11-09T10:00:00Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const store = (o: AssessOptions = quiet) => createFolderStore({ root, now: () => clock, assess: o });

describe("the copy", () => {
  test("is a clone on this volume (APFS here) and holds the folder as it was", async () => {
    invoices(6);
    const s = store();
    const r = await s.prepare("t1", folder);
    expect(r.ok).toBe(true);
    if (process.platform === "darwin" && r.ok) expect(r.method).toBe("clone"); // the temp dir is on the data volume
    expect(picture(join(root, "t1", "copy"))).toEqual(picture(folder));
    // A second prepare keeps the open copy (it covers everything the task did since).
    writeFileSync(join(folder, "later.txt"), "x");
    const again = await s.prepare("t1", folder);
    expect(again.ok && again.fresh).toBe(false);
    expect(existsSync(join(root, "t1", "copy", "later.txt"))).toBe(false);
  });

  test("a cloud-synced folder is not copied: the task asks first", () => {
    const icloud = join(dir, "Library", "Mobile Documents", "com~apple~CloudDocs", "Taxes");
    const gdrive = join(dir, "Library", "CloudStorage", "GoogleDrive-me@example.com", "My Drive", "Photos");
    const dropbox = join(dir, "home", "Dropbox", "Receipts");
    for (const d of [icloud, gdrive, dropbox]) mkdirSync(d, { recursive: true });
    expect(assess(icloud, root, quiet)).toEqual({ ok: false, why: "cloud", detail: "iCloud Drive" });
    expect(assess(gdrive, root, quiet)).toEqual({ ok: false, why: "cloud", detail: "Google Drive" });
    expect(cloudOf(dropbox, { home: join(dir, "home"), xattrs: () => [] })).toBe("Dropbox");
    // A .dropbox marker anywhere above it, and iCloud's Desktop & Documents xattr.
    const marked = join(dir, "work", "Shared", "Scans");
    mkdirSync(marked, { recursive: true });
    writeFileSync(join(dir, "work", ".dropbox"), "{}");
    expect(cloudOf(marked, { home: "/nowhere", xattrs: () => [] })).toBe("Dropbox");
    expect(cloudOf(folder, { home: "/nowhere", xattrs: (d) => (d === folder ? ["com.apple.icloud.desktop"] : []) })).toBe("iCloud Drive");
    expect(cloudOf(folder, { home: "/nowhere", xattrs: () => ["com.apple.macl"] })).toBeUndefined();
  });

  test("a network or external drive, or a big folder that can't be cloned, asks first", () => {
    invoices(3);
    const mounts = (type: string, point: string) => [{ point: "/", type: "apfs" }, { point, type }];
    expect(assess(folder, root, { ...quiet, mounts: mounts("smbfs", dir) })).toMatchObject({ ok: false, why: "network" });
    expect(assess(folder, root, { ...quiet, platform: "darwin", mounts: [{ point: "/", type: "apfs" }, { point: "/Volumes/Backup", type: "exfat" }] })).toMatchObject({ ok: true });
    // A folder on /Volumes/… (macOS) or /media/… (Linux) is an external drive.
    expect(mountOf("/Volumes/Backup/Photos", mounts("exfat", "/Volumes/Backup"))?.type).toBe("exfat");
    // Not clonable (exfat here) and over the plain-copy cap: ask.
    expect(assess(folder, root, { ...quiet, platform: "darwin", mounts: mounts("exfat", dir), copyCap: 10 })).toMatchObject({ ok: false, why: "too_big" });
    // Under the cap: a plain copy.
    expect(assess(folder, root, { ...quiet, platform: "darwin", mounts: mounts("exfat", dir) })).toMatchObject({ ok: true, method: "copy" });
    expect(assess(folder, root, { ...quiet, fileCap: 2 })).toMatchObject({ ok: false, why: "too_big" });
    expect(assess(join(dir, "nope"), root, quiet)).toEqual({ ok: false, why: "missing" });
  });
});

describe("what changed", () => {
  test("sorting into month folders reads as moves into new folders; renames and edits are told apart", async () => {
    invoices(9);
    writeFileSync(join(folder, "notes.txt"), "keep me\n");
    writeFileSync(join(folder, "old.tmp"), "junk\n");
    const s = store();
    await s.prepare("t1", folder);
    for (const m of ["01", "02", "03"]) mkdirSync(join(folder, `2026-${m}`));
    for (const f of readdirSync(folder).filter((f) => f.startsWith("invoice-"))) renameSync(join(folder, f), join(folder, `2026-${f.slice(13, 15)}`, f));
    renameSync(join(folder, "2026-01", "invoice-2026-01-01.pdf"), join(folder, "2026-01", "January first.pdf")); // moved, then renamed: still one move
    renameSync(join(folder, "notes.txt"), join(folder, "Notes.txt")); // renamed in place
    writeFileSync(join(folder, "2026-02", "invoice-2026-02-02.pdf"), "%PDF fixed\n"); // moved and changed: a new file and a removed one
    unlinkSync(join(folder, "old.tmp"));
    writeFileSync(join(folder, "summary.csv"), "month,total\n");
    const c = (await s.changes("t1", { files: true }))!;
    expect(c).toMatchObject({ folders: 3, moved: 8, renamed: 1, added: 2, changed: 0, removed: 2, undo: "open" });
    expect(c.files.find((f) => f.path === "2026-01/January first.pdf")).toEqual({ kind: "moved", path: "2026-01/January first.pdf", from: "invoice-2026-01-01.pdf" });
    expect(c.files.find((f) => f.path === "Notes.txt")).toEqual({ kind: "moved", path: "Notes.txt", from: "notes.txt" });
    expect(c.files.filter((f) => f.dir).map((f) => f.path)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(c.files.filter((f) => f.kind === "removed").map((f) => f.path).sort()).toEqual(["invoice-2026-02-02.pdf", "old.tmp"]);
    // Without files: the counts only.
    expect((await s.changes("t1"))!.files).toEqual([]);
  });

  test("same size and time is the same; same size, new time is checked by hash", async () => {
    writeFileSync(join(folder, "a.txt"), "aaaa");
    writeFileSync(join(folder, "b.txt"), "bbbb");
    const s = store();
    await s.prepare("t1", folder);
    utimesSync(join(folder, "a.txt"), new Date(), new Date(Date.now() + 5000)); // touched, same bytes
    writeFileSync(join(folder, "b.txt"), "BBBB"); // same size, new bytes
    const c = (await s.changes("t1", { files: true }))!;
    expect(c.files).toEqual([{ kind: "changed", path: "b.txt" }]);
  });

  test(".DS_Store never counts", async () => {
    writeFileSync(join(folder, "a.txt"), "a");
    const s = store();
    await s.prepare("t1", folder);
    writeFileSync(join(folder, ".DS_Store"), "finder");
    expect((await s.changes("t1", { files: true }))!.files).toEqual([]);
  });
});

describe("undo", () => {
  async function sorted() {
    invoices(12);
    mkdirSync(join(folder, "keep"));
    writeFileSync(join(folder, "keep", "inside.txt"), "deep\n");
    symlinkSync("keep/inside.txt", join(folder, "link"));
    const before = picture(folder);
    const s = store();
    await s.prepare("t1", folder);
    for (const m of ["01", "02", "03"]) mkdirSync(join(folder, `2026-${m}`));
    for (const f of readdirSync(folder).filter((f) => f.startsWith("invoice-"))) renameSync(join(folder, f), join(folder, `2026-${f.slice(13, 15)}`, f));
    rmSync(join(folder, "keep"), { recursive: true });
    unlinkSync(join(folder, "link"));
    writeFileSync(join(folder, "report.txt"), "new\n");
    return { s, before };
  }

  test("puts the folder back exactly, checked by hash, and frees the copy", async () => {
    const { s, before } = await sorted();
    s.finish("t1");
    const r = await s.undo("t1");
    expect(r.ok).toBe(true);
    expect(picture(folder)).toEqual(before);
    // The bytes of every file, by hash, against what was there before the task.
    for (const [p, e] of walk(folder)!) if (e.t === "f") expect(await hashFile(join(folder, p))).toBe(new Bun.CryptoHasher("sha256").update(before[p]!).digest("hex"));
    expect(existsSync(join(root, "t1", "copy"))).toBe(false);
    expect((await s.changes("t1"))!.undo).toBe("undone");
    expect((await s.undo("t1")).message).toMatch(/Already undone/);
  });

  test("asks first when the folder changed after the task finished, and says what would be lost", async () => {
    const { s, before } = await sorted();
    s.finish("t1");
    writeFileSync(join(folder, "2026-01", "my own note.txt"), "the user's\n");
    const r = await s.undo("t1");
    expect(r.ok).toBe(false);
    expect(r.confirm).toEqual({ count: 1, files: ["2026-01/my own note.txt"] });
    expect(r.message).toMatch(/1 file was changed after the task finished \(my own note\.txt\)/);
    expect(existsSync(join(folder, "2026-01", "my own note.txt"))).toBe(true); // nothing touched
    const forced = await s.undo("t1", { force: true });
    expect(forced.ok).toBe(true);
    expect(picture(folder)).toEqual(before);
  });

  test("one file at a time: a moved one goes back, a new one goes, a removed one comes back", async () => {
    const { s } = await sorted();
    expect((await s.undo("t1", { path: "2026-01/invoice-2026-01-01.pdf" })).ok).toBe(true);
    expect(existsSync(join(folder, "invoice-2026-01-01.pdf"))).toBe(true);
    expect(existsSync(join(folder, "2026-01", "invoice-2026-01-01.pdf"))).toBe(false);
    expect((await s.undo("t1", { path: "report.txt" })).ok).toBe(true);
    expect(existsSync(join(folder, "report.txt"))).toBe(false);
    expect((await s.undo("t1", { path: "keep/inside.txt" })).ok).toBe(true);
    expect(readFileSync(join(folder, "keep", "inside.txt"), "utf8")).toBe("deep\n");
    expect((await s.undo("t1", { path: "2026-02" })).ok).toBe(false); // a folder: only with Undo all
    expect((await s.undo("t1", { path: "../etc/passwd" })).ok).toBe(false);
    expect((await s.changes("t1"))!.undo).toBe("open"); // the rest can still be undone
  });

  test("keep frees the copy; undo then says there's nothing to undo", async () => {
    const { s } = await sorted();
    expect(s.keep("t1").ok).toBe(true);
    expect(existsSync(join(root, "t1", "copy"))).toBe(false);
    expect((await s.changes("t1"))!.undo).toBe("kept");
    expect((await s.undo("t1")).ok).toBe(false);
  });
});

describe("retention", () => {
  test("the copy is kept 7 days after the task finished, then freed", async () => {
    invoices(2);
    const s = store();
    await s.prepare("t1", folder);
    expect(s.sweep()).toEqual([]); // still working: no clock runs
    s.finish("t1");
    const c = (await s.changes("t1"))!;
    expect(c.undoUntil).toBe("2026-11-16T10:00:00.000Z");
    clock += 7 * DAY - 1;
    expect(s.sweep()).toEqual([]);
    clock += 1;
    expect(s.sweep()).toEqual(["t1"]);
    expect(existsSync(join(root, "t1", "copy"))).toBe(false);
    expect((await s.changes("t1"))!.undo).toBe("expired");
    expect((await s.undo("t1")).message).toMatch(/kept for 7 days/);
  });

  test("a follow-up that finishes again starts the 7 days again", async () => {
    invoices(2);
    const s = store();
    await s.prepare("t1", folder);
    s.finish("t1");
    clock += 3 * DAY;
    s.finish("t1");
    expect((await s.changes("t1"))!.undoUntil).toBe("2026-11-19T10:00:00.000Z");
  });
});

test("diffTrees on two plain folders (no store)", async () => {
  const a = join(dir, "a");
  const b = join(dir, "b");
  mkdirSync(a);
  mkdirSync(b);
  writeFileSync(join(a, "x.txt"), "same");
  writeFileSync(join(b, "y.txt"), "same");
  const d = await diffTrees(a, b);
  expect(d.files).toEqual([{ kind: "moved", path: "y.txt", from: "x.txt" }]);
  expect(d.counts.renamed).toBe(1);
});
