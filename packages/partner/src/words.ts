// What the partner's code says on its own (an ack it had to write, a card it builds), by
// language (D292). Tables exist for zh and en; any other language falls back through the chain
// (ko → en, zh-Hant → zh) until it has one. What the model says is always in the user's own
// language: these are only the lines the code writes when the model didn't.
import { fill, pickTag, words, type LangTag } from "../../protocol/src/lang.ts";
import { zhJoin } from "./bridge-out.ts";

const W = {
  zh: {
    ack: "好，我去做：{title}",
    // D380: a quick web look didn't settle it, so a browsing task takes it (when the model wrote no line).
    lookAck: "网上一下没查准，我开个任务仔细查：{title}",
    trustedBrief: "（你的 {agent} 让我做的；你说过它的活直接接。）",
    // D494: work handed to one of the person's helpers; its own brief follows.
    helperBrief: "（你的 {agent} 交给「{helper}」的；你开「{helper}」时就说好，交来的活直接接。）",
    // D598: the task on this home that handed it over; rework only its author should do goes back there through Ducter.
    helperBriefYou: "（你交给「{helper}」的；你开「{helper}」时就说好，交来的活直接接。）",
    helperFromTask: "（是任务 {task}「{title}」交过来的。需要它返工的，在 report_to_main 里说清要它改什么，Ducter 会叫醒它。）",
    // D598: work handed to a helper that none of its tasks took in time, said once, with the offer.
    helperStalled: "交给「{helper}」的「{gist}」过了 {min} 分钟还没有任务接手。要我直接开一个任务来做吗？",
    // D372: the first errand Ducter's default put on a faster model, said once.
    kindFirst: "这类跑腿的事我先交给 {fast}：更快，也给 {smart} 留着额度。想换就说。",
    // D435: the partner's own agent ran out (or fails): said once, by code, before the answer.
    heldQuota: "{from}的额度用完了，这会儿先用{to}答你，{at}换回来。",
    heldQuotaSoon: "{from}的额度用完了，这会儿先用{to}答你，{from}恢复了就换回来。",
    heldThrottle: "{from}这会儿太忙了，先用{to}答你，过一会儿换回来。",
    heldError: "{from}这会儿出错了，先用{to}答你，过一会儿再换回来试试。",
    waitQuota: "{from}的额度用完了，别的 AI 也接不上。{at}恢复后我接着回你，这期间发来的也按顺序回。",
    waitQuotaSoon: "{from}的额度用完了，别的 AI 也接不上。我隔一会儿试一次，好了就接着回你。",
    waitThrottle: "{from}这会儿太忙了，别的 AI 也接不上。过一会儿好了我就接着回你。",
    waitError: "{from}这会儿出错了，别的 AI 也接不上。我过几分钟再试，好了就接着回你。",
    // D449: a free key's day spent: the provider's own name and reset, and the paid way, never a guessed hour.
    waitFreeDay: "{provider}的免费额度今天用完了，{at}恢复；想不等的话，{more}。这期间发来的，到时按顺序回你。",
    waitFreeMinute: "{provider}的免费额度这一分钟用满了，{at}我接着回你。",
    heldFreeDay: "{provider}的免费额度今天用完了，这会儿先用{to}答你，{at}换回来。",
    // D440: a message while nothing on the home can think yet: kept, answered first once there is something.
    blind: "这句我先记下了。我还没有能用来想事情的 AI：贴一个 API 密钥，或者登录 Claude Code、Codex，有了我就先回你这句。",
    // D376: the first time the partner looks in the person's own sessions, said once.
    ownLook: "我看了 {computer} 上你在 {agents} 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。",
    // D377: the person's own records on a computer for tasks wait for their yes on its card.
    ownAsk: "你最近在 {computer} 上用过 {agents}，那台电脑上的记录我还没读过。在「你的设备」里打开 {computer}，点「读它们留下的记录」，我就去找。",
    yourAgent: "你的 {agent}",
    trustQuestion: "以后{agent}发来的事，直接接下？",
    trustGo: "直接接下",
    // D379: a saying never saved as a rule decided who does a task: asked once.
    saidQuestion: "你之前说过「{quote}」，这个就交给了 {agent}。记成一条规则吗？",
    saidGo: "记成规则",
    saidHold: "只这次",
    sendQuestion: "发给{who}？\n「{gist}」{whose}",
    sendWhose: "\n（就是发来「{theirs}」的那个）",
    sendGo: "发送",
    // D334: a teammate's agent writes for the first time (答应 / 不理, default 不理).
    senderAsk: "{team} 里{who}想找{name}：\n「{gist}」",
    senderAskNoTeam: "{who}想找{name}：\n「{gist}」",
    senderMemberAgent: "{member} 的 {agent}",
    senderHost: "{host} 里的 agent",
    senderSomeone: "一个没留名字的 agent",
    senderGo: "答应",
    senderHold: "不理",
  },
  en: {
    ack: "On it: {title}",
    lookAck: "A quick look didn't settle it, so a task is checking properly: {title}",
    trustedBrief: "(Your {agent} asked for this; you let its work start without asking.)",
    helperBrief: "(Your {agent} handed this to \"{helper}\"; making \"{helper}\" was your go for the work it takes.)",
    helperBriefYou: "(You handed this to \"{helper}\"; making \"{helper}\" was your go for the work it takes.)",
    helperFromTask: "(Task {task} \"{title}\" handed this over. If it needs rework only that task should do, say exactly what in report_to_main and Ducter wakes it.)",
    helperStalled: "“{gist}”, handed to “{helper}”, hasn't been taken by any of its tasks in {min} minutes. Shall I open a task and do it directly?",
    kindFirst: "Errands like this go to {fast} first: it's faster, and {smart}'s limit is kept for harder work. Say if you'd rather not.",
    heldQuota: "{from} is out of credit, so {to} is answering you for now. Back to {from} at {at}.",
    heldQuotaSoon: "{from} is out of credit, so {to} is answering you for now, until {from} is back.",
    heldThrottle: "{from} is too busy right now, so {to} is answering you for a little while.",
    heldError: "{from} isn't working right now, so {to} is answering you for a little while.",
    waitQuota: "{from} is out of credit and no other AI can take over. It's back at {at}; I'll answer then, and anything you send meanwhile, in order.",
    waitQuotaSoon: "{from} is out of credit and no other AI can take over. I'll keep trying and answer as soon as it's back.",
    waitThrottle: "{from} is too busy right now and no other AI can take over. I'll answer as soon as it eases.",
    waitError: "{from} isn't working right now and no other AI can take over. I'll try again in a few minutes and answer then.",
    waitFreeDay: "{provider}'s free allowance is used up for today. It's back at {at}; if you'd rather not wait, {more}. I'll answer anything you send meanwhile then, in order.",
    waitFreeMinute: "{provider}'s free allowance is full for this minute. I'll answer at {at}.",
    heldFreeDay: "{provider}'s free allowance is used up for today, so {to} is answering you for now. Back at {at}.",
    blind: "I've kept this. I have nothing to think with yet: paste an API key, or sign in to Claude Code or Codex, and answering you is the first thing I do.",
    ownLook: "I looked at your {agents} conversations on {computer}: only their names, folders, times and your first words, no code or files.",
    ownAsk: "You used {agents} on {computer} lately, and I haven't read its records yet. Open {computer} in Your devices and tap Read what they keep, and I'll look.",
    yourAgent: "your {agent}",
    trustQuestion: "Take work from {agent} without asking from now on?",
    trustGo: "Take it directly",
    saidQuestion: "You said before: “{quote}”. So this one went to {agent}. Keep that as a rule?",
    saidGo: "Keep it",
    saidHold: "Just this once",
    sendQuestion: 'Send this to {who}?\n"{gist}"{whose}',
    sendWhose: '\n(the one that wrote "{theirs}")',
    sendGo: "Send",
    senderAsk: '{who} in {team} wants to reach {name}:\n"{gist}"',
    senderAskNoTeam: '{who} wants to reach {name}:\n"{gist}"',
    senderMemberAgent: "{member}'s {agent}",
    senderHost: "An agent in {host}",
    senderSomeone: "An unnamed agent",
    senderGo: "Let it",
    senderHold: "Ignore",
  },
};
export type PartnerWord = keyof typeof W.en;

