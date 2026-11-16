// D272 on the phone and in the browser: a project is any folder on the computer that does the work.
// 加一个文件夹… is one row per computer, opening its three ways in order (new folder, choose one
// there, clone); a new folder needs no git; the clone field says where that computer stands with
// GitHub and signs it in there (the code and link, then back to the clone, retried), or with a
// pasted key that is sent once and never kept. The web never opens a local picker.
import { afterAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";
import { ntGitHubish } from "../src/app.ts";

const hel = { id: "local", name: "Hetzner Server", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [] };
const mac = { id: "dev_mac", name: "Macbook Pro M3", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] };
const none = { place: { kind: "none" }, name: "" };
const helRepo = { place: { kind: "repo", device: "local", repoPath: "/root/ducter/projects/api" }, name: "api", defaultBranch: "main", computer: "Hetzner Server" };
const folders = [
  { device: "local", path: "/root/ducter" },
  { device: "dev_mac", path: "/Users/weyl/ducter-work" },
];

async function sheet(lang: "zh" | "en" = "zh", ds: any[] = [hel, mac]) {
  const { A } = await import("../src/app.ts");
  A.L = strings(lang);
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.S.welcomed = true;
  A.status = "connected";
  try {
    localStorage.clear();
  } catch {}
  A.nt.gh = undefined;
  A.nt.ghPanel = A.nt.add = A.nt.newFolder = A.nt.clone = undefined;
  A.pickWho("");
  A.openNewTask();
  A.receive({ t: "devices", devices: ds, reach: { clients: [] } } as any);
  A.receive({ t: "task_new_options", places: [helRepo, none], candidates: [{ harness: "codex", reason: { kind: "fit" }, device: "local", deviceName: "Hetzner Server" }], ducterFolders: folders } as any);
  return { A, sent };
}

describe("Add a folder on any computer (D272)", () => {
  test("one Add a folder… per computer; its three ways in order, on that computer; the web never opens a picker", async () => {
    const { A } = await sheet();
    expect(A.ntBrowsable().map((d) => d.id)).toEqual(["local", "dev_mac"]);
    A.ntAddOpen("local");
    expect(A.nt.list).toBe("add");
    const name = A.ntComputerName("local");
    expect([A.L.t("newtask.new", name), A.L.t("newtask.choose", name), A.L.t("newtask.clone")]).toEqual(["在 Hetzner Server 上新建一个文件夹", "选 Hetzner Server 上已有的文件夹", "从 Git 地址克隆"]);
    expect(A.L.t("newtask.new.line", A.ntProjectsPath("local"))).toBe("放在 /root/ducter/projects 里，不用 git");
    expect(A.ntProjectsPath("dev_mac")).toBe("~/ducter-work/projects");
    // Choose: the home's own folders through the home (folder_browse), never this device's picker.
    A.ntBrowse("local");
    expect(A.nt.list).toBe("browse");
    A.ntBrowseBack();
    expect(A.nt.list).toBe("add");
    const src = await Bun.file(new URL("../src/newtask.tsx", import.meta.url)).text();
    expect(src).not.toContain('type="file"');
    expect(src).not.toContain("showDirectoryPicker");
    A.sheet = null;
  });

  test("New folder on the Mac: the name goes to that computer; done, it is the card's place; a bad name says why", async () => {
    const { A, sent } = await sheet();
    A.ntAddOpen("dev_mac");
    A.ntNewOpen("dev_mac");
    expect(A.nt.list).toBe("newfolder");
    A.ntNewGo(); // nothing typed: nothing sent
    expect(sent.filter((f) => f.t === "project_new")).toHaveLength(0);
    A.ntNewInput("../x");
    A.ntNewGo();
    let ask = sent.at(-1);
    expect(ask).toMatchObject({ t: "project_new", name: "../x", device: "dev_mac" });
    A.receive({ t: "project_new_result", ok: false, clientId: ask.clientId, device: "dev_mac", reason: "invalid", message: "x" } as any);
    expect(A.nt.newFolder?.err).toBe("名字里不能有 / 或 \\，也不能以点开头。");
    A.ntNewInput("Trip plans");
    A.ntNewGo();
    ask = sent.at(-1);
    A.ntNewInput("changed"); // read-only while it is made
    expect(A.nt.newFolder?.name).toBe("Trip plans");
    const trip = { place: { kind: "folder", device: "dev_mac", path: "/Users/weyl/ducter-work/projects/Trip plans" }, name: "Trip plans", added: true };
    A.receive({ t: "project_new_result", ok: true, clientId: ask.clientId, device: "dev_mac", place: trip } as any);
    expect(A.chosenPlace().place).toEqual(trip.place);
    expect(A.nt.newFolder).toBeUndefined();
    expect(A.nt.list).toBe("");
    A.sheet = null;
  });

  test("on the home, the frame names no device", async () => {
    const { A, sent } = await sheet();
    A.ntNewOpen("local");
    A.ntNewInput("发票");
    A.ntNewGo();
    expect(sent.at(-1).t).toBe("project_new");
    expect(sent.at(-1).device).toBeUndefined();
    A.sheet = null;
  });
});

