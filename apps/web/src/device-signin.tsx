// D599: 登录 {service} / Sign in to {service} with a one-time code (design/device-signin.md). The
// card a task's sign-in command puts up (gh auth login's page and 8694-B656): what to do in one line,
// the code large with 复制 / Copy, and 打开 GitHub / Open GitHub, which copies the code first and opens
// the page in the browser (Safari on an iPhone); then the wait, alive, with how long the code still
// works. Nobody replies: Ducter sees the sign-in by the CLI's own check and the card says 已登录 GitHub.
// Once the code ran out: 再要一个码 / Get a new code. 先不用 and 回复… stay as on every ask (D482).
import { useState } from "preact/hooks";
import { codeExpired, minutesLeft } from "@ducter/protocol/src/device-signin.ts";
import { A } from "./app.ts";
import { AliveLine } from "./alive.tsx";
import { Coin } from "./coin.tsx";
import { Btn, CodeToCopy, LinkBtn } from "./controls.tsx";
import { copyAndSay } from "./conv-copy.ts";
import { harnessOf, type DecisionState } from "./store.ts";
import { DecideRow, Resolved } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export function DeviceSignInBody({ d, about, compact }: { d: DecisionState; about: string; compact?: boolean }) {
  const s = d.deviceSignIn!;
  const [copied, setCopied] = useState(false);
  const open = !d.resolved && !d.pending;
  const now = Date.now();
  const out = codeExpired(s, now);
  const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  const harness = task ? harnessOf(task) : "";
  // Open copies the code first, so the page only needs a paste.
  const opened = () => {
    if (!s.code) return;
    void copyAndSay(s.code, (ok) => ok && setCopied(true));
  };
  return (
    <div class={`dsi${open && out ? " out" : ""}`}>
      {!compact && <div class="q">{t("dsi.title", s.service)}</div>}
      {open && <div class="dl dsi-line">{out ? t("dsi.expired") : t(s.code ? "dsi.line" : "dsi.line.nocode", s.service)}</div>}
      {open && s.code && <CodeToCopy code={s.code} label={t("dsi.code")} copied={copied} off={out} />}
      {open ? (
        <DecideRow
          d={d}
          about={about}
          dflt={false}
          lead={out ? <Btn kind="primary" label={t("dsi.again")} about={about} onClick={() => A.decide(d.decisionId, "go")} /> : <LinkBtn kind="primary" href={s.url} label={t("dsi.open", s.service)} onOpen={opened} />}
          foot={
            !out && (
              <AliveLine
                class="dsi-live"
                size={22}
                motion="glance"
                words={t("dsi.wait", s.service)}
                sub={t("dsi.left", minutesLeft(s, now))}
                figure={harness ? <Coin harness={harness} size={22} /> : <span class="dsi-dot" />}
              />
            )
          }
        />
      ) : (
        <Resolved d={d} />
      )}
    </div>
  );
}
