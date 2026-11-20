// D363: one AI agent on a device, as a row: its coin and name, where it stands, and the one thing
// to do (安装, 登录, 再试一次), with its sign-in opening in place under it (Codex's link and code,
// Claude's link and the code to paste back, pi's line for that computer's terminal). The device
// card and the lend sheet use the same row.
import type { DeviceHarness, DeviceView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { Coin } from "./coin.tsx";
import { harnessName } from "./format.ts";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
import { agentRowLook, troubleWords } from "./agent-setup-view.ts";

/** A sign-in link as one short line (Claude's runs to 400 characters; Open link opens the whole). */
export function shortUrl(url: string): string {
  const s = url.replace(/^https:\/\//, "");
  return s.length > 44 ? `${s.slice(0, 43)}…` : s;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

/** The sign-in, in place: what to open, the code, the paste box; each ending in one line. */
export function LoginPanel({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const l = h.login;
  const [code, setCode] = useState("");
  if (!l) return null;
  const again = <Btn kind="secondary" size="sm" label={t("ag.retry")} about={harnessName(h.harness)} onClick={() => A.agentSetup(dv.id, "login", { harness: h.harness })} />;
  if (l.state === "terminal") return <div class="ag-login"><p>{t("ag.login.pi", dv.name)}</p></div>;
  if (l.state === "starting") return <div class="ag-login"><p class="soft">{t("ag.login.starting")}</p></div>;
  if (l.state === "done") return <div class="ag-login"><p class="ok">{t("ag.login.done")}</p></div>;
  if (l.state === "failed" || l.state === "expired")
    return (
      <div class="ag-login">
        <p class="warn">{t(l.state === "expired" ? "ag.login.expired" : l.reason === "device_off" ? "ag.login.device_off" : l.reason === "wrong_code" ? "ag.login.wrong_code" : "ag.login.failed")}</p>
        {again}
      </div>
    );
  if (l.key) return <KeyLogin dv={dv} h={h} code={code} setCode={setCode} />;
  return (
    <div class="ag-login">
      <p>{t(h.harness === "codex" ? "ag.login.codex" : h.harness === "antigravity" ? "ag.login.agy" : "ag.login.claude")}</p>
      {l.reason === "wrong_code" && <p class="warn">{t("ag.login.wrong_code")}</p>}
      {l.url && (
        <a class="ag-link" href={l.url} target="_blank" rel="noopener noreferrer">
          {shortUrl(l.url)}
        </a>
      )}
      {l.code && (
        <div class="ag-code">
          <code>{l.code}</code>
          <Btn kind="secondary" size="sm" label={t("ag.login.copy")} onClick={() => copy(l.code!)} />
        </div>
      )}
      {l.paste && l.state === "waiting" && (
        <div class="ag-paste">
          <input class="dev-input" value={code} placeholder={t("ag.login.paste")} aria-label={t("ag.login.paste")} onInput={(e) => setCode((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && code.trim() && A.agentSetup(dv.id, "code", { harness: h.harness, code })} />
          <Btn kind="primary" size="sm" label={t("ag.login.send")} disabled={!code.trim()} onClick={() => A.agentSetup(dv.id, "code", { harness: h.harness, code })} />
        </div>
      )}
      {l.state === "checking" && <p class="soft">{t("ag.login.checking")}</p>}
      <div class="ag-acts">
        {l.url && <Btn kind="secondary" size="sm" label={t("ag.login.open")} onClick={() => window.open(l.url, "_blank", "noopener")} />}
        <Btn kind="text" size="sm" label={t("ag.login.cancel")} onClick={() => A.agentSetup(dv.id, "cancel", { harness: h.harness })} />
      </div>
    </div>
  );
}

/**
 * D371: DeepSeek Harness's sign-in in place: its app opened on that Mac (when it has one), and a
 * DeepSeek API key to paste, kept only on that computer. Turns ready by itself either way.
 */
function KeyLogin({ dv, h, code, setCode }: { dv: DeviceView; h: DeviceHarness; code: string; setCode: (v: string) => void }) {
  const l = h.login!;
  const checking = l.state === "checking";
  const send = () => {
    if (!code.trim() || checking) return;
    A.agentSetup(dv.id, "code", { harness: h.harness, code });
    setCode("");
  };
  const why = l.reason === "wrong_key" ? t("ag.login.wrong_key") : l.reason === "no_balance" ? t("ag.login.no_balance") : l.reason === "offline" ? t("ag.login.offline", dv.name) : l.reason === "failed" ? t("ag.login.failed") : "";
  return (
    <div class="ag-login">
      {l.app && <p>{t("ag.dsh.app", dv.name)}</p>}
      <p>{t(l.app ? "ag.dsh.key.or" : "ag.dsh.key", dv.name)}</p>
      <form
        class="ag-paste"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input class="dev-input" type="password" autocomplete="off" spellcheck={false} value={code} placeholder="sk-…" aria-label={t("ag.dsh.field")} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        <Btn kind="primary" size="sm" label={checking ? t("ag.login.checking") : t("ag.dsh.check")} about={harnessName(h.harness)} disabled={!code.trim() || checking} onClick={send} />
      </form>
      {why && !checking && <p class="warn" role="alert">{why}</p>}
      <div class="ag-acts">
        {l.url && <Btn kind="secondary" size="sm" label={t("ag.dsh.get")} onClick={() => window.open(l.url, "_blank", "noopener")} />}
        <Btn kind="text" size="sm" label={t("ag.login.cancel")} onClick={() => A.agentSetup(dv.id, "cancel", { harness: h.harness })} />
      </div>
    </div>
  );
}

/** One agent's row. `pick`: the lend sheet's checkbox instead of 安装 (before anything was asked). */
export function AgentRow({ dv, h, pick }: { dv: DeviceView; h: DeviceHarness; pick?: { checked: boolean; onChange: (v: boolean) => void } }) {
  const look = agentRowLook(h);
  const name = harnessName(h.harness);
  const awake = dv.state === "awake";
  // D415: partly there (too old, broken, only the app): said as what it is, its button as what it does.
  const tr = look === "install" || look === "missing" ? troubleWords(h) : undefined;
  const word =
    look === "ready" ? t("ag.ready")
    : look === "signin" || look === "login" ? t("ag.signed_out")
    : look === "installing" ? (h.setup?.pct ? `${t("ag.installing")} ${h.setup.pct}%` : t("ag.installing"))
    : look === "queued" ? t("ag.queued")
    : look === "failed" ? t(`ag.failed.${h.setup?.reason ?? "failed"}`, dv.name)
    : tr ? t(tr.word, ...tr.args)
    : t("ag.missing");
  const installLabel = tr?.button === "update" ? t("ag.update") : tr?.button === "reinstall" ? t("ag.reinstall") : t("ag.install");
  return (
    <div class={`ag-row ${look}`}>
      <div class="ag-head">
        <span class={`ag-coin${look === "installing" ? " busy" : ""}`}>
          <Coin harness={h.harness} size={36} off={look !== "ready"} />
          {look === "installing" && <i class="cring" aria-hidden="true" />}
        </span>
        <span class="ag-t">
          <b>{name}</b>
          <small class={look === "failed" ? "warn" : look === "ready" ? "ok" : ""}>{word}</small>
        </span>
        {pick && look === "install" ? (
          <input type="checkbox" class="ag-pick" checked={pick.checked} aria-label={name} onChange={(e) => pick.onChange((e.target as HTMLInputElement).checked)} />
        ) : look === "install" ? (
          <Btn kind="secondary" size="sm" label={installLabel} about={name} disabled={!awake} onClick={() => A.agentSetup(dv.id, "install", { harnesses: [h.harness] })} />
        ) : look === "failed" ? (
          <Btn kind="secondary" size="sm" label={t("ag.retry")} about={name} disabled={!awake} onClick={() => A.agentSetup(dv.id, "install", { harnesses: [h.harness] })} />
        ) : look === "signin" ? (
          <Btn kind="primary" size="sm" label={t("ag.signin")} about={name} disabled={!awake} onClick={() => A.agentSetup(dv.id, "login", { harness: h.harness })} />
        ) : null}
      </div>
      {look === "failed" && h.setup?.detail && <div class="ag-detail">{h.setup.detail}</div>}
      {/* D371: its command line is big; say so before the tap. */}
      {(look === "install" || look === "queued") && h.harness === "deepseek-harness" && <div class="ag-detail">{t("ag.dsh.size")}</div>}
      {/* D415: where agy goes (its own installer's place, not Ducter's folder), before the tap. */}
      {(look === "install" || look === "queued") && h.harness === "antigravity" && tr?.button !== "update" && <div class="ag-detail">{t("ag.agy.size")}</div>}
      {/* D415: Google's own terms, said before the person signs in with their Google account. */}
      {(look === "signin" || (look === "login" && h.login?.state !== "done")) && h.harness === "antigravity" && <div class="ag-detail">{t("ag.agy.terms")}</div>}
      {look === "login" && <LoginPanel dv={dv} h={h} />}
    </div>
  );
}

/** A device couldn't take the ask: away, or its Ducter is too old for it. */
export function SetupAnswer({ dv }: { dv: DeviceView }) {
  const a = A.setupAnswer;
  if (!a || a.device !== dv.id) return null;
  return <div class="ag-answer warn">{t(a.reason === "away" ? "ag.away" : "ag.old", dv.name)}</div>;
}
