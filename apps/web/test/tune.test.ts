// D202 on the phone: Who does it lists every agent on every computer (one on another computer than
// the folder's is "on {computer}", and picking it switches to that repo's copy there, or opens the
// folder list on that computer); under the chosen agent, its Model and Effort rows, the choice
// remembered per agent; the frame says model and effort only when they differ from the defaults.
import { afterAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

// The author's setup: the home is the server hel (Codex only); the Mac is its worker, with Claude Code.
const devices = {
  t: "devices",
  devices: [
    { id: "local", name: "hel", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [] },
    { id: "dev_mac", name: "Macbook Pro M3", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] },
  ],
  reach: { clients: [] },
} as any;
const helRepo = { place: { kind: "repo", device: "local", repoPath: "/root/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "next"], remote: "github.com/wey-gu/ducter", computer: "hel" };
const macRepo = { place: { kind: "repo", device: "Macbook Pro M3", repoPath: "/Users/weyl/dev/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "next"], remote: "github.com/wey-gu/ducter", added: true, computer: "Macbook Pro M3" };
const macNotes = { place: { kind: "folder", device: "Macbook Pro M3", path: "/Users/weyl/notes" }, name: "notes", added: true, computer: "Macbook Pro M3" };
const none = { place: { kind: "none" }, name: "" };
// Candidates at hel's folder, as core's ranking sends them (every: one on the Mac is "elsewhere").
const atHel = [
  { harness: "codex", reason: { kind: "fit" }, device: "local", deviceName: "hel" },
  { harness: "claude-code", model: "opus", reason: { kind: "fit" }, blocked: "elsewhere", device: "dev_mac", deviceName: "Macbook Pro M3" },
  { harness: "codex", reason: { kind: "fit" }, blocked: "elsewhere", device: "dev_mac", deviceName: "Macbook Pro M3" },
  { harness: "claude-code", model: "opus", reason: { kind: "fit" }, blocked: "not_installed", device: "local", deviceName: "hel" },
];
const atMac = [
  { harness: "claude-code", model: "opus", reason: { kind: "fit" }, device: "dev_mac", deviceName: "Macbook Pro M3" },
  { harness: "claude-code", model: "sonnet", reason: { kind: "fast" }, device: "dev_mac", deviceName: "Macbook Pro M3" },
  { harness: "codex", reason: { kind: "fit" }, device: "dev_mac", deviceName: "Macbook Pro M3" },
  { harness: "codex", reason: { kind: "fit" }, blocked: "elsewhere", device: "local", deviceName: "hel" },
];
const claudeModels = {
  harness: "claude-code",
  device: "dev_mac",
  from: "live",
  models: [
    { id: "opus", label: "Opus 5.5", suggested: true, efforts: ["low", "medium", "high", "xhigh", "max"] },
    { id: "sonnet", label: "Sonnet 5.5", efforts: ["low", "medium", "high", "xhigh", "max"] },
    { id: "haiku", label: "Haiku 5.5", efforts: ["low", "medium", "high", "xhigh", "max"] },
  ],
};
const codexModels = (device: string) => ({
  harness: "codex",
  device,
  from: "live",
  models: [
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", suggested: true, default: true, efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], defaultEffort: "low" },
    { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
  ],
});

async function sheet(places: any[], candidates: any[], models: any[]) {
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
  A.receive({ t: "task_new_options", places, candidates, models } as any);
  return { A, sent };
}

describe("Who does it, across computers (D202)", () => {
  test("hel's folder: Claude Code on the Mac is offered, on Macbook Pro M3; Codex on hel stays suggested", async () => {
    const { A } = await sheet([helRepo, macRepo, none], atHel, [codexModels("local"), claudeModels]);
    const { list, elsewhere } = A.ntCands();
    expect(list.map((c) => `${c.harness}@${c.device}`)).toEqual(["codex@local", "claude-code@dev_mac"]);
    expect([...elsewhere]).toEqual(["dev_mac|claude-code"]);
    expect(A.chosenCandidate()).toMatchObject({ c: { harness: "codex", device: "local" }, picked: false });
    expect(A.L.t("newtask.agent.elsewhere", "Macbook Pro M3")).toBe("在 Macbook Pro M3 上");
    A.sheet = null;
  });

  test("picking it switches to the repo's copy on the Mac (same remote), keeping the branch, and picks it", async () => {
    const { A, sent } = await sheet([helRepo, macRepo, none], atHel, [codexModels("local"), claudeModels]);
    A.nt.branch = "next";
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    expect(A.ntCopyOn("dev_mac")?.place).toEqual(macRepo.place);
    A.pickAgent(claude);
    expect(A.chosenPlace().place).toEqual(macRepo.place);
    expect(A.nt.branch).toBe("next");
    expect(sent.at(-1)).toEqual({ t: "task_new_options", place: macRepo.place });
    A.receive({ t: "task_new_options", places: [helRepo, macRepo, none], candidates: atMac, models: [claudeModels, codexModels("dev_mac")] } as any);
    expect(A.chosenCandidate()).toMatchObject({ c: { harness: "claude-code", device: "dev_mac" } });
    A.nt.words = "修一下登录页";
    A.startNewTask();
    // Claude Code is the Mac's own suggestion now, Opus and its default effort: nothing extra goes.
    expect(sent.at(-1)).toMatchObject({ t: "task_new", place: { kind: "repo", device: "Macbook Pro M3", repoPath: "/Users/weyl/dev/ducter", baseBranch: "next" } });
    expect(sent.at(-1).model).toBeUndefined();
    expect(sent.at(-1).effort).toBeUndefined();
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "offline" } as any);
    A.sheet = null;
  });

  test("no copy there: the folder list opens on that computer's places, and a folder there picks it", async () => {
    const { A, sent } = await sheet([helRepo, macNotes, none], atHel, [codexModels("local"), claudeModels]);
    const claude = A.ntCands().list.find((c) => c.harness === "claude-code")!;
    A.pickAgent(claude);
    expect(A.nt.list).toBe("place");
    expect(A.nt.placeOnly).toBe("dev_mac");
    expect(A.nt.pending).toBe("dev_mac|claude-code");
    expect(A.L.t("newtask.agent.needsfolder", "Macbook Pro M3")).toBe("文件夹要在 Macbook Pro M3 上");
    A.pickPlace(macNotes as any);
    expect(A.nt.pick).toBe("dev_mac|claude-code");
    expect(A.nt.placeOnly).toBeUndefined();
    expect(sent.at(-1)).toEqual({ t: "task_new_options", place: macNotes.place });
    A.sheet = null;
  });

  test("no remotes known: the exact folder name matches; one remote known and the other not: no match", async () => {
    const { sameRepo } = await import("../src/app.ts");
    const a = { place: { kind: "repo", device: "local", repoPath: "/root/ducter" }, name: "ducter" } as any;
    const b = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/w/ducter/" }, name: "ducter" } as any;
    expect(sameRepo(a, b)).toBe(true);
    expect(sameRepo({ ...a, remote: "github.com/x/ducter" }, b)).toBe(false);
    expect(sameRepo({ ...a, remote: "github.com/x/ducter" }, { ...b, remote: "github.com/y/ducter" })).toBe(false);
    expect(sameRepo({ ...a, place: { ...a.place, repoPath: "/root/ducter-2" } }, b)).toBe(false);
  });
});

describe("Model and effort (D202)", () => {
  test("defaults: the suggested model and its own default effort; the pill says them; nothing extra is sent", async () => {
    const { A, sent } = await sheet([helRepo, none], [atHel[0]!], [codexModels("local")]);
    const whoLabel = (c: any) => A.ntWhoLabel(c);
    const c = A.chosenCandidate().c!;
    const tu = A.ntTune(c);
    expect(tu.model?.id).toBe("gpt-6.1-terra");
    expect(tu.effort).toBe("low");
    expect(whoLabel(c)).toBe("Codex · GPT-6.1 Terra · 低");
    A.nt.words = "x";
    A.startNewTask();
    expect(sent.at(-1).harness).toBeUndefined();
    expect(sent.at(-1).effort).toBeUndefined();
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "offline" } as any);
    A.sheet = null;
  });

  test("a picked model and effort go with the agent, and are remembered for that agent on the next sheet", async () => {
    const { A, sent } = await sheet([macRepo, none], atMac, [claudeModels, codexModels("dev_mac")]);
    const whoLabel = (c: any) => A.ntWhoLabel(c);
    const c = A.chosenCandidate().c!;
    expect(c.harness).toBe("claude-code");
    // Claude Code lists no default effort: none is picked, and none is sent.
    expect(A.ntTune(c).effort).toBe("");
    A.pickTune(c, "model", "sonnet");
    A.pickTune(c, "effort", "high");
    expect(whoLabel(c)).toBe("Claude Code · Sonnet 5.5 · 高");
    A.nt.words = "x";
    A.startNewTask();
    expect(sent.at(-1)).toMatchObject({ harness: "claude-code", model: "sonnet", effort: "high" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "offline" } as any);
    A.openNewTask();
    A.receive({ t: "task_new_options", places: [macRepo, none], candidates: atMac, models: [claudeModels, codexModels("dev_mac")] } as any);
    const again = A.ntTune(A.chosenCandidate().c!);
    expect([again.model?.id, again.effort]).toEqual(["sonnet", "high"]);
    // Back to the model's default effort: "default" wins over the remembered level.
    A.pickTune(A.chosenCandidate().c!, "effort", "default");
    expect(A.ntTune(A.chosenCandidate().c!).effort).toBe("");
    // A model without effort levels shows no effort row.
    const codex = A.ntCands().list.find((x) => x.harness === "codex")!;
    expect(A.ntTune(codex).efforts.length).toBeGreaterThan(0);
    A.sheet = null;
  });

  test("effort words, zh and en", async () => {
    const { effortWord } = await import("../src/app.ts");
    const zh = strings("zh");
    const en = strings("en");
    expect(["low", "medium", "high", "xhigh", "max", "ultra"].map((e) => effortWord(zh, e))).toEqual(["低", "中", "高", "很高", "最高", "极限"]);
    expect(["low", "medium", "high", "xhigh", "max", "ultra"].map((e) => effortWord(en, e))).toEqual(["Low", "Medium", "High", "Extra high", "Max", "Ultra"]);
    expect(effortWord(en, "turbo")).toBe("turbo");
  });
});

// The app is one module for every web test file: leave it as a fresh client found it (no draft,
// no devices, nothing remembered), whatever order the files run in.
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
