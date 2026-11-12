# Autofill: sign-ins, cards and your details for errands (D191)

Status: decided as D191 (draft for the author's review), built on the home, the web client and the
Mac app; verified with unit tests, an integration test through the real core, and a fake checkout
in a local Chrome for Testing. Evidence: `research/54-credentials-for-errands.md` (and
`research/25` for Muse's `authd`). Supersedes the vault parts of `system.md` "Credentials and
logged-in profiles" (D48).

## 1. Who, and what they feel

- **A heavy multi-agent developer.** Already has 1Password and their own Chrome on the Mac. On a
  Mac, tasks use the agent's own browser in that Chrome (D130), where their password manager fills
  as it always has; Ducter stores nothing. Autofill matters for the server (`hel`), where no
  password manager runs: save the two or three sign-ins and a card a server task needs. Feels: "it
  can't leak what it never saw", and can check every use.
- **A consumer (Muse, Grok bot).** Wants "book the hotel, use my Visa". Saves a card and their
  passport once on the phone. Every payment arrives as one card naming the merchant, the amount and
  the last four; they type the 3-digit code and tap Pay. Feels: in control without doing the work.
- **A fresh user.** Never sets anything up. The first errand that needs a sign-in shows the D151
  sign-in card (they sign in themselves); the first that needs paying stops at the checkout. The
  partner says once that Settings › Autofill lets Ducter fill it next time. Nothing to learn first.

North star: easy (save once, tap once per payment), smooth (no copy-paste between apps),
delightful (a receipt-like card, not a form), trustworthy (the model never sees a secret, every
use is listed), pleasantly surprising (a passport number that fills on the airline site after one
OK).

## 2. What lives where

| Thing | Where | Who sees the value |
|---|---|---|
| The session (cookies) | Ducter's browser profile (D151) | nobody reads it; Signed-in sites lists the sites |
| A saved sign-in (site, user name, password) | Autofill on the home | the fill code only; clients see site + user name |
| A card (number, expiry, name, postcode) | Autofill on the home | the fill code only; clients and models see brand + last four + expiry + name |
| The card's security code | **never stored** (PCI DSS 3.3.1.2, research/54 §8) | typed on each Pay card, held in memory for that payment's 15 minutes |
| Readable details: name, email, phone, seat, meal, passport country | Autofill on the home | the partner and its tasks may read them (to pick a seat, say whose name) |
| Private details: passport number and expiry, birthday, address, known traveler number, loyalty numbers | Autofill on the home | the fill code only; clients see "kept" and a hint (•••678) |
| The owner's own password manager | the owner's devices | untouched; on a Mac it fills in their own Chrome |
| A key a task asked for (D233, §8): name, variable, value | Autofill on the home (or only the task's grant, just this once) | the task's key file on the home, loaded inside one command; clients see the name, the variable and a head (`dop_v1_••••••`) or "kept" |

**At rest:** `<dataDir>/saved/<persona>.enc`, AES-256-GCM, 0600. The key is apart from it: on a
Mac in the login keychain (generic password, service `Ducter Autofill`, an account per data folder,
via `/usr/bin/security`); elsewhere `<dataDir>/saved/key`, 0600. The screen says which, plainly:
**锁着存在 {home} 上，密钥在这台 Mac 的钥匙串里 / Locked on {home}, its key in this Mac's
keychain** or **…密钥在一个只有 Ducter 能读的文件里 / …its key in a file only Ducter can read**.
Never synced to a client; a client sends a secret once (`saved_put`) and never gets it back.
Tests and the eval always use the key file (`DUCTER_SAVED_KEY=file`, and `bun test`).

## 3. Fill by reference

- A **handle** names a saved thing: `signin:github.com` (`#2` for a second account),
  `card:visa-4242`, `me.passport_number`. The partner reads handles with `saved_list` (listed only
  once something is saved) and puts one in a brief ("pay with card:visa-4242"). Tasks in Ducter's
  browser get `saved_list`, `browser_fill {ref, use, part}` and `browser_ask_to_pay`.
- A brief that names a saved handle makes the task run on **Ducter's own browser** wherever it can
  start (`DucterBrowserPort.wants`), on a Mac too, since only there is the fill out of the model's
  reach. If it can't start there, the usual order holds and the owner signs in or pays themselves.
- `browser_fill` types the value with CDP `Input.insertText` into field `[ref]`, then marks it
  `data-ducter-filled` and draws it as dots (`-webkit-text-security: disc`), so later reads say
  **(filled from saved; hidden)** and a screenshot shows dots.
- **Belt and braces:** every browser tool's answer is scrubbed of every saved value (and the card
  number with its usual spacings); a held security code is scrubbed as a whole number while its
  payment is open. The fake checkout test proves it against a page that echoes keystrokes.
- `browser_type` refuses password, one-time-code and card fields; the reader marks card fields
  **card number field (only from a saved card…)**.
- The live view's own "fill from saved" (being built beside this) plugs in as another `FillSeam`
  (`packages/core/src/saved/fill.ts`): `where(taskId)` and `fill(taskId, ref, value)`.

## 4. When the owner is asked

| What | Rule | Card |
|---|---|---|
| A saved sign-in | only on its own site (the host or a subdomain of it); a look-alike page gets nothing and the task is told it may be one | the first use on that site: **第一次用存着的登录进 {site}？ / Sign in to {site} with what you saved, for the first time?**, **可以 / OK** · **暂不使用 / Not now**; never again on that site |
| A private detail | per site | the first time on each site: **第一次把你的{detail}给 {site}？ / Give {site} your {detail} for the first time?** |
| A readable detail | none | — |
| **Every payment** | the task calls `browser_ask_to_pay` on the checkout; the merchant is the page's host read by code, never the model's word | **在 {site} 付款？ / Pay on {site}?** with Amount, For, Merchant (+ **第一次在这里付款 / First payment here**), Card; the security-code field; **暂不付款 / Not now** · **支付 {amount} / Pay {amount}**. No default, never pushed past quiet hours as a default. Go without the code is refused |
| After Go | the card fills only on that site, for that task, within 15 minutes; a changed total means a new ask | — |
| Any page that isn't https | nothing fills, nothing pays | the task says so |

A Pay or OK card is never written by `report_to_main`: only Ducter's own tools set `pay` / `fill`
on a question. The partner does not ask first itself (one card, not two); it opens the task.

## 5. Two-factor, 3-D Secure, passkeys

- A 3-D Secure page, an SMS or email code, a TOTP prompt: the owner's, live. The task calls
  `browser_ask_sign_in` with that page; the owner finishes it in the live view (D151). Codes are
  not stored (research/54 §9).
- Reading a code from a connected mailbox is **not built**: it would need its own consent per
  account and a filter like Muse's (`todo.md`).
- **Passkeys:** an agent can't use the owner's passkey. The owner signs in once in the live view;
  the session stays.

## 6. Settings › Autofill (both clients)

**设置 › 自动填充 / Settings › Autofill**, after Accounts. One lede, then four groups:
**登录 / Sign-ins** (site, user name, last used, a dot row), **卡 / Cards** (a small clay card
with the last four, name, expiry), **你的资料 / Your details** (readable values; private ones by
name only), **使用记录 / Where it was used** (filled · said Go to {amount} · said OK · said no,
with the site, the task and when; the newest 30 shown, 300 kept). Add and edit in place; **删掉 /
Remove** asks once (**确定删掉**). Editing a secret replaces it (empty keeps it); nothing is ever
revealed, to anyone, the owner included: the owner's own password manager is where to look one up.
Removing a thing deletes its secret at once; its history lines stay.

Art: the 上网 clay (`ab_web`) for now, since Autofill lives in Ducter's browser; a dedicated clay
object goes through the metaphor process first (`todo.md`).

## 7. Not in v1

- Reading from 1Password or Bitwarden by reference (1Password's agent programme is partner-only;
  Bitwarden's Agent Access SDK is alpha, research/54 §5).
- Single-use or merchant-locked cards (Stripe Link's agent wallet, Privacy.com: US/Canada,
  research/54 §7) as a second rail behind the same Pay card.
- Face ID / Touch ID on the Pay card (the code is the fact only the owner has, for now).
- Codes from a connected mailbox; TOTP secrets.
- A key for a task on a worker (§8).

## 8. Keys a task asks for (D233)

Status: built 2026-11-12 on the home, the web client and the Mac app, for the author's review;
unit tests for the store, an integration test through the real core (the card, the answer in the
waiting call, the run-ended case resumed, a restart in between, Don't give, once, the switch, a
worker task), the Mac card's tests. Not yet tried with a live harness.

**Who and what they feel.** The developer's deploy task needs `DO_TOKEN`; the consumer's errand
needs an API key they own; a fresh user has never set anything up. Before: paste a token into the
chat and hope, or a task that stops at "I need DO_TOKEN". After: one card, paste, **保存，继续 /
Save and continue**, and a receipt line. Easy (one field), smooth (the task carries on by itself,
even after its run ended), trustworthy (the key never enters the conversation, the Log or Ducter's
own model calls, and every use is listed). Unlike T3 Code's "Asked for a secret", whose card was
cancelled with the run, the card stays until the person answers it.

**The tool.** `ask_for_key({ env, name, why?, again? })`, for every task not in a browser place:

| The case | What happens |
|---|---|
| A key is kept under `env` | given to the task at once (a use listed); the answer says how to load it |
| Given to this task already | the same answer (`again: true` instead asks anew: the key didn't work) |
| The switch is off | no card; the task is told to say in its report which key it needs and why |
| The task runs on a worker | no card; the task is told plainly a key can't reach it there yet |
| Otherwise | a key card; the call waits up to the harness's MCP limit (`MCP_CALL_WAIT`: Claude Code 5 min, the others 50 s) |
| Answered while the call waits | the answer comes back in the call; the resolution is `delivered`, never forwarded again |
| Answered later (the run ended, or Ducter restarted) | the task is resumed with one message (D10's forward through `runner.send`) |

**The card** ({task} 需要一个密钥 / {task} needs a key), receipt-like, on the conversation, On hand
and a push like any decision, no default: 要什么 / What, 变量名 / Variable (mono), 为什么 / Why;
the masked field **把密钥粘贴到这里 / Paste the key here**; **记住，以后直接用 / Remember it**
(default) or **只这一次 / Just this once**; **不给 / Don't give** · **保存，继续 / Save and
continue** (**交给它，继续 / Give it and continue** when once). The note: **它只在要用的那条命令里读
这个密钥：不进对话，不进记录，Ducter 自己的 AI 也看不到。任务若故意把它打印出来，自己会看到。**
After: **已交给 {task} / Given to {task}** · **你没给 / You didn't give it**. A message to the task
never answers it; the Mac's menu bar opens the window for it rather than offering Go.

**How the task uses it.** The home writes `<dataDir>/task-keys/<taskId>.env` (folder 0700, file
0600, `export ENV='…'`) from the store, and the tool's answer says to load it inside the one
command that needs it: `. '<file>' && <command>`, never to print it. The file is rewritten on every
change (an edit or a removal reaches it) and at start; it goes when the task is done, dropped or
archived. A key given just this once lives only in the task's grant and goes with it.

**What is guaranteed.** Every event the Log takes is scrubbed of every key value first, so the
transcript, On hand, a push and the partner's reads show `••••••` even when a command printed it.
What is not: the task's agent sees what its own commands print, and its harness keeps that in its
own transcript. The card and the docs say so plainly.

**Settings › Autofill › 密钥 / Keys.** **让任务向我要密钥 / Let tasks ask me for keys** (on by
default) with **任务要用 API 密钥或部署密钥时，会在对话里问你要。关掉后，它只在报告里说需要哪一个。**;
the kept keys (name; variable · last used; a head then `••••••`, or **已存 / kept**); **添加密钥 /
Add a key** (它是什么 / What it is, 变量名 / Variable name, 密钥 / Key); Remove as for the others.
使用记录 lists **把 {name} 交给了任务 / Gave {name} to a task** (**，只这一次 / , just this once**) and
**你没给 {name} / You didn't give {name}**, with the task. A variable is `^[A-Z_][A-Z0-9_]{0,63}$`
and never one that changes how a shell starts (PATH, LD_*, DYLD_*, NODE_OPTIONS, BASH_ENV…) or
Ducter's own (DUCTER_*, NMEM_*).
