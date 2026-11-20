// research/188: realistic document asks, each with the pitfall it carries (or none). A case is the
// ask (what the task's title and brief say), the person's language, and how its document is made.
import type { DocFindingCode } from "@ducter/protocol";
import { docx, latinPdf, pptx, type Block, type Shape } from "./make.ts";

export interface DocCase {
  id: string;
  ask: string;
  lang: "zh" | "en";
  /** The finding(s) its seeded defect must produce; empty: a clean document. */
  expect: DocFindingCode[];
  make: { html: string; name: string } | { bytes: () => Uint8Array; name: string };
}

// ---------- HTML drafts (printed by Chrome) ----------

const A4 = (css = "") => `<style>@page{size:A4;margin:18mm 18mm 20mm}*{box-sizing:border-box}body{font-family:"PingFang SC","Noto Sans CJK SC","Source Han Sans SC",-apple-system,sans-serif;font-size:10.5pt;line-height:1.6;color:#1d1d1f;margin:0}h1{font-size:20pt;margin:0 0 4mm}h2{font-size:13pt;margin:6mm 0 2mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:1.5mm 2mm;text-align:left;vertical-align:top}.meta{color:#666;font-size:9pt}${css}</style>`;
const SLIDE = (css = "") => `<style>@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"PingFang SC","Noto Sans CJK SC",-apple-system,sans-serif;color:#1d1d1f}.s{width:13.333in;height:7.5in;padding:0.7in 0.9in;page-break-after:always;overflow:hidden;position:relative}.s:last-child{page-break-after:auto}h1{font-size:40pt;margin:0 0 .3in}h2{font-size:30pt;margin:0 0 .25in}p,li{font-size:20pt;line-height:1.45}${css}</style>`;

const doc = (css: string, body: string) => `<!doctype html><html lang="zh"><head><meta charset="utf-8">${A4(css)}</head><body>${body}</body></html>`;
const deck = (css: string, slides: string[]) => `<!doctype html><html lang="zh"><head><meta charset="utf-8">${SLIDE(css)}</head><body>${slides.map((s) => `<section class="s">${s}</section>`).join("")}</body></html>`;

const WEEK = `<h1>本周进展（11 月 16 日–21 日）</h1><p class="meta">王 · 写给老板 · 2026 年 11 月 21 日</p>
<h2>做完的</h2><ul><li>结账跑腿上线：任务在自己的浏览器里一路做到结账页，付款只由本人在实时画面里点。</li><li>交付前复查：改了代码的结果先给另一个 AI 看一遍，36 个埋好的问题全部找到。</li><li>0.1.4 发布：桌面端、网页端和服务端同一天更新，没有回滚。</li></ul>
<h2>数字</h2><table><tr><th>指标</th><th>上周</th><th>本周</th></tr><tr><td>日活任务</td><td>212</td><td>264</td></tr><tr><td>需要人看的提醒</td><td>41</td><td>29</td></tr><tr><td>失败后自动接上</td><td>8</td><td>15</td></tr></table>
<h2>下周</h2><ul><li>文档交付的质量线：PDF 和幻灯片先自己看一遍每页再交。</li><li>iPhone 应用提交审核。</li></ul>`;

const WEEK_LONG = WEEK + `<h2>风险</h2><p>${"安卓签名密钥还没定下来，影响应用商店上架；第三方日历的授权在部分账号上会过期，需要提醒重新连接。".repeat(9)}</p><h2>细节</h2><p>${"每个任务的复查都记录在任务里，开发者可以打开看到另一个 AI 说了什么，以及任务怎么修的。".repeat(14)}</p>`;

const RESUME = `<!doctype html><html lang="en"><head><meta charset="utf-8">${A4("body{font-family:-apple-system,Helvetica,Arial,sans-serif}")}</head><body><h1>Lin Zhou</h1><p class="meta">Open-source developer · Shanghai</p><h2>Experience</h2><ul><li><b>Ducter</b>, author (2026). A self-deployed personal AI: one partner you talk to, its work run as tasks on Claude Code, Codex and pi.</li><li><b>A graph database company</b>, developer advocate (2021–2024). Retrieval demos, conference talks, the Python client.</li></ul><h2>Skills</h2><p>TypeScript, Go, Python; agent harnesses; distributed databases; technical writing in English and Chinese.</p><h2>Talks</h2><ul><li>Graph retrieval in practice, a Python conference, 2023.</li><li>Running agents you can trust, a local meetup, 2026.</li></ul></body></html>`;

