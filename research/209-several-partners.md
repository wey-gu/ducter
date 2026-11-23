# 208: Several partners, out of preview (D486)

2026-11-23. Why a person wants more than one partner, what Ducter had built (D309, D312) against
what it lacked, what three open-source multi-agent personal assistants teach about several agents
living side by side, the candidates, and the choice. The named comparison is in
`research/private/` (gitignored); this report describes concepts only.

## 1. The question

The author: 「主 ai 我们没支持多 partner，这里要综合看一下设计实现一下了」. D309 and D312 built a
second partner, but only behind `DUCTER_PARTNERS=preview`, which is off on every home. So for
every person Ducter had one partner. The question: what does a complete first slice need, and is
the D309 model (shared person, separate conversations and memory) the right one?

## 2. Audit: built, half-built, missing (VERIFIED by code and tests on main 0.1.18)

| Piece | State before D486 | Where |
|---|---|---|
| partners.json, names, looks, at most four | built | `core/src/partners.ts`, `core/test/partners.test.ts` |
| Each conversation its own stream (`channel:<id>`), a socket sees one | built | `ws.ts`, `partners.test.ts` |
| A second partner's own session, folder, MCP role, digests | built | `core/src/partner-view.ts`, `partner/test/second-partner.test.ts` |
| Core's writes routed to the owning partner (tasks, waits, routines) | built | `createWhose`, `partners-answer.test.ts` |
| Its own Mem identity `ducter-<id>` | built (bound when Mem answers) | `core/src/main.ts` `bindPartnerMem` |
| Its L1 from its own Mem bundle (the person's profile, its rules) | **missing**: only Ducter's own words | `core/src/persona.ts` `otherIdentity` |
| One needs-you count, On hand stones, push and menu bar naming whose | built (web, Mac) | `needsAcross`, `apps/web/src/partners.tsx`, Mac `views/partners.go` |
| The switch (stones in the bar), remembered per device | built (web wide, phone web, Mac) | same |
| **On for anyone** | **missing**: off unless `DUCTER_PARTNERS=preview` | `partners.ts` |
| What each partner is for | **missing** | |
| Making one by talking ("make me a second partner for …") | **missing**: Settings only | |
| One partner knowing the others exist (who, what for) | **half**: a second partner's L1 named the others; the default knew nothing | `otherIdentity` |
| A message meant for the other partner; a task the other owns | **missing**: no way to hand over | |
| Removing a partner | **missing** | |
| The Mac renaming another partner | **missing** (the web did) | |
| The second partner's [devices] facts (computers, agents, code, limits) | **missing**: its view of core lacked them | `partnerView` |
| Chat apps per partner, Bridge per partner | missing (the default's) | `personas.md` |
| Forgetting and correcting a second partner's memories | missing (the default's) | `partnerView` settings |
| CLI | no partner surface (the CLI talks to the default) | `packages/cli` |

## 3. What the references teach (DOCUMENTED, their own docs; read-only clones, nothing run)

Three open-source projects that run several agents for one person were read: a chat app of bots
(the project the author named), an agent gateway with multi-agent routing, and an agent CLI with
profiles. Concepts only:

1. **An identity is not a conversation.** All three separate a durable agent (name, look, voice,
   memory, folder) from the threads with it. Ducter already does: a partner, its conversation.
2. **What it is for, said once at creation.** One asks for a one-line role at creation so a
   coordinator knows what each is good at; another offers "set me up in one sentence". Ducter had
   only a name and a colour.
3. **Made by talking.** In one, the first agent makes a specialist itself, says so in one line and
   offers Undo; in another an agent may only ask, and a person approves. The person asking in their
   own words is consent enough when nothing outward happens.
4. **Hand-over is visible and carries only what was said.** "Sent to X" where the work went, the
   answer where it comes back; a private conversation is never posted into another. Nobody new
   reads the room.
5. **One inbox, each line saying whose**, one notification, one count on the icon. Ducter's On hand
   already is this (D24, D309).
6. **Facts about the person are shared; each agent's own notes are its own.** One keeps an
   "about me" every agent reads (each line saying which agent learned it) beside each agent's own
   memory. Nowledge Mem already has this split: the owner's profile is the person's, an agent
   identity's memories and rules are its own (INFERRED from the bundle's `owner_profile` and
   per-agent `rule_stack`).
