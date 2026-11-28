// D651 (research/246): a demo core for the web client's screenshots of Past tasks with
// conversations brought in from another app. Four threads, read only, each with its own day and
// project (one folder gone, one chat-only), imported through the real service.
//   DUCTER_PORT=7512 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-import.ts
// Then the web at http://127.0.0.1:7512/app#past.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { IMPORT_FORMAT } from "@ducter/core/src/imports/format.ts";
import { importInto } from "@ducter/core/src/imports/service.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-import-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const core = startCore({ dataDir, push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const now = Date.now();
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number, hours = 0) => iso(now - days * DAY - hours * 3_600_000);
const rows: unknown[] = [{ t: "source", format: IMPORT_FORMAT, app: "Lody", account: "workspace:acme", reader: "lody-cli", readerVersion: "1" }];
const thread = (id: string, title: string, at: number, extra: Record<string, unknown> = {}) => ({
  t: "thread",
  id,
  title,
  createdAt: iso(at - 3 * 3_600_000),
  updatedAt: iso(at),
  ...extra,
});
const msg = (threadId: string, id: string, role: "user" | "assistant", text: string, at: string) => ({ t: "msg", thread: threadId, id, role, text, at });

// 1. A repo thread, two days ago.
const t1 = now - 2 * DAY - 5 * 3_600_000;
rows.push(thread("S-8f2a", w("WAL 尾部损坏时怎么回放", "Replaying the WAL with a torn tail"), t1, { folder: "/Users/ada/src/hawdb", repo: "github.com/acme/hawdb", branch: "fix-wal", agent: "codex", model: "gpt-5.5" }));
rows.push(msg("S-8f2a", "m1", "user", w("WAL 尾部损坏的时候，回放要跳过那条记录，别整个失败。", "When the WAL's tail is torn, replay should skip that record instead of failing the whole replay."), iso(t1 - 2 * 3_600_000)));
rows.push(msg("S-8f2a", "m2", "assistant", w("截断到最后一个校验和正确的记录，记一行警告，再加三个用例。", "Cut at the last record with a good checksum, log one warning, and add three cases."), iso(t1 - 3_600_000)));
rows.push(msg("S-8f2a", "m3", "user", w("就这么办，提交前先跑一遍崩溃测试。", "Do that, and run the crash test before committing."), iso(t1)));

// 2. A folder whose origin is known, four days ago.
const t2 = now - 4 * DAY - 2 * 3_600_000;
rows.push(thread("S-91c0", w("京都酒店和机票一起看", "Kyoto hotel and flights together"), t2, { folder: "/Users/ada/src/mem", agent: "claude-code" }));
rows.push(msg("S-91c0", "k1", "user", w("12 月 3 日到 6 日，京都站附近，能免费取消的。", "Dec 3 to 6, near Kyoto Station, free cancellation."), iso(t2 - 2 * 3_600_000)));
rows.push(msg("S-91c0", "k2", "assistant", w("Hotel Kanra 三晚含早，11 月 30 日前可取消；机票最便宜的是 12 月 2 日晚班。", "Hotel Kanra, three nights with breakfast, free to cancel until Nov 30; the cheapest flight is Dec 2 in the evening."), iso(t2)));

// 3. A folder that isn't on this computer any more, nine days ago.
const t3 = now - 9 * DAY - 4 * 3_600_000;
rows.push(thread("S-77aa", w("试一下旧的 parser", "Try the old parser"), t3, { folder: "/Users/ada/src/old-thing" }));
rows.push(msg("S-77aa", "o1", "user", w("把旧 parser 拉起来，喂一遍今年的日志看看还能不能读。", "Run the old parser and feed it this year's logs to see if it still reads."), iso(t3 - 3_600_000)));
rows.push(msg("S-77aa", "o2", "assistant", w("能读，但遇到 2026 年的新头会 Warn；先记下来，不改。", "It reads them, but warns on the 2026 header; noted, not changing it."), iso(t3)));

// 4. A chat-only app, no folders at all, twelve days ago.
const t4 = now - 12 * DAY - 3_600_000;
rows.push(thread("S-52bd", w("周末去哪儿", "Where to go this weekend"), t4));
rows.push(msg("S-52bd", "c1", "user", w("周末去苏州还是杭州？", "Suzhou or Hangzhou this weekend?"), iso(t4 - 3_600_000)));
rows.push(msg("S-52bd", "c2", "assistant", w("苏州更近，园林也适合慢慢逛；杭州要住一晚才不赶。", "Suzhou is closer and its gardens suit a slow day; Hangzhou needs a night to not be rushed."), iso(t4)));

rows.push({ t: "end", threads: 4, messages: 9 });

await importInto(
  {
    log: core.log,
    tasks: core.tasks,
    persona: "default",
    runId: () => "run_demo_import",
    folder: async (path: string) => {
      if (path.includes("old-thing")) return { exists: false } as never;
      const name = basename(path);
      return { exists: true, kind: "repo", root: path, name, remote: `github.com/acme/${name}` } as never;
    },
  },
  rows.map((r) => JSON.stringify(r)).join("\n"),
);

console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
