// D651 (research/246): a reader's stream at real lengths, for the import service's memory and
// count checks: 300 threads, one of them 4,000 messages, Chinese and English mixed, the way months
// of one person's work looks.
import { IMPORT_FORMAT } from "../../src/imports/format.ts";

export interface LargeImport {
  text: string;
  threads: number;
  messages: number;
}

export function largeImport(now = Date.now()): LargeImport {
  const rows: string[] = [];
  const push = (r: unknown) => rows.push(JSON.stringify(r));
  const day = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  push({ t: "source", format: IMPORT_FORMAT, app: "Lody", account: "workspace:acme", reader: "lody-cli", readerVersion: "1" });
  const projects = ["hawdb", "mem", "ducter", "notes", "site", "infra"];
  let messages = 0;
  for (let i = 0; i < 300; i++) {
    const id = `thread-${i}`;
    const started = now - (i + 3) * day;
    const big = i === 0;
    push({
      t: "thread",
      id,
      title: i % 2 ? `查 compaction 和 WAL 的问题 #${i}` : `Fix the flaky WAL test #${i}`,
      folder: `/Users/me/src/${projects[i % projects.length]}`,
      repo: i % 3 === 0 ? `github.com/acme/${projects[i % projects.length]}` : undefined,
      agent: i % 2 ? "codex" : "claude-code",
      createdAt: iso(started),
      updatedAt: iso(started + 3_600_000),
      archived: i % 7 === 0,
    });
    const n = big ? 4000 : 3;
    for (let m = 0; m < n; m++) {
      push({
        t: "msg",
        thread: id,
        id: `m${m}`,
        role: m % 2 ? "assistant" : "user",
        text: m % 2 ? `它先和 checkpoint 抢跑。第 ${m} 条：修好之后连跑 500 次都过了。` : `The WAL test fails one run in five. 第 ${m} 条：看看 checkpoint 的时序。`,
        at: iso(started + m * 10_000),
      });
      messages++;
    }
    if (i % 5 === 0) push({ t: "skipped", thread: id, what: "attachment", n: 2 });
  }
  push({ t: "end", threads: 300, messages });
  return { text: rows.join("\n"), threads: 300, messages };
}
