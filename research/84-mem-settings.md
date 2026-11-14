# 84 · Where memory lives in Settings: an audit of 记得什么, Nowledge Mem's place, its updates, and 你的其他 AI

**Asked by the author (2026-11-14):** "nowledge mem 在 role 的 ui 里，而且更新通知没有，而且里边的设计没有仔细打磨。里边的
memory 是分条目的？那个『记得什么』是怎么设计的？……『你的其他 AI』是 nowledge mem 区域么？你能第一性原理审视这个设置的位置和整体体验么？"

**Method.** Read the Mac app (`apps/desktop/internal/views/partner.go`, `peers.go`, `settings.go`), the web client
(`apps/web/src/views.tsx` `MemorySettings`, `BridgeRow`, `PeerSettings`, `SettingsSheet`), core (`settings.ts`
`noted()`, `bridge-link.ts` `view()`, `mem-cli.ts`), the decisions that placed each part (D141, D150, D168, D169,
D170, D205, D225, D229, D249) and `design/memory.md`, `design/bridge.md`. Pictures of the page as it was, Mac
1280 and phone web 390, zh/en, light/dark (`.shots/mem-settings/before-*`; built from `apps/web/demo-bridge.ts`
DEMO_BRIDGE=hel_ready and a Go tester frame with Mem connected, two noted lines and Bridge connected with Mem's
`status.update` saying a newer nmem is out). All VERIFIED by reading code and running it, unless marked.

## 1. What was there (VERIFIED)

Settings › 伙伴 / Partner was one long page of six groups: 用什么想, 谁来做事, 怎么说话, **记得什么**, 要不要先问,
**你的其他 AI**. The phone's Settings list described 伙伴 as "名字、用什么想事情、怎么说话、记得什么".

**记得什么 / What it remembers** (D150, D141):

- One switch row, 记住事情, whose helper said "你说过的事，它记在 Nowledge Mem 的「ducter」名下；替你做事时也用得上"
  (the AI Identity's id, an internal name, in the first line a person reads).
- Under it, 最近记下的: a flat list of up to 12 lines. **Data source:** not Mem. Core's `settings.ts` `noted()`
  reads the Log's `memory_noted` events (one per `memory_add` the partner made in the conversation), newest first,
  minus the ones hidden by a forget. Each line: its title, "2 小时前", 忘掉. So yes, memory showed as entries,
  but only the partner's own saves in this conversation, ungrouped, with no word on where they live or how to see
  the rest. Memories the person's other tools wrote into Mem, or the partner's tasks wrote, never appear.
- No Mem: no switch, one line on what Mem adds, and **了解 Nowledge Mem** (a link out).

**Nowledge Mem itself** (install, version, update, sign in) had **no place of its own.** D225/D229 put the home's
`nmem` steps on the *Bridge row* inside 你的其他 AI: 装上, 更新 (too old for Bridge), 换一下 (move to pipx), the
sign-in link, local-only. Mem's own "a newer nmem is out" (`nmem status`.update, D229) showed only as a quiet
13 px line under the Bridge row ("hel 上的 Nowledge Mem 有新版本了。") with a bare **更新** button beside **断开**
(update what?). Consequences:

- A person who never connects other agents never sees that Mem has an update. With `DUCTER_BRIDGE=0`, or memory
  off, nothing about Mem's version shows anywhere.
- When the copy is the Nowledge Mem app's (Ducter can't update it), `upkeep` was never set, so a newer version
  was never mentioned at all (`upkeepFor` needs a plan Ducter can run).
- The version itself was sent only on `update_mem` and `sign_in`; a working Mem never said which version it was.
- Nothing outside the page said it either: the Settings list row, the Mac's rail and On hand were silent.

**你的其他 AI / Your other AI agents** (D170, D205) sat at the bottom of the same partner page, *after* 记得什么,
and its first row was the Mem install/update/sign-in row whenever Mem wasn't ready, so to a reader it looked like
"the Nowledge Mem area". When connected, its help text ended with a monospace `ducter · Only me · 6f1c0d2e-…`
line.

