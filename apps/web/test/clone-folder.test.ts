// D204 on the phone and in the browser: 从 Git 地址加… / Add from a Git address… on any computer of
// the home (the clone runs there; the field says where it goes and with whose git; 在克隆…; a
// failure in one line; done, it is the card's place and picks the agent that waited); the folder
// list in the situations New task must survive with no dead end: hel + the Mac, the Mac away, an
// older Mac, a first run with no folders anywhere.
import { afterAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const hel = { id: "local", name: "hel", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [] };
const mac = { id: "dev_mac", name: "Macbook Pro M3", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] };
const devices = (ds: any[]) => ({ t: "devices", devices: ds, reach: { clients: [] } }) as any;
const none = { place: { kind: "none" }, name: "" };
const helRepo = { place: { kind: "repo", device: "local", repoPath: "/root/ducter/projects/api" }, name: "api", defaultBranch: "main", remote: "github.com/acme/api", computer: "hel" };
const atHel = [
  { harness: "codex", reason: { kind: "fit" }, device: "local", deviceName: "hel" },
  { harness: "claude-code", model: "opus", reason: { kind: "fit" }, blocked: "elsewhere", device: "dev_mac", deviceName: "Macbook Pro M3" },
];
const folders = [
  { device: "local", path: "/root/ducter" },
  { device: "dev_mac", path: "/Users/weyl/ducter-work" },
];

async function sheet(o: { ds?: any[]; places?: any[]; candidates?: any[]; ducterFolders?: any[]; lang?: "zh" | "en" } = {}) {
  const { A } = await import("../src/app.ts");
  A.L = strings(o.lang ?? "zh");
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.S.welcomed = true;
  A.status = "connected";
  try {
    localStorage.clear();
  } catch {}
  A.pickWho("");
  A.openNewTask();
  A.receive(devices(o.ds ?? [hel, mac]));
  A.receive({ t: "task_new_options", places: o.places ?? [helRepo, none], candidates: o.candidates ?? atHel, ...(o.ducterFolders !== undefined ? { ducterFolders: o.ducterFolders } : { ducterFolders: folders }) } as any);
  return { A, sent };
}

describe("Add from a Git address (D204)", () => {
  test("the user's case: Claude Code on the Mac, no copy there: clone it on the Mac from the phone, and the agent is picked", async () => {
    const { A, sent } = await sheet();
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    A.pickAgent(claude);
    expect(A.nt.placeOnly).toBe("dev_mac");
    // The Mac's rows: Find and Add from a Git address, both for the Mac.
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local", "dev_mac"]);
    A.ntCloneOpen("dev_mac");
    expect(A.nt.list).toBe("clone");
    // Where it goes: the Mac's real Ducter folder (here its fallback, ~/ducter was someone else's).
    expect(A.ntFolder("dev_mac")?.path).toBe("/Users/weyl/ducter-work");
    expect(A.L.t("newtask.clone.where", "~/ducter-work/projects", "Macbook Pro M3")).toBe("会放在 ~/ducter-work/projects，用 Macbook Pro M3 自己的 git 登录克隆。");
    A.ntCloneGo(); // nothing typed: nothing sent
    expect(sent.filter((f) => f.t === "project_clone")).toHaveLength(0);
    A.ntCloneInput("acme/api");
    A.ntCloneGo();
    const ask = sent.at(-1);
    expect(ask).toMatchObject({ t: "project_clone", address: "acme/api", device: "dev_mac" });
    expect(A.nt.clone?.cid).toBe(ask.clientId);
    A.ntCloneInput("changed"); // the field is read-only while it clones
    expect(A.nt.clone?.address).toBe("acme/api");
    const api = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/ducter-work/projects/api" }, name: "api", added: true, defaultBranch: "main", branches: ["main"] };
    A.receive({ t: "project_clone_result", ok: true, clientId: ask.clientId, device: "dev_mac", place: api } as any);
    expect(A.chosenPlace().place).toEqual(api.place);
    expect(A.nt.pick).toBe("dev_mac|claude-code");
    expect(A.nt.clone).toBeUndefined();
    expect(A.nt.list).toBe("");
    A.sheet = null;
  });

  test("on hel (the home) the frame names no device; failures say why in words; the socket coming back asks again with the same id", async () => {
    const { A, sent } = await sheet();
    A.ntCloneOpen("local");
    A.ntCloneInput("git@github.com:acme/private.git");
    A.ntCloneGo();
    const ask = sent.at(-1);
    expect(ask.t).toBe("project_clone");
    expect(ask.device).toBeUndefined();
    // A new socket: the clone in flight is asked for again, by the same id.
    A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as any);
    expect(sent.filter((f) => f.t === "project_clone" && f.clientId === ask.clientId)).toHaveLength(2);
    const why: Record<string, string> = {
      no_access: "hel 没有这个仓库的权限：先在 hel 上登录 git，再试一次。",
      not_found: "找不到这个仓库，或者 hel 没有它的权限。",
      network: "hel 连不上那个地址。",
      timeout: "克隆超过 10 分钟，已停止。",
      invalid: "这不像 Git 地址。试试 https://…、git@…:主人/仓库 或 主人/仓库。",
      offline: "hel 现在连不上。",
      old: "hel 上的 Ducter 需要更新，才能这样做。",
      failed: "没能克隆：destination path exists",
    };
    for (const [reason, line] of Object.entries(why)) {
      A.ntCloneGo();
      const k = sent.filter((f) => f.t === "project_clone").at(-1);
      A.receive({ t: "project_clone_result", ok: false, clientId: k.clientId, reason, message: "destination path exists." } as any);
      expect(A.nt.clone?.err).toBe(line);
      expect(A.nt.clone?.cid).toBeUndefined();
    }
    A.sheet = null;
  });

  test("English words", async () => {
    const { A } = await sheet({ lang: "en" });
    expect(A.L.t("newtask.clone")).toBe("Add from a Git address…");
    expect(A.L.t("newtask.clone.err.no_access", "Macbook Pro M3")).toBe("Macbook Pro M3 has no access to it: sign in to git on Macbook Pro M3, then try again.");
    expect(A.L.t("newtask.old.row", "Macbook Pro M3")).toBe("Ducter on Macbook Pro M3 needs an update");
    A.sheet = null;
  });
});

