// Fill by reference (D191, design/autofill.md §3): a task names a saved thing by its handle
// ("card:visa-4242", "signin:github.com", "me.passport_number") and a field by its [number]; code
// on the home types the value into the page. The model never sees the value: it isn't in the
// tool's answer, the field is drawn as dots (so a screenshot shows none), later reads say
// "filled from saved", and every browser tool's answer is scrubbed of saved values besides.
//
// What the code holds, whatever the model does:
//   - a sign-in fills only on its own site (a look-alike page gets nothing), and its first use
//     there waits for the owner's OK; a private detail likewise per site;
//   - a card fills only after the owner's Go on a 付款 / Pay card that names the merchant (the
//     page's host, read by code), the amount and the card's last four, on that site, within
//     15 minutes; the security code comes with that Go and is never kept;
//   - only https pages (or this machine's own, for tests);
//   - every use is a line in 用在了哪儿 / Where it was used.
//
// The seam: `FillSeam` is the browser side (where the task's tab is, type one value into one
// field). `hostSeam` drives Ducter's browser over CDP; the live view's own "fill from saved"
// (being built beside this) plugs in as another FillSeam.
import type { Bodies, FillAsk, PayAsk, Question } from "@ducter/protocol";
import { DETAIL_CLASS, onSite, siteOf, type DetailKey } from "@ducter/protocol/src/saved.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub, Ctx } from "../mcp.ts";
import type { BrowserHost } from "../browser/host.ts";
import { BLIND } from "../browser/tools.ts";
import { focusExpression } from "../browser/reader.ts";
import { CARD_PARTS, detailLabel, SavedError, type SavedStore } from "./store.ts";

export const PAY_WINDOW_MS = 15 * 60_000;

export interface FillSeam {
  /** The page the task's tab is on now. */
  where(taskId: string): Promise<{ url: string; host: string }>;
  /** Type `value` into field [ref] of that page and hide it from reads and pictures. */
  fill(taskId: string, ref: number, value: string): Promise<void>;
}

type Send = (method: string, params?: object) => Promise<any>;

async function evaluate(send: Send, expression: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) throw new Error("the page threw while filling");
  return r?.result?.value;
}

/** Marks a filled field: drawn as dots, its value hidden from reads (reader.ts reads the mark). */
export function markExpression(ref: number): string {
  return `(() => {
    const el = document.querySelector('[data-ducter-ref="${ref}"]');
    if (!el) return false;
    el.setAttribute("data-ducter-filled", "1");
    el.style.setProperty("-webkit-text-security", "disc", "important");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
}

/** The default seam: Ducter's own browser, the task's current tab. */
export function hostSeam(host: BrowserHost): FillSeam {
  const page = async (taskId: string): Promise<Send> => {
    const t = host.task(taskId);
    if (!t) throw new Error("this task has no browser of Ducter's");
    if (host.blind(t.profile)) throw new Error(BLIND);
    const { b, sessionId } = await host.tab(taskId);
    return (m, p = {}) => b.cdp.send(m, p, sessionId);
  };
  return {
    async where(taskId) {
      const send = await page(taskId);
      const url = String((await evaluate(send, "location.href").catch(() => "")) ?? "");
      return { url, host: siteOf(url) };
    },
    async fill(taskId, ref, value) {
      const send = await page(taskId);
      const ok = await evaluate(send, `(() => { const el = document.querySelector('[data-ducter-ref="${ref}"]'); if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return "none"; const was = el.getAttribute("data-ducter-was"); return was === null || was === \`\${el.name}|\${el.id}|\${el.autocomplete || ""}|\${el.type}\` ? "ok" : "changed"; })()`);
      if (ok === "none") throw new Error(`there is no field [${ref}] on the page now: browser_read again`);
      // A re-render (a checkout's address block, say) can reuse the node for another field: never type a saved value there.
      if (ok === "changed") throw new Error(`the page changed under field [${ref}] since your last read: nothing was filled. browser_read again and use the new number`);
      const select = await evaluate(send, `document.querySelector('[data-ducter-ref="${ref}"]') instanceof HTMLSelectElement`);
      if (select) {
        // A select (expiry month, country): pick the option whose value or text matches.
        const v = JSON.stringify(value);
        const picked = await evaluate(
          send,
          `(() => { const el = document.querySelector('[data-ducter-ref="${ref}"]'); const want = ${v}.toLowerCase(); const o = [...el.options].find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want || Number(o.value) === Number(want) && !isNaN(Number(want))); if (!o) return false; el.value = o.value; el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`,
        );
        if (!picked) throw new Error(`field [${ref}] has no choice that matches the saved value`);
      } else {
        await evaluate(send, focusExpression(ref, true));
        await send("Input.insertText", { text: value });
      }
      await evaluate(send, markExpression(ref));
    },
  };
}

