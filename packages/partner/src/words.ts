// What the partner's code says on its own (an ack it had to write, a card it builds), by
// language (D292). Tables exist for zh and en; any other language falls back through the chain
// (ko → en, zh-Hant → zh) until it has one. What the model says is always in the user's own
// language: these are only the lines the code writes when the model didn't.
import { fill, pickTag, words, type LangTag } from "../../protocol/src/lang.ts";
import { zhJoin } from "./bridge-out.ts";

const W = {
  zh: {
    ack: "好，我去做：{title}",
    trustedBrief: "（你的 {agent} 让我做的；你说过它的活直接接。）",
    // D372: the first errand Ducter's default put on a faster model, said once.
    kindFirst: "这类跑腿的事我先交给 {fast}：更快，也给 {smart} 留着额度。想换就说。",
    // D376: the first time the partner looks in the person's own sessions, said once.
    ownLook: "我看了 {computer} 上你在 {agents} 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。",
    // D377: the person's own records on a computer for tasks wait for their yes on its card.
    ownAsk: "你最近在 {computer} 上用过 {agents}，那台电脑上的记录我还没读过。在「你的设备」里打开 {computer}，点「读它们留下的记录」，我就去找。",
    yourAgent: "你的 {agent}",
    trustQuestion: "以后{agent}发来的事，直接接下？",
    trustGo: "直接接下",
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
    trustedBrief: "(Your {agent} asked for this; you let its work start without asking.)",
    kindFirst: "Errands like this go to {fast} first: it's faster, and {smart}'s limit is kept for harder work. Say if you'd rather not.",
    ownLook: "I looked at your {agents} conversations on {computer}: only their names, folders, times and your first words, no code or files.",
    ownAsk: "You used {agents} on {computer} lately, and I haven't read its records yet. Open {computer} in Your devices and tap Read what they keep, and I'll look.",
    yourAgent: "your {agent}",
    trustQuestion: "Take work from {agent} without asking from now on?",
    trustGo: "Take it directly",
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
