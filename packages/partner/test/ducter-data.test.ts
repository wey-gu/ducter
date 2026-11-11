// D207: a task never works in Ducter's own data folder. Live (2026-11-11, a hel home): the partner
// gave its own working directory, `<dataDir>/partner`, as the task's folder, and the task rewrote
// the partner's state.json there. The call is refused before anything is said or opened, and the
// partner opens it again with no folder (a scratch folder of its own).
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPartner, resolvePlace, type PlaceFs } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script) {
  const clock = new FakeClock();
  const dataDir = mkdtempSync(join(tmpdir(), "ducter-data-test-"));
  mkdirSync(join(dataDir, "partner"), { recursive: true });
  const fc = fakeCore(clock, dataDir);
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { dataDir, fc, fr, partner, user };
}

test("task_open in the partner's own folder is refused before anything is said; the retry with no folder opens", async () => {
  let refused: { ok?: boolean; error?: string } | undefined;
  const { fc, fr, partner, user } = setup(async (_input, s) => {
    refused = (await fc.callTool("task_open", { title: "排查电话只播放开场白的问题", place: { kind: "folder", path: join(dataDirOf(fc), "partner") }, brief: "看看为什么电话只播开场白" })) as typeof refused;
    s.say("好，我去查一下。");
    await fc.callTool("task_open", { title: "排查电话只播放开场白的问题", place: { kind: "none" }, brief: "看看为什么电话只播开场白" });
    s.end();
  });
  user("电话接通后只播开场白就没声了，帮我查查");
  await partner.idle();
  expect(refused?.ok).toBe(false);
  expect(refused?.error).toContain("is Ducter's own data folder");
  expect(refused?.error).toContain('{"kind":"none"}');
  expect(fr.opened).toHaveLength(1);
  expect(fr.opened[0]!.place).toEqual({ kind: "none" });
  // No failed line in the conversation for the refused call.
  const failed = fc.events.filter((e) => e.kind === "job_status" && (e.body as { state?: string }).state === "failed");
  expect(failed).toHaveLength(0);
});

test("the data folder itself and a repo in it are refused too", async () => {
  const errors: string[] = [];
  const { fc, fr, partner, user } = setup(async (_input, s) => {
    for (const place of [{ kind: "folder", path: dataDirOf(fc) }, { kind: "repo", device: "local", repoPath: join(dataDirOf(fc), "partner") }]) {
      const r = (await fc.callTool("task_open", { title: "看看", place, brief: "b" })) as { error?: string };
      errors.push(r.error ?? "");
    }
    s.end();
  });
  user("看看");
  await partner.idle();
  expect(errors.every((e) => e.includes("is Ducter's own data folder"))).toBe(true);
  expect(fr.opened).toHaveLength(0);
});

test("a path in Ducter's data folder named in the words is never taken as the place", () => {
  const fs: PlaceFs = { isDir: () => true, isRepo: () => false, home: "/root", isDucterData: (p) => p === "/root/.ducter" || p.startsWith("/root/.ducter/") };
  expect(resolvePlace(undefined, ["看看 /root/.ducter/partner 里的 state.json"], [], fs)).toEqual({ kind: "none" });
  expect(resolvePlace(undefined, ["整理 ~/Documents/invoices"], [], fs)).toEqual({ kind: "folder", device: "local", path: "/root/Documents/invoices" });
});

function dataDirOf(fc: ReturnType<typeof fakeCore>): string {
  return (fc.core as { dataDir: string }).dataDir;
}