7. **Never two writers on one state.** Two of them warn that two agents on one state directory
   load each other's writes until neither is what was set up. Ducter's `partners/<id>` folder and
   one Mem identity each keep this.
8. **Not taken:** group rooms of several agents (no scenario for the three users yet), a chief that
   manages the others (hierarchy; Ducter's vocabulary is partners), per-agent logins (the person's
   accounts are the person's).

## 4. Who, and why (User first)

- **The heavy multi-agent developer:** a work partner and a home partner. The release ask and the
  dentist never share a context or a memory. Value 放心.
- **The consumer personal-AI user:** one partner per family member, or a different character for a
  part of life, made in one sentence. Value 惊喜.
- **The fresh user:** never sees any of it until they ask ("再给我做一个管家里事的伙伴"); with one
  partner nothing about partners shows. Value 好用.

## 5. Candidates

| # | Shape | False implications |
|---|---|---|
| A | Separate homes per partner (everything apart: accounts, computers, On hand) | the person is several people; two On hands; attention split |
| B | D309 as it was (shared person, own conversation and memory), off by default | nobody has it; a partner can't know the others or hand anything over |
| C | A roster with a chief that manages the others (delegation tree, group rooms) | hierarchy; the person talks to a boss of bots; group rooms leak between conversations |
| D | One partner with modes (hats), one memory | the home thing still sits in the work memory: the reason for wanting two |
| E | B, on for everyone, plus: what each looks after, made by talking, the person's words passed between partners on their word, each knowing the others' names and parts (never their contents), its own Mem bundle, removal | a partner may pass words the person didn't mean to pass (guarded: only on their word, only their words) |

Rubric (1 to 5): zero setup / isolation (nothing of one leaks) / attention per person / hand-over /
fits "partners, not hierarchy" / feasibility on today's code.

| | Zero setup | Isolation | Attention | Hand-over | Partners | Feasible | Sum |
|---|---|---|---|---|---|---|---|
| A | 2 | 5 | 1 | 1 | 4 | 2 | 15 |
| B | 1 | 5 | 5 | 1 | 5 | 5 | 22 |
| C | 3 | 2 | 4 | 5 | 1 | 2 | 17 |
| D | 5 | 1 | 5 | 3 | 4 | 4 | 22 |
| E | 5 | 4 | 5 | 4 | 5 | 4 | 27 |

E is chosen (D486). Its isolation scores 4, not 5, because a partner now knows the others' names
and what each looks after (the person's own words, given for that), and passes words on the
person's say; it never sees another's conversation, tasks or memory.

## 6. Implications for Ducter

1. Several partners are on for every home; `DUCTER_PARTNERS=off` turns them off.
2. A partner has **它管什么 / What it looks after**, the person's words, at most 120 characters.
3. One partner tool, `partner`: `make`, `pass`, `set`. Removal stays two taps in Settings.
4. A `[partners]` line on every turn while there is more than one: who this partner is, the others,
   what each looks after, how many of their own questions wait. Nothing of their contents.
5. Passed words land in the other partner's conversation as the person's (`user_msg.passed`), with
   a small line over them naming who passed them; that partner answers there.
6. A second partner's L1 adds its own Mem identity's bundle, read when its session starts.
7. A second partner sees the same computers, agents, code and limits as the first.
8. Left: chat apps per partner, Bridge per partner, forgetting per partner, per-partner accounts,
   the CLI, a clay character per partner, the stone's comprehension test.

## Summary

Ducter's partner model was right but switched off, and partners were strangers to each other. The
references agree on separate state per agent, one inbox per person, visible hand-over carrying only
what was said, a role given at creation, and creation by talking. D486 turns partners on, gives
each what it looks after, lets a partner make another, pass the person's words to another and
rename one from the conversation, lets each know the others by name and part, reads a second
partner's own Mem bundle, gives it the same world facts, and lets the person remove one.
