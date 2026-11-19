// D402 (research/164): eleven "waiting for your reply" mails shaped like the ones hel said by itself
// over 2026-11-12 to 11-18 (all held, none acted on), rebuilt as synthetic mail: every person,
// company, domain and address is made up (example.com/.org/.net), except GitHub's own notification
// sender, which is a service, not a person. Each carries what a cheap model said of it, as triage
// did on hel (a GitHub relay mail marked as a person; an ask with no words). Added to the aha week
// (aha-days.ts: Wed 2026-11-18 07:00 to Fri 11-20 12:00, Asia/Shanghai).
//
//   worth a tap (a real person, a real ask, getting old, not answered anywhere):
//     w_sub      a customer they wrote to before: paid for Plus, still shows "Not active"
//     w_build    a tester: a signed Apple Silicon test build
//     w_import   a user asking again: is large-file import fixed
//     w_409      a user with only a number for a name: POST /memories answers 409
//   silent:
//     w_refund   a reimbursement asked 20 days before the watch began and never mentioned since: too old to be news
//     w_expo     an event's drip mail asking again to confirm attendance (a stranger's invitation)
//     w_link     a networking bot asking for a booking link
//     w_camp     an invitation to a camp
//     w_agency   an agency's sales address offering freelance talent
//     w_gh       GitHub's notification relay ("Wei Wang via GitHub"): GitHub is where it is answered
//     w_blank    a colleague whose ask the model could not put in words
import type { FakeMail, Triaged } from "./inbox.ts";
import { ME } from "./inbox.ts";

const T = (s: string) => new Date(Date.parse(s)).toISOString();
/** The run with these starts the Monday before the aha days (hel watched all along). */
export const WAITING_START = Date.parse("2026-11-09T07:00:00+08:00");
const ask = (what: string, o: { again?: boolean } = {}): Triaged => ({ person: true, needsAnswer: true, ...(o.again ? { again: true } : {}), facts: [{ type: "ask", what }] });

export interface WaitingCase {
  id: string;
  /** A word its find must contain when it is said. */
  name: string;
  worth: boolean;
  /** The language its thread is in (the draft must be in it). */
  lang?: "en" | "zh" | "ja";
}

export const WAITING_CASES: WaitingCase[] = [
  { id: "w_sub", name: "Kenji", worth: true, lang: "ja" },
  { id: "w_build", name: "Haoyu", worth: true, lang: "en" },
  { id: "w_import", name: "CamLi", worth: true, lang: "zh" },
  { id: "w_409", name: "4471", worth: true, lang: "en" },
  { id: "w_refund", name: "Theo", worth: false },
  { id: "w_expo", name: "Irina", worth: false },
  { id: "w_link", name: "Linky", worth: false },
  { id: "w_camp", name: "Yuka", worth: false },
  { id: "w_agency", name: "Talentia", worth: false },
  { id: "w_gh", name: "Wei", worth: false },
  { id: "w_blank", name: "Yue", worth: false },
];

