// D337 (research/118 #23): demo cores never read this machine's Mem, sound devices or phone.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { demoOptions } from "../demo-core.ts";

const dir = join(import.meta.dir, "..");

describe("demo cores use the pretend machine (D337)", () => {
  test("every demo that starts a core takes startCore from demo-core.ts", () => {
    const bad = readdirSync(dir)
      .filter((f) => /^demo.*\.ts$/.test(f) && f !== "demo-core.ts")
      .filter((f) => {
        const src = readFileSync(join(dir, f), "utf8");
        return /startCore\(/.test(src) && !/import \{[^}]*\bstartCore\b[^}]*\} from "\.\/demo-core\.ts"/.test(src);
      });
    expect(bad).toEqual([]);
  });

  test("what a demo leaves out is a fake: no nmem, no plugin check, the pretend speakers, no phone", async () => {
    const o = demoOptions({});
    expect(await o.bridgeLink!.run!(["status"])).toBeUndefined();
    expect(o.bridgeLink!.env!.NMEM_CLI_PATH).toBe("/nonexistent/nmem");
    expect(o.bridgeLink!.sys!.exists("/Applications/Nowledge Mem.app")).toBe(false);
    expect(await o.memPlugins!.inspectLocal!()).toBeUndefined();
    expect((await o.ownNumber!.listAudio!()).outputs).toEqual(["MacBook Air Speakers"]);
    expect((await o.ownNumber!.exec!(["devices"] as never)).out).not.toContain("\tdevice");
    expect(o.update!.homeName).toBe("Ada's MacBook Air"); // never this Mac's own name
  });

  test("a demo's own fake wins", async () => {
    const run = async () => ({ code: 0, out: "nmem 0.10.119", err: "" });
    const listAudio = async () => ({ inputs: [], outputs: ["USB Audio Device"], tool: true });
    const o = demoOptions({ bridgeLink: { run, env: {} }, ownNumber: { listAudio } });
    expect(o.bridgeLink!.run).toBe(run);
    expect(o.bridgeLink!.env).toEqual({});
    expect(o.ownNumber!.listAudio).toBe(listAudio);
  });
});