interface Approval {
  decisionId: string;
  handle: string;
  site: string;
  amount: string;
  currency: string;
  until: number;
  cvc?: string;
}

export interface FillDeps {
  mcp: CoreMcpHub;
  saved: SavedStore;
  log: LogStore;
  seam: FillSeam;
  tasks: { get(id: string): { persona?: string; residency?: string; title?: string } | undefined; setState(id: string, a: any, r: any, reason?: string): void };
  /** A task uses Ducter's browser (the fill tools are listed only for those). */
  hasBrowser: (taskId: string) => boolean;
  now?: () => number;
}

export interface Fill {
  /** ws: a pay card's security code, held until that decision is answered (never logged). */
  holdCvc(decisionId: string, cvc: string): void;
  /** Whether a decision is a pay card that still needs its code. */
  needsCvc(decisionId: string): boolean;
  approvals(): ReadonlyMap<string, Omit<Approval, "cvc">>;
  /** The security codes held for payments still open: scrubbed as whole numbers while they are. */
  codes(): string[];
  stop(): void;
}

const isLocal = (url: string) => {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
};
const secure = (url: string) => url.startsWith("https://") || isLocal(url);

const CARD_ONLY = "D191: a card is filled only after the user's Go on a pay card";

export function registerFillTools(d: FillDeps): Fill {
  const { mcp, saved, log } = d;
  const now = d.now ?? (() => Date.now());
  const approvals = new Map<string, Approval>(); // taskId -> its one payment Go
  const asked = new Map<string, { taskId: string; pay?: PayAsk; fill?: FillAsk }>(); // decisionId -> what it asks
  const cvcs = new Map<string, string>(); // decisionId -> the code typed on its card
  // First-use OKs still open, by task, handle and site: a second fill (the password after the user
  // name, in the same turn) waits on the same card instead of raising another.
  const pendingOk = new Set<string>();
  const okKey = (taskId: string, handle: string, site: string) => `${taskId} ${handle} ${site}`;

  const any = () => {
    try {
      const v = saved.view();
      return v.items.length > 0 || v.details.some((x) => x.kept);
    } catch {
      return false;
    }
  };
  const visible = (ctx: Ctx) => !!ctx.taskId && d.hasBrowser(ctx.taskId) && any();
  const title = (taskId: string) => d.tasks.get(taskId)?.title;

  const ask = (taskId: string, q: Question, summary: string) => {
    const card = d.tasks.get(taskId);
    const body: Bodies["report"] = { taskId, state: "needs_input", summary, questions: [q], evidence: [] };
    log.append({ persona: card?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
    d.tasks.setState(taskId, "needs_you", (card?.residency as any) ?? "hot");
  };

  // The decisions the fill asked for, and their answers.
  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      if (b.taskId && (b.pay || b.fill)) asked.set(b.decisionId, { taskId: b.taskId, ...(b.pay ? { pay: b.pay } : {}), ...(b.fill ? { fill: b.fill } : {}) });
      return;
    }
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    const a = asked.get(r.decisionId);
    if (!a) return;
    asked.delete(r.decisionId);
    const cvc = cvcs.get(r.decisionId);
    cvcs.delete(r.decisionId);
    const task = title(a.taskId);
    if (a.fill) pendingOk.delete(okKey(a.taskId, a.fill.handle, a.fill.site));
    try {
      if (a.pay) {
        if (r.option === "go") {
          approvals.set(a.taskId, { decisionId: r.decisionId, handle: a.pay.handle, site: a.pay.site, amount: a.pay.amount, currency: a.pay.currency, until: now() + PAY_WINDOW_MS, ...(cvc ? { cvc } : {}) });
          saved.allow(a.pay.handle, a.pay.site);
          saved.record({ handle: a.pay.handle, label: a.pay.card, site: a.pay.site, what: "approved", taskId: a.taskId, ...(task ? { task } : {}), amount: `${a.pay.currency} ${a.pay.amount}` });
        } else saved.record({ handle: a.pay.handle, label: a.pay.card, site: a.pay.site, what: "declined", taskId: a.taskId, ...(task ? { task } : {}), amount: `${a.pay.currency} ${a.pay.amount}` });
      } else if (a.fill) {
        if (r.option === "go") {
          saved.allow(a.fill.handle, a.fill.site);
          saved.record({ handle: a.fill.handle, label: a.fill.label, site: a.fill.site, what: "ok", taskId: a.taskId, ...(task ? { task } : {}) });
        } else saved.record({ handle: a.fill.handle, label: a.fill.label, site: a.fill.site, what: "declined", taskId: a.taskId, ...(task ? { task } : {}) });
      }
    } catch (err) {
      console.error("[saved] recording an answer failed:", (err as Error).message);
    }
  });

  mcp.registerWhen(
    "task",
    "browser_fill",
    'Fill one field of the page from what the user saved, by its handle (from saved_list): you never see the value. `use` is the handle; `part` says which piece: a sign-in\'s "username" or "password"; a card\'s "number", "exp" (MM/YY), "exp_month", "exp_year", "cvc", "name" or "postcode". A sign-in fills only on its own site; a card only after browser_ask_to_pay was answered Go.',
    {
      type: "object",
      properties: {
        ref: { type: "number", description: "The field's [number] from the last browser_read." },
        use: { type: "string", description: 'The handle, e.g. "card:visa-4242", "signin:github.com", "me.passport_number".' },
        part: { type: "string", description: "Which piece of a sign-in or card (see above); not for details." },
      },
      required: ["ref", "use"],
    },
    async (args, ctx) => {
      const taskId = ctx.taskId!;
      const handle = String(args.use ?? "").trim();
      const ref = Number(args.ref);
      if (!Number.isInteger(ref) || ref < 1) throw new Error("ref must be a field's number from the last browser_read");
      const r = saved.resolve(handle);
      if (!r) throw new Error(`nothing is saved as "${handle}": call saved_list for the handles`);
      const at = await d.seam.where(taskId);
      if (!secure(at.url)) throw new Error(`${at.host || "this page"} isn't a secure (https) page: nothing saved is filled here. Tell the user in your report.`);
      const task = title(taskId);
      const part = typeof args.part === "string" && args.part.trim() ? args.part.trim() : undefined;
      let value: string;
      if (r.kind === "signin") {
        if (!onSite(at.host, r.site))
          throw new Error(`This sign-in is for ${r.site}, and this page is ${at.host}. Saved sign-ins fill only on their own site, so nothing was filled. If the page is the real sign-in for ${r.site}, browser_open ${r.site} instead; otherwise this may be a look-alike: say so in your report.`);
        if (!saved.okOn(handle, at.host) && !saved.okOn(handle, r.site)) {
          if (pendingOk.has(okKey(taskId, handle, r.site))) return `The user is already being asked to OK this saved sign-in on ${r.site}. End your turn now; when they answer you'll get a message, then call browser_fill again.`;
          pendingOk.add(okKey(taskId, handle, r.site));
          ask(taskId, { id: "fill", text: `First time signing in to ${r.site} with what the user saved (${r.item.username})`, blocking: true, default: "OK", reversible: false, fill: { site: r.site, handle, label: r.label, kind: "signin" } }, `Wants to sign in to ${r.site} with your saved sign-in.`);
          return `This is the first time this saved sign-in is used on ${r.site}: the user was asked to OK it. End your turn now; when they answer you'll get a message, then call browser_fill again.`;
        }
        value = saved.secret(handle, part ?? "username");
      } else if (r.kind === "detail") {
        if (DETAIL_CLASS[r.key as DetailKey] === "fill" && !saved.okOn(handle, at.host)) {
          if (pendingOk.has(okKey(taskId, handle, at.host))) return `The user is already being asked to OK giving ${at.host} their ${r.label.toLowerCase()}. End your turn now; when they answer you'll get a message, then call browser_fill again.`;
          pendingOk.add(okKey(taskId, handle, at.host));
          ask(taskId, { id: "fill", text: `First time giving ${at.host} the user's ${r.label.toLowerCase()}`, blocking: true, default: "OK", reversible: false, fill: { site: at.host, handle, label: r.label, kind: "detail" } }, `Wants to give ${at.host} your ${r.label.toLowerCase()}.`);
          return `The user's ${r.label.toLowerCase()} goes to ${at.host} for the first time: the user was asked to OK it. End your turn now; when they answer you'll get a message, then call browser_fill again.`;
        }
        value = r.item.value;
      } else {
        const a = approvals.get(taskId);
        if (!a || a.handle !== handle || !onSite(at.host, a.site) || a.until < now()) {
          if (a && a.until < now()) approvals.delete(taskId);
          throw new Error(`${CARD_ONLY}. Call browser_ask_to_pay with this card, the amount and what it buys (on the checkout page), then end your turn.`);
        }
        const p = part ?? "number";
        if (!(CARD_PARTS as readonly string[]).includes(p)) throw new Error(`a card fills ${CARD_PARTS.join(", ")}, not ${p}`);
        if (p === "cvc") {
          if (!a.cvc) throw new Error("No security code came with the Go (it is never kept). Leave the field empty and say so in your report.");
          value = a.cvc;
        } else value = saved.secret(handle, p);
      }
      try {
        await d.seam.fill(taskId, ref, value);
      } catch (err) {
        if (err instanceof SavedError) throw err;
        throw new Error((err as Error).message.split(value).join("••••••"));
      }
      saved.record({ handle, label: r.label, site: at.host, what: "filled", taskId, ...(task ? { task } : {}) });
      return `Filled [${ref}] from saved (${r.kind === "card" ? `${r.label}, ${part ?? "number"}` : r.kind === "signin" ? `${r.site}, ${part ?? "username"}` : r.label}). The value is hidden from you; browser_read shows the field as filled.`;
    },
    visible,
  );

  mcp.registerWhen(
    "task",
    "browser_ask_to_pay",
    "On the checkout page, before any card field: ask the user's Go for this one payment. The card names the merchant (this page's site), the amount and the card's last four. Then end your turn; after Go, fill the card with browser_fill within 15 minutes and place the order once. Never pay without it.",
    {
      type: "object",
      properties: {
        use: { type: "string", description: 'The card\'s handle from saved_list, e.g. "card:visa-4242".' },
        amount: { type: "string", description: 'The total the page shows, e.g. "128.00".' },
        currency: { type: "string", description: 'ISO code, e.g. "USD", "CNY", "JPY".' },
        what: { type: "string", description: 'What it buys, in a few words: "1 night, Hotel Okura, Nov 20".' },
      },
      required: ["use", "amount", "currency"],
    },
    async (args, ctx) => {
      const taskId = ctx.taskId!;
      const handle = String(args.use ?? "").trim();
      const r = saved.resolve(handle);
      if (!r || r.kind !== "card") throw new Error(`"${handle}" isn't a saved card: call saved_list for the handles`);
      const amount = String(args.amount ?? "").replace(/[^\d.,]/g, "");
      if (!/\d/.test(amount)) throw new Error("amount must be the total the page shows, as a number");
      const currency = String(args.currency ?? "").trim().toUpperCase().slice(0, 3);
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be an ISO code like USD");
      const at = await d.seam.where(taskId);
      if (!secure(at.url)) throw new Error(`${at.host || "this page"} isn't a secure (https) page: never pay here. Tell the user in your report.`);
      const last4 = r.item.number.slice(-4);
      const what = String(args.what ?? "").trim().slice(0, 120);
      const pay: PayAsk = { site: at.host, amount, currency, ...(what ? { what } : {}), handle, card: r.label, last4, needsCvc: true, firstHere: !saved.paidOn(handle, at.host) };
      approvals.delete(taskId);
      ask(taskId, { id: "pay", text: `Pay ${currency} ${amount} at ${at.host} with ${r.label}${what ? ` (${what})` : ""}?`, blocking: true, reversible: false, pay }, `Wants to pay ${currency} ${amount} at ${at.host}.`);
      return `Asked the user to Go this payment (${currency} ${amount} at ${at.host}, ${r.label}). End your turn now. After Go you'll get a message: fill the card with browser_fill, place the order once, and report what the site confirmed.`;
    },
    visible,
  );

  return {
    holdCvc(decisionId, cvc) {
      const c = String(cvc ?? "").replace(/\D+/g, "");
      if (!/^\d{3,4}$/.test(c)) throw new Error("the security code is 3 or 4 digits");
      if (!asked.get(decisionId)?.pay) throw new Error("that isn't a payment card");
      cvcs.set(decisionId, c);
    },
    needsCvc: (id) => !!asked.get(id)?.pay?.needsCvc,
    approvals: () => new Map([...approvals].map(([k, { cvc: _c, ...v }]) => [k, v])),
    codes: () => [...[...approvals.values()].filter((a) => a.cvc && a.until >= now()).map((a) => a.cvc!), ...cvcs.values()],
    stop: () => unsubscribe(),
  };
}

