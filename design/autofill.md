# Autofill: sign-ins, cards and your details for errands (D191)

The person sees it as **密码和银行卡 / Passwords & cards** (D336): the Settings section, the docs page
and every word the partner says. "Autofill" is the builder's name for the mechanism (this note, the
code); it never reaches a screen. In zh a payment card is **银行卡**, never a bare 卡.

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
  partner says once that Settings › Passwords & cards lets Ducter fill it next time. Nothing to learn first.

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
| A key copied to a computer (D539, §9): name, variable, value | that computer's own shelf (`kept-keys/keys.enc`, its lock in the keychain or a 0600 file), never the home's | a task there by reference, in its session's environment; clients see the name, the variable and where it came from |

**At rest:** `<dataDir>/saved/<persona>.enc`, AES-256-GCM, 0600. The key is apart from it: on a
Mac in the login keychain (generic password, service `Ducter Autofill`, an account per data folder,
via `/usr/bin/security`); elsewhere `<dataDir>/saved/key`, 0600. The screen says which, plainly:
**锁着存在 {home} 上，解锁用的密钥在 Mac 的钥匙串里 / Locked on {home}, its key in the Mac's
keychain** or **…解锁用的密钥在一个只有 Ducter 能读的文件里 / …its key in a file only Ducter can read**.
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
| **Every payment** | the task calls `browser_ask_to_pay` on the checkout; the merchant is the page's host read by code, never the model's word | **在 {site} 付款？ / Pay on {site}?** with Amount, For, Merchant (+ **第一次在这里付款 / First payment here**), Card; the security-code field; **暂不付款 / Not now** · **支付 {amount} / Pay {amount}**. No default, never pushed past quiet hours as a default. Go without the code is refused. Without a saved card (or without the person's words to pay with it) an errand stops at the checkout instead: **去付款 / Go to checkout**, the person pays in the live view (D436, `errand.md`); a press that pays is refused by code outside this card's Go |
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

## 6. Settings › Passwords & cards (both clients)

**设置 › 密码和银行卡 / Settings › Passwords & cards** (D336), after Chat apps. Its line in the
Settings list says what it is for and where it is kept: **登录、付款、填地址时用，锁着存在你的电脑上 /
For signing in, paying and filling in addresses; locked on your computer**. One lede, then the
groups: **登录 / Sign-ins** (site, user name, last used, a dot row), **银行卡 / Cards** (a small clay card
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
- A key pasted on the home for a task on a worker (§8; a key the person has on another computer is copied, §9).

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
own model calls, and every use is listed). The card is not cancelled with the run: it stays until
the person answers it.

**The tool.** `ask_for_key({ env, name, why?, again? })`, for every task not in a browser place:

| The case | What happens |
|---|---|
| A key is kept under `env` | given to the task at once (a use listed); the answer says how to load it |
| Given to this task already | the same answer (`again: true` instead asks anew: the key didn't work) |
| The switch is off | no card; the task is told to say in its report which key it needs and why |
| The task runs on a worker | D539 (§9): kept there, given at once; on another of the person's computers, a copy card; else no card, and the task is told to ask with a `needs_input` question if it can't go on |
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

**Settings › Passwords & cards › 密钥 / Keys.** **让任务向你要密钥 / Let tasks ask you for keys** (on by
default) with **任务要用 API 密钥或部署密钥时，会在对话里问你要。关掉后，它只在报告里说需要哪一个。**;
the kept keys (name; variable · last used; a head then `••••••`, or **已存 / kept**); **添加密钥 /
Add a key** (它是什么 / What it is, 变量名 / Variable name, 密钥 / Key); Remove as for the others.
使用记录 lists **把 {name} 交给了任务 / Gave {name} to a task** (**，只这一次 / , just this once**) and
**你没给 {name} / You didn't give {name}**, with the task. A variable is `^[A-Z_][A-Z0-9_]{0,63}$`
and never one that changes how a shell starts (PATH, LD_*, DYLD_*, NODE_OPTIONS, BASH_ENV…) or
Ducter's own (DUCTER_*, NMEM_*).

## 9. A key you already have, copied to your other computers (D539)

Status: built 2026-11-24 on the home, the worker, the web client and the Mac app, for the author's
review; checked with core's `key-copy.test.ts` over fake computers (the Mac has the variable in its
shell, hel and haswell don't, an older worker can't), the runner's worker test (a session on a
worker gets it by name), the partner eval's two puzzles from hel's case; shots in
`.shots/secret-copy/`. Not yet tried between the author's real computers. The mechanism and its
threat model: `system.md` "Keys copied between computers".