describe("New task with no dead end (D204 parity)", () => {
  test("an older Mac: no Find or clone rows for it, one greyed row saying to update it; its browse and add say so in words, not the server's English", async () => {
    const { A } = await sheet({ ducterFolders: [{ device: "local", path: "/root/ducter" }, { device: "dev_mac", old: true }] });
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local"]);
    expect(A.ntBrowsable(true).map((d) => d.id)).toEqual(["dev_mac"]);
    A.ntBrowse("dev_mac");
    A.receive({ t: "folder_browse_result", ok: false, clientId: A.nt.browse!.cid, device: "dev_mac", reason: "old", message: "Macbook Pro M3 runs an older Ducter that can't look through its folders yet; update it first." } as any);
    expect(A.nt.browse?.res?.reason).toBe("old");
    expect(A.L.t("newtask.old", A.ntBrowseName())).toBe("Macbook Pro M3 上的 Ducter 需要更新，才能这样做。");
    A.ntBrowseUse(); // nothing to use
    A.nt.adding = "p1";
    A.receive({ t: "project_add_result", ok: false, clientId: "p1", reason: "old", message: "Macbook Pro M3 runs an older Ducter…" } as any);
    expect(A.nt.err).toBe("Macbook Pro M3 上的 Ducter 需要更新，才能这样做。");
    A.sheet = null;
  });

  test("the Mac away: its places stay listed, but no Find or clone rows for it", async () => {
    const { A } = await sheet({ ds: [hel, { ...mac, state: "unreachable" }], ducterFolders: [{ device: "local", path: "/root/ducter" }] });
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local"]);
    expect(A.ntBrowsable(true)).toEqual([]);
    A.sheet = null;
  });

  test("home = this Mac alone, first run: no folders anywhere, and the list still offers Find, Add from a Git address and No folder", async () => {
    const solo = { id: "local", name: "Ana's MacBook", kind: "laptop", home: true, state: "awake", harnesses: [], abilities: [] };
    const { A } = await sheet({ ds: [solo], places: [none], candidates: [{ harness: "claude-code", model: "opus", reason: { kind: "fit" } }], ducterFolders: [{ device: "local", path: "/Users/ana/ducter" }] });
    expect(A.newTaskPlaces().filter((p) => p.place.kind !== "none")).toEqual([]);
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local"]);
    expect(A.L.t("newtask.empty")).toBe("还没有文件夹。");
    A.ntCloneOpen("local");
    expect(A.ntFolder("local")?.path).toBe("/Users/ana/ducter");
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
