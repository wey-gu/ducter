// D483: a task in a folder named in Chinese (or with spaces) resumes its own session. On hel,
// task b7gw6r2e's Antigravity session in /root/ducter/worktrees/mem/在-hel-用-gemini-审改-mem-长文案并开-pr
// was refused on resume: agy lists a session's cwd from its workspace URI (percent-encoded), OAR
// compared it to the raw path, and the runner started afresh. Ducter patches OAR's directory
// identity (patches/@botiverse%2Foar@0.124.0.patch): one directory, every spelling. Synthetic
// folder names with the same shape; OAR's real resume guard runs against a fake ACP listing.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const dist = join(dirname(Bun.resolveSync("@botiverse/oar", import.meta.dir)));
const { sameDirectory } = (await import(join(dist, "shared/same-directory.js"))) as { sameDirectory: (a: string, b: string, platform?: string) => boolean };
const { refuseResumeElsewhere } = (await import(join(dist, "shared/acp/resume-cwd.js"))) as {
  refuseResumeElsewhere: (process: unknown, sessionId: string, cwd: string, timeoutMs: number) => Promise<void>;
};

const root = mkdtempSync(join(tmpdir(), "d483-resume-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const zh = join(root, "在-hel-用-gemini-审改-长文案并开-pr");
const spaced = join(root, "review the copy 再开 PR");
const other = join(root, "另一个-文件夹");
for (const d of [zh, spaced, other]) mkdirSync(d);
const encoded = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");

test("one directory, every spelling a session store uses: raw, percent-encoded, a file URI, NFD", () => {
  for (const dir of [zh, spaced]) {
    expect(sameDirectory(encoded(dir), dir, "linux")).toBe(true);
    expect(sameDirectory(pathToFileURL(dir).href, dir, "linux")).toBe(true);
    expect(sameDirectory(dir.normalize("NFD"), dir, "linux")).toBe(true);
    expect(sameDirectory(dir, encoded(dir), "linux")).toBe(true);
  }
  // Never two different folders: the encoded spelling of one is not the other.
  expect(sameDirectory(encoded(zh), other, "linux")).toBe(false);
  expect(sameDirectory(encoded(spaced), zh, "linux")).toBe(false);
  // A literal percent that isn't an escape stays as written.
  expect(sameDirectory(join(root, "100%-done"), join(root, "100%-done"), "linux")).toBe(true);
  expect(sameDirectory(join(root, "100%-done"), zh, "linux")).toBe(false);
});

/** A fake ACP connection whose session/list reports cwd the way agy does: from its workspace URI. */
const listing = (sessionId: string, cwd: string) => ({
  connection: { agent: { request: async (method: string) => (method === "session/list" ? { sessions: [{ sessionId, cwd }] } : {}) } },
  exited: new Promise(() => {}),
});

test("OAR's resume guard lets a Chinese-named folder's session resume, and still refuses another folder", async () => {
  await expect(refuseResumeElsewhere(listing("s1", encoded(zh)), "s1", zh, 1000)).resolves.toBeUndefined();
  await expect(refuseResumeElsewhere(listing("s2", pathToFileURL(spaced).href), "s2", spaced, 1000)).resolves.toBeUndefined();
  await expect(refuseResumeElsewhere(listing("s3", encoded(other)), "s3", zh, 1000)).rejects.toThrow(/lives in/);
});
