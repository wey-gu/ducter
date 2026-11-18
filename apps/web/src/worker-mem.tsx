// D366: Nowledge Mem on a computer for tasks, as one row on its card and on the lend sheet: Mem's
// own app icon and name, where it stands there, and the one thing to do (装上, the link to sign in,
// 接上, 再试一次). Shown only when the home has Mem and memory is on (DeviceView.mem). The Mac's is
// apps/desktop/internal/views/workermem.go, with the same order of looks (worker-mem-view.ts).
import type { DeviceView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark } from "./brand.tsx";
import { Btn } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { memRowLook, unconnected } from "./worker-mem-view.ts";
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
  if (!m) return null;
  const look = memRowLook(m);
  const awake = dv.state === "awake";
  const home = A.devices?.find((d) => d.home)?.name ?? "";
  const left = unconnected(dv);
  const installed = dv.harnesses.filter((h) => h.installed && (h.harness === "codex" || h.harness === "claude-code")).map((h) => h.harness);
  const word =
    look === "ready" ? t("wmem.ready")
    : look === "installing" ? (m.step?.pct ? `${t("wmem.installing")} ${m.step.pct}%` : t("wmem.installing"))
    : look === "connecting" ? t("wmem.connecting", dv.name)
    : look === "sign_in" ? t("wmem.signin.line")
    : look === "failed" ? t(`wmem.failed.${m.step?.reason ?? "failed"}`, dv.name)
    : t("wmem.absent", dv.name);
  const signIn = (look === "sign_in" || (look === "failed" && m.state === "sign_in")) && awake;
  const go = () => {
    if (!link.trim()) return;
    A.memSetup(dv.id, "connect", link.trim());
    setLink("");
  };
  const answer = A.memSetupAnswer?.device === dv.id ? A.memSetupAnswer.reason : undefined;
  return (
    <div class={`ag-row wmem ${look}`}>
      <div class="ag-head">
        <span class={`ag-coin wmem-icon${look === "ready" ? "" : " faded"}`}>
          <BrandMark name="nowledge_mem" size={36} />
          {(look === "installing" || look === "connecting") && <i class="cring" aria-hidden="true" />}
        </span>
        <span class="ag-t">
          <b>Nowledge Mem</b>
          <small class={look === "failed" ? "warn" : look === "ready" ? "ok" : ""}>{word}</small>
        </span>
        {look === "absent" && m.installable ? (
          <Btn kind="primary" size="sm" label={t("wmem.install")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : look === "failed" && m.state === "absent" ? (
          <Btn kind="secondary" size="sm" label={t("wmem.retry")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "install")} />
        ) : look === "ready" && left.length ? (
          <Btn kind="secondary" size="sm" label={t("wmem.connect")} about="Nowledge Mem" disabled={!awake} onClick={() => A.memSetup(dv.id, "connect")} />
        ) : null}
      </div>
      {look === "failed" && m.step?.detail && <div class="ag-detail">{m.step.detail}</div>}
      {look === "absent" && <p class="wmem-why">{t(m.installable ? "wmem.absent.why" : "wmem.absent.none", dv.name)}</p>}
      {look === "absent" && m.installable && <p class="wmem-why soft">{t("ag.where")}</p>}
      {look === "ready" && <p class="wmem-why">{readyWords(dv.name, installed, left)}</p>}
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
