# 113 · Giving the partner its own iMessage identity on macOS 15 and 26

> 2026-11-17. Public. Evidence for D323: how a person realistically makes the partner a contact of its
> own in Messages (the D277 mode **{name} 自己的 Apple ID（推荐）**), instead of **给自己发信息 / Message
> yourself**, where the author found "每一个消息有两遍" (every message shows twice).
>
> Tags: **VERIFIED** read by me in a primary source or on this Mac's system files this session ·
> **DOCUMENTED** stated by an official doc or a maintained project's doc (read through the page or a search
> summary) · **INFERRED** my reading. Nothing touched the author's Messages, Apple Account, `chat.db` or
> macOS accounts: no Apple Account was made, no second macOS user was created, no message was sent.
> The only thing read on this Mac was the Messages app's scripting definition (`sdef`, a system file).
> macOS here: 15.7.9 (24G830). macOS 26 was not available to try.

## 1. One Apple Account in Messages per macOS user

| Finding | Tag | Source |
|---|---|---|
| Messages on a Mac is signed in to one Apple Account for iMessage; changing it is Messages › Settings › iMessage › **Sign Out**, then sign in with the other | DOCUMENTED | Apple, *Set up Messages on Mac* [1]; Apple Community threads [2][3] |
| You cannot add a second iMessage account to the same Messages; a second Apple Account needs a second macOS user | DOCUMENTED (community) | [3][4] |
| The Apple Account in **Messages can differ from the one in iCloud** (System Settings) for the same macOS user. Apple's guide says to use the same one everywhere; with different ones, Messages in iCloud doesn't sync | DOCUMENTED | [1][2] |
| One user reported sending broke after splitting iCloud and Messages accounts | DOCUMENTED (anecdote, one report) | [2] |
| The Messages scripting dictionary has, on `account`: `id`, `description` ("the name of this account as defined in Account preferences description field"), `enabled`, `connection status`, `service type` | VERIFIED (`sdef /System/Applications/Messages.app`, macOS 15.7.9) | this Mac |
| What `description` holds for an iMessage account (the login address?) | INFERRED, not seen | — |

So (a) is confirmed with a nuance that matters: one Apple Account **per Messages**, i.e. per macOS user,
but it need not be the user's iCloud account. A person who doesn't use Messages on this Mac can sign
**only Messages** in to the partner's account and keep iCloud as theirs.

## 2. A second macOS user on the same Mac, kept logged in

| Finding | Tag | Source |
|---|---|---|
| BlueBubbles documents running a second server in another macOS user: an admin user, Fast User Switching on, a different port; "the other user should now be able to use BlueBubbles simultaneously" | DOCUMENTED | BlueBubbles docs [5] |
| Only one user can log in automatically at boot | DOCUMENTED | [5] |
| A maintained agent's iMessage guide: "if the server user is switched away from (Fast User Switching), **AppleScript-based sending fails**"; sends on a background user fail "with long timeouts"; error example `-1743`; it says the Private API helper (SIP off) is required for reliable sending in background-user setups | DOCUMENTED | Hermes Agent docs [6] |
| A vendor guide for several iMessage accounts on one Mac: all profiles must stay logged in (switch, never log out); after a restart, log each in again; keep the Mac awake, plugged in, start after power failure, Power Nap off | DOCUMENTED (vendor) | WhatSnap docs [7] |
| OpenClaw's iMessage guide recommends "a dedicated Apple ID and macOS user"; Automation and Full Disk Access prompts must be approved in that user's session | DOCUMENTED | OpenClaw docs [8] |
| With FileVault on, automatic login is off; macOS 26 turned FileVault on during some upgrades and then greyed out automatic login | DOCUMENTED (STIG baseline; community reports for 26) | [9][10] |
| Reading `chat.db` from a background user (no Apple Events needed) keeps working | INFERRED (no source says either way; `imagent` keeps the database current while the user is logged in) | — |
| Energy: a second logged-in user costs memory and a little CPU; nothing found quantifying it | INFERRED | — |

