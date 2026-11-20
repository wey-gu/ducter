// D366: Nowledge Mem on a computer for tasks, as one row on its card and on the lend sheet: Mem's
// own app icon and name, where it stands there, and the one thing to do (装上, the link to sign in,
// 接上, 再试一次). Shown only when the home has Mem and memory is on (DeviceView.mem). The Mac's is
// apps/desktop/internal/views/workermem.go, with the same order of looks (worker-mem-view.ts).
import type { DeviceView } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark } from "./brand.tsx";
import { Btn } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { memKeepsPaste, memRowHealth, memRowLook, memRowTheirs, theirUpdateCommand, unconnected } from "./worker-mem-view.ts";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The agents as words: "Codex 和 Claude Code" / "Codex and Claude Code". */
function agentsWords(ids: string[]): string {
  const names = ids.map(harnessName);
  if (names.length <= 1) return names[0] ?? "";
  return t("wmem.and", names.slice(0, -1).join(t("wmem.comma")), names.at(-1)!);
}

/** Ready: which agents there use it, and which aren't connected yet (one installed after). */
function readyWords(device: string, installed: string[], left: string[]): string {
  const on = installed.filter((h) => !left.includes(h));
  if (!installed.length) return t("wmem.ready.noagent", device);
  if (!on.length) return t("wmem.ready.none", device);
  return left.length ? `${t("wmem.ready.why", device, agentsWords(on))} ${t("wmem.ready.left", agentsWords(left))}` : t("wmem.ready.why", device, agentsWords(on));
}