/**
 * The language of a line the code must say before the user has written anything with a language
 * (a fresh home, only "OK" so far). Chinese, as before D292: the partner's own lines to the
 * author's users started there. Every line says it in the user's language once one is known.
 */
export const NO_WORDS_YET: LangTag = "zh";

/** A line in `lang`: zh joined at its placeholders with zhJoin (a Latin name gets its space, D78). */
export function said(lang: LangTag | undefined, key: PartnerWord, vars: Record<string, string | number> = {}): string {
  const tpl = words(W, lang)[key];
  if (pickTag(lang, ["zh", "en"]) !== "zh") return fill(tpl, vars);
  return zhJoin(...tpl.split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? fill(p, vars) : p)));
}

const CLOCK = {
  zh: { tomorrow: "明天 {clock}", date: "{m} 月 {d} 日 {clock}" },
  en: { tomorrow: "tomorrow {clock}", date: "{mon} {d}, {clock}" },
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * D435: a time the person will meet again, as the clients write one: "20:53" today, "明天 9:00" /
 * "tomorrow 9:00", else the date ("11 月 23 日 9:00" / "Nov 23, 9:00"), in the home's own time.
 */
export function clockWords(lang: LangTag | undefined, iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; // the clients' own clock (apps/web format.ts clock)
  if (days <= 0) return clock;
  const w = words(CLOCK, lang);
  return fill(days === 1 ? w.tomorrow : w.date, { clock, m: d.getMonth() + 1, d: d.getDate(), mon: MON[d.getMonth()]! });
}
