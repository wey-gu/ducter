// 你的设备 / Your devices on the phone (D148): every device and phone kept from the devices
// frame, the update's step in words, the card's actions sent to the server.
import { describe, expect, test } from "bun:test";
import { strings, TABLES } from "../src/i18n.ts";

describe("your devices (D148)", () => {
  const home = (update: Record<string, unknown>) =>
    ({
      t: "devices",
      devices: [{ id: "local", name: "vps-1", kind: "server", home: true, state: "awake", version: "0.0.3", harnesses: [], abilities: [], update: { current: "0.0.3", how: "self", ...update } }],
      reach: { clients: [{ id: "c1", name: "iPhone", platform: "ios", connected: true }] },
    }) as any;

  test("a devices frame keeps every device and phone; the card's update step reads in words", async () => {
    const { A } = await import("../src/app.ts");
    const { phaseLine: words, behind } = await import("../src/format.ts");
    const phaseLine = (u: any) => words(A.L, u);
    A.L = strings("zh");
    A.receive(home({ latest: "0.0.4", available: true }));
    expect(A.devices?.[0]?.update?.latest).toBe("0.0.4");
    expect(A.reach?.clients.map((c) => c.name)).toEqual(["iPhone"]);
    expect(behind(A.devices![0]!.update)).toBe(true);
    expect(phaseLine({ current: "0.0.3", available: true, how: "self", phase: "downloading", to: "0.0.4", progress: 0.4 })).toBe("在下载 0.0.4… 40%");
    expect(phaseLine({ current: "0.0.3", available: true, how: "self", phase: "waiting" })).toBe("等手头的事停好…");
    expect(phaseLine({ current: "0.0.4", available: false, how: "self", phase: "done", to: "0.0.4" })).toBe("回来了，现在是 0.0.4");
    expect(phaseLine({ current: "0.0.3", available: true, how: "self", phase: "failed", from: "0.0.3", rolledBack: true })).toBe("没更新成，已经换回 0.0.3");
    // Under way: no dot (the step says it), and no second tap.
    expect(behind({ current: "0.0.3", latest: "0.0.4", available: true, how: "self", phase: "restarting" })).toBe(false);
  });

  test("Update, Disconnect and Rename go to the server; a refusal is kept for the card", async () => {
    const { A } = await import("../src/app.ts");
    const sent: unknown[] = [];
    A.send = (f) => void sent.push(f);
    A.updateDevice("local");
    A.disconnectDevice("c1");
    A.renameDevice("c1", "Wey 的 iPhone");
    expect(sent).toEqual([
      { t: "device_update", device: "local" },
      { t: "disconnect_device", device: "c1" },
      { t: "rename_device", device: "c1", name: "Wey 的 iPhone" },
    ]);
    A.receive({ t: "update_result", device: "local", ok: false, reason: "checksum" } as any);
    expect(A.deviceAnswer).toEqual({ device: "local", reason: "checksum" });
    A.receive({ t: "update_result", device: "local", ok: true } as any);
    expect(A.deviceAnswer).toBeUndefined();
  });

  test("zh and en have the same device and update keys", () => {
    const keys = (l: "zh" | "en") => Object.keys(TABLES[l]).filter((k) => /^(devup|device\.|devices\.title|settings\.versions)/.test(k)).sort();
    expect(keys("zh")).toEqual(keys("en"));
  });

  test("D167: 没更新成 never on the version it went to, nor once the device moved on; a real one stays", async () => {
    const { A } = await import("../src/app.ts");
    const failed = (current: string, from = "0.0.6") => ({ current, latest: "0.0.7", available: current !== "0.0.7", how: "self", phase: "failed", from, to: "0.0.7", reason: "health", rolledBack: true });
    A.receive(home(failed("0.0.7")));
    expect(A.devices?.[0]?.update?.phase).toBeUndefined();
    A.receive(home({ ...failed("0.0.7"), from: "0.0.5", to: "0.0.6" }));
    expect(A.devices?.[0]?.update?.phase).toBeUndefined();
    A.receive(home(failed("0.0.6")));
    expect(A.devices?.[0]?.update).toMatchObject({ phase: "failed", reason: "health", rolledBack: true });
    A.receive(home(failed("0.0.6", "?")));
    expect(A.devices?.[0]?.update?.phase).toBe("failed");
  });

  test("D167: the devices section and its version block use shared controls only; 在查… lives in the version row", async () => {
    // D161: the devices section and the card live in devcard.tsx.
    const src = await Bun.file(new URL("../src/devcard.tsx", import.meta.url)).text();
    const body = (head: string) => {
      const at = src.indexOf(head);
      expect(at).toBeGreaterThan(-1);
      return src.slice(at, src.indexOf("\n}\n", at));
    };
    for (const head of ["function DucterLine(", "function Versions(", "export function DevicesSection("]) {
      const b = body(head);
      expect(b).not.toMatch(/<(button|input|select|textarea|a)[\s>]/);
      // Every handler sits on a shared component (Btn, Toggle), never on a bare element.
      for (const m of b.matchAll(/onClick=|onChange=/g)) {
        const tag = b.slice(b.lastIndexOf("<", m.index), m.index);
        expect(tag).toMatch(/^<(Btn|Toggle|ListRow|BackRow)\s/);
      }
    }
    // 在查… replaces 现在检查 in the one place it lives, beside what the home runs.
    const v = body("function Versions(");
    expect(v).toContain('t("devup.checking")');
    expect(src.split('t("devup.checking")').length).toBe(2);
  });
});
