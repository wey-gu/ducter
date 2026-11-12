// The gate at the effect in the person's own apps (D235, principle "gate at the effect"; the
// phone's gate, D217, for a Mac): which apps a task never sees or touches, and which actions wait
// for the person's Go. Pure and conservative: a false "asks" costs one tap; a false "goes" could
// send, pay or delete something of theirs.
import { effectOf, type Effect } from "../android/gate.ts";

export { effectOf, type Effect };

/**
 * Apps a task never sees or touches, matched on the bundle id and the name: password managers,
 * the Mac's keychain and Passwords, authenticators, banks, wallets and payment apps (the person's
 * money and keys), System Settings (a task never changes what the Mac lets apps do), and the two
 * that drive it (cua-driver, Ducter itself).
 */
const BLOCKED_ID = /^(com\.1password\.|com\.agilebits\.|com\.bitwarden\.|com\.lastpass\.|com\.dashlane\.|org\.keepassxc\.|com\.sinew\.enpass|in\.sinew\.enpass|com\.apple\.passwords|com\.apple\.keychainaccess|com\.apple\.systempreferences|com\.apple\.settings|com\.trycua\.|co\.nowledge\.ducter|com\.authy\.|com\.ledger\.|com\.exodus\.|io\.metamask|com\.paypal\.|com\.alipay\.|com\.coinbase\.|com\.binance\.)/i;
const BLOCKED_NAME = /(1password|bitwarden|lastpass|dashlane|keepass|enpass|^passwords$|^密码$|keychain access|钥匙串访问|authenticator|authy|system settings|system preferences|系统设置|系统偏好设置|cuadriver|cua driver|^ducter$|\bbank\b|银行|wallet|钱包|paypal|alipay|支付宝|coinbase|binance|metamask|ledger live|exodus)/i;

export function blockedMacApp(app: { bundle?: string; name?: string }): boolean {
  return (!!app.bundle && BLOCKED_ID.test(app.bundle)) || (!!app.name && BLOCKED_NAME.test(app.name.trim()));
}

/** Apps where Return sends a message (so Return there is a send). */
const MESSAGING = /^(com\.apple\.MobileSMS|com\.apple\.mail|com\.tencent\.xinWeChat|com\.tencent\.qq|com\.tinyspeck\.slackmacgap|ru\.keepcoder\.Telegram|org\.telegram\.|net\.whatsapp\.|desktop\.WhatsApp|com\.hnc\.Discord|com\.electron\.lark|com\.bytedance\.|com\.alibaba\.DingTalkMac|com\.microsoft\.Outlook|com\.microsoft\.teams|com\.facebook\.archon|com\.readdle\.smartemail|com\.superhuman\.|com\.google\.Chrome\.app\.)/i;
const MESSAGING_NAME = /(messages|信息|mail|邮件|wechat|微信|^qq$|slack|telegram|whatsapp|discord|lark|飞书|dingtalk|钉钉|outlook|teams|messenger|spark|superhuman)/i;

export function messagingApp(app: { bundle?: string; name?: string }): boolean {
  return (!!app.bundle && MESSAGING.test(app.bundle)) || (!!app.name && MESSAGING_NAME.test(app.name.trim()));
}

const lower = (s: string) => s.trim().toLowerCase();

/** What a key press commits, if anything: Return in a messaging app or ⌘Return anywhere sends; ⌘⌫ deletes. */
export function keyEffect(app: { bundle?: string; name?: string }, key: string, modifiers: string[] = []): Effect | undefined {
  const k = lower(key);
  const mods = new Set(modifiers.map(lower).map((m) => (m === "command" ? "cmd" : m)));
  const ret = k === "return" || k === "enter";
  if (ret && mods.has("cmd")) return "send";
  if (ret && messagingApp(app)) return "send";
  if ((k === "delete" || k === "backspace" || k === "forwarddelete") && mods.has("cmd")) return "delete";
  return undefined;
}

/** A Go for one action, bound to the app and the words on what it acts on, for a while. */
export interface ComputerAllowed {
  app: string; // bundle id (or name)
  label: string;
  effect: Effect;
  until: number;
}

export function allowedNow(a: ComputerAllowed | undefined, at: { app: string; label: string }, now: number): boolean {
  return !!a && a.until >= now && a.app === at.app && lower(a.label) === lower(at.label);
}