export function MemOnDevice({ dv }: { dv: DeviceView }) {
  const m = dv.mem;
  const [link, setLink] = useState("");
  // D393: the home carries Mem to the tasks here; signing in here is only for the person's own sessions, asked for when they want it.
  const [own, setOwn] = useState(false);
  // D386: a paste that wasn't spent stays in the box after a failure; a spent one (or a sign-in done) clears it.
  const failedWhy = m?.step?.phase === "failed" ? m.step.reason : undefined;
  const spent = !!m && ((m.step?.phase === "failed" && !memKeepsPaste(failedWhy)) || (!m.step && m.state === "ready"));
  useEffect(() => {
    if (spent && link) setLink("");
  }, [spent]);
  if (!m) return null;
  const look = memRowLook(m);
  const health = memRowHealth(m); // D375
  const theirs = memRowTheirs(m); // D386
  const theirCmd = theirUpdateCommand(m.theirs?.how);
  const awake = dv.state === "awake";
  const home = A.devices?.find((d) => d.home)?.name ?? "";
  const left = unconnected(dv);
  const installed = dv.harnesses.filter((h) => h.installed && (h.harness === "codex" || h.harness === "claude-code")).map((h) => h.harness);
  const carried = !!m.carried && look !== "installing" && look !== "connecting" && look !== "failed";
  const word =
    carried ? t("wmem.carried", home)
    : look === "ready" ? t("wmem.ready")
    : look === "installing" ? (m.step?.pct ? `${t("wmem.installing")} ${m.step.pct}%` : t("wmem.installing"))
    : look === "connecting" ? t("wmem.connecting", dv.name)
    : theirs === "old" && look === "sign_in" ? t("wmem.theirs.old", dv.name)
    : health ? t(`wmem.health.${health}`, dv.name)
    : look === "sign_in" ? t("wmem.signin.line")
    : look === "failed" ? t(`wmem.failed.${m.step?.reason ?? "failed"}`, dv.name)
    : t("wmem.absent", dv.name);
  const signIn = ((look === "sign_in" && health !== "unreachable" && health !== "old" && theirs !== "old") || (look === "failed" && m.state === "sign_in" && theirs !== "old")) && awake && (!m.carried || own || look === "failed");
  // D386: kept until the step ends (memKeepsPaste above says whether it stays).
  const go = () => {
    if (!link.trim()) return;
    A.memSetup(dv.id, "connect", link.trim());
  };
  const answer = A.memSetupAnswer?.device === dv.id ? A.memSetupAnswer.reason : undefined;
  return (
    <div class={`ag-row wmem ${look}`}>
      <div class="ag-head">
        <span class={`ag-coin wmem-icon${look === "ready" || carried ? "" : " faded"}`}>
          <BrandMark name="nowledge_mem" size={36} />
          {(look === "installing" || look === "connecting") && <i class="cring" aria-hidden="true" />}
        </span>
        <span class="ag-t">
          <b>Nowledge Mem</b>
          <small class={carried ? "ok" : look === "failed" || health || (theirs === "old" && look === "sign_in") ? "warn" : look === "ready" ? "ok" : ""}>{word}</small>
        </span>
        {carried && look === "sign_in" && !own && awake && theirs !== "old" && health !== "unreachable" && health !== "old" ? (
          <Btn kind="secondary" size="sm" label={t("wmem.own.go")} about="Nowledge Mem" onClick={() => setOwn(true)} />
        ) : look === "absent" && m.installable ? (
          <Btn kind={carried ? "secondary" : "primary"} size="sm" label={t("wmem.install")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : theirs === "old" && (look === "sign_in" || look === "failed") && m.installable ? (
          <Btn kind={look === "failed" ? "secondary" : "primary"} size="sm" label={t(look === "failed" ? "wmem.retry" : "wmem.theirs.install")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : look === "failed" && m.state === "absent" ? (
          <Btn kind="secondary" size="sm" label={t("wmem.retry")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : health === "unreachable" ? (
          <Btn kind="secondary" size="sm" label={t("wmem.again")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "look")} />
        ) : health === "old" && m.ours ? (
          <Btn kind="primary" size="sm" label={t("wmem.update")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : look === "ready" && left.length ? (
          <Btn kind="secondary" size="sm" label={t("wmem.connect")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "connect")} />
        ) : null}
      </div>
      {look === "failed" && m.step?.detail && <div class="ag-detail">{m.step.detail}</div>}
      {carried && look === "absent" && m.installable && !health && <p class="wmem-why soft">{t("wmem.own.absent")}</p>}
      {carried && look === "sign_in" && !signIn && theirs !== "old" && !health && <p class="wmem-why soft">{t("wmem.own.signin")}</p>}
      {!carried && look === "absent" && <p class="wmem-why">{t(m.installable ? "wmem.absent.why" : "wmem.absent.none", dv.name)}</p>}
      {!carried && look === "absent" && m.installable && <p class="wmem-why soft">{t("ag.where")}</p>}
      {look === "ready" && !carried && <p class="wmem-why">{readyWords(dv.name, installed, left)}</p>}
      {/* D420: carried, the line under the title says it all; an agent not connected yet is the one thing to know. */}
      {look === "ready" && carried && left.length > 0 && <p class="wmem-why soft">{t("wmem.ready.left", agentsWords(left))}</p>}
      {carried && health && <p class="wmem-why soft">{t(`wmem.health.${health}`, dv.name)}</p>}
      {health === "old" && !m.ours && <p class="wmem-why">{t("wmem.health.old.how", dv.name)}</p>}
      {theirs === "old" && look !== "installing" && m.installable && <p class="wmem-why">{t("wmem.theirs.why", dv.name)}</p>}
      {theirs === "using" && look !== "installing" && look !== "connecting" && <p class="wmem-why soft">{t("wmem.theirs.using", dv.name)}</p>}
      {theirs && look !== "installing" && look !== "connecting" && (
        <p class="wmem-why soft">
          {theirCmd ? (
            <>
              {t("wmem.theirs.cmd", dv.name)} <code class="wmem-cmd">{theirCmd}</code>
            </>
          ) : (
            t("wmem.theirs.guide")
          )}
        </p>
      )}
      {signIn && (
        <div class="ag-login wmem-signin">
          <p>{A.bridge?.where === "local" ? t("wmem.signin.local", home, dv.name) : t("wmem.signin.how")}</p>
          <div class="ag-paste">
            {/* D370: Mem copies a whole prompt (a token and its Mem's address), so the box takes lines. */}
            <textarea
              class="wmem-paste"
              rows={3}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              enterkeyhint="go"
              value={link}
              placeholder={t("wmem.signin.ph")}
              aria-label={t("wmem.signin.link")}
              onInput={(e) => setLink((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), go());
              }}
            />
            <Btn kind="primary" size="sm" label={t("wmem.signin.go")} about="Nowledge Mem" disabled={!link.trim()} onClick={go} />
          </div>
        </div>
      )}
      {answer && <div class="ag-answer warn">{t(answer === "away" ? "ag.away" : "ag.old", dv.name)}</div>}
    </div>
  );
}
