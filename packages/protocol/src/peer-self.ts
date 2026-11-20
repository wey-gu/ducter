// D418: one of the person's own agents, by what its message says it is.
//
// Mem names few senders (nmem 0.10.121: every native session's agent is the generic "Bridge agent",
// and the member an id), so an own agent's line said 「一个没留名字的 agent」 even when its first words
// were 「我是 Wey 的 Mem 协作 Codex」 (hel, 2026-11-20). For a sender Mem says is the person's own
// (`mine: true`), what it says it is becomes its name, but only when it names a tool the person runs
// (Codex, Claude Code …): a message can't make itself 「你的银行」. A teammate's agent is never named
// from its own text (anyone can write "I'm Alex's reviewer").
//
// Also: whether a message is a contact or liveness test that asks only for an acknowledgement
// (`pingOf`), and the reply it asks for. Pure functions; the partner and the clients share them.
import { detect, words } from "./lang.ts";

/** The tools a person's agent may say it runs as, longest first (so "Claude Code" beats "Claude"). */
const TOOLS = ["Claude Code", "Gemini CLI", "Copilot CLI", "Grok Build", "Antigravity", "OpenCode", "Codex", "Cursor", "Gemini", "Copilot", "Grok", "Claude", "pi"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toolIn = (s: string): { tool: string; at: number; len: number } | undefined => {
  for (const t of TOOLS) {
    // A tool's name as a word ("Mem 协作 Codex", "Codex reviewer"), never inside another word.
    const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc(t)})(?=$|[^\\p{L}\\p{N}])`, t === "pi" ? "u" : "iu").exec(s);
    if (m) return { tool: t, at: m.index + m[1]!.length, len: m[2]!.length };
  }
  return undefined;
};

/** What an own agent says it is in its first lines: its tool and the rest of its own words for itself. */
export function ownAgentSelf(text: string): { agent: string; role?: string } | undefined {
  const head = text.split("\n").filter((l) => l.trim()).slice(0, 3).join("\n").slice(0, 400);
  const said: string[] = [];
  // 「我是 Wey 的 Mem 协作 Codex」 / 「我是你的 Codex」 / 「我是 Mem 协作 Codex」
  for (const m of head.matchAll(/我是\s*(?:[\p{L}\p{N}_.\- ]{1,20}?\s*的\s*)?([^，。,.!！？?；;:：\n“”"「」（）()]{2,30})/gu)) said.push(m[1]!);
  // "I'm Wey's Codex reviewer" / "This is your Claude Code" / "I am the Mem helper Codex"
  for (const m of head.matchAll(/\b(?:I am|I'm|I’m|this is)\s+(?:[\p{Lu}][\p{L}.\-]{0,20}['’]s\s+)?((?:your|the|an?)\s+)?([^,.;!?\n"“”()]{2,40})/giu)) said.push(m[2]!);
  for (const s of said) {
    const desc = s.trim().replace(/\s+/g, " ");
    const t = toolIn(desc);
    if (!t) continue;
    const role = (desc.slice(0, t.at) + " " + desc.slice(t.at + t.len))
      .replace(/(^|\s)(agent|session|会话|的)(?=\s|$)/giu, " ")
      .replace(/^[\s的\-–—:：]+|[\s的\-–—:：]+$/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const ok = role && [...role].length <= 16 && !/^(here|again|back|now|也|又)$/i.test(role);
    return { agent: t.tool, ...(ok ? { role } : {}) };
  }
  return undefined;
}

// ---------- contact tests ----------

/** What Ducter says back to a contact test that quotes nothing (D292: one table per language). */
const ACK = { zh: { got: "收到", stop: "。", running: "我正在运行。" }, en: { got: "Received", stop: ".", running: " I'm running." } };

const TEST_ZH = /(联络|联调|通信|连通|连接|联系|收发)测试|测试(一下)?(通信|联络|连接|连通|收发|能不能收到)|ping\b/iu;
const TEST_EN = /\b(contact|connectivity|connection|liveness|smoke|round[- ]trip|bridge|delivery)[- ]test\b|\bping\b|\btesting (the )?(connection|bridge|delivery)\b|\bare you (there|alive|up|online)\b/i;
const ASKS_REPLY = /(回复|回一句|回个|回我|回应|答复|回一下)|\b(reply|respond|answer|confirm|acknowledge)\b/i;
// A question about whether it runs is not an action ("说明你当前是否正在运行", "say whether you're running").
const RUNNING_ZH = /(说明|告诉我|说一下|讲一下)?(你)?(当前|现在|目前)?(是否|是不是|有没有)(正在|还在|在)?(运行|在线|工作)(中)?|你(当前|现在|目前)?(还)?(在|正在)(运行|线)(吗|么)?\s*[？?]?/gu;
const RUNNING_EN = /\b(say |tell me |and )?(whether|if) you('re| are)? (currently |still )?(running|online|up|alive|there)\b|\bare you (currently |still )?(running|online|up|alive|there)\b\s*\??/gi;
// What it says it does not ask: "不授权改文件、配置、身份或凭据" / "无需执行其他任务" / "don't change anything".
const NEGATED_ZH = /(不授权|不需要|无需|不用|不必|别(?!忘)|不要(?!忘)|请勿|勿|不是|不会|没有)[^，。,.;；!！？?\n]*/gu;
const NEGATED_EN = /\b(do not|don't|dont|no need to|without|never|not|nothing (else )?to)\b(?! forget)[^,.;!?\n]*/gi;
const ACTION_ZH = /(修改|改动|改一下|删除|删掉|提交|推送|执行|安装|部署|发布|创建|写入|转发|付款|支付|购买|登录|配置|合并|打开|运行|下载|上传|重启|关闭|发给|告诉.{0,6}(他|她|别人)|任务)/u;
const ACTION_EN = /\b(change|edit|delete|remove|commit|push|run|execute|install|deploy|publish|create|write|forward|pay|buy|log ?in|sign ?in|configure|merge|open|download|upload|restart|shut|send (it|this|that|to)|task|fix|review)\b/i;

/**
 * D418: a contact or liveness test that asks only to be acknowledged, and the reply it asks for: the
 * words it quotes ("请直接回复：“Ducter 已收到 3590a347df”"), plus that Ducter runs when it asks; else a
 * plain acknowledgement in its language. Anything that asks for more (a task, a change, a question
 * beyond "are you running", a link, code) is no ping. Only for the person's own agents (the caller's job).
 */
export function pingOf(text: string): { reply: string; zh: boolean } | undefined {
  const t = text.trim();
  if (!t || t.length > 600 || /https?:\/\/|```|\n\s*[-*\d]+[.)]?\s/.test(t)) return undefined;
  if (!TEST_ZH.test(t) && !TEST_EN.test(t)) return undefined;
  if (!ASKS_REPLY.test(t)) return undefined;
  const zh = /[一-鿿]/.test(t);
  // The words it asks back, quoted right after the ask to reply.
  const q = /(?:回复|回一句|回|reply|respond|answer)[^“"「\n]{0,24}[“"「]([^”"」\n]{1,80})[”"」]/iu.exec(t)?.[1]?.trim();
  const running = new RegExp(RUNNING_ZH.source, "u").test(t) || new RegExp(RUNNING_EN.source, "i").test(t);
  // What's left once the quoted reply, the running question and what it says it doesn't ask are gone.
  const rest = t
    .replace(/[“"「][^”"」\n]{0,80}[”"」]/gu, " ")
    .replace(RUNNING_ZH, " ")
    .replace(RUNNING_EN, " ")
    .replace(NEGATED_ZH, " ")
    .replace(NEGATED_EN, " ");
  if (ACTION_ZH.test(rest) || ACTION_EN.test(rest)) return undefined;
  // Any other question ("哪个 Space 读到的？", "what time is it there?") wants a real answer, not an ack.
  if (/[？?]/.test(rest.replace(/(你好|hello|hi)[？?]/gi, "")) || /(哪个|哪里|哪儿|什么|多少|几点|怎么|为什么|如何|吗)/u.test(rest)) return undefined;
  const w = words(ACK, detect(t)?.lang);
  const base = q ?? w.got;
  if (!running) return { reply: q ? base : `${base}${w.stop}`, zh };
  const end = /[。.!！]$/.test(base) ? "" : w.stop;
  return { reply: `${base}${end}${w.running}`, zh };
}
