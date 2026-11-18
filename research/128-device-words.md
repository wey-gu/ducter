# 128 · The words for the home and for a computer that does tasks

> 2026-11-18. Public. Evidence for D358. The author on 0.0.76's 你的设备: the home's 「住这儿」, the header
> 「Ducter 住在 Hetzner Server 上。」 and a worker's 「替 Hetzner Server 做事」 "表达我觉得也不够好，仔细反思".
>
> Tags: **VERIFIED** run by me this session · **INFERRED** my reading. LLM proxies only (claude haiku), no
> humans: the numbers say how a careful naive reader parses the words, not how people feel.

## 1. What the words must carry (INFERRED)

The devices page shows one computer where the partner itself runs (the conversation, memory, the
decisions; turn it off and the partner is gone), and computers that only run its tasks (turn one off and
only the tasks there stop; it never sees the conversation). The person reading it is one of three:

- the heavy developer with a home on a server (hel) and a Mac that runs tasks;
- the consumer who never opened a terminal and doesn't know what a server is;
- the fresh user who has never heard of an agent and doesn't know Ducter can use several computers.

What each needs from the two short lines: which one Ducter *is on*, what happens if either is turned off,
and that the second is there to help, not to hold their conversation. What they should feel: 放心 (it is
clear what is where) and calm, with the partner as the subject, not a machine.

## 2. Candidates and their false implications (INFERRED)

Home (the list's line, the card's line, the page's header):

| Candidate | Says | False implications |
|---|---|---|
| H1 住这儿 / Lives here (today) | the partner dwells here | a creature in a box; a bare 住这儿 has no subject in the list ("who lives here?"); moving it is "moving house"; read by several raters as an odd word |
| H2 Ducter 在这台上运行 / Ducter runs here (literal) | the software runs on this one | slightly technical ("运行"); none about where the chats are |
| H3 Ducter 的家 / Ducter's home | its home | a box in *your* house (raters: "a physical box in your home"); a home it leaves to visit others; that the others are lesser |
| H4 主电脑 / Main computer | the main one of several | "main" vs "secondary" sounds like a ranking of the person's own computers; "主机" jargon |
| H5 对话和记忆在这台上 / Chats and memory are here | where the data sits | reads as storage only: raters didn't conclude the partner stops when it is off (4/12) |
| H6 Ducter 在这儿 / Ducter is here | presence | too thin: the others "may also be Ducter" (6/12 and 2/12 read the off-switch right) |

A computer that does tasks:

| Candidate | Says | False implications |
|---|---|---|
| W1 替 Hetzner Server 做事 / Works for Hetzner Server (today) | it works on behalf of the home machine | servitude to a machine; the person isn't in the picture; "the server controls it"; 替 flagged odd |
| W2 也在这台上跑任务 / Runs tasks too | tasks also run here | "too" reads as "a minor extra"; 任务 is a word Ducter otherwise says as 事 |
| W3 帮 Ducter 做事 / Helps Ducter with tasks | it helps the partner | a helper "smaller" than the partner (true: it only runs tasks); doesn't say it can't see the chats |
| W4 帮手电脑 / Helper computer | a helper kind of computer | a category of hardware; 2.17 clarity in zh |
| W5 能在这台上做事 / Can do tasks here | a capability | "can" without saying whether it does |
| W6 借给 Ducter 做事 / Lent to Ducter for tasks | lent | handed over, no longer yours; temporary; 借给 flagged odd in 4 of 6 zh runs, "lent" in all 6 en |
| W7 Ducter 也在这儿做事 / Ducter also works here | the partner works here too | that Ducter *is* on this one as well (off-home read right 2/12) |
| W8 帮 Ducter 跑任务 / Runs tasks for Ducter | runs tasks for it | 跑任务 colloquial-technical; "帮…跑任务" read as vague by two zh raters |

"No metaphor" here is H2 + W3/W8: say what runs where.

## 3. Method (VERIFIED)

- **Raters:** `claude -p --model haiku --no-session-persistence --tools "" -- <prompt>` from a scratch
  folder, 8 at a time. No `~/.claude/projects` folder was created (listed before and after, identical).
- **Stimulus:** the page as the person sees it, in the rater's language: the header line, then "你的设备 /
  Your devices" with three rows: Hetzner Server with the home word, Wey's MacBook Pro with the worker word,
  iPhone with 现在连着 / Connected now. One coherent set (header, home, worker) per run.
- **Personas:** the three users above, in their language.
- **Asked (one JSON line):** what Hetzner Server is to Ducter; what the MacBook is for; shut down Hetzner
  Server (A: Ducter stops entirely, right); shut down the MacBook (B: tasks there stop, Ducter carries on,
  right); can the MacBook see your chats (no, right); clarity of each 1-5; feel 1-5 (warm and trustworthy
  vs awkward, cold, strange); one thing the words might make you wrongly believe; which word reads oddly.
- **Rubric:** reads right (the two off-switch questions), mapping fidelity (no false belief beyond the
  table), works at scale (a persona named 小鸭, several workers, a server or a Mac, with 在做 2 件事 beside
  it), emotional fit (feel, odd-word flags), distinctiveness (home vs worker never confused), feasibility
  (fits the 226-pt list row and the Settings switch).
- **Round 1:** 7 sets × zh/en × 3 personas × 2 runs = 84. **Round 2:** the best home and the best worker
  words combined, against today as a control: 4 sets × 12 = 48. 132 runs in all, none unparsable.

## 4. Results (VERIFIED)

Round 1 (12 runs per set; clarity and feel as zh / en):

| Set (home + worker) | Off home right | Off worker right | Clarity home | Clarity worker | Feel |
|---|---|---|---|---|---|
| S1 住这儿 + 替 Hetzner Server 做事 (today) | 9 | 11 | 3.83 / 3.83 | 2.83 / 2.83 | 3.17 / 3.17 |
| S2 在这台上运行 + 也在这台上跑任务 | **11** | 12 | 3.33 / **4.00** | 2.83 / 3.00 | 3.00 / 3.00 |
| S3 Ducter 的家 + 帮 Ducter 做事 | 4 | 12 | 3.00 / 2.83 | **3.33 / 3.67** | **3.50 / 3.50** |
| S4 主电脑 + 帮手电脑 | 7 | 11 | 2.67 / 3.33 | 2.17 / 2.83 | 3.00 / 3.33 |
| S5 对话和记忆在这台上 + 能在这台上做事 | 4 | 12 | 3.50 / 4.17 | 3.00 / 3.33 | 3.00 / 3.33 |
| S6 Ducter 在这儿 + 借给 Ducter 做事 | 6 | 12 | 3.50 / 3.00 | 2.83 / 3.50 | 3.00 / 3.17 |
| S7 Ducter 在这儿 + Ducter 也在这儿做事 | 2 | 11 | 3.00 / 3.17 | 2.50 / 2.50 | 3.00 / 3.00 |

Round 2:

| Set | Off home right | Off worker right | Clarity home | Clarity worker | Feel |
|---|---|---|---|---|---|
| Control: 住这儿 + 替 Hetzner Server 做事 | 10 | 11 | 3.33 / 3.67 | 2.83 / 3.00 | 3.17 / 3.33 |
| **R2a 在这台上运行 + 帮 Ducter 做事** | **12** | **12** | 3.83 / 4.17 | 3.00 / 3.00 | 3.33 / 3.33 |
| R2b the same, the header adding 你们的对话和记忆都在那儿 | 12 | 11 | **4.00 / 4.67** | 2.50 / 3.00 | 3.33 / 3.17 |
| R2c 在这台上运行 + 帮 Ducter 跑任务 | 11 | 12 | 3.50 / 4.17 | 3.17 / 3.17 | 3.00 / 3.00 |

**Odd-word flags, in the raters' words:** today's 住这儿 / 住在这儿 / Lives here was named the odd word in 13
of 24 runs with it, 替 / Works for in 9; 借给 in 4 of 6 zh runs and "lent" in all 6 English ones; Ducter 的家 /
home in 10 of 12. R2a's own words were never named (the flags were 现在连着 / Connected now and the server's
English name).

