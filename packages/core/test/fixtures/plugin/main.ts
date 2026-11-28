// D668 (research/246 §3.5): a tiny fixture reader. It reads only the file its manifest
// declares and prints `ducter-import/1`; it is the only reader the sandbox tests run.
import { readFileSync } from "node:fs";

interface FakeThread {
  id: string;
  title: string;
  folder?: string;
  repo?: string;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; role: "user" | "assistant"; text: string; at: string }[];
}

const data = JSON.parse(readFileSync(new URL("./threads.json", import.meta.url), "utf8")) as { threads: FakeThread[] };
const lines: string[] = [JSON.stringify({ t: "source", format: "ducter-import/1", app: "Fixture Notes", account: "fixture", reader: "fixture-reader", readerVersion: "0.1.0" })];
let messages = 0;
for (const thread of data.threads) {
  lines.push(JSON.stringify({ t: "thread", id: thread.id, title: thread.title, ...(thread.folder ? { folder: thread.folder } : {}), ...(thread.repo ? { repo: thread.repo } : {}), createdAt: thread.createdAt, updatedAt: thread.updatedAt, archived: false }));
  for (const m of thread.messages) {
    lines.push(JSON.stringify({ t: "msg", thread: thread.id, id: m.id, role: m.role, text: m.text, at: m.at }));
    messages++;
  }
}
lines.push(JSON.stringify({ t: "end", threads: data.threads.length, messages }));
process.stdout.write(`${lines.join("\n")}\n`);
