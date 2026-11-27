// D642 (design/calendar.md §6.2): the kind mark a Go card carries at its leading edge. It is
// read from the fields the home already sends; the view never invents a kind. The calendar answers
// "" — its date leaf is its mark, and richer than a glyph.
import type { DecisionState } from "./store.ts";

export function askKind(d: DecisionState): string {
  switch (true) {
    case !!d.cal:
      return "";
    case !!d.call:
      return "call";
    case !!d.pay:
      return "pay";
    case !!d.checkout:
      return "cart";
    case !!d.draft:
      return "draft";
    case !!d.src:
      return srcKind(d.src);
    case !!d.signIn || !!d.deviceSignIn || !!d.signInWhere:
      return "signin";
    case !!d.key || !!d.copyKey || !!d.fill:
      return "key";
    case !!d.phone || !!d.handset:
      return "phone";
    case !!d.computer || !!d.where || !!d.closing:
      return "computer";
    case !!d.memPlugin:
      return "plugin";
    case !!d.trust:
      return "trust";
    case !!d.sender || !!d.asker || !!d.saying || !!d.relay:
      return "message";
    case !!d.routineId || !!d.loop:
      return "reminder";
    case !!d.anywhere:
      return "tunnel";
    case !!d.offer:
      return "offer";
    case !!d.findId:
      return actionKind(d);
  }
  return actionKind(d);
}

/** A generic card whose fields name no kind: its own action words are the only fact there is. Read
 *  them for the thing being approved, never for a plain question (which keeps the honest ask mark).
 *  A send-the-file card ("Send this file to Sam?") is the case that made this necessary. */
function actionKind(d: DecisionState): string {
  const text = `${d.goLabel ?? ""} ${d.question ?? ""}`.toLowerCase();
  const g = (d.goLabel ?? "").toLowerCase();
  const send = /(send|share|attach|upload|forward|email|mail|message|post|发|发送|寄|传给|上传|转发)/.test(text);
  const file = /(file|document|attachment|pdf|docx?|xlsx?|pptx?|zip|image|photo|picture|screenshot|文件|文档|附件|图片|照片|表格|幻灯片|压缩包|截图)/.test(text);
  if ((send || /(上传|attach|upload)/.test(text)) && file) return "file";
  if (send && /(mail|email|邮件|邮箱)/.test(text)) return "mail";
  if (send && /(message|chat|text|消息|聊天|发言)/.test(text)) return "message";
  if (/(draft|write|compose|拟|写|起草)/.test(g) && /(reply|replies|回复|回信)/.test(text)) return "draft";
  if (/(comment|评论|留言)/.test(g)) return "comment";
  if (/(close|关闭|关掉|收起)/.test(g)) return "close";
  if (/(merge|open|post|review|合并|开|评审|提交)/.test(g) && /(pull request|\bpr\b|#\d|分支)/.test(text)) return "pr";
  if (/(call|phone|dial|电话|打电话)/.test(g)) return "call";
  if (/(checkout|结账|下单)/.test(g)) return "cart";
  if (/(pay|payment|付款|支付)/.test(g)) return "pay";
  if (/(remind|reminder|wake|alarm|提醒|叫醒|闹钟)/.test(g)) return "reminder";
  if (/(sign in|log in|signin|登录|登陆)/.test(g)) return "signin";
  return "ask";
}

/** A to-do source card's mark by what it writes and where. */
function srcKind(src: NonNullable<DecisionState["src"]>): string {
  const github = src.item.kind === "github";
  switch (src.kind) {
    case "review":
    case "reviews":
    case "group_review":
      return github ? "pr" : "comment";
    case "write":
    case "hand_comment":
      if (github) return src.close ? "close" : "comment";
      return "todo";
    case "closed":
      return "close";
    case "trust":
      return "trust";
    case "where_rule":
      return "computer";
    case "plan":
    case "batch":
    case "picks":
      return "todo";
  }
  return "todo";
}