**False beliefs that survive every set:** "the MacBook can see my chats" (no set got a "no" from a rater,
except S5, whose home line names the chats: 5/12), and for some, "the MacBook is Ducter itself". R2b's
header (chats and memory are there) lifted home clarity but some raters then thought the MacBook stores
them too, and the worker's clarity fell.

## 5. Reading (INFERRED)

- **Home: Ducter 在这台上运行 / Ducter runs here.** The only home word read right by every rater in round
  2 (and 11/12 in round 1), with the highest clarity of the words that keep the partner as the subject.
  Literal, and the persona name in front keeps it warm enough (feel 3.33, the same as today's).
- **A computer that does tasks: 帮 {name} 做事 / Helps {name} with tasks.** The partner, not a machine,
  is who it helps: the "servitude to a machine" reading goes, and 替 (on someone's behalf, in their place)
  becomes 帮 (helping). Best worker clarity in round 1 and 12/12 off-switch in round 2.
- **What the words can't carry, the screens say once:** the worker can't see the conversation. Raters
  never inferred it from any short label, so it goes where a worker is added and switched on (the add
  sheet's line, the Mac switch's note), not into the list.
- 借 (lend) reads as "handed over, no longer yours" to Chinese readers: Lend a computer becomes
  加一台做事的电脑 / Add a computer for tasks.

## 6. Not tested

Humans; Traditional Chinese; the words read aloud; a home on a Mac (the person's own laptop) where
"runs here" may read as "this app runs here".

## Implications for Ducter

1. The home's lines: **{name} 在这台上运行 / {name} runs here** (list and card), **{name} 在 {computer} 上
   运行。/ {name} runs on {computer}.** (header), Partner **在 {computer} 上运行 · 用 {agent} 想事情**;
   Settings group **在哪儿运行 / Where it runs**; "the computer Ducter lives on" becomes "the computer
   Ducter runs on" in the clients, the command line and the docs.
2. A computer that does tasks: **帮 {name} 做事 / Helps {name} with tasks**, **在帮 {name} 做 {n} 件事**,
   the switch **让这台 Mac 也帮 {name} 做事 / Let this Mac help {name} with tasks**, always with the
   partner's name, never the home computer's.
3. Say "it never sees your conversation" where a computer is added or switched on.
4. Retire 借 in the lend flow's name.

**Summary:** 132 haiku runs as the three users over 6 home and 8 worker candidates. 住这儿 and 替 {machine}
做事 were read right most of the time but flagged as odd; Ducter 在这台上运行 + 帮 Ducter 做事 was the only
set every rater read right in both directions, with better clarity and the same warmth. LLM raters only.
