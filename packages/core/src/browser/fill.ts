// The seam for filling a field from the vault (D190; the vault itself is built elsewhere).
//
// Ducter's browser never lets a task type a password or one-time code (tools.ts). A vault that
// holds the user's sign-ins and payment details plugs in here: `setVault(fn)` on DucterBrowser,
// then `fillFromVault(taskId, ref)` puts the value into that field of the task's tab straight
// through CDP. The value goes from the vault to the page and nowhere else: it is never returned,
// logged, shown in a live view's line, or read back (reads never return secret fields' values).
// Not registered as a task tool here: whoever builds the vault decides the tool and its words.
import { siteOf } from "./sites.ts";
import { hostOf } from "./tools.ts";
import { focusExpression, locateExpression } from "./reader.ts";
import type { BrowserHost } from "./host.ts";

export type FillKind = "username" | "password" | "otp" | "card" | "other";

export interface FillRequest {
  taskId: string;
  profile: string;
  /** The registrable site of the page ("github.com"): what a vault entry is matched on. */
  site: string;
  url: string;
  field: { ref: number; kind: FillKind; label: string };
}

/** The vault's answer: a value to put in, or why not (the user said no, nothing saved…). */
export type VaultFill = (req: FillRequest) => Promise<{ value: string } | { refused: string }>;

/** What kind of field this is, from what the page says about it (never its value). */
export function fillKind(at: { secret: boolean; type?: string; label?: string; autocomplete?: string }): FillKind {
  const s = `${at.type ?? ""} ${at.label ?? ""} ${at.autocomplete ?? ""}`.toLowerCase();
  if (/one-time|otp|2fa|totp|passcode|验证码/.test(s)) return "otp";
  if (at.secret || /password|密码/.test(s)) return "password";
  if (/cc-|card|卡号/.test(s)) return "card";
  if (/email|user|login|账号|邮箱/.test(s)) return "username";
  return "other";
}

export async function fillFromVault(
  host: BrowserHost,
  vault: VaultFill | undefined,
  taskId: string,
  ref: number,
): Promise<string> {
  if (!vault) return "No vault is set up on this Ducter: ask the user to sign in themselves (browser_ask_sign_in).";
  const t = host.task(taskId);
  if (!t) throw new Error("this task has no browser of Ducter's");
  if (host.blind(t.profile)) throw new Error("It's the user's turn in Ducter's browser; wait for it back.");
  const { b, sessionId } = await host.tab(taskId, { create: false });
  const send = (m: string, p: object = {}) => b.cdp.send(m, p, sessionId);
  const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;
  const at = (await ev(locateExpression(ref))) as { secret: boolean; field: boolean; type?: string; label?: string } | null;
  if (!at?.field) return `[${ref}] isn't a field you can fill: browser_read again.`;
  const url = String((await ev("location.href")) ?? "");
  const host_ = hostOf(url);
  if (!host_ || !/^https?:/.test(url)) return "Only a web page's fields are filled from the vault.";
  const answer = await vault({ taskId, profile: t.profile, site: siteOf(host_), url, field: { ref, kind: fillKind(at), label: at.label ?? "" } });
  if ("refused" in answer) return `Not filled: ${answer.refused}`;
  await ev(focusExpression(ref, true));
  await send("Input.insertText", { text: answer.value });
  return `Filled [${ref}] from the vault (you don't see the value).`;
}