**Visual (the author's "typography、layout 各种设计非常没有仔细打磨"):** both groups were the generic settings
row (MD 15 bold label, SM 13 muted helper, control at the end). The noted list was rows of plain MD text with
XS times; no grouping, no hierarchy, no character. The partner's face appears only in the page header, unrelated
to memory. The update line was the same muted grey as every helper. On the phone the trusted/muted agents were
loose rows outside any card.

## 2. Who opens this, and why (first principles)

| Who | Why they come | What they should feel after | First time |
|---|---|---|---|
| Heavy multi-agent developer | Check what the partner knows; fix a wrong memory; see Mem is healthy and current; connect terminal agents | "It knows me, I can see and correct it, and Mem is fine" | Mem already on the home; a newer nmem out |
| Consumer personal-AI user | "Does it remember me?" | Warmth: it remembers me, and I'm in control (forget anything) | Mem may be missing; must not feel broken |
| Fresh user | Curiosity, or never | It already remembers this conversation; one gentle offer for more | No Mem, no concepts (no "AI Identity", no "Bridge") |

Two different questions were on one page: *what does my partner remember about me* (personal, emotional, the
consumer's question) and *how do my other agents reach it* (a developer's plumbing, J6 says a fresh user never
meets it). And a third concern, *is the memory app healthy and current*, had no home at all.

## 3. Options for the information architecture

| | Shape | For | Against |
|---|---|---|---|
| A | Keep everything on 伙伴, polish the cards | No new tab | The page stays a long sheet; Mem's health still lives under Bridge or nowhere; 你的其他 AI still reads as Mem's |
| **B** | **记忆 / Memory as its own tab after 伙伴** (what it remembers, then Nowledge Mem itself); **你的其他 AI its own tab**, shown once it means something | Each question gets a place; the update has an obvious home; the fresh user's Settings stays short | Two more rail entries (one hidden for most) |
| C | Mem as a card on 你的设备 / Devices (it is software on the home, like an agent) | Matches D148/D224's update machinery | Memory is the partner's, not a device's; "does it remember me?" would never look under Devices |
| D | Memory inside 伙伴, Mem's install/update on Devices | Each in its "technical" home | Splits one story in two places; the person who asks about memory meets "go to Devices" |

**Chosen: B.** Memory is the partner's (the partner always carries its notebook in its clay art), but it is also
the person's own product (Nowledge Mem, shared by their other tools), so it gets a tab that leads with the
partner's warmth and ends with Mem's own card. Bridge is about other agents, not memory: it gets its own tab and
borrows only Mem's sign-in. C stays a follow-up (Mem could join 全部更新 / Update all, `todo.md`).

## 4. What 记得什么 should show

Not a raw list. In order:

1. **The partner and one sentence.** The partner hugging its notebook (its `done` face) and "小鸭记得你 / Duckie
   remembers you", then where it keeps it and why that matters (a new conversation or another AI tool picks up).
   Off: the napping face under its blanket and "现在不记新的事"; no Mem: "记得这次对话" and the one offer. The
   switch belongs to this card.
2. **What it noted, grouped by when** (今天 / 这一周 / 更早), each line a small clay pebble, the title at weight
   600, its age, 忘掉. Grouping by *kind* (preference, decision, fact) would read better, but the noted lines carry
   no kind (`memory_add` has title, content, importance); Mem's records do (`unit_type`, labels: research/69 §2),
   but reading the identity's memories from Mem in Settings is a new read path and a privacy surface: left to
   `todo.md` with its trigger. **在 Nowledge Mem 里看全部 / See everything in Nowledge Mem** is the honest door to
   the rest.
3. **Nowledge Mem**: where it is and its version ("在 hel 上 · 0.10.118", a green 已连上 pill), the name it
   goes by there (the persona's display name, not the id), and Mem's own steps (装上, the sign-in link, 换一下,
   local-only), moved here from the Bridge row with their D225/D229 words unchanged.

## 5. Mem updates

- Core says, on every working state, the home's nmem `version` and Mem's own `newer` (from `nmem status`.update:
  the latest version, or "" when Mem doesn't name one), whether or not Ducter can run the update.
- Memory shows one card in the highlight (D213's update colour, D224's 有 N 项更新 language): **Nowledge Mem 有新版本
  0.10.121** · "hel 上现在是 0.10.118。更新只换程序：登录不变，记忆不动。" · **更新**. Bridge needs it (`update_mem`):
  **Nowledge Mem 要更新一下** with D225's line. The app's copy: the same title, "在 Nowledge Mem 应用里更新就好", no
  button. While it runs: the working colour, "正在更新 hel 上的 Nowledge Mem…".
- Where the person will see it: the Settings list row (web) and the Mac's rail say **Nowledge Mem 有新版本** /
  **Mem update available** under 记忆, in the highlight's ink, exactly as 你的设备 says its updates (D224).
- When it matters for something in use: on 你的其他 AI, a failed, refused or unconfirmed connection with a newer
  Mem out says "Nowledge Mem 有新版本。连不上的时候，先更新它，再试一次。" with **去「记忆」** (nowledge-co/mem#10211
  is such a Bridge-setup fix, INFERRED from the author's note; not verified here). An On hand item for it is not
  built (silence means success, and the update is never urgent): `todo.md`.

## 6. The marks (the metaphor rule)

Memory's mark had five candidates: (1) no metaphor, the word only; (2) the partner's face again; (3) a brain;
(4) a knot on a finger; (5) **the partner's own blue notebook** (from its clay art, where it is always held).
False implications: a brain says "intelligence", not memory; a knot says "a reminder", which Ducter's waits already
are; the face is 伙伴's mark already. The notebook's false implication is "a file you write in", and the page does
let you strike lines out, so it mostly holds. Chosen: the notebook, drawn in the same clay as the other drawn tab
marks (cover on a ledge, the pages' edge, strap, clasp, a highlight; `--notebook-*`, `Tokens.Notebook`). 你的其他
AI's mark is literal: two of the person's own agents' coins, overlapped. Comprehension test with naive raters:
not run (the LLM-proxy run would write to `~/.claude`, out of bounds for this change): `todo.md`.

## Implications for Ducter

- D257: two tabs, 记忆 / Memory and 你的其他 AI / Your other AI agents; 伙伴 keeps who the partner is.
- Core's `BridgeView` carries `version` and `newer` on working states (it already had them on two).
- The glossary gains 记忆 / Memory, 它记下的 / What it noted, 有新版本 / is out, 去「记忆」 / Go to Memory; 记得什么
  and 最近记下的 retire from the UI.
- Later: Mem's own memories (by kind) in Memory; Mem in 全部更新; an On hand line when an update blocks something.

**Summary.** The partner's memory was a switch and a flat list of its own conversation saves inside the partner
page, Nowledge Mem had no place (its install, sign-in and update sat on the Bridge row), its update was a grey
line under 你的其他 AI and invisible otherwise, and 你的其他 AI read as Mem's area. D257 gives memory its own
tab that leads with the partner and what it noted (grouped by when), gives Nowledge Mem a card with its version
and a highlighted update, says the update on the Settings entry, and gives 你的其他 AI its own tab that appears
once Mem is in.
