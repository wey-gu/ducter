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

test("a place named after the home and one that says local are one project (demo-onhand's two hawdb)", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-project-home-"));
  const core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", update: { homeName: "home-server" } });
  try {
    for (const [id, device] of [
      ["t_tokio", "home-server"],
      ["t_bench", "local"],
    ] as const) {
      core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: id, project: "", place: { kind: "repo", device, repoPath: "/Users/weyl/dev/hawdb", branch: "main", baseBranch: "main" }, harness: "claude-code", brief: id } });
    }
    await Bun.sleep(30);
    const list = core.tasks.onHand().projectList ?? [];
    expect(list.filter((p) => p.name === "hawdb")).toHaveLength(1);
    expect(list.find((p) => p.name === "hawdb")?.key).toBe("folder:local:/Users/weyl/dev/hawdb");
  } finally {
    await core.stop();
  }
});
