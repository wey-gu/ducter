// A demo core for the file viewer (D239): a task looked into why a file card opened a link on the
// home and showed what it made: its investigation (Markdown), the eval it ran (CSV), the fix
// (source), and a PDF (drawn page by page, D242). Open a card to read it in Ducter.
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-file.ts
// then open http://127.0.0.1:7797/app
import { readFileSync } from "node:fs";
import { startCore, stubRunner } from "@ducter/core";
import type { MediaRef } from "@ducter/protocol";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const store = (core as unknown as { media: { put(b: Uint8Array, o?: object): MediaRef } }).media;
const id = "t_file";
const enc = (s: string) => new TextEncoder().encode(s);
const put = (name: string, s: string | Uint8Array) => store.put(typeof s === "string" ? enc(s) : s, { files: true, name, from: { taskId: id } });

export const INVESTIGATION = zh
  ? `# 调查：点开文件为什么会打开 hel 上的链接

**结论：** Mac 上的文件卡片把「打开」交给了默认浏览器，地址是家里那台主机（hel）上的文件地址，带着这个文件的钥匙。浏览器里看到的是一页没排版的原文，地址还留在了浏览记录里。

## 发生了什么

1. 任务做完，把 \`investigation.md\` 交给了家里的主机。
2. 卡片上的 **打开** 调用 \`OpenURL(home + "/media/<id>?k=<钥匙>&dl=1")\`。
3. 浏览器打开了 hel 的地址。

| 地方 | 打开的是 | 带着什么 |
|---|---|---|
| Mac | 默认浏览器，hel 的地址 | 这个文件的钥匙 |
| 手机网页 | 新标签页 | 这个文件的钥匙 |
| 设备令牌 | 没有带 | — |

> 钥匙只能取这一个文件，但它不会过期；浏览器同步了历史，别的设备上也能看到。

## 怎么改

- [x] 文件在 Ducter 里打开：Markdown 排好版，代码带颜色和行号
- [x] **存一份** 走这台设备自己，不再去 hel 的地址
- [ ] PDF 的页面在 Ducter 里画出来（以后）

\`\`\`ts
// 以前
a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))
// 现在
a.OpenFile(ref, card)
\`\`\`

---

这件事不用你做什么；下次任务交来的文件，点一下就在这里读。
`
  : `# Investigation: why opening a file opened a link on hel

**In short:** the Mac's file card handed Open to the default browser with the file's address on the home (hel), carrying that file's key. The browser showed the raw text, and the address stayed in its history.

## What happened

1. The task finished and handed \`investigation.md\` to the home.
2. **Open** on the card called \`OpenURL(home + "/media/<id>?k=<key>&dl=1")\`.
3. The browser opened hel's address.

| Where | What opened | What it carried |
|---|---|---|
| Mac | the default browser, hel's address | the file's key |
| Phone web | a new tab | the file's key |
| Device token | not carried | — |

> The key fetches only this one file, but it never expires, and a synced browser history shows it on other devices too.

## The fix

- [x] Files open inside Ducter: Markdown laid out, code with its colours and line numbers
- [x] **Save a copy** goes through this device, never to hel's address
- [ ] PDF pages drawn inside Ducter (later)

\`\`\`ts
// before
a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))
// after
a.OpenFile(ref, card)
\`\`\`

---

Nothing for you to do; the next file a task hands you opens right here.
`;

export const EVAL_CSV = `scenario,model,turns,result,cost_usd
reply-older-result,haiku,3,pass,0.012
reply-two-at-once,haiku,4,pass,0.015
reply-find,haiku,2,pass,0.009
reply-out-of-window,haiku,3,pass,0.011
reply-open-question,haiku,2,pass,0.008
open-file-in-ducter,haiku,2,pass,0.007
"save a copy, not a link",haiku,3,fail,0.013
`;

export const FIX_GO = `package views

// fileCard is a file a task showed: one line with its kind, name, size and
// Open. D239: Open reads it inside Ducter, growing out of the card.
func (a *App) fileCard(c *ui.Context, ref *protocol.MediaRef) {
	t := a.T
	name := firstNonEmpty(ref.Name, a.L.T("media.file"))
	card := ui.Row(c.Key("file:" + ref.ID)).Gap(t.S3).AlignItems(ui.Center)
	if card.Clicked() {
		a.OpenFile(*ref, card.Bounds())
	}
}
`;

const md = put("investigation.md", INVESTIGATION);
const csv = put(zh ? "评测结果.csv" : "eval-results.csv", EVAL_CSV);
const go = put("media.go", FIX_GO);
// D242: a real PDF draws page by page (DEMO_PDF: the research report printed); else a stand-in, said plainly.
const pdfBytes = process.env.DEMO_PDF ? new Uint8Array(readFileSync(process.env.DEMO_PDF)) : enc("%PDF-1.7\n% a stand-in\n" + "x".repeat(180_000));
const pdf = put(zh ? "Ducter 文件查看器调研.pdf" : "Ducter file viewer research.pdf", pdfBytes);

const log = core.log;
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "为什么我点开一个文件，打开的居然是 hel 上的链接？查一下" : "Why did opening a file open a link on hel? Look into it" } } as never);
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "点开文件为什么去了 hel" : "Why a file opened on hel", project: "", place: { kind: "none" }, harness: "claude-code", brief: "" } } as never);
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: { text: zh ? "查清楚了：卡片把文件交给了浏览器，打开的是 hel 上带钥匙的地址。经过写在调查里，另附评测和改法。" : "Found it: the card handed the file to the browser, at hel's address with its key. The investigation has the story, with the eval and the fix.", media: [md, csv, go, pdf] },
} as never);
core.tasks.setState(id, "done", "warm");

console.log(`[demo] http://127.0.0.1:${core.port}/app`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
