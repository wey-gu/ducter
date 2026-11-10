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

**At rest:** `<dataDir>/saved/<persona>.enc`, AES-256-GCM, 0600. The key is apart from it: on a
Mac in the login keychain (generic password, service `Ducter Autofill`, an account per data folder,
via `/usr/bin/security`); elsewhere `<dataDir>/saved/key`, 0600. The screen says which, plainly:
**锁着存在 {home} 上，钥匙在这台 Mac 的钥匙串里 / Locked on {home}, its key in this Mac's
keychain** or **…钥匙是一个只有 Ducter 能读的文件 / …its key in a file only Ducter can read**.
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
| A saved sign-in | only on its own site (the host or a subdomain of it); a look-alike page gets nothing and the task is told it may be one | the first use on that site: **第一次用存着的登录进 {site}？ / Sign in to {site} with what you saved, for the first time?**, **可以 / OK** · **先不用 / Not now**; never again on that site |
| A private detail | per site | the first time on each site: **第一次把你的{detail}给 {site}？ / Give {site} your {detail} for the first time?** |
| A readable detail | none | — |
| **Every payment** | the task calls `browser_ask_to_pay` on the checkout; the merchant is the page's host read by code, never the model's word | **在 {site} 付款？ / Pay on {site}?** with Amount, For, Merchant (+ **第一次在这里付 / First payment here**), Card; the security-code field; **先不付 / Not now** · **付 {amount} / Pay {amount}**. No default, never pushed past quiet hours as a default. Go without the code is refused |
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
name only), **用在了哪儿 / Where it was used** (filled · said Go to {amount} · said OK · said no,
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