So (b) is **not a path Ducter can recommend**: receiving would likely work, but sending, which is
AppleScript to Messages (D277, by design no SIP-off helper), fails while that user is in the background,
which on a Mac the person uses is nearly always. After every restart that user has to be logged in by
hand, and with FileVault (on by default on recent Macs) there is no automatic login at all.

## 3. A spare Mac (or a Mac mini) carrying iMessage for the home

| Finding | Tag | Source |
|---|---|---|
| Every iMessage gateway that works without SIP off runs on a Mac whose Messages is signed in, in a logged-in session in front | DOCUMENTED | [6][8] |
| Guides for a dedicated Mac: keep it awake, plugged in, "start up after a power failure", automatic login so it comes back after a restart | DOCUMENTED | [7][11] |
| Ducter's bridge already lives in the **Mac app as a client of the home** (`apps/desktop/imessage.go`: it relays through the app's socket, whatever computer the home is); the author used it with a server home (commit `1ea6775e`) | VERIFIED (code) | this repo |
| What was missing: the home didn't tell other clients **which Mac** carries iMessage, so the person's own Mac and the web said nothing true about it | VERIFIED (code: `channel_status` was kept on the socket only, read by `channelUp`) | this repo |

So (c) works with what is built: Ducter on the spare Mac, connected to the home like any Mac
(D293's worker Mac is the same app), Messages there signed in to the partner's account. Its socket's
`channel_status` is the only thing the home needs to show it to the person's other devices.

## 4. Making an Apple Account for the partner

| Finding | Tag | Source |
|---|---|---|
| On a Mac: System Settings › Sign in › *Don't have an account?*: birthday, email, password, region; payment can be None; **confirm a phone number**; verify the email | DOCUMENTED | Apple, *Create a new Apple Account* [12] |
| On the web: account.apple.com › *Create Your Apple Account*: email, password, region, birthday, "a phone number that you can always access"; verify the email and the phone number | DOCUMENTED | [12] |
| The email is the sign-in; any email works (a new iCloud address is offered only during iPhone, iPad or Vision Pro setup) | DOCUMENTED | [12] |
| Two-factor needs at least one trusted phone number | DOCUMENTED | Apple, *trusted phone numbers and devices* [13] |
| One trusted device can serve several Apple Accounts with two-factor; community answers say a number can be trusted on more than one account, with one report of "already used" | DOCUMENTED (Apple FAQ quoted in a forum) / anecdote | [14] |
| Minimum age to make an account alone: 13 in most places, 14 in some (China mainland, South Korea, Spain, Italy, others) | DOCUMENTED | Apple, *Create an Apple Account for your child* [15] |
| China mainland may need a +86 number | DOCUMENTED | [12] |
| An iMessage account reachable only at an email address (no phone number on it) is the normal shape for a Mac-only Apple Account: people text the email | INFERRED (Messages on a Mac registers the Apple Account's email; the phone number on a new account is a 2FA number, not an iMessage address) | — |
| New accounts sometimes fail to activate iMessage on a Mac ("Could not sign in", "An error occurred during activation"); fixes reported: sign in at account.apple.com first, sign out and in, check date and time, update macOS | DOCUMENTED (community) | [16] |

So (d): an email the person controls (a new one, or `+ducter` alias if their provider supports it),
their own phone number as the trusted number, the partner's "birthday" as the person's (an adult),
the person's region. No second SIM. The 2FA codes come to the person's own phone, which is right: the
person owns the partner's account.

## 5. Can the self-thread duplicate be reduced?

| Finding | Tag |
|---|---|
| In the thread you keep with yourself, each message is both sent and received by the same account, so Messages shows it as a sent bubble and a received bubble; the author saw this live (2026-11-17) | VERIFIED (by the author) |
| Ducter already reads one copy (D277: the same words within 30 s are one message), so nothing is *handled* twice; the *display* is Messages' | VERIFIED (code) |
| Ducter can't hide a bubble in Messages without the private API (SIP off), which D277 rules out | INFERRED from research/88 §4.1 |
| Sending the partner's replies to another of the person's own addresses (email vs phone number) lands in the same person's account; whether Messages keeps it in the same thread or a second self-thread varies, and the duplicate stays either way | INFERRED, not tried |

Honest answer: **no**. In Message yourself, every line shows twice and Ducter can't change that. Only
an account of the partner's own gives a clean one-to-one thread.

## Implications for Ducter

1. **One Mac:** recommend signing **only Messages** in to the partner's account when the person doesn't
   use Messages on this Mac themselves (their phone keeps their iMessages; Messages in iCloud then stays
   off on this Mac); otherwise keep Message yourself and say plainly what it costs. Don't offer a second
   macOS user: sending from it fails while it is in the background.
2. **A spare Mac, or a server home with a Mac:** the partner's account goes on a Mac that is Ducter's
   (an old MacBook, a Mac mini), its Ducter connected to the home, kept awake and logged in. The bridge
   already works there; the home should tell every client which Mac carries iMessage.
3. **Settings should check, not just tell:** Messages signed in (the Automation probe), the address it
   is signed in to (the `description` of the account, INFERRED, and the receiving address of the code
   message, which is definitive), whether that address is this Mac's iCloud account (a hint that it may
   be the person's own), and whether this macOS user is the one in front.
4. **The code tells the truth:** if the code arrives in the person's own thread with themselves, this
   Messages is theirs, so partner mode must not link as if it were the partner's.
5. **Unverified until a live run:** what `description` returns; `destination_caller_id` on macOS 26; an
   Apple Account made today getting iMessage on a Mac at the first try.

## Sources

1. Apple, Messages User Guide for Mac, *Set up Messages on Mac* (macOS 26 edition): https://support.apple.com/en-au/guide/messages/ichte16154fb/mac
2. Apple Community, different Apple IDs for iCloud and Messages: https://discussions.apple.com/thread/253971894 ; https://discussions.apple.com/thread/251175516
3. Apple Community, two iMessage accounts on one Mac: https://discussions.apple.com/thread/5522742
4. Apple Community, one Mac user with two Apple IDs: https://discussions.apple.com/thread/253881041
5. BlueBubbles, *Multiple users on the same Mac*: https://docs.bluebubbles.app/server/basic-guides/multiple-users-on-the-same-mac
6. Hermes Agent, *BlueBubbles* messaging guide: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/bluebubbles
7. WhatSnap, *Multi-user iMessage setup on a single Mac*: https://whatsnap.gitbook.io/whatsnap-docs/faq/imessage/multi-user-single-mac-setup
8. OpenClaw, *iMessage deployment*: https://docs.openclaw.ai/channels/imessage/deployment ; channel doc https://cdn.jsdelivr.net/npm/openclaw@2026.5.7/docs/channels/imessage.md
9. macOS 26 STIG APPL-26-000033 (automatic login off): https://stigaview.com/products/macos26/v1r2/APPL-26-000033
10. Apple Community, automatic login greyed out by FileVault after the Tahoe upgrade: https://discussions-cn-prz.apple.com/thread/256199871
11. OpenClaw iMessage guides on a Mac mini (awake, automatic login): https://dev.to/zacvibecodez/openclaw-imessage-setup-connect-via-imsg-or-bluebubbles-54d
12. Apple, *How to create a new Apple Account*: https://support.apple.com/en-us/108647
13. Apple, *About trusted phone numbers and trusted devices for Apple Account*: https://support.apple.com/en-is/122621
14. Apple Developer Forums, two-factor with multiple Apple IDs: https://developer.apple.com/forums/thread/129783 ; Apple Community https://discussions.apple.com/thread/256095366
15. Apple, *Create an Apple Account for your child*: https://support.apple.com/en-us/ht201084
16. Apple Community, iMessage won't sign in on a Mac with a new Apple ID: https://discussions.apple.com/thread/250926147 ; https://discussions.apple.com/thread/254574866

## Summary

One Messages holds one Apple Account, per macOS user, but it can differ from iCloud's. A second macOS user
can't carry the partner: its sending fails in the background, and it must be logged in by hand after every
restart. A spare Mac whose Messages is the partner's, with Ducter on it connected to the home, works with
what is built. The partner's account needs an email and the person's own phone number for 2FA. The
self-thread's double bubbles are Messages' and can't be removed.
