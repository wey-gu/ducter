// D203 on the phone: the repos the Mac reports are places (found), so picking Claude Code on the
// Mac for hel's ducter switches to the Mac's copy (and keeps the branch once that copy says its
// branches); with no copy, the Mac's list shows its reported repos and 选择文件夹… / Find a
// folder…; the browser asks folder_browse, and using a folder adds it there and picks the agent.
import { afterAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const devices = {
  t: "devices",
  devices: [
    { id: "local", name: "hel", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [] },
    { id: "dev_mac", name: "Macbook Pro M3", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] },
  ],
  reach: { clients: [] },
} as any;
const helRepo = { place: { kind: "repo", device: "local", repoPath: "/root/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "next"], remote: "github.com/wey-gu/ducter", computer: "hel" };
const macDucter = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/dev/ducter" }, name: "ducter", defaultBranch: "main", remote: "github.com/wey-gu/ducter", found: true, computer: "Macbook Pro M3" };
const macMem = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/dev/mem" }, name: "mem", defaultBranch: "main", remote: "github.com/nowledge-co/mem", found: true, computer: "Macbook Pro M3" };
const none = { place: { kind: "none" }, name: "" };
const atHel = [
  { harness: "codex", reason: { kind: "fit" }, device: "local", deviceName: "hel" },
  { harness: "claude-code", model: "opus", reason: { kind: "fit" }, blocked: "elsewhere", device: "dev_mac", deviceName: "Macbook Pro M3" },
];

async function sheet(places: any[]) {
  const { A } = await import("../src/app.ts");
  A.L = strings("zh");
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.S.welcomed = true;
  A.status = "connected";
  try {
    localStorage.clear();
  } catch {}
  A.pickWho("");
  A.openNewTask();
  A.receive(devices);
  A.receive({ t: "task_new_options", places, candidates: atHel } as any);
  return { A, sent };
}

describe("Folders a computer reported (D203)", () => {
  test("the user's case: Claude Code on the Mac for hel's ducter switches to the Mac's reported copy, and keeps the branch once it says its branches", async () => {
    const { A, sent } = await sheet([helRepo, macDucter, macMem, none]);
    A.nt.branch = "next";
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    expect(A.ntCopyOn("dev_mac")?.place).toEqual(macDucter.place);
    A.pickAgent(claude);
    expect(A.chosenPlace().place).toEqual(macDucter.place);
    expect(A.nt.pick).toBe("dev_mac|claude-code");
    expect(sent.at(-1)).toEqual({ t: "task_new_options", place: macDucter.place });
    // The copy's branches arrive with the answer: the branch it has is kept.
    A.receive({ t: "task_new_options", places: [helRepo, { ...macDucter, branches: ["main", "next"] }, macMem, none], candidates: atHel } as any);
    expect(A.nt.branch).toBe("next");
    expect(A.nt.wantBranch).toBe("");
    A.sheet = null;
  });

  test("no copy on the Mac: its list holds its reported repos, and Find a folder… is offered for it", async () => {
    const { A } = await sheet([helRepo, macMem, none]);
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    A.pickAgent(claude);
    expect(A.nt.placeOnly).toBe("dev_mac");
    const mine = A.newTaskPlaces().filter((p) => p.place.kind !== "none" && A.placeComputer(p.place) === "dev_mac");
    expect(mine.map((p) => p.name)).toEqual(["mem"]);
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local", "dev_mac"]);
    expect(A.L.t("newtask.find")).toBe("选择文件夹…");
    expect(A.L.t("newtask.find.empty", "Macbook Pro M3")).toBe("还没有 Macbook Pro M3 上的文件夹。");
    A.sheet = null;
  });

  test("Find a folder… on the Mac: browse asks the Mac, goes in, and Use this folder adds it there and picks the agent that waited", async () => {
    const { A, sent } = await sheet([helRepo, none]);
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    A.pickAgent(claude);
    A.ntBrowse("dev_mac");
    expect(A.nt.list).toBe("browse");
    const ask = sent.at(-1);
    expect(ask).toMatchObject({ t: "folder_browse", device: "dev_mac" });
    expect(ask.path).toBeUndefined();
    A.receive({ t: "folder_browse_result", ok: true, clientId: ask.clientId, device: "dev_mac", path: "/Users/weyl", home: "/Users/weyl", folders: [{ name: "Sites", path: "/Users/weyl/Sites" }] } as any);
    expect(A.nt.browse?.res?.folders?.[0]?.name).toBe("Sites");
    A.ntBrowse("dev_mac", "/Users/weyl/Sites");
    const ask2 = sent.at(-1);
    expect(ask2).toMatchObject({ t: "folder_browse", device: "dev_mac", path: "/Users/weyl/Sites" });
    // A late answer to the first ask is ignored.
    A.receive({ t: "folder_browse_result", ok: true, clientId: ask.clientId, device: "dev_mac", path: "/Users/weyl", home: "/Users/weyl", folders: [] } as any);
    expect(A.nt.browse?.res).toBeUndefined();
    A.receive({ t: "folder_browse_result", ok: true, clientId: ask2.clientId, device: "dev_mac", path: "/Users/weyl/Sites", home: "/Users/weyl", parent: "/Users/weyl", folders: [{ name: "blog", path: "/Users/weyl/Sites/blog", repo: true }] } as any);
    A.ntBrowse("dev_mac", "/Users/weyl/Sites/blog");
    const ask3 = sent.at(-1);
    A.receive({ t: "folder_browse_result", ok: true, clientId: ask3.clientId, device: "dev_mac", path: "/Users/weyl/Sites/blog", home: "/Users/weyl", parent: "/Users/weyl/Sites", folders: [] } as any);
    A.ntBrowseUse();
    const add = sent.at(-1);
    expect(add).toMatchObject({ t: "project_add", path: "/Users/weyl/Sites/blog", device: "dev_mac" });
    const blog = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/Sites/blog" }, name: "blog", added: true, defaultBranch: "main", branches: ["main"] };
    A.receive({ t: "project_add_result", ok: true, clientId: add.clientId, place: blog } as any);
    expect(A.chosenPlace().place).toEqual(blog.place);
    expect(A.nt.pick).toBe("dev_mac|claude-code");
    expect(A.nt.list).toBe("");
    expect(sent.at(-1)).toEqual({ t: "task_new_options", place: blog.place });
    A.sheet = null;
  });

  test("Find a folder… on hel (the home) sends no device; an away computer says so in words", async () => {
    const { A, sent } = await sheet([helRepo, none]);
    A.ntBrowse("local");
    const ask = sent.at(-1);
    expect(ask.t).toBe("folder_browse");
    expect(ask.device).toBeUndefined();
    A.ntBrowse("dev_mac");
    A.receive({ t: "folder_browse_result", ok: false, clientId: sent.at(-1).clientId, device: "dev_mac", reason: "offline" } as any);
    expect(A.nt.browse?.res?.reason).toBe("offline");
    expect(A.L.t("newtask.find.offline", A.ntBrowseName())).toBe("Macbook Pro M3 现在连不上。");
    A.sheet = null;
  });
});

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  try {
    localStorage.removeItem("ducter.newtask.who");
    localStorage.removeItem("ducter.newtask.tune");
  } catch {}
  A.nt.words = "";
  A.nt.pick = "";
  A.sheet = null;
  A.devices = undefined;
  A.newTaskOptions = undefined;
});
