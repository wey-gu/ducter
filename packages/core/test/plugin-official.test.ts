// D670: the official Lody plugin, through the host's own path. The folder-level checks run
// everywhere (manifest, icon, the index's content hash). The live run needs a host that can apply a
// nested Seatbelt profile: it installs the plugin with `ducter plugin add <folder>`, runs it under
// the sandbox with a temporary home, and parses the stream.
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { iconDataUrl } from "../src/imports/icon.ts";
import { contentHash, createPluginRuntime, readManifest } from "../src/imports/plugins.ts";
import { parseImport } from "../src/imports/format.ts";
import { tempDir } from "./helpers.ts";

const repo = join(import.meta.dir, "../../../.plugins-repo/repo");
const lodyDir = join(repo, "plugins/lody");
// The official repository is its own repo (github.com/wey-gu/ducter-plugins), checked out here only
// on a maintainer's machine; where it isn't (CI), these tests are skipped and say so.
const HAVE = existsSync(join(repo, "index.json"));
if (!HAVE) console.warn("official plugin tests skipped: no .plugins-repo/repo checkout here");
const index = (HAVE ? JSON.parse(readFileSync(join(repo, "index.json"), "utf8")) : { plugins: [] }) as { plugins: { id: string; hash: string; commit: string; icon?: string }[] };
const NOW = Date.parse("2026-12-02T10:00:00Z");

const LIVE = (() => {
  if (process.platform !== "darwin") return false;
  try {
    return Bun.spawnSync(["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", "/bin/echo", "ok"]).exitCode === 0;
  } catch {
    return false;
  }
})();
if (!LIVE) console.warn("official plugin live run skipped: this host refused sandbox_apply (nested Seatbelt)");

test.skipIf(!HAVE)("the official Lody plugin matches the index: manifest, icon and content hash", () => {
  for (const [id, dir] of [["lody", lodyDir]] as const) {
    const entry = index.plugins.find((p) => p.id === id)!;
    expect(entry).toBeDefined();
    const m = readManifest(dir);
    expect(m.id).toBe(id);
    expect(m.version).toBe("0.1.0");
    expect(contentHash(dir)).toBe(entry.hash);
    expect(entry.commit).toMatch(/^[0-9a-f]{7,64}$/);
    expect(iconDataUrl(dir, m.app.icon)?.startsWith("data:image/png;base64,")).toBe(true);
    expect(existsSync(join(dir, "README.md"))).toBe(true);
    expect(readFileSync(join(dir, "NOTICE"), "utf8")).toContain("LodyAI/Lody");
  }
  expect(readManifest(lodyDir).online).toBe(true);
  expect(readManifest(lodyDir).uses[0]).toMatchObject({ command: "lody", online: true });
});

test.skipIf(!HAVE || !LIVE)("the Lody plugin runs the declared signed-in lody command sandboxed and imports", async () => {
  const t = tempDir();
  const home = join(t.dir, "home");
  mkdirSync(join(home, ".lody"), { recursive: true });
  const bin = join(t.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const fake = join(lodyDir, "test/fake-lody.js");
  const wrapper = join(bin, "lody");
  writeFileSync(wrapper, '#!/bin/sh\nexec "$DUCTER_TEST_BUN" "$DUCTER_FAKE_LODY_JS" "$@"\n');
  chmodSync(wrapper, 0o755);
  // The fake reads its state from inside the declared ~/.lody, as the real command reads its login.
  const state = join(home, ".lody/fake-state.json");
  writeFileSync(
    state,
    JSON.stringify({
      signedIn: true,
      workspaces: [{ id: "w1", name: "Acme", slug: "acme" }],
      sessions: {
        acme: [
          {
            id: "S-1",
            title: "The old Lody thread",
            repoFullName: "acme/hawdb",
            createdAt: "2026-10-02T03:11:00Z",
            lastMessageAt: Date.parse("2026-10-02T03:14:00Z"),
            history: [
              { id: "m1", role: "user", timestamp: "2026-10-02T03:11:00Z", items: [{ type: "text", text: "Bring this over." }] },
              { id: "m2", role: "assistant", timestamp: "2026-10-02T03:14:00Z", finished: true, items: [{ type: "text", text: "It's in." }] },
            ],
          },
        ],
      },
    }),
  );

  const rt = createPluginRuntime({
    dataDir: t.dir,
    now: () => NOW,
    curated: [],
    home,
    path: `${bin}:${process.env.PATH ?? ""}`,
    env: { DUCTER_TEST_BUN: process.execPath, DUCTER_FAKE_LODY_JS: fake, DUCTER_FAKE_LODY_STATE: state },
  });
  try {
    expect((await rt.install(lodyDir)).ok).toBe(true);
    rt.consent("lody", readManifest(lodyDir).reads, true);
    const r = await rt.run("lody");
    expect(r.error).toBeUndefined();
    const p = parseImport(r.stream, { now: () => NOW });
    expect([p.ok, p.counts.threads, p.counts.messages]).toEqual([true, 1, 2]);
    expect(r.stream).toContain("The old Lody thread");
  } finally {
    t.cleanup();
  }
});