/** The mail, with the person's own earlier replies (their voice, and who they know). */
export function waitingMail(): { mail: FakeMail[]; triage: Record<string, Triaged> } {
  const mail: FakeMail[] = [
    // The person's own sent mail: their voice (short, warm, signs "Wey"), and Kenji is someone they wrote to.
    { id: "s_kenji", threadId: "t_kenji_old", from: `Wey <${ME}>`, to: ["kenji@kmail.example.jp"], subject: "Re: ログインについて", snippet: "Kenji さん、ご連絡ありがとうございます。直しましたので、もう一度お試しください。Wey", date: T("2026-11-02T10:00:00+08:00"), labelIds: ["SENT"] },
    { id: "s_mia", threadId: "t_mia_old", from: `Wey <${ME}>`, to: ["mia@example.org"], subject: "Re: release notes", snippet: "Thanks Mia, looks good. Ship it. Wey", date: T("2026-11-06T18:00:00+08:00"), labelIds: ["SENT"] },
    { id: "s_lin", threadId: "t_lin_old", from: `Wey <${ME}>`, to: ["lin@example.org"], subject: "Re: 周会", snippet: "好的，周四聊。Wey", date: T("2026-11-09T11:00:00+08:00"), labelIds: ["SENT"] },
    // Worth a tap.
    { id: "w_sub", threadId: "t_sub", from: "Kenji Example <kenji@kmail.example.jp>", to: [ME], subject: "Plus を購入しましたが Not active のままです", snippet: "Plus を購入しましたが、アカウントは Not active のままです。確認していただけますか？", date: T("2026-11-15T09:00:00+08:00") },
    { id: "w_build", threadId: "t_build", from: "Haoyu Zhang <haoyu@devmail.example.com>", to: [ME], subject: "Signed Apple Silicon build?", snippet: "Could you share a signed Apple Silicon test build? The unsigned one won't open on my M3.", date: T("2026-11-12T11:00:00+08:00") },
    { id: "w_import1", threadId: "t_import", from: "CamLi <camli@qmail.example.cn>", to: [ME], subject: "大文件导入一直报错", snippet: "导入 200MB 的文件一直报错，重建搜索也失败。", date: T("2026-11-13T14:00:00+08:00") },
    { id: "w_import2", threadId: "t_import", from: "CamLi <camli@qmail.example.cn>", to: [ME], subject: "Re: 大文件导入一直报错", snippet: "再问一下，大文件导入修好了吗？", date: T("2026-11-16T15:00:00+08:00") },
    { id: "w_409", threadId: "t_409", from: "4471902233@qmail.example.cn", to: [ME], subject: "POST /memories returns HTTP 409", snippet: "Every POST /memories answers 409 Conflict since yesterday. Any idea?", date: T("2026-11-15T16:00:00+08:00") },
    // Silent.
    { id: "w_refund", threadId: "t_refund", from: "Theo Jiang <theo@pmail.example.com>", to: [ME], subject: "MacBook Pro 报销付款", snippet: "上个月买的 MacBook Pro，报销麻烦安排一下付款。", date: T("2026-10-20T14:00:00+08:00") },
    { id: "w_expo1", threadId: "t_expo", from: "Irina Udova <irina@devexpo.example.com>", to: [ME], subject: "Your invitation: DevExpo Tokyo 2026", snippet: "We'd love to have you at DevExpo Tokyo. Can you confirm your attendance?", date: T("2026-11-12T09:30:00+08:00") },
    { id: "w_expo2", threadId: "t_expo", from: "Irina Udova <irina@devexpo.example.com>", to: [ME], subject: "Re: Your invitation: DevExpo Tokyo 2026", snippet: "Following up: please confirm your attendance by Friday.", date: T("2026-11-17T09:30:00+08:00") },
    { id: "w_link", threadId: "t_link", from: "Linky Connector <linky@linky.example.com>", to: [ME], subject: "Two founders you should meet", snippet: "I found two founders you should meet. Send me a booking link and I'll set it up.", date: T("2026-11-10T03:30:00+08:00") },
    { id: "w_camp", threadId: "t_camp", from: "Yuka Hayase <yuka@dxcamp.example.jp>", to: [ME], subject: "Invitation: Manufacturing DX CAMP", snippet: "Would you consider joining our Manufacturing DX CAMP as a speaker?", date: T("2026-11-11T08:00:00+08:00") },
    { id: "w_agency", threadId: "t_agency", from: "株式会社Talentia <sales@talentia.example.jp>", to: [ME], subject: "フリーランス人材のご提案", snippet: "弊社のフリーランス人材についてご提案させてください。", date: T("2026-11-14T06:20:00+08:00") },
    { id: "w_gh", threadId: "t_gh", from: "Wei Wang <notifications@github.com>", to: [ME], subject: "Re: [example/agent] Harden prompts after recent failures (#912)", snippet: "@wey could you review the recent failures and harden the prompts?", date: T("2026-11-15T11:50:00+08:00") },
    { id: "w_blank", threadId: "t_blank", from: "Yue Fan <yue@example.org>", to: [ME], subject: "", snippet: "", date: T("2026-11-15T17:30:00+08:00") },
  ];
  const triage: Record<string, Triaged> = {
    s_kenji: { person: true, needsAnswer: false, facts: [] },
    s_mia: { person: true, needsAnswer: false, facts: [] },
    s_lin: { person: true, needsAnswer: false, facts: [] },
    w_sub: ask("check payment status and activate subscription"),
    w_build: ask("provide a signed Apple Silicon test build"),
    w_import1: ask("whether large-file import is fixed"),
    w_import2: ask("whether large-file import is fixed", { again: true }),
    w_409: ask("help with POST /memories returning HTTP 409"),
    w_refund: ask("arrange reimbursement payment"),
    w_expo1: ask("confirm attendance at DevExpo Tokyo"),
    w_expo2: ask("confirm attendance at DevExpo Tokyo", { again: true }),
    w_link: ask("send a booking link"),
    w_camp: ask("consider the Manufacturing DX CAMP invitation"),
    w_agency: ask("discuss freelance talent proposals and collaboration"),
    w_gh: ask("review recent failures and harden prompts"),
    w_blank: { person: true, needsAnswer: true, facts: [] },
  };
  return { mail, triage };
}

/** A draft a cheap model would write for each thread worth answering (recorded: tests never call a model). */
export const WAITING_DRAFTS: Record<string, { reply: string; lang: string; check?: string }> = {
  "kenji@kmail.example.jp": { reply: "Kenji さん、ご連絡ありがとうございます。お支払いの状況を確認して、すぐにご連絡します。Wey", lang: "ja", check: "Plus が有効になったか" },
  "haoyu@devmail.example.com": { reply: "Hi Haoyu, thanks for testing. A signed Apple Silicon build is coming with the next release; I'll send you the link as soon as it's up. Wey", lang: "en" },
  "camli@qmail.example.cn": { reply: "CamLi 你好，抱歉回晚了。大文件导入的问题我们在查，修好后第一时间告诉你。Wey", lang: "zh" },
  "4471902233@qmail.example.cn": { reply: "Hi, thanks for the report. A 409 on POST /memories usually means the memory already exists; could you send the request body you're using? Wey", lang: "en" },
  "mia@example.org": { reply: "Hi Mia, good question. Let me check which release has the export fix and get back to you. Wey", lang: "en", check: "which release has the fix" },
};
