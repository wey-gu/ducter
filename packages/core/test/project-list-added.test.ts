// D654 (research/245 §3.2): a folder added by hand is a project row before its first task,
// and `project_change` can find it. The snapshot's decorator must see the added list.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "../src/core.ts";

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("an added folder is in On hand's projectList before its first task", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-project-list-"));
  writeFileSync(
    join(dir, "projects.json"),
    JSON.stringify({
      version: 1,
      projects: [
        { name: "mem", place: { kind: "repo", device: "local", repoPath: "/home/w/ducter/projects/mem" }, addedAt: "2026-11-01T00:00:00.000Z", remote: "github.com/nowledge-co/mem" },
        { name: "mem-identity", place: { kind: "repo", device: "local", repoPath: "/home/w/dev/mem-identity" }, addedAt: "2026-11-01T00:00:00.000Z" },
      ],
    }),
  );
  const core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin" });
  try {
    const list = core.tasks.onHand().projectList ?? [];
    expect(list.map((p) => p.name).sort()).toEqual(["mem", "mem-identity"]);
    expect(list.find((p) => p.name === "mem-identity")?.key).toBe("folder:local:/home/w/dev/mem-identity");
  } finally {
    await core.stop();
  }
});
