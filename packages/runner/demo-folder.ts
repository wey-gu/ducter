// A demo core for D142 (a folder that isn't a git repo), with the real runner and a scripted
// harness in place of a model: it sorts a scratch folder of fake invoices into month folders
// and reports done, so the opened task's Changes, Undo all changes and Keep the changes run
// for real against the files. Never point it at a real folder.
//   DUCTER_PORT=7992 DUCTER_DATA_DIR=<scratch>/data DEMO_FOLDER=<scratch>/发票 DEMO_LANG=zh bun packages/runner/demo-folder.ts
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import { startCore } from "../core/src/index.ts";
import { createOarHarnessPort, createRunner, registerTaskTools } from "./src/index.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const folder = process.env.DEMO_FOLDER;
if (!folder || !process.env.DUCTER_DATA_DIR) throw new Error("set DEMO_FOLDER and DUCTER_DATA_DIR to scratch paths");

// 18 fake invoices over six months, flat in one folder, as a download folder holds them.
mkdirSync(folder, { recursive: true });
const vendors = ["滴滴出行", "京东", "美团", "顺丰", "中国移动", "Apple"];
for (let i = 0; i < 18; i++) {
  const m = String(5 + (i % 6)).padStart(2, "0");
  writeFileSync(join(folder, `${vendors[i % 6]}-2026${m}${String(3 + i).padStart(2, "0")}.pdf`), `%PDF-1.4 fake invoice ${i} 2026-${m}\n`);
}

const core = startCore({ persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
// The task tools as the MCP endpoint would call them (the scripted harness has no MCP client).
type Handler = (args: unknown, ctx: { role: string; taskId?: string }) => Promise<unknown>;
const tools = new Map<string, Handler>();
const register = core.mcp.register.bind(core.mcp);
core.mcp.register = (role, name, d, s, h) => (tools.set(name, h as Handler), register(role, name, d, s, h));
let runner: ReturnType<typeof createRunner>;
registerTaskTools(core as never, { folderChanges: (id) => runner.folderReport(id) });
const harness = createOarHarnessPort({
  loadRuntime: async () =>
    scriptedRuntime({
      id: "claude",
      async turn(t) {
        if (!t.input.includes("Start the task")) return t.say(w("好的。", "OK."));
        t.say(w("一共 18 张发票，跨 6 个月。按开票月份建文件夹，再挪进去。", "18 invoices across 6 months. Making a folder per month, then moving them in."));
        for (const f of readdirSync(folder).filter((f) => f.endsWith(".pdf"))) {
          const m = f.match(/-2026(\d\d)/)![1]!;
          mkdirSync(join(folder, `2026-${m}`), { recursive: true });
          renameSync(join(folder, f), join(folder, `2026-${m}`, f));
        }
        const id = core.tasks.list()[0]?.taskId ?? "";
        const report = { state: "done", summary: w("整理好了：18 张发票按月份放进了 6 个文件夹。", "Done: the 18 invoices are in 6 month folders."), evidence: [{ kind: "file", label: w("6 个月份文件夹", "6 month folders"), ref: "2026-05" }] };
        await t.tool("mcp__ducter__report_to_main", "{}", async () => JSON.stringify(await tools.get("report_to_main")!(report, { role: "task", taskId: id })));
      },
    }),
});
runner = createRunner(core as never, { harness });
core.setRunner(runner);
core.setPartner({ onTrigger() {} });
await runner.openTask({ persona: "default", title: w("把发票按月份整理好", "Sort my invoices by month"), brief: w("把「发票」里的 PDF 按月份放进各自的文件夹。", "Put the invoice PDFs into one folder per month."), place: { kind: "folder", device: "local", path: folder }, language: zh ? "zh" : "en" });
console.log(`[demo-folder] ${core.url}`);