const VISA = `<h1>日本旅游签证材料</h1><p class="meta">申请人：王 · 送签：上海 · 2026 年 12 月 3 日</p><h2>1. 材料清单</h2><table><tr><th>材料</th><th>说明</th><th>状态</th></tr>${["护照原件（有效期 6 个月以上）", "签证申请表（贴 4.5×3.5 cm 白底照片）", "在职证明（公司抬头纸，盖章）", "近 6 个月银行流水", "往返机票预订单", "酒店预订单（12 月 20 日–26 日）", "行程单（见第 2 页）"].map((m) => `<tr><td>${m}</td><td>原件或复印件，按领馆要求</td><td>已备齐</td></tr>`).join("")}</table><div style="page-break-before:always"></div><h2>2. 行程单</h2><table><tr><th>日期</th><th>城市</th><th>安排</th><th>住宿</th></tr>${["12 月 20 日|东京|抵达成田，入住|新宿华盛顿酒店", "12 月 21 日|东京|浅草寺、上野公园|同上", "12 月 22 日|东京|东京国立博物馆|同上", "12 月 23 日|京都|新干线前往京都，伏见稻荷|京都塔酒店", "12 月 24 日|京都|清水寺、祇园|同上", "12 月 25 日|大阪|大阪城、道顿堀|大阪难波酒店", "12 月 26 日|大阪|关西机场回国|—"].map((r) => `<tr>${r.split("|").map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table><div style="page-break-before:always"></div><h2>3. 在职与收入说明</h2><p>${"申请人在上海一家软件公司任职，月收入稳定，行程结束后按时回国上班。".repeat(6)}</p>`;

const PITCH = [
  `<h1>Ducter</h1><p>一个你自己部署的个人 AI：只跟一个伙伴说话，活儿交给 Claude Code、Codex 和 pi 去做。</p><p style="color:#666">种子轮融资 · 2026 年 11 月</p>`,
  `<h2>问题</h2><ul><li>同时开五六个 AI 助手，人成了它们之间的调度员。</li><li>结果对不对，最后还得自己一行行看。</li></ul>`,
  `<h2>我们的做法</h2><ul><li>一个伙伴汇报，只在真正要你拿主意时找你。</li><li>每件事都能打开看到底，也能随时接手。</li></ul>`,
  `<h2>进展</h2><ul><li>v1 已经在作者自己的三台电脑上每天跑。</li><li>0.1.4 发布，桌面、网页和手机同步。</li></ul>`,
  `<h2>要多少钱，做什么</h2><ul><li>种子轮 150 万美元。</li><li>12 个月：iPhone 和安卓上架，开源社区到 5 000 个星。</li></ul>`,
];

// ---------- decks (Office XML) ----------

const title = (text: string, size = 40): Shape => ({ x: 0.9, y: 0.6, w: 11.5, h: 1.2, paras: [{ text, size }] });
const body = (lines: string[], size = 22, h = 4.6): Shape => ({ x: 0.9, y: 2.0, w: 11.5, h, paras: lines.map((t) => ({ text: t, size })) });
const PITCH_SLIDES: Shape[][] = [
  [title("Ducter：你自己部署的个人 AI", 44), body(["只跟一个伙伴说话，活儿交给 Claude Code、Codex 和 pi 去做。", "种子轮融资 · 2026 年 11 月"])],
  [title("问题"), body(["同时开五六个 AI 助手，人成了它们之间的调度员。", "结果对不对，最后还得自己一行行看。"])],
  [title("我们的做法"), body(["一个伙伴汇报，只在真正要你拿主意时找你。", "每件事都能打开看到底，也能随时接手。"])],
  [title("进展"), body(["v1 已经在作者自己的三台电脑上每天跑。", "0.1.4 发布，桌面、网页和手机同步。"])],
  [title("要多少钱，做什么"), body(["种子轮 150 万美元。", "12 个月：iPhone 和安卓上架，开源社区到 5 000 个星。"])],
];

const WEEK_DOCX: Block[] = [
  { p: "本周进展（11 月 16 日–21 日）" },
  { p: "结账跑腿上线：任务在自己的浏览器里一路做到结账页，付款只由本人在实时画面里点。" },
  { p: "交付前复查：改了代码的结果先给另一个 AI 看一遍，36 个埋好的问题全部找到。" },
  { table: [["指标", "上周", "本周"], ["日活任务", "212", "264"], ["需要人看的提醒", "41", "29"]], cols: [2.5, 1.5, 1.5] },
  { p: "下周：文档交付的质量线；iPhone 应用提交审核。" },
];

export const CASES: DocCase[] = [
  // ----- PDF from an HTML draft -----
  { id: "weekly-onepage", ask: "帮我把这周的进展做成一页 PDF 发给老板", lang: "zh", expect: [], make: { name: "本周进展.pdf", html: doc("", WEEK) } },
  { id: "weekly-spills-to-two", ask: "帮我把这周的进展做成一页 PDF 发给老板", lang: "zh", expect: ["count"], make: { name: "本周进展.pdf", html: doc("", WEEK_LONG) } },
  {
    id: "weekly-wide-table",
    ask: "把这周各项目的情况做成 PDF 表格发给老板",
    lang: "zh",
    expect: ["overflow"],
    make: { name: "项目情况.pdf", html: doc("td,th{white-space:nowrap}table{width:auto}", `<h1>各项目情况</h1><table><tr>${["项目名称", "负责人", "开始日期", "结束日期", "当前状态", "风险说明", "下一步计划", "预算（万元）", "备注与链接", "所属季度", "评审人"].map((h) => `<th>${h}</th>`).join("")}</tr>${["结账跑腿|王|11-10|11-20|已上线|真实网站未验|接真实网站|12|research/185|Q4|李", "交付前复查|王|11-12|11-21|已上线|噪声 2/34|看真实运行|8|research/186|Q4|赵"].map((r) => `<tr>${r.split("|").map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`) },
  },
  {
    id: "weekly-title-runs-off",
    ask: "帮我把这周的进展做成一页 PDF 发给老板",
    lang: "zh",
    expect: ["overflow"],
    make: { name: "本周进展.pdf", html: doc("h1{white-space:nowrap;font-size:26pt}", WEEK.replace("本周进展（11 月 16 日–21 日）", "本周进展：结账跑腿上线、交付前复查与 0.1.4 发布（11 月 16 日–21 日）")) },
  },
  { id: "weekly-blank-page", ask: "帮我把这周的进展做成 PDF 发给老板", lang: "zh", expect: ["blank"], make: { name: "本周进展.pdf", html: doc("", WEEK.replace("<h2>下周</h2>", `<div style="page-break-after:always"></div><div style="page-break-after:always"></div><h2>下周</h2>`)) } },
  { id: "weekly-placeholders", ask: "帮我把这周的进展做成一页 PDF 发给老板", lang: "zh", expect: ["placeholder"], make: { name: "本周进展.pdf", html: doc("", WEEK.replace("王 · 写给老板", "[姓名] · 写给 [公司名称]")) } },
  {
    id: "weekly-in-english",
    ask: "帮我把这周的进展做成一页 PDF 发给老板",
    lang: "zh",
    expect: ["language"],
    make: { name: "weekly.pdf", html: `<!doctype html><html lang="en"><head><meta charset="utf-8">${A4()}</head><body><h1>This week (Nov 16–21)</h1><h2>Done</h2><ul><li>The errand to the checkout shipped: a task goes all the way to the pay page in its own browser; only the person pays, in the live view.</li><li>A second look before results go out: another AI reads code changes first; it caught all 36 seeded defects.</li><li>0.1.4 released on desktop, web and server the same day, with no rollback.</li></ul><h2>Next week</h2><ul><li>A quality bar for documents: look at every page before handing it over.</li><li>Submit the iPhone app for review.</li></ul></body></html>` },
  },
  { id: "weekly-tiny-text", ask: "帮我把这周的进展做成一页 PDF 发给老板", lang: "zh", expect: ["small"], make: { name: "本周进展.pdf", html: doc("body{font-size:5pt}h1{font-size:8pt}h2{font-size:6pt}", WEEK) } },
  {
    id: "weekly-stub-last-page",
    ask: "帮我把这周的进展做成 PDF 发给老板",
    lang: "zh",
    expect: ["stub"],
    make: { name: "本周进展.pdf", html: doc("", WEEK + `<p class="meta" style="page-break-before:always">以上数字截至 11 月 21 日中午。</p>`) },
  },
  { id: "resume-en", ask: "Make my resume into a one-page PDF I can send to recruiters", lang: "en", expect: [], make: { name: "Lin Zhou resume.pdf", html: RESUME } },
  { id: "visa-three-pages", ask: "把签证材料整理成一个 PDF", lang: "zh", expect: [], make: { name: "日本签证材料.pdf", html: doc("", VISA) } },
  // ----- a deck as a PDF from HTML slides -----
  { id: "pitch-five-slides", ask: "做个 5 页的融资 deck，PDF 就行", lang: "zh", expect: [], make: { name: "Ducter 融资.pdf", html: deck("", PITCH) } },
  { id: "pitch-six-slides", ask: "做个 5 页的融资 deck，PDF 就行", lang: "zh", expect: ["count"], make: { name: "Ducter 融资.pdf", html: deck("", [...PITCH, `<h2>团队</h2><p>作者一人，全职。</p>`]) } },
  {
    id: "pitch-title-runs-off",
    ask: "做个 5 页的融资 deck，PDF 就行",
    lang: "zh",
    expect: ["overflow"],
    make: { name: "Ducter 融资.pdf", html: deck(".s{overflow:visible}h1{white-space:nowrap}", [PITCH[0]!.replace("<h1>Ducter</h1>", "<h1>Ducter：一个你自己部署、只跟一个伙伴说话的个人 AI</h1>"), ...PITCH.slice(1)]) },
  },
  // ----- a PDF written with a Latin font -----
  { id: "latin-font-mojibake", ask: "把签证材料整理成一个 PDF", lang: "zh", expect: ["cjk"], make: { name: "签证材料.pdf", bytes: () => latinPdf([["日本旅游签证材料", "申请人：王", "1. 护照原件（有效期 6 个月以上）", "2. 签证申请表", "3. 在职证明"]]) } },
  { id: "latin-font-boxes", ask: "帮我把这周的进展做成一页 PDF 发给老板", lang: "zh", expect: ["cjk"], make: { name: "本周进展.pdf", bytes: () => latinPdf([["本周进展（11 月 16 日–21 日）", "结账跑腿上线", "交付前复查", "0.1.4 发布"]], { boxes: true }) } },
  { id: "latin-font-english-ok", ask: "Make a one-page PDF of this week's progress for my manager", lang: "en", expect: [], make: { name: "weekly.pdf", bytes: () => latinPdf([["This week (Nov 16-21)", "The errand to the checkout shipped.", "A second look before results go out.", "0.1.4 released on desktop, web and server."]]) } },
  { id: "not-a-pdf", ask: "把签证材料整理成一个 PDF", lang: "zh", expect: ["unreadable"], make: { name: "签证材料.pdf", bytes: () => new TextEncoder().encode("%PDF-1.4\n%broken, cut off while writing\n1 0 obj\n<< /Type /Catalog") } },
  // ----- decks -----
  { id: "pptx-pitch", ask: "做个 5 页的融资 deck", lang: "zh", expect: [], make: { name: "Ducter 融资.pptx", bytes: () => pptx(PITCH_SLIDES) } },
  {
    id: "pptx-text-overflows-box",
    ask: "做个 5 页的融资 deck",
    lang: "zh",
    expect: ["box"],
    make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES.slice(0, 3), [title("进展"), body(["v1 已经在作者自己的三台电脑上每天跑，覆盖了对话、手头的事、打开的任务、桌面应用、手机网页、服务器模式和工作机。", "0.1.4 发布，桌面、网页和手机同步，结账跑腿、交付前复查、小窗都在这一版里。", "下一步：真实网站上的结账、真实运行里的复查、iPhone 上架、安卓签名密钥、文档交付的质量线，还有每周一次在作者真实生活上的找东西测量。", "社区：GitHub 上开始有人提 issue，第一批用户来自作者的朋友圈和几个开发者群。"], 24, 3.2)], PITCH_SLIDES[4]!]) },
  },
  { id: "pptx-long-title", ask: "做个 5 页的融资 deck", lang: "zh", expect: ["box"], make: { name: "Ducter 融资.pptx", bytes: () => pptx([[title("Ducter：一个你自己部署、只跟一个伙伴说话、活儿交给现成智能体去做的个人 AI", 44), body(["种子轮融资 · 2026 年 11 月"])], ...PITCH_SLIDES.slice(1)]) } },
  { id: "pptx-picture-off-slide", ask: "做个 5 页的融资 deck", lang: "zh", expect: ["off"], make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES.slice(0, 3), [...PITCH_SLIDES[3]!, { x: 9.5, y: 3, w: 5.2, h: 3, picture: true }], PITCH_SLIDES[4]!]) } },
  { id: "pptx-placeholder", ask: "做个 5 页的融资 deck", lang: "zh", expect: ["placeholder"], make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES.slice(0, 4), [title("单击此处添加标题"), body(["种子轮 150 万美元。"])]]) } },
  { id: "pptx-blank-slide", ask: "做个 5 页的融资 deck", lang: "zh", expect: ["blank", "count"], make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES.slice(0, 2), [], ...PITCH_SLIDES.slice(2)]) } },
  { id: "pptx-seven-for-five", ask: "做个 5 页的融资 deck", lang: "zh", expect: ["count"], make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES, [title("团队"), body(["作者一人，全职。"])], [title("谢谢"), body(["联系方式见 GitHub。"])]]) } },
  { id: "pptx-big-title-fits", ask: "Make a short deck for Friday's demo", lang: "en", expect: [], make: { name: "Friday demo.pptx", bytes: () => pptx([[title("Friday demo", 54), body(["The errand to the checkout, live.", "A second look before results go out."], 28)], [title("What's next"), body(["The iPhone app in review.", "A quality bar for documents."], 28)]]) } },
  // ----- Word files -----
  { id: "docx-weekly", ask: "把这周进展写成 Word 文档发给老板", lang: "zh", expect: [], make: { name: "本周进展.docx", bytes: () => docx(WEEK_DOCX) } },
  { id: "docx-wide-table", ask: "把这周进展写成 Word 文档发给老板", lang: "zh", expect: ["wide"], make: { name: "本周进展.docx", bytes: () => docx([...WEEK_DOCX.slice(0, 3), { table: [["项目", "负责人", "开始", "结束", "状态", "风险", "下一步", "预算"], ["结账跑腿", "王", "11-10", "11-20", "已上线", "真实网站未验", "接真实网站", "12"]], cols: [1.4, 0.9, 0.9, 0.9, 0.9, 1.3, 1.3, 0.8] }]) } },
  { id: "docx-placeholder", ask: "Write my cover letter as a Word document", lang: "en", expect: ["placeholder"], make: { name: "Cover letter.docx", bytes: () => docx([{ p: "Dear [Hiring Manager Name]," }, { p: "I'm writing to apply for the developer advocate role. I built Ducter, a self-deployed personal AI, and spent three years explaining graph databases to developers." }, { p: "Best regards, Lin" }]) } },
  { id: "docx-english-for-zh", ask: "把这周进展写成 Word 文档发给老板", lang: "zh", expect: ["language"], make: { name: "weekly.docx", bytes: () => docx([{ p: "This week (Nov 16–21)" }, { p: "The errand to the checkout shipped: a task goes all the way to the pay page in its own browser; only the person pays." }, { p: "A second look before results go out: another AI reads code changes first; it caught all 36 seeded defects." }]) } },
  { id: "docx-picture-too-wide", ask: "把签证材料整理成 Word 文档", lang: "zh", expect: ["wide"], make: { name: "签证材料.docx", bytes: () => docx([{ p: "日本旅游签证材料：护照首页复印件如下。" }, { picture: 8.5 }]) } },
  // ----- clean ones written after the check was tuned (false alarms, held out) -----
  { id: "held-meeting-notes", ask: "把今天的会议纪要做成 PDF 发给大家", lang: "zh", expect: [], make: { name: "会议纪要.pdf", html: doc("", `<h1>周会纪要（11 月 21 日）</h1><p class="meta">参会：王、李、赵 · 记录：王</p><h2>结论</h2><ul><li>结账跑腿先在两个真实网站上试，下周三前给结果。</li><li>复查的误报率要在真实运行里再量一次，不只看埋好的例子。</li><li>文档交付的质量线这周做完，先 PDF 和幻灯片，Word 跟上。</li></ul><h2>讨论</h2><p>${"大家同意先把最常见的三种文档做好：一页的周报、几页的融资材料、签证这类要打印的材料。每一种都要中文字体正确、表格不出界、没有空白页。".repeat(10)}</p><h2>待办</h2><table><tr><th>事项</th><th>谁</th><th>什么时候</th></tr><tr><td>真实网站上的结账</td><td>王</td><td>11 月 25 日</td></tr><tr><td>复查的真实测量</td><td>李</td><td>11 月 27 日</td></tr><tr><td>TODO 列表搬到待办来源</td><td>赵</td><td>11 月 28 日</td></tr></table>`) } },
  { id: "held-wrapped-table", ask: "把这周各项目的情况做成 PDF 表格发给老板", lang: "zh", expect: [], make: { name: "项目情况.pdf", html: doc("table{table-layout:fixed}td,th{word-break:break-all;font-size:9pt}", `<h1>各项目情况</h1><table><tr>${["项目名称", "负责人", "开始日期", "结束日期", "当前状态", "风险说明", "下一步计划", "预算（万元）", "备注与链接", "所属季度", "评审人"].map((h) => `<th>${h}</th>`).join("")}</tr>${["结账跑腿|王|11-10|11-20|已上线|真实网站未验|接真实网站|12|research/185|Q4|李", "交付前复查|王|11-12|11-21|已上线|噪声 2/34|看真实运行|8|research/186|Q4|赵"].map((r) => `<tr>${r.split("|").map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`) } },
  { id: "held-resume-zh", ask: "帮我做一份一页的中文简历 PDF", lang: "zh", expect: [], make: { name: "简历.pdf", html: doc("", `<h1>周林</h1><p class="meta">开源开发者 · 上海 · 邮箱见附信</p><h2>经历</h2><ul><li><b>Ducter</b>，作者（2026）：自己部署的个人 AI，一个伙伴对话，活儿交给 Claude Code、Codex 和 pi。</li><li><b>一家图数据库公司</b>，开发者布道师（2021–2024）：检索演示、大会分享、Python 客户端。</li></ul><h2>技能</h2><p>TypeScript、Go、Python；智能体运行框架；分布式数据库；中英文技术写作。</p><h2>教育</h2><p>计算机科学学士。</p>`) } },
  { id: "held-pitch-en", ask: "Make a 5-slide pitch deck as a PDF", lang: "en", expect: [], make: { name: "Ducter pitch.pdf", html: `<!doctype html><html lang="en"><head><meta charset="utf-8">${SLIDE("body{font-family:-apple-system,Helvetica,sans-serif}")}</head><body>${["<h1>Ducter</h1><p>A personal AI you run yourself: one partner to talk to, its work done by Claude Code, Codex and pi.</p>", "<h2>The problem</h2><ul><li>Five assistants open at once, and you are their dispatcher.</li><li>You still read every result line by line.</li></ul>", "<h2>What we do</h2><ul><li>One partner reports, and asks only when it matters.</li><li>Every task can be opened and taken over.</li></ul>", "<h2>Where it stands</h2><ul><li>v1 runs daily on three of the author's computers.</li><li>0.1.4 shipped on desktop, web and phone.</li></ul>", "<h2>The ask</h2><ul><li>A $1.5M seed round.</li><li>12 months: the iPhone and Android apps out, 5,000 stars.</li></ul>"].map((x) => `<section class="s">${x}</section>`).join("")}</body></html>` } },
  { id: "held-pptx-dense", ask: "做个 5 页的融资 deck", lang: "zh", expect: [], make: { name: "Ducter 融资.pptx", bytes: () => pptx([...PITCH_SLIDES.slice(0, 4), [title("要多少钱，做什么"), body(["种子轮 150 万美元。", "6 个月：iPhone 上架，安卓签名定下来。", "12 个月：开源社区到 5 000 个星。", "钱主要花在两个全职工程师和测试设备上。", "每个月公开一次进展。"], 20)]]) } },
  { id: "held-docx-long", ask: "把签证材料的说明写成 Word 文档", lang: "zh", expect: [], make: { name: "签证说明.docx", bytes: () => docx([{ p: "日本旅游签证材料说明" }, ...Array.from({ length: 12 }, (_, i) => ({ p: `第 ${i + 1} 项：按领馆要求准备原件和复印件，复印件用 A4 纸，单面，不要装订。` })), { table: [["材料", "份数"], ["护照", "1"], ["照片", "2"]], cols: [3, 1.5] }]) } },
];
