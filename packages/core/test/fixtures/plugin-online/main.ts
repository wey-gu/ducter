// D670: an online reader fixture. It starts the declared `lody` command (a fake on PATH in
// tests) and opens a loopback socket; both are allowed only because its manifest declares an
// online use. Its stream is the same tiny fixture as the offline reader's, printed on stdout;
// the probe's answer goes to stderr so the import service never sees it.
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { readFileSync } from "node:fs";

let lody = "LODY_MISSING";
if (process.env.PROBE_LODY === "1") {
  const r = spawnSync("lody", ["workspace", "list", "--json"], { encoding: "utf8" });
  lody = r.status === 0 && r.stdout.includes("workspaces") ? "LODY_OK" : "LODY_DENIED";
  process.stderr.write(`${lody}\n`);
}

if (process.env.PROBE_PORT) {
  const port = Number(process.env.PROBE_PORT);
  await new Promise<void>((done) => {
    let said = false;
    const say = (w: string) => {
      if (said) return;
      said = true;
      process.stderr.write(`${w}\n`);
      done();
    };
    const s = connect(port, "127.0.0.1");
    s.on("connect", () => {
      say("SOCKET_OK");
      s.destroy();
    });
    s.on("error", () => say("SOCKET_DENIED"));
    setTimeout(() => {
      say("SOCKET_DENIED");
      s.destroy();
    }, 800);
  });
}

const threads = JSON.parse(readFileSync(new URL("./threads.json", import.meta.url), "utf8")) as {
  threads: { id: string; title: string; repo?: string; createdAt: string; updatedAt: string; messages: { id: string; role: string; text: string; at: string }[] }[];
};
const lines = [JSON.stringify({ t: "source", format: "ducter-import/1", app: "Fixture Online", account: "fixture-online", reader: "fixture-online", readerVersion: "0.1.0" })];
let messages = 0;
for (const th of threads.threads) {
  lines.push(JSON.stringify({ t: "thread", id: th.id, title: th.title, ...(th.repo ? { repo: th.repo } : {}), createdAt: th.createdAt, updatedAt: th.updatedAt }));
  for (const m of th.messages) {
    lines.push(JSON.stringify({ t: "msg", thread: th.id, id: m.id, role: m.role, text: m.text, at: m.at }));
    messages++;
  }
}
lines.push(JSON.stringify({ t: "end", threads: threads.threads.length, messages }));
process.stdout.write(`${lines.join("\n")}\n`);
void lody;
