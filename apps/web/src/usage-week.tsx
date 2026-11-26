// D591: where this week's allowance went, where people look (design/settings.md "Where the
// allowance went"): Settings › Overview's quiet section (the agents' shares, the three tasks that
// used most, each opening its task, the rest behind 更多 / More) and the limit card's one line
// naming what used most of that agent. The numbers are D588's count from the Log
// (`usage_days`), asked when one of them shows and at most once a minute. Silent when nothing was
// used or the home can't count. The Mac's twin is apps/desktop/internal/views/usage.go.
import type { ServerFrame, UsageReport } from "@ducter/protocol";
import { harnessName, usageShare, usageWeight } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Facts, TrayRow } from "./controls.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const FRESH_MS = 60_000;
/** The tasks shown before 更多 / More. */
const SHOWN = 3;

/** The last count the home gave, and when this window last asked. */
export const U = { report: undefined as UsageReport | undefined, asked: 0 };

/** Asks the home for the week's count, unless it was asked within the minute. */
export function askUsage(now = Date.now()) {
  if (!A.S.welcomed || now - U.asked < FRESH_MS) return;
  U.asked = now;
  A.send({ t: "usage_days", days: 7, tz: -new Date(now).getTimezoneOffset(), top: 5 });
}

/** usage_days_result from the home (app.ts hands it here); an error keeps the last count. */
export function onUsageFrame(f: Extract<ServerFrame, { t: "usage_days_result" }>) {
  if (!f.report) return;
  U.report = f.report;
  A.changed();
}

const share = (s: number) => <span class="tray-time">{usageShare(s)}</span>;

/** Settings › Overview: one quiet tray, nothing at all when nothing was used. */
export function UsageWeek() {
  useEffect(() => askUsage(), []);
  const [more, setMore] = useState(false);
  const r = U.report;
  if (!r || !r.turns) return null;
  const agents = r.harnesses.filter((h) => h.share >= 0.01).slice(0, 3);
  const tasks = r.tasks.slice(0, SHOWN);
  const rest = r.tasks.slice(SHOWN);
  const models = r.agents.filter((a) => a.model && a.share >= 0.01).slice(0, 4);
  // By model only when one agent ran on two or more of them.
  const twice = new Set(models.map((a) => a.harness)).size < models.length;
  const whole = usageWeight(r.total);
  const of = (s: { input: number; output: number; cached: number }) => (whole > 0 ? usageWeight(s) / whole : 0);
  const you = of(r.by.you), mine = of(r.by.partner);
  return (
    <section class="set-map usage-week" aria-label={t("usage.head")}>
      <h3 class="map-label">{t("usage.head")}</h3>
      <div class="usage-tray">
        {agents.length > 0 && (
          <div class="usage-agents">
            <Facts items={agents.map((h) => t("usage.agent", harnessName(h.harness), usageShare(h.share)))} />
          </div>
        )}
        {tasks.map((k) => (
          <TrayRow key={k.taskId} words={k.title} side={share(k.share)} goes onClick={() => A.openTaskPage(k.taskId)} />
        ))}
        <TrayRow tone="fold" words={t("usage.more")} open={more} onClick={() => setMore(!more)}>
          <div class="usage-more">
            {rest.map((k) => (
              <TrayRow key={k.taskId} words={k.title} side={share(k.share)} goes onClick={() => A.openTaskPage(k.taskId)} />
            ))}
            {r.talk.turns > 0 && <TrayRow words={t("usage.talk")} side={share(r.talk.share)} />}
            {r.looks.turns > 0 && <TrayRow words={t("usage.looks")} side={share(r.looks.share)} />}
            <div class="usage-facts">
              {twice && (
                <p>
                  <span class="usage-k">{t("usage.models")}</span>
                  <Facts items={models.map((a) => t("usage.agent", a.model, usageShare(a.share)))} />
                </p>
              )}
              {(you > 0 || mine > 0) && <Facts items={[you > 0 && t("usage.agent", t("usage.you"), usageShare(you)), mine > 0 && t("usage.agent", t("usage.mine"), usageShare(mine))]} />}
              <p class="usage-note">{t("usage.note")}</p>
            </div>
          </div>
        </TrayRow>
      </div>
    </section>
  );
}

/** The limit card's line: what used most of this agent this week (this very task, or another). */
export function UsageWhy({ harness, taskId }: { harness: string; taskId?: string }) {
  useEffect(() => askUsage(), []);
  const h = U.report?.harnesses.find((x) => x.harness === harness);
  if (!h?.top) return null;
  const name = harnessName(harness);
  return <p class="back usage-why">{h.top.taskId === taskId ? t("usage.why.this", name, usageShare(h.top.share)) : t("usage.why", name, h.top.title, usageShare(h.top.share))}</p>;
}