describe("Sign in to GitHub on that computer (D272)", () => {
  test("the clone field asks where it stands; signed out offers the sign-in; signed in says as whom; no gh says what to install", async () => {
    const { A, sent } = await sheet();
    A.ntCloneOpen("local");
    const st = sent.at(-1);
    expect(st).toMatchObject({ t: "git_login", action: "status" });
    expect(st.device).toBeUndefined();
    A.receive({ t: "git_login_state", host: "github.com", clientId: st.clientId, state: "signed_out" } as any);
    expect(A.ntGh("local")?.state).toBe("signed_out");
    A.receive({ t: "git_login_state", host: "github.com", device: "dev_mac", state: "no_gh" } as any);
    expect(A.ntGh("dev_mac")?.state).toBe("no_gh");
    expect(A.L.t("newtask.gh.as", "Hetzner Server", "wey-gu")).toBe("Hetzner Server 已用 wey-gu 登录 GitHub。");
    expect(A.L.t("newtask.gh.nogh", "Hetzner Server")).toContain("sudo apt install gh");
    expect(ntGitHubish("")).toBe(true);
    expect(ntGitHubish("nowledge-co/mem")).toBe(true);
    expect(ntGitHubish("https://github.com/nowledge-co/mem")).toBe(true);
    expect(ntGitHubish("git@gitlab.com:a/b.git")).toBe(false);
    A.sheet = null;
  });

  test("the author's case: a private repo fails for access; sign in there (code, link, copy), approved, and the clone goes again by itself", async () => {
    const { A, sent } = await sheet();
    A.ntCloneOpen("local");
    A.receive({ t: "git_login_state", host: "github.com", state: "signed_out" } as any);
    A.ntCloneInput("https://github.com/nowledge-co/mem");
    A.ntCloneGo();
    const k1 = sent.at(-1);
    A.receive({ t: "project_clone_result", ok: false, clientId: k1.clientId, reason: "no_access", message: "could not read Username" } as any);
    expect(A.nt.clone?.err).toBe("Hetzner Server 没有这个仓库的权限。在 Hetzner Server 上登录 GitHub，再试一次。");
    expect(A.nt.clone?.failedAccess).toBe(true);
    A.ntGhStart("local");
    const start = sent.at(-1);
    expect(start).toMatchObject({ t: "git_login", action: "start" });
    expect(A.nt.list).toBe("gh");
    A.receive({ t: "git_login_state", host: "github.com", clientId: start.clientId, state: "code", code: "7F3K-QW2M", url: "https://github.com/login/device" } as any);
    expect(A.nt.ghPanel?.code).toBe("7F3K-QW2M");
    // A new socket: the sign-in in flight is asked for again by its id (the same code comes back).
    A.receive({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as any);
    expect(sent.filter((f) => f.t === "git_login" && f.action === "start" && f.clientId === start.clientId)).toHaveLength(2);
    A.receive({ t: "git_login_state", host: "github.com", clientId: start.clientId, state: "signed_in", account: "wey-gu" } as any);
    expect(A.nt.list).toBe("clone");
    expect(A.nt.ghPanel).toBeUndefined();
    const again = sent.at(-1);
    expect(again).toMatchObject({ t: "project_clone", address: "https://github.com/nowledge-co/mem" });
    expect(again.clientId).not.toBe(k1.clientId);
    expect(A.ntGh("local")).toEqual({ state: "signed_in", account: "wey-gu" });
    A.sheet = null;
  });

  test("failures say why; cancel stops it; a key goes once and is cleared", async () => {
    const { A, sent } = await sheet("en");
    A.ntCloneOpen("dev_mac");
    A.ntGhStart("dev_mac");
    let start = sent.at(-1);
    expect(start.device).toBe("dev_mac");
    A.receive({ t: "git_login_state", host: "github.com", device: "dev_mac", clientId: start.clientId, state: "failed", reason: "expired" } as any);
    expect(A.nt.ghPanel?.err).toBe("The code expired. Try again for a new one.");
    A.ntGhStart("dev_mac");
    start = sent.at(-1);
    A.receive({ t: "git_login_state", host: "github.com", device: "dev_mac", clientId: start.clientId, state: "code", code: "AB12-CD34", url: "https://github.com/login/device" } as any);
    A.ntGhCancel();
    expect(sent.at(-1)).toMatchObject({ t: "git_login", action: "cancel", device: "dev_mac" });
    expect(A.nt.list).toBe("clone");
    // The key fallback.
    A.ntGhStart("dev_mac");
    A.ntGhTokenMode(true);
    const key = "ghp_" + "d".repeat(36);
    A.ntGhTokenInput(key);
    A.ntGhTokenGo();
    const ask = sent.at(-1);
    expect(ask).toMatchObject({ t: "git_login", action: "token", token: key, device: "dev_mac" });
    expect(A.nt.ghPanel?.tokenText).toBe("");
    expect(JSON.stringify(A.nt)).not.toContain(key);
    A.receive({ t: "git_login_state", host: "github.com", device: "dev_mac", clientId: ask.clientId, state: "failed", reason: "bad_token", message: "missing required scope 'read:org'." } as any);
    expect(A.nt.ghPanel?.err).toBe("GitHub didn't take that key: missing required scope 'read:org'");
    A.ntGhTokenInput(key);
    A.ntGhTokenGo();
    A.receive({ t: "git_login_state", host: "github.com", device: "dev_mac", clientId: sent.at(-1).clientId, state: "signed_in", account: "wey-gu" } as any);
    expect(A.nt.clone?.signedIn).toBe("Signed in to GitHub on Macbook Pro M3 as wey-gu.");
    A.sheet = null;
  });

  test("no gh on that computer: the panel says what to install and offers Check again", async () => {
    const { A, sent } = await sheet();
    A.ntCloneOpen("local");
    A.ntGhStart("local");
    A.receive({ t: "git_login_state", host: "github.com", clientId: sent.at(-1).clientId, state: "no_gh" } as any);
    expect(A.nt.ghPanel?.nogh).toBe(true);
    expect(A.nt.ghPanel?.err).toContain("brew install gh");
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
  A.nt.gh = undefined;
  A.nt.ghPanel = A.nt.add = A.nt.newFolder = A.nt.clone = undefined;
  A.sheet = null;
  A.devices = undefined;
  A.newTaskOptions = undefined;
});
