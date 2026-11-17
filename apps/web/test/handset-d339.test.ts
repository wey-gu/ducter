// D339, from the author's phone loan on 0.0.69 (Codex on Hetzner Server, "用手机 Chrome 查看今天上海天气"):
// the task's head said "在 Hetzner Server 上用 Ducter 自己的浏览器" and the workbench offered 看它上网
// for a task that worked on their Pixel Fold. A task that asked for the person's own phone says
// where it works (在你的 Pixel Fold 上), and 看它上网 shows only once it used Ducter's browser.
// Settings › 用这台手机 says how to lend it while not holding it, never with its PIN.
import { describe, expect, test } from "bun:test";
import { strings, TABLES } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

const devices = {
  t: "devices",
  devices: [
    { id: "local", name: "Hetzner Server", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [{ id: "web", state: "on", where: "ducter" }] },
    { id: "dev_mac", name: "MacBook", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [] },
  ],
  reach: { clients: [{ id: "pix", name: "Pixel Fold", platform: "android-app", connected: true }] },
} as any;

const ev = (seq: number, kind: string, body: object) => ({ seq, ts: new Date(1_700_000_000_000 + seq * 1000).toISOString(), stream: "task:t1", origin: "task", kind, body }) as any;

function phoneTask() {
  const s = new Store();
  s.applyEvent(ev(1, "task_open", { taskId: "t1", title: "用手机 Chrome 查看今天上海天气", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "b" }));
  s.applyEvent(ev(2, "body_selected", { taskId: "t1", harness: "codex", why: { kind: "default", where: { device: "Hetzner Server", kind: "no_signin", uses: "ducter" } } }));
  return s;
}
const ask = ev(3, "report", { taskId: "t1", state: "needs_input", summary: "「用手机 Chrome 查看今天上海天气」想用你的 Pixel Fold", questions: [{ id: "handset_use", text: "…", blocking: true, reversible: false, handset: { kind: "use", device: "pix", name: "Pixel Fold" } }], evidence: [] });

describe("a phone task says where it works (D339)", () => {
  test("the ask in its stream makes the head say 在你的 Pixel Fold 上, never the computer's browser", async () => {
    const { A } = await import("../src/app.ts");
    const { taskWhere } = await import("../src/where.ts");
    A.L = strings("zh");
    A.receive(devices);
    const s = phoneTask();
    const before = s.tasks.get("t1")!;
    expect(taskWhere(before).line).toBe("在 Hetzner Server 上用 Ducter 自己的浏览器");
    s.applyEvent(ask);
    const task = s.tasks.get("t1")!;
    expect(task.phone).toEqual({ device: "pix", name: "Pixel Fold" });
    expect(taskWhere(task)).toEqual({ line: "在你的 Pixel Fold 上", why: "" });
    A.L = strings("en");
    expect(taskWhere(task).line).toBe("on your Pixel Fold");
  });

  test("看它上网 only once it used Ducter's browser", async () => {
    const { A } = await import("../src/app.ts");
    const { watchesBrowser } = await import("../src/where.ts");
    A.receive(devices);
    const s = phoneTask();
    s.applyEvent(ask);
    const task = s.tasks.get("t1")!;
    const prev = A.S.onHand;
    A.S.onHand = { tasks: [{ taskId: "t1", attention: "blocked", browsing: { device: "local" } }] } as any;
    try {
      expect(watchesBrowser(task, false)).toBe(false);
      // It opened a page there: now there is something to watch.
      s.applyEvent(ev(4, "task_event", { taskId: "t1", role: "system", text: "looking", raw: { browser: { host: "weather.com.cn", url: "https://weather.com.cn" } } }));
      expect(watchesBrowser(s.tasks.get("t1")!, false)).toBe(true);
      expect(watchesBrowser(s.tasks.get("t1")!, true)).toBe(false);
      // A browser task with no phone keeps D190's rule: holding the browser is enough.
      const plain = phoneTask().tasks.get("t1")!;
      expect(watchesBrowser(plain, false)).toBe(true);
    } finally {
      A.S.onHand = prev;
    }
  });

  test("Settings › 用这台手机: Smart Lock in Android's own words, and Ducter never asks for the PIN", () => {
    for (const lang of ["zh", "en"] as const) {
      expect(TABLES[lang]["handset.where.on"], lang).toContain("%s");
      expect(TABLES[lang]["handset.smartlock"], lang).toContain("Smart Lock");
    }
    expect(TABLES.zh["handset.smartlock"]).toContain("Ducter 从不要你的锁屏密码");
    expect(TABLES.en["handset.smartlock"]).toContain("Ducter never asks for your screen lock PIN");
  });
});
