// The gate at the effect on Ducter's phone (D217, principle "gate at the effect"): what a task
// may tap by itself, what waits for the user's Go on a decision card, and what stays the user's.
// Pure and conservative: a false "asks" costs one tap; a false "goes" could send or pay.
// The ideas follow Pinky's gateway (research/62: commit verbs, app classes, credential fields,
// the re-check before acting); no code is taken from it.

export type Effect = "pay" | "send" | "post" | "delete" | "buy" | "install" | "call" | "account" | "confirm";

/** Words on a button that commit something, by kind. Matched on the whole label, case-folded. */
const VERBS: [Effect, RegExp][] = [
  ["pay", /\b(pay|pay now|checkout|check out|place order|confirm (and )?pay|subscribe|top up|transfer|withdraw|donate|tip)\b|支付|付款|立即支付|确认支付|结算|下单|提交订单|充值|转账|提现|打赏|订阅|支払|購入手続き/i],
  ["buy", /\b(buy|buy now|purchase|order|rent|book|reserve)\b|购买|立即购买|买|预订|预约|租|購入|予約/i],
  ["send", /\b(send|reply|forward|share|invite|submit|request)\b|发送|发出|回复|转发|分享|邀请|提交|申请|送信|返信/i],
  ["post", /\b(post|publish|tweet|upload|go live|comment|retweet|repost)\b|发布|发表|发帖|上传|评论|转发|直播|投稿|公開/i],
  ["delete", /\b(delete|remove|erase|clear( all)?|uninstall|discard|unsubscribe|cancel (order|subscription|booking)|block|unfriend|archive)\b|删除|移除|清空|清除|卸载|取消订单|取消订阅|拉黑|删好友|退订|削除/i],
  ["install", /\b(install|update|get)\b|安装|更新|获取|インストール/i],
  ["call", /\b(call|dial|video call)\b|拨打|呼叫|打电话|视频通话|発信/i],
  ["account", /\b(sign out|log out|logout|change password|delete account|close account)\b|退出登录|注销|修改密码|删除账号|ログアウト/i],
  ["confirm", /\b(confirm|agree|accept|allow|yes, continue|i agree)\b|确认|同意|接受|允许|確認|同意する/i],
];

/** What a tap on this label would commit, if anything. */
export function effectOf(label: string): Effect | undefined {
  // A row named by the words inside it ("Title · subtitle"): its title is what it does.
  const l = label.split(" · ")[0]!.trim();
  if (!l || l.length > 60) return undefined; // a long label is text, not a button's verb
  for (const [kind, re] of VERBS) if (re.test(l)) return kind;
  return undefined;
}

/**
 * Apps a task never sees or touches: banks, wallets, payments, password managers and
 * authenticators (the user's money and keys). Matched on the package id.
 */
const BLOCKED = /(\.bank|bank\.|banking|\.wallet|wallet\.|paypal|venmo|cashapp|squareup\.cash|alipay|eg\.android\.alipay|wechat.*pay|unionpay|revolut|wise\.|transferwise|monzo|chime|robinhood|coinbase|binance|metamask|1password|bitwarden|lastpass|dashlane|keepass|authenticator|authy|\.otp|google\.android\.apps\.walletnfcrel)/i;

export function blockedApp(pkg: string): boolean {
  return BLOCKED.test(pkg);
}

/** The Go a task got for one tap: bound to the app, the label and where it was, for a while. */
export interface Allowed {
  app: string;
  label: string;
  effect: Effect;
  until: number;
}

/** A tap is the one that was allowed: the same app and label, and the Go is fresh. */
export function matches(a: Allowed | undefined, at: { app: string; label: string }, now: number): boolean {
  return !!a && a.until >= now && a.app === at.app && a.label.trim().toLowerCase() === at.label.trim().toLowerCase();
}
