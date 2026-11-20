// D445: Settings, the second round: show what a setting does for the person, live, instead of saying
// it (D43). The Mac's twins are in apps/desktop/internal/views/settings_delight.go and settings_panels.go.
//   - Notifications: the notification itself, with this page's choices in it (the default wait, quiet
//     hours, notifications off), the partner on it smiling for a moment after a change;
//   - This phone / This computer: Look and sound's preview stage (the partner, your message, its reply,
//     the details as set), as the Mac has it;
//   - Replies in: the partner's reply in the language picked, a small bubble under the row.
import { replySample } from "@ducter/protocol/src/lang.ts";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Avatar } from "./views.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** How long the partner smiles after a change on a page with a preview (the Mac's cheerFor). */
const CHEER_MS = 1600;
let cheerAt = 0;
const cheerListeners = new Set<() => void>();

/** A change was made on a page with a preview: the partner on it smiles for a moment. */
export function cheer() {
  cheerAt = Date.now();
  for (const f of cheerListeners) f();
}

/** The partner's face on a preview: done (a smile) just after a change, else idle. */
function useCheerFace(): "done" | "idle" {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    cheerListeners.add(f);
    return () => void cheerListeners.delete(f);
  }, []);
  const left = CHEER_MS - (Date.now() - cheerAt);
  useEffect(() => {
    if (left <= 0) return;
    const h = setTimeout(() => bump((n) => n + 1), left);
    return () => clearTimeout(h);
  }, [cheerAt]);
  return left > 0 ? "done" : "idle";
}

/** The default wait as its choice says it (30 分钟, 1 小时). */
export function waitLabel(min: number): string {
  return min < 60 ? t("partner.default.min", min) : t("partner.default.hour", min / 60);
}

/** Notifications' stage: the notification the partner would send now, with this page's choices in it. */
export function NotifyPreview() {
  const s = A.settings;
  const face = useCheerFace();
  if (!s) return null;
  const under = !s.notify ? t("notify.pv.off") : s.quiet ? t("notify.pv.quiet", s.quiet.start, s.quiet.end) : t("notify.pv.anytime");
  return (
    <section class="set pv-stage notify-pv" role="group" aria-label={t("notify.pv")}>
      <div class={`pv-note${s.notify ? "" : " off"}`}>
        <Avatar size={44} state={face} />
        <span class="grow">
          <span class="pv-head">
            <b>{A.S.personaName}</b>
            <small>{t("notify.pv.now")}</small>
          </span>
          <span class="pv-ask">{t("notify.pv.ask")}</span>
          {s.defaultAfterMin > 0 && <small class="pv-wait">{t("notify.pv.default", waitLabel(s.defaultAfterMin))}</small>}
        </span>
      </div>
      <p class="pv-under" key={under}>
        {under}
      </p>
    </section>
  );
}

/** This phone / This computer's stage: how the conversation looks here, as the Mac's Look preview. */
export function LookPreview() {
  const face = useCheerFace();
  return (
    <section class="set pv-stage look-pv" role="group" aria-label={t("settings.preview")}>
      <Avatar size={72} state={face} />
      <div class="pv-talk">
        <span class="pv-you">{t("settings.preview.user")}</span>
        <span class="pv-reply">{t("settings.preview.reply")}</span>
        {A.details === "shown" ? (
          <span class="pv-noted">
            <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 10.5l3.5 3.5L15 6.5" />
            </svg>
            {t("settings.preview.noted")}
          </span>
        ) : (
          <span class="pv-details">{t("details.show")} ›</span>
        )}
      </div>
    </section>
  );
}

/** Replies in's voice: the partner's reply in the language it answers in ("" follows the person: this page's). */
export function TalkSample({ language }: { language: string }) {
  const tag = !language || language === "auto" ? A.L.lang : language;
  const text = replySample(tag);
  if (!text) return null;
  return (
    <span class="pv-sample" lang={tag} key={tag}>
      {text}
    </span>
  );
}