/** What a task (and the partner) reads about the saved things: names and handles, never values. */
export function savedListText(saved: SavedStore, role: "task" | "partner"): string {
  const v = saved.view();
  const lines: string[] = [];
  const sign = v.items.filter((x) => x.kind === "signin");
  const cards = v.items.filter((x) => x.kind === "card");
  if (!sign.length && !cards.length && !v.details.some((x) => x.kept)) return "Nothing is saved in Autofill yet. The user adds sign-ins, cards and their details in Settings › Autofill.";
  lines.push(role === "task" ? "Saved by the user (fill with browser_fill by handle; you never see the values):" : "Saved in Autofill (tasks fill these by handle in Ducter's browser; nobody sees the values):");
  for (const s of sign) lines.push(`- ${s.handle}: sign-in for ${s.site}, user ${s.username}${s.okSites?.length ? "" : " (call browser_fill: its first use there asks the user's OK by itself)"}`);
  for (const c of cards) lines.push(`- ${c.handle}: ${c.label}, expires ${c.exp}, name ${c.name} (every payment: browser_ask_to_pay first)`);
  const kept = v.details.filter((x) => x.kept);
  if (kept.length) {
    lines.push("Details:");
    for (const x of kept) lines.push(x.value !== undefined ? `- ${x.handle} = ${x.value}` : `- ${x.handle} (kept; fill only: call browser_fill, its first use on a site asks the user's OK by itself)`);
  }
  return lines.join("\n");
}

export { detailLabel };
