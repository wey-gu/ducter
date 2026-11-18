// D359: the pile's demo data, for demo-todos.ts with DEMO_TODOS=pile: 557 open issues assigned to a
// heavy developer across four repositories (the kinds a real backlog holds: small fixes, product
// questions, old ideas nobody touched, big rewrites), one PR waiting for review with a real diff, and
// a fake cheapest model that sorts them by their words (never a real model) and pre-reads the PR.
import type { FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";

const DAY = 86_400_000;

const SMALL = [
  ["acme/web", "Typo on the pricing page: \"recieve\""],
  ["acme/web", "Button label cut off in German on the checkout page"],
  ["acme/web", "Missing alt text on the team photos"],
  ["acme/api", "Docs: the install page still says Node 18"],
  ["acme/api", "Flaky test: session expiry off by one second"],
  ["acme/mobile", "Wrong icon for the share action on Android"],
  ["acme/infra", "404 link to the runbook in the alert template"],
  ["acme/web", "Footer links overflow on small phones"],
  ["acme/api", "Typo in the rate limit error message"],
  ["acme/mobile", "Missing alt text on the onboarding slides"],
  ["acme/web", "Dark mode: the date picker stays white"],
  ["acme/infra", "Docs: the backup restore steps skip the key step"],
];
const ASK = [
  ["acme/web", "Should we drop Safari 15?"],
  ["acme/api", "Support SSO with Okta, or wait for SCIM?"],
  ["acme/api", "Move billing emails to Postmark or keep SES?"],
  ["acme/mobile", "Should the app work offline for the first release?"],
  ["acme/web", "Keep the old dashboard as an opt-out for a month?"],
];
const OLD = [
  ["acme/web", "Investigate the memory spike on the reports page"],
  ["acme/api", "Try GraphQL for the mobile endpoints"],
  ["acme/infra", "Evaluate a second CDN"],
  ["acme/mobile", "Experiment: tablet layout"],
];
const BIG = [
  ["acme/web", "Rewrite the importer"],
  ["acme/api", "Epic: audit log v2"],
  ["acme/mobile", "Offline mode"],
  ["acme/infra", "Move CI to the new runners"],
  ["acme/web", "Settings page redesign"],
  ["acme/api", "Split the monolith's billing module"],
  ["acme/infra", "Terraform the staging cluster"],
  ["acme/web", "Accessibility pass over every form"],
];

/** 557 open issues: about one in eleven small, one in twenty a question, one in eighteen long idle, two duplicates. */
export function pileIssues(now = Date.now()): FakeIssue[] {
  const out: FakeIssue[] = [];
  for (let k = 0; k < 557; k++) {
    const n = 1200 - k;
    let pick: string[];
    let idle: number;
    if (k % 11 === 3) (pick = SMALL[(k / 11) % SMALL.length | 0]!), (idle = 2 + (k % 40));
    else if (k % 20 === 7) (pick = ASK[(k / 20) % ASK.length | 0]!), (idle = 5 + (k % 60));
    else if (k % 18 === 11) (pick = OLD[(k / 18) % OLD.length | 0]!), (idle = 320 + (k % 200));
    else (pick = BIG[k % BIG.length]!), (idle = 1 + (k % 300));
    const round = Math.floor(k / 40);
    const title = round ? `${pick[1]} (${round + 1})` : pick[1]!;
    out.push({ repo: pick[0]!, number: n, title, state: "open", assigned: true, labels: k === 30 || k === 31 ? ["duplicate"] : k % 7 === 0 ? ["bug"] : [], updated: new Date(now - idle * DAY - k * 60_000).toISOString(), ...(k % 9 === 0 ? { comments: 2 + (k % 5) } : {}) });
  }
  out.push(
    { repo: "acme/web", number: 1377, title: "Make the sign-in page keyboard friendly", pr: true, state: "open", assigned: false, review: true, author: "mei-chen", updated: new Date(now - 25 * 60_000).toISOString(), diff: "diff --git a/src/login.tsx b/src/login.tsx\n@@ -10,6 +10,12 @@\n+  useFocusTrap(form);\n+  <div tabIndex={0} onKeyDown={submitOnEnter}>\n" },
    { repo: "acme/api", number: 1352, title: "Token refresh races when two tabs are open", state: "open", assigned: true, mentions: true, labels: ["bug"], updated: new Date(now - 70 * 60_000).toISOString() },
  );
  return out;
}

/** The demo's cheapest model: sorts by the words (a question, a small fix, long idle), pre-reads by a fixed answer. */
export function demoAsk(zh: boolean, delayMs = 250) {
  return async (prompt: string) => {
    await Bun.sleep(delayMs);
    if (prompt.includes("<diff>")) {
      return {
        text: JSON.stringify({
          gist: zh ? "让登录页能全程用键盘完成" : "Makes the sign-in page usable by keyboard alone",
          notes: [
            { kind: "problem", path: "src/login.tsx", line: 12, text: "The focus trap never releases after Escape, so the cookie banner can't be reached." },
            { kind: "problem", path: "src/login.tsx", line: 13, text: "tabIndex 0 on the wrapper adds a second stop before the email field." },
            { kind: "suggestion", text: "A test that presses Enter in the password field would keep this working." },
          ],
        }),
        tokens: 3000,
      };
    }
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string; idleDays?: number }[];
    const out = rows.map((r) => {
      if ((r.idleDays ?? 0) > 300) return { id: r.id, group: "close", why: zh ? "快一年没人动，也没说要做什么" : "Idle for most of a year, no clear ask", comment: "Closing this for now: no activity in a long while and no clear next step. Reopen it if it still matters." };
      if (/\?$|^Should|^Keep|, or |^Move .* or /.test(r.title.replace(/ \(\d+\)$/, ""))) return { id: r.id, group: "decide", why: zh ? "要不要做是产品上的选择" : "A product choice", ask: zh ? `${r.title.replace(/ \(\d+\)$/, "")}（要你定）` : r.title.replace(/ \(\d+\)$/, ""), pick: "later" };
      if (/^(Typo|Missing alt|Docs:|Flaky test|Wrong icon|404 link|Button label|Footer links|Dark mode)/.test(r.title)) return { id: r.id, group: "do", why: zh ? "说得清楚，改动小" : "Clear, and a small change", size: "small" };
      return { id: r.id, group: "later", why: zh ? "改动大，得先拆开" : "Big; needs breaking down first" };
    });
    return { text: JSON.stringify(out), tokens: 1500 };
  };
}
