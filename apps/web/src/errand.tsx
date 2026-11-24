// D436: 跑腿到付款 / An errand to the checkout (design/errand.md). The 去付款 / Go to checkout card:
// what it buys, the total, the site (read by code), the page's picture; 去付款 opens the same tab
// live in the person's turn, where they pay with their own tap, and 付好了 answers the card. And a
// step that's the person's on a page (a CAPTCHA, a code by text): the same live view, 去处理 / Do it.
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { EyeShut, liveSize } from "./live.tsx";
import { mediaUrl } from "./media-fresh.ts";
import type { DecisionState } from "./store.ts";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const ITEMS_SHOWN = 5;

/** 到付款这一步了 / Ready to pay on {site}: the facts, the page, then Not now or Go to checkout. No default. */
export function CheckoutBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const c = d.checkout!;
  const open = !d.resolved && !d.pending;
  const pic = c.media?.[0];
  const go = () => A.openLive(d.decisionId, c.site, liveSize());
  const items = c.items ?? [];
  return (
    <>
      {!compact && <div class="q">{t("co.title", c.site)}</div>}
      <dl class="pay-facts co-facts">
        <dt>{t("co.what")}</dt>
        <dd>
          <span dir="auto">{c.what}</span>
          {items.length > 0 && (
            <ul class="co-items">
              {items.slice(0, ITEMS_SHOWN).map((x, i) => (
                <li key={i} dir="auto">
                  {x}
                </li>
              ))}
              {items.length > ITEMS_SHOWN && <li class="more">{t("co.more", items.length - ITEMS_SHOWN)}</li>}
            </ul>
          )}
        </dd>
        {c.total && (
          <>
            <dt>{t("co.total")}</dt>
            <dd class="pay-amount">
              {c.currency ? `${c.currency} ` : ""}
              {c.total}
            </dd>
          </>
        )}
        <dt>{t("co.where")}</dt>
        <dd>{c.site}</dd>
      </dl>
      {pic && (
        <button class="co-pic" type="button" aria-label={t("co.pic")} disabled={!open} onClick={go}>
          <img src={mediaUrl(pic.thumb ?? pic)} alt={t("co.pic")} {...(pic.w && pic.h ? { width: pic.w, height: pic.h } : {})} loading="lazy" />
        </button>
      )}
      {open ? (
        <>
          <div class="small sub co-why">{t("co.why")}</div>
          <div class={compact ? "tray" : "btns decide"}>
            <Btn kind="primary" size={compact ? "sm" : undefined} label={t("co.go")} about={c.site} onClick={go} />
            <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("co.hold")} about={c.site} onClick={() => A.decide(d.decisionId, "hold")} />
          </div>
        </>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" || d.pending === "go" ? t("co.resolved") : t("co.resolved.hold")}
        </div>
      )}
    </>
  );
}

/** {site} 这一步要你来 / Your step on {site}: the step in the task's words, then Not now or Do it. */
export function StepBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const s = d.signIn!;
  const open = !d.resolved && !d.pending;
  return (
    <>
      {!compact && <div class="q">{t("step.title", s.site)}</div>}
      {s.step && (
        <div class="co-step" dir="auto">
          {s.step}
        </div>
      )}
      <div class="signin-why">
        <EyeShut />
        <span>{t("step.why")}</span>
      </div>
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t("step.open")} about={s.site} onClick={() => A.openLive(d.decisionId, s.site, liveSize())} />
          <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("step.later")} about={s.site} onClick={() => A.decide(d.decisionId, "hold")} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "hold" ? t("step.resolved.hold") : t("step.resolved")}
        </div>
      )}
    </>
  );
}

/** The live view's words for the card behind it: a checkout, a step, or a sign-in (undefined). */
export function liveCard(decisionId: string): { title: string; band?: string; hold: string; done: string } | undefined {
  const d = A.S.decisions.get(decisionId);
  if (d?.checkout) return { title: t("co.live.title", d.checkout.site), band: t("co.live.band"), hold: t("co.live.notyet"), done: t("co.live.paid") };
  if (d?.signIn?.step) return { title: t("step.title", d.signIn.site), hold: t("step.later"), done: t("step.live.done") };
  return undefined;
}
