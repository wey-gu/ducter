// D455 on the phone and in the browser: On hand's 添加文件夹 opens one sheet, the computer first (the
// one the latest work was on), then the folder there, looked through by that computer through
// Ducter (never a local picker): recent folders first, typed text narrows the list or names a
// path, a repo says its origin; adding closes the sheet on that project; the lens says where each
// project lives. Faked frames only (no real home).
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";
import { browseNeedle } from "../src/app.ts";

// A small local storage, as a browser has (the lens is kept there).
const kept = new Map<string, string>();
(globalThis as any).localStorage ??= { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k), clear: () => kept.clear() };

const hel = { id: "local", name: "Hetzner Server", kind: "server", home: true, state: "awake", harnesses: [], abilities: [] };
const mini = { id: "mini", name: "Mac mini", kind: "mini", home: false, state: "awake", harnesses: [], abilities: [] };
const mac = { id: "dev_mac", name: "MacBook Pro", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] };
const card = (id: string, device: string, repoPath: string, project: string, updatedAt: string) => ({
  taskId: id,
  title: id,
  project,
  place: { kind: "repo", device, repoPath, branch: `ducter/${id}`, baseBranch: "main" },
  harness: "codex",
  attention: "working",
  openedAt: updatedAt,
  updatedAt,
});

async function boot(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  A.L = strings(lang);
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.S.welcomed = true;
  A.status = "connected";
  try {
    localStorage.clear();
  } catch {}
  A.receive({ t: "devices", devices: [hel, mini, mac], reach: { clients: [] } } as any);
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [card("t1", "dev_mac", "/Users/weyl/dev/ducter", "ducter", "2026-11-21T09:00:00Z"), card("t2", "local", "/root/code/hawdb", "hawdb", "2026-11-21T10:00:00Z")],
      projects: [{ name: "ducter", place: { kind: "repo", device: "local", repoPath: "/root/code/ducter" }, addedAt: "2026-11-20T00:00:00Z", remote: "github.com/wey-gu/ducter" }],
      waiters: [],
      counts: { needs_you: 0, working: 2, waiting: 0, done_today: 0 },
    },
  } as any);
  return { A, sent };
}

describe("Add a folder on any computer (D455)", () => {
  test("the sheet opens on the computer the latest work was on, its folders looked through there", async () => {
    const { A, sent } = await boot();
    A.openAddFolder();
    expect(A.sheet).toEqual({ kind: "addfolder" });
    expect(A.addf).toEqual({ device: "local", way: "choose" });
    expect(sent.some((f) => f.t === "task_new_options")).toBe(true);
    const b = sent.findLast((f) => f.t === "folder_browse");
    expect(b.device).toBeUndefined(); // the home itself
    // Another computer: one tap, its own folders.
    A.afPick("mini");
    expect(sent.findLast((f) => f.t === "folder_browse")).toMatchObject({ device: "mini" });
    // A path typed lists that folder and keeps what is typed.
    A.receive({ t: "folder_browse_result", ok: true, clientId: A.nt.browse!.cid, device: "mini", path: "/Users/ana", home: "/Users/ana", folders: [{ name: "dev", path: "/Users/ana/dev" }] } as any);
    A.ntBrowseFilter("~/dev/ha");
    expect(sent.at(-1)).toMatchObject({ t: "folder_browse", device: "mini", path: "/Users/ana/dev" });
    expect(A.nt.browse!.filter).toBe("~/dev/ha");
    A.receive({ t: "folder_browse_result", ok: true, clientId: A.nt.browse!.cid, device: "mini", path: "/Users/ana/dev/hawdb", home: "/Users/ana", parent: "/Users/ana/dev", folders: [], inRepo: { root: "/Users/ana/dev/hawdb", name: "hawdb", remote: "github.com/acme/hawdb" } } as any);
    A.ntBrowseUse();
    const add = sent.at(-1);
    expect(add).toMatchObject({ t: "project_add", device: "mini", path: "/Users/ana/dev/hawdb" });
    A.receive({ t: "project_add_result", ok: true, clientId: add.clientId, place: { place: { kind: "repo", device: "mini", repoPath: "/Users/ana/dev/hawdb" }, name: "hawdb", added: true } } as any);
    expect(A.sheet).toBeNull();
    expect(localStorage.getItem("ducter.onhand.lens")).toBe("hawdb");
  });

  test("clone and new folder are the same sheet on the chosen computer; Cancel closes it", async () => {
    const { A, sent } = await boot("en");
    A.openAddFolder();
    A.afWay("clone");
    expect(A.nt.list).toBe("clone");
    expect(A.nt.clone?.device).toBe("local");
    A.afWay("new");
    expect(A.nt.newFolder?.device).toBe("local");
    A.ntAddBack();
    expect(A.sheet).toBeNull();
    expect(sent.some((f) => f.t === "git_login")).toBe(true);
  });

  test("the lens says where each project lives, home first; the web never opens a local picker", async () => {
    const { A } = await boot();
    const { lensGroups } = await import("../src/onhand.tsx");
    const g = lensGroups();
    expect(g.find((x) => x.name === "ducter")?.where).toEqual(["Hetzner Server", "MacBook Pro"]);
    expect(g.find((x) => x.name === "hawdb")?.where).toEqual(["Hetzner Server"]);
    const src = await Bun.file(new URL("../src/addfolder.tsx", import.meta.url)).text();
    expect(src).not.toContain('type="file"');
    expect(src).not.toContain("showDirectoryPicker");
    void A;
  });

  test("browseNeedle reads a path or a name", () => {
    expect(browseNeedle("du", "/root", "/root")).toEqual({ dir: "", needle: "du" });
    expect(browseNeedle("~/code/ha", "/root", "/root")).toEqual({ dir: "/root/code", needle: "ha" });
    expect(browseNeedle("~/code/ha", "/root/code", "/root")).toEqual({ dir: "", needle: "ha" });
    expect(browseNeedle("/srv/", "/root", "/root")).toEqual({ dir: "/srv", needle: "" });
  });
});
