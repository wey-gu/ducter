/**
 * The questions the home page answers (D558), shown in `<details>` and given to search engines as
 * FAQPage data, word for word. Each question is also a `###` in docs/faq.md, where the longer
 * answer lives (`test/faq.test.ts` holds the two together). Answers are plain text: the same
 * string is the visible answer and the structured one.
 */
import { agentsByNameAnd, agentsSoonClause, agentsTasksAnd, agentsTodayAnd } from "./agents";

export interface Faq { q: string; a: string; more: { href: string; label: string } }

export const homeFaq: Faq[] = [
  {
    q: "What is Ducter, in one sentence?",
    a: "A personal AI on your own computers: you talk to one partner, it hands the work to an AI agent you already use, and it comes back when the work is done, with how it checked.",
    more: { href: "/docs/concepts", label: "How it fits together" },
  },
  {
    q: "Why one partner rather than a team of agents?",
    a: "Because then you'd be the one managing a team. With one partner you say what you want once; it hands each piece to as many AI agents as it needs, each a task you can open, and brings back only what needs you. You still see who did what: every task shows its AI agent, its steps and its changes.",
    more: { href: "/docs/faq#why-one-partner-rather-than-a-team-of-agents", label: "Questions people ask" },
  },
  {
    q: "Does it cost anything?",
    a: "Ducter itself is free and open source, under the Apache 2.0 license. The AI work runs on your own AI agent's plan or key, so it counts against that plan like any other session. There's no Ducter account.",
    more: { href: "/docs/faq#does-it-cost-anything", label: "Questions people ask" },
  },
  {
    q: "Which AI agents does it work with?",
    a: `${agentsTodayAnd} can be your partner, signed in as you; you need at least one. ${agentsTasksAnd} take any task, but never your partner. ${agentsByNameAnd} take a task only when you ask for them by name, because their terms keep those sign-ins interactive.${agentsSoonClause ? ` ${agentsSoonClause}.` : ""}`,
    more: { href: "/docs/faq#which-ai-agents-does-it-work-with", label: "Which AI agents" },
  },
  {
    q: "Do I need to know about git or \"agents\"?",
    a: "No. Write what you want, the way you'd ask a colleague. Coding tasks use git behind the scenes, so each one works on its own branch, and nothing reaches your main branch until you choose Merge into main.",
    more: { href: "/docs/getting-started", label: "Getting started" },
  },
  {
    q: "What if my Mac goes to sleep?",
    a: "Tasks on a sleeping Mac wait and carry on when it wakes. If you want work to go on through the night, put Ducter on a Linux server that stays on, at home or in the cloud.",
    more: { href: "/docs/install#a-linux-server-that-stays-on", label: "A server that stays on" },
  },
  {
    q: "Will it bother me all the time?",
    a: "No. Silence means things are going fine. Ducter comes to you when a decision is yours to make, always with a suggested default, and your phone stays quiet from 23:00 to 08:00 unless you change it.",
    more: { href: "/docs/on-hand", label: "On hand" },
  },
  {
    q: "Can it read my email or calendar?",
    a: "Yes, when you say so. Reading just happens; sending, changing or answering anything waits for your Go.",
    more: { href: "/docs/accounts", label: "Accounts it can read" },
  },
];
