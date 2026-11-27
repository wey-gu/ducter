// /llms.txt (D558): what Ducter is, for an AI that reads the site on someone's behalf, then every
// docs page by the docs' own groups, each with its one-line description. Built from the same
// sources as the pages (the home page's words, docs/README.md's sections), so it never drifts.
import type { APIRoute } from "astro";
import { agentsByNameAnd, agentsSoonAnd, agentsTasksAnd, agentsTodayAnd } from "../lib/agents";
import { docHref, docLabel, groupDocs, publishedDocs } from "../lib/docs";
import { homeFaq } from "../lib/faq";

export const GET: APIRoute = async () => {
  const docs = await publishedDocs();
  const readme = docs.find((d) => d.id === "readme");
  const groups = groupDocs(docs, readme?.body ?? "");
  const site = "https://ducter.ai";
  const out: string[] = [
    "# Ducter",
    "",
    "> Hand it ten things. Hear back only what needs you. Ducter is a free, open-source personal AI for builders, on your own computers or servers.",
    "",
    "You talk to one partner, from your phone, your desk or the chat app you already use. It hands the work to the AI agents you already pay for " +
      `(${agentsTodayAnd} can be your partner; ${agentsTasksAnd} takes any task; ${agentsByNameAnd} when asked by name; ${agentsSoonAnd} coming soon), each a task you can open and steer, side by side on your Mac or a Linux server you own, ` +
      "and brings it back with how it was checked. It also minds your mail and calendar, runs errands to the checkout (you pay with your own tap), " +
      "and asks you only when a decision is yours. Nothing to sign up for; the code is Apache 2.0 at https://github.com/wey-gu/ducter.",
    "",
    "Set it up: " + site + "/start. Downloads: " + site + "/download. An AI agent can install it by following " + site + "/skills/ducter-deploy/SKILL.md.",
    "",
  ];
  for (const g of groups) {
    out.push(`## ${g.title}`, "");
    for (const d of g.docs) {
      const desc = d.data.description ? `: ${d.data.description}` : "";
      out.push(`- [${docLabel(d)}](${site}${docHref(d)})${desc}`);
    }
    out.push("");
  }
  out.push("## Questions people ask", "");
  for (const f of homeFaq) out.push(`- ${f.q} ${f.a}`);
  out.push("");
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
