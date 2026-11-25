# 227: How a similar open-source project frames itself, and what Ducter can learn

**Date:** 2026-11-25. **Question (the author):** a similar open-source project's framing, README
and website read as inspiring; what should Ducter take from its wording, what it stresses, and its
design ideas? **Method:** its repository cloned `--depth 1` (commit of 2026-11-24) and read only,
never run: the README, the user docs (a hosted docs site's sources), the internal design notes,
the landing page's source; its live homepage fetched once. Per D414 this public report does not
name it or the products it names; the private report (`private/`) does, with the source paths and
a drafted README and landing diff.

Tags: VERIFIED = read in its source or on its live page today; DOCUMENTED = its own docs say so,
not checked in code; INFERRED = my reading.

## 1. What it is

- **One line:** "AI teammates that run your whole company." Its subline: they code, support,
  market and sell, "on the Claude or ChatGPT plan you already pay for. Every decision that needs
  you lands in one list." VERIFIED (README, homepage hero).
- **Two-beat slogans** carry the control promise: "Hand off the work. Keep the decisions." (README)
  and "He does the work. You make the calls." (the landing's closing call). VERIFIED.
- **The object** is a *team*: several named teammates, each the real Claude Code or Codex with a
  job (a name, a title, role instructions, a model), its own Apps with read-only or read-write
  access, a memory, daily caps. A meta-teammate (a "chief") helps set the team up, routes work and
  makes a daily pass over what waits on the person. VERIFIED (docs: key concepts, quickstart).
- **Audience:** founders and small companies who build with Claude Code or Codex and also run
  support, marketing and sales alone ("a star helps other founders find it"). VERIFIED (README).
- **Where it runs:** a hosted web dashboard (sign-up) plus a *runner* that links a computer: your
  own Mac or Linux machine for free, or a paid cloud computer that keeps working when yours is off
  (two tiers). Self-hosting the whole stack is possible (Docker Compose, or serverless workers).
  "We don't gate features." VERIFIED (README, pricing FAQ).
- **AI bill:** none. The runner strips API keys from its environment so every turn runs on the
  person's subscription; its servers "never call an AI model themselves: even thread titles are
  written on your computer". VERIFIED (README; security doc).

## 2. How it explains itself to a newcomer

1. **A concrete three-step example in the first screen**, with a named teammate and a real-looking
   task: *Create a teammate* (Sam, support, Gmail and a help center, on a Max plan) → *Give it a
   job* ("Sort every support email and draft the answers our docs already cover") → *Approve what
   matters* (Sam wants to reply to a customer; you tap Approve). The same three steps open the docs
   index. VERIFIED.
2. **"Right for you if"**: six checked lines the reader recognises themselves in ("You have several
   agent sessions open and lose track of which one does what", "You already pay for a Max or Pro
   plan and don't want a second bill", "You want to read every line of the software that holds your
   passwords"). VERIFIED.
3. **"Problems it solves"**: a Without / With table, pain first, seven rows ("Ten terminal tabs of
   Claude Code, and no idea which one is waiting on you" → "Threads with a status dot each, and one
   list of what waits for your answer"; "Your laptop closes and the agent stops" → "Move the thread
   to the cloud computer"). VERIFIED.
4. **Logos as proof of reach**: a "Runs on" row (two agents) and a "Works in" wall of about 30
   service marks. VERIFIED.
5. **An ASCII architecture diagram** and three plain bullets (dashboard and API, the runner, Apps)
   in the README; the security doc repeats a smaller one showing where data goes. VERIFIED.
6. **A FAQ that answers the obvious objections**, including "Why several teammates rather than one
   agent?" ("One agent with every tool and no owner gets vague fast"). The same FAQ is the
   landing's, emitted as `FAQPage` structured data. VERIFIED.
7. **Self-proof:** "built by itself": the landing reads its merged-PR and commit counts from GitHub
   at build time and shows the latest merges as a terminal (949 PRs and 1,195 commits on the live
   page today). VERIFIED (homepage; landing source).

## 3. The website

- **Hero:** the six-word claim, a two-sentence subline set one sentence per line, two actions
  (download, star on GitHub); the header's button sells the paid always-on computer ("Get your 24/7
  AI team"). VERIFIED.
- **Play in the hero:** six clay-like blobs with faces fall onto the words "AI teammates" with
  physics and dance on the letters; a larger blob face in the closing call follows the pointer and
  changes mood. VERIFIED (landing source). INFERRED: it is the one moment of delight, and the page
  is otherwise sober.
- **A live demo directly under the hero:** the real dashboard in a window on the page, on recorded
  data, "nothing here is real"; tabs pick a story to play ("Fix a customer's bug", "Ship a requested
  feature", "Prep a sales call", "Chase a failed payment", "Work through a list"). The API is
  answered inside the browser from recorded responses; writes are kept in memory; a reload starts
  over. VERIFIED (landing source, demo design note).
- **Then:** bring your own plan (a panel of connected accounts, the next account taking over at a
  limit, a model per teammate), "Plugged into your stack", four animated tiles (a computer of its
  own, teach a task, remembers how you work, starts on its own), built-by-itself, FAQ, closing call.
  The tiles are drawn UI in CSS, not screenshots. VERIFIED.
- **Discoverability:** a `/compare/<rival>` page for about twenty alternatives, `/guides`, an
  `llms.txt` route, JSON-LD for the organization, the app with its prices, and the FAQ; a
  disambiguation line for other projects with the same name. VERIFIED.

## 4. Design ideas worth knowing

| Idea | What it does | Tag |
|---|---|---|
| Stacked plans | Several accounts of one provider; when one hits its limit the teammate carries on with the next, mid-task | DOCUMENTED (README, FAQ) |
| One list of what needs you | Typed tickets: approvals, questions, access, a sign-in only a person can do (take over the browser, then "Done, hand back"), caps reached, out of usage, disk full; each card has "Something else" (own words) and "Decline" | VERIFIED (docs) |
| Measured goals | `/goal` turns into a contract the person approves: result and deadline, target, *measured by* (a command, an App read, a list, or the person's judgment), allowed writes each with a cap, a budget; "the teammate cannot declare it done"; the system measures and re-prompts | DOCUMENTED (docs) |
| Teach a task | Take over a teammate's cloud computer and do it once; it writes the steps as a skill and does it on its own once you approve | DOCUMENTED (README; cloud only) |
| Playbooks | A whole job (triggers, routines, skills, Apps) installed in one conversation; it "earns more autonomy as you approve its work" | DOCUMENTED (docs) |
| The chief only recommends while rules are calibrated | Its daily pass shows what it would do and how often its picks matched the person's answers; acting is off until the person trusts it | VERIFIED (design note) |
| Every step logged, daily caps | Threads, computer hours and writes per App, per teammate | DOCUMENTED |
| Own email address per teammate | Replies come back to the teammate that started the conversation | DOCUMENTED |

**What it deliberately doesn't do:** bill for AI or run its own agent loop; gate features in the
open source; serve one person's life (its comparison pages set "one personal agent per person"
against "a team for your company"); a native phone app (the dashboard installs as a web app with
push). VERIFIED (README, compare list, quickstart).

INFERRED: its house style for copy and engineering notes is close to Ducter's (plain sentences, no
ellipsis on cut text, a decisions page, clay pebbles in the art); the two projects read as cousins,
so the useful lessons are in *framing*, not in style.

## 5. Point by point against Ducter

| | It | Ducter | Reading |
|---|---|---|---|
| Who it is for | Founders running a company | Builders, and the rest of their day (D414) | Differs on purpose |
| The object | A team of named teammates with jobs | One partner; tasks under it, each on its own AI agent | Differs on purpose (one partner is Ducter's core; motivation.md) |
| Where | Hosted dashboard + runner; paid always-on cloud | Your Mac or your server; no account, nothing to pay | Ducter stronger on "yours"; it stronger on "zero setup" |
| First line | Six words, a claim about outcome | A category ("A personal AI for builders") plus a 16-word second line | It is faster to read; Ducter's is more exact |
| First 30 seconds of the README | Claim, two sentences, a slogan, a three-step example, logos, "right for you if", without/with | Line, an 85-word paragraph, a real screenshot, then bullets | Ducter weaker: no example, no self-identification, no pain framing above the fold |
| Site's first screen | Claim, two lines, buttons, then a *live* demo | The line, an 80-word lede, buttons, trust line, two real screens | Ducter's lede is long; no way to try before installing |
| Proof | Live demo; "built by itself" with live counts; 30 logos | Real screens; "How I know" on every result; changelog | Ducter's proof is better in the product, weaker on the page |
| Control | One list of typed tickets; per-teammate access and caps | Needs you, Go / Hold / Reply, a default it will take; Done for you; never pays or sends without OK | Ducter stronger (defaults, the after-the-fact ledger) |
| Docs | Grouped by job, a key-concepts page with a hierarchy, steps, a video | A flat list of 27 pages under 3 headings; glossary table at the bottom | Ducter weaker in structure, stronger in breadth |
| Personal half | None | Mail, calendar, errands, chat apps, the morning note | Ducter only |
| Phone | Web app with push | iPhone, iPad, Android apps; iMessage and chat apps | Ducter stronger |
| Limits | Next account of the same provider takes over | Waits and carries on (D297); another signed-in agent on the same computer (D478); several accounts of one agent not told apart (D82) | It is ahead for a person with two plans of one provider |

## 6. Recommendations, ranked by impact

1. **Open the README and the site with one concrete example, in three steps.** Keep D414's line;
   add a two-beat promise and a three-row "how it goes" from the author's own work (the flaky test
   in HawDB → a task on Claude Code in its own branch → "50 of 50 runs pass", Merge into main).
   Proposed promise: *"Hand it ten things. Hear back only what needs you."* /
   *「交给它十件事，只听要紧的那几句。」* Shorten the site's lede to two sentences, one per line.
   (A D on top of D414: the lede stops being the whole paragraph; the paragraph moves to the first
   section.)
2. **"Ducter is for you if" and a Before / With Ducter table** in the README, compact on the site:
   six lines builder first, then the personal half; six pain rows, each answered by something built
   (several sessions → On hand and Needs you; laptop closes → a server you own; re-explaining →
   memory; a limit stops work → it says when it carries on and does; a question while you are away →
   the default it will take; what did it do → Done for you and How I know). No emoji (the house rule):
   drawn checks on the site, plain bullets in the README.
3. **A live demo on the landing** (a D): the real web client in a window under the hero, on
   recorded data in the browser, nothing real; four stories as tabs: a flaky test fixed with proof,
   ten tasks on hand, the morning note, an errand to the checkout. Ducter already has the demo
   scripts that seed the web client (`apps/web/demo-*.ts`); INFERRED: recording their replies for an
   in-browser fake is days, not weeks. Its biggest gain is for the consumer and the fresh user, who
   won't install to find out.
4. **Docs by job, with a key-concepts page**: regroup `docs/README.md`'s `##` sections (the site's
   sidebar follows them) into Start here / Hand it work / The rest of your day / Where it runs and
   where you reach it / Stay in control / Help; a new `concepts.md` with a three-level picture
   (you → your partner → tasks, each on an AI agent, on a device) and one paragraph per glossary
   word; the "Words you'll see" table moves there. Add the FAQ entry Ducter is missing: *"Why one
   partner rather than a team of agents?"*; put the top FAQ on the landing as `FAQPage` data, and
   add `/llms.txt`.
5. **Several accounts of one AI agent, carrying on mid-task** (a D; extends D297/D478, revisits
   D82): two Claude plans on one computer, each signed in under its own home, the next one taking
   over at a limit, said in one line on the task. Its value is highest for the builder who already
   pays twice; INFERRED feasible through each agent's own config-home variable; needs research
   before a decision.
6. **A measured finish** (to consider): when a task's done can be checked by a command the person
   or the partner names, Ducter runs it and the task can't say done before it passes. This fits
   "How I know" and "code guards invariants"; today a standing goal is judged by the model.
7. **Calibrate before acting** (to consider for the morning note and waived Gos): show how often the
   person's answers matched the default Ducter offered, before offering to take that kind of
   decision alone.

**Not to adopt:** a team of named personas as the main object (it contradicts one partner); a
sign-up and a paid always-on computer; comparison pages naming other products (D414); an emoji
feature grid; outcome claims at company scale ("run your whole company"); a "built by itself"
section unless Ducter's history shows it (this repository's history names no task branches today;
the author's call).

## Implications for Ducter

Ducter's product is already stronger where trust and the phone matter, and on the personal half.
What the similar project does better is the *first thirty seconds*: a short claim, one concrete
example in three steps, a list the reader recognises themselves in, pain before features, and a
way to try it before installing. Ducter can take all of that without changing what it is. The one
product idea with clear value for Ducter's builder is several accounts of one AI agent.

**Summary:** keep D414's line; add a two-beat promise, a three-step real example, "for you if" and
a before/with table to the README and site; put a recorded live demo under the hero; regroup the
docs by job with a concepts page and a "why one partner" FAQ; research several accounts per agent
for a D.