**Who and what they feel.** The developer moving his Prow log MCP from the Mac to hel and haswell:
the key is in his Mac's shell, the config needs it on the other two. Before (hel, 2026-11-24): the
hel task sat in 在等 for forty minutes, the partner told him 「请在 hel 本机设置
STI_MCP_API_KEY，不要把密钥发到聊天里」, and when he asked 「不能直接把 mac 上的自动迁移过去么」 it
said there was no safe channel and to ask a Prow admin. Ducter has had an authenticated link to
each of his computers all along. After: one card, **复制**, done; the task carries on by itself.
The consumer with a laptop and a home mini: a key they set once on the laptop works for the
errand on the mini. A fresh user never meets it until a task needs a key that is on another of
their computers, and then it is one card in their own words. Easy (one tap, nothing to paste),
smooth (the task that waited is answered in its own call), delightful (a receipt-like card that
says from where to where), trustworthy (asked every time, never shown, the home never holds it),
pleasantly surprising (the key they set on the Mac months ago just works on the server).

**When the card comes.** Only from a tool call, never from what a task or a page says:

- a task calls `ask_for_key` and the variable isn't kept for it: Ducter asks the person's other
  connected computers whether they have it (a yes or no each); found, the task's card is a copy
  card for it, and the task waits on it in **待你处理 / Needs you**, as for D233's key card;
- the partner sees work on one computer needs a key the person has on another (a task's report, or
  their own words): `key_copy {env, from, to[]}` puts the card in the conversation.

It is never automatic: a copy widens where a secret lives (the D61 floor's spirit). No default, no
countdown, no standing permission, no chat-app button, never answered by a message.

**The card** (the decision's `copyKey`), receipt-like like the key card: the title **把 {from} 上的
{env} 复制到 {to}？ / Copy {env} from {from} to {to}?**; the facts **变量名 / Variable** (mono),
**要什么 / What** (when it has words of its own), **来自 / From**, **复制到 / To**, **为什么 / Why**;
the note **只给 Ducter 的任务用，不显示，不进聊天记录。 / Only for Ducter's tasks there. Never shown,
never in the conversation.**; **先不 / Not now** · **复制 / Copy**. After: **正在复制… / Copying…**,
then **已复制到 {to} / Copied to {to}** or **没有复制 / Not copied**. A computer it couldn't reach
says so under the facts: **没能复制到 {name}：它现在没连上 / Couldn't copy to {name}: it isn't
connected now** (or that its Ducter is too old, or that the key is no longer where it was). When
nothing went, the card stays open with **再试一次 / Try again**.

**How a task uses it.** Kept on its computer, the variable is the task's by reference: its session
starts with it in its environment (so a config that names `$STI_MCP_API_KEY`, an MCP server's
included, just works), and a session already running gets a 0600 file there to source inside one
command (D233's rule: never print it). The person's own shell profile is never touched.

**Settings: each computer's card**, a fold **Ducter 存着的密钥 / Keys Ducter keeps** (with the count):
**只给 Ducter 在这台电脑上的任务用，锁着存在这台电脑上，谁也看不到内容。 / Only for Ducter's tasks on this
computer, locked on it. Nobody can see what they hold.**; each key its name, its variable (mono),
**从 {computer} 复制来 / Copied from {computer}**, and **删掉 / Remove** (asked once: **确定删掉 /
Remove it**). Empty: **还没有。这台电脑上的任务要用另一台电脑上的密钥时，Ducter 会问你要不要复制过来。**
Away: **它现在没连上，连上后能看到。** Too old: **这台电脑上的 Ducter 还不能存密钥，更新一下就行。**

**Not in v1.** Copying a key pasted into Passwords & cards › Keys on the home to a worker (the
D233 paste card still serves home tasks only), a config file's entry as a source (an MCP config's
literal header), and rotating a key everywhere it was copied (`todo.md`).
