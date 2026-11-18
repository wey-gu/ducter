// D347: 借一台电脑来干活 / Lend a computer (design/where.md). One question (a Mac or a Linux
// server), then the one line to paste there, with its code's minutes and what it does; the sheet
// waits in place until the computer is here, then says its name, its OS and the AI agents signed
// in on it, and offers a new name. A failure is one sentence and one next step. The same words and
// steps as the Mac's (apps/desktop/internal/views/lend.go). The partner says nothing about it.
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { AddRow, BackRow, Btn } from "./controls.tsx";
import { Coin } from "./coin.tsx";
import { harnessName } from "./format.ts";
import { arrived, lendStep, minutesLeft, type LendKind } from "./lend-view.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const art = (n: string) => `app/art/${n}.webp`;
const homeName = () => A.devices?.find((d) => d.home)?.name ?? A.homeName ?? "Ducter";

/** The entry in 你的设备 (and the partner's card): a plus, the words, why. */
export function LendEntry() {
  return (
    <div class="set-card lend-entry">
      <AddRow label={t("lend.entry")} help={t("lend.entry.why")} onClick={() => A.openLend()} />
    </div>
  );
}

/** The partner's 借一台电脑来干活 card (a `lend` block in its words, D303): one button to the sheet. */
export function LendCard() {
  return (
    <div class="rich-card rich-lend">
      <img src={art("dev_server_awake")} alt="" aria-hidden="true" />
      <div class="rl-words">
        <b>{t("lend.entry")}</b>
        <small>{t("lend.entry.why")}</small>
      </div>
      <Btn kind="secondary" size="sm" label={t("lend.entry")} onClick={() => A.openLend()} />
    </div>
  );
}

function CopyLine({ text, kind }: { text: string; kind: "line" | "ask" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1800))).catch(() => undefined);
  return (
    <div class={`lend-copy ${kind}`}>
      <code>{text}</code>
      <Btn kind="secondary" size="sm" label={t(copied ? "lend.copied" : "lend.copy")} onClick={copy} />
    </div>
  );
}

function Waiting({ say }: { say: string }) {
  return (
    <div class="lend-wait" role="status" aria-live="polite">
      <i class="lend-pulse" aria-hidden="true" />
      {t(say)}
    </div>
  );
}

/** 没连上？ / Didn't connect?: each a bold sentence and one next step. */
function Help({ address, check, open }: { address: string; check?: string; open?: boolean }) {
  return (
    <details class="lend-help" open={open}>
      <summary>{t("lend.help")}</summary>
      <dl>
        <dt>{t("lend.help.expired")}</dt>
        <dd>
          <span>{t("lend.help.expired.do")}</span>
        </dd>
        <dt>{t("lend.help.reach", homeName())}</dt>
        <dd>
          <span>{t("lend.help.reach.do", address)}</span>
          {check && <CopyLine text={check} kind="line" />}
        </dd>
        <dt>{t("lend.help.curl")}</dt>
        <dd>
          <span>{t("lend.help.curl.do")}</span>
        </dd>
        <dt>{t("lend.help.arch")}</dt>
        <dd>
          <span>{t("lend.help.arch.do")}</span>
        </dd>
      </dl>
    </details>
  );
}

function Pick() {
  const kinds: { k: LendKind; art: string; label: string }[] = [
    { k: "mac", art: "dev_laptop_awake", label: t("lend.kind.mac") },
    { k: "linux", art: "dev_server_awake", label: t("lend.kind.linux") },
  ];
  return (
    <div class="lend-ask">
      <div class="lend-q">{t("lend.question")}</div>
      <div class="lend-kinds">
        {kinds.map((x) => (
          <button key={x.k} class="lend-kind" onClick={() => A.lendAsk(x.k)}>
            <img src={art(x.art)} alt="" aria-hidden="true" />
            <b>{x.label}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function Here() {
  const f = A.lend!.frame!;
  const d = arrived(f, A.devices);
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const next = (draft ?? "").trim();
    if (d.id && next && next !== d.name) A.renameDevice(d.id, next);
    setDraft(null);
  };
  return (
    <div class="lend-here">
      <div class="dc-hero" aria-hidden="true">
        <div class="ground" />
        <img class="art drift" src={art(d.os === "mac" ? "dev_laptop_awake" : "dev_server_awake")} alt="" />
      </div>
      <h3 class="lend-arrived">{t("lend.here", d.name)}</h3>
      {d.os && (
        <div class="lend-os">
          <span>{t(`lend.os.${d.os}`)}</span>
          {d.arch && <small>{d.arch}</small>}
        </div>
      )}
      <div class="lend-agents">
        <div class="small sub">{t("lend.agents")}</div>
        {d.agents.length ? (
          <div class="lend-coins">
            {d.agents.map((h) => (
              <span class="lend-coin" key={h}>
                <Coin harness={h} size={40} />
                <small>{harnessName(h)}</small>
              </span>
            ))}
          </div>
        ) : (
          <p class="lend-note">{t("lend.agents.none")}</p>
        )}
      </div>
      {draft === null ? (
        <div class="lend-acts">
          {d.id && <Btn kind="secondary" label={t("lend.rename")} onClick={() => setDraft(d.name)} />}
          <Btn kind="primary" label={t("lend.done")} onClick={() => A.closeLend()} />
        </div>
      ) : (
        <div class="lend-acts">
          <input
            class="dev-input"
            value={draft}
            aria-label={t("lend.rename")}
            autoFocus
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") e.stopPropagation(), setDraft(null);
            }}
          />
          <Btn kind="primary" label={t("lend.done")} onClick={save} />
        </div>
      )}
    </div>
  );
}

/** The sheet, pushed inside 你的设备 with its own ‹ 你的设备. */
export function LendSheet() {
  const l = A.lend!;
  const now = Date.now();
  const step = lendStep(l, now);
  // The code's minutes count down while the line is up; it turns to 过期了 by itself.
  const [, tick] = useState(0);
  useEffect(() => {
    if (step !== "line") return;
    const h = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(h);
  }, [step]);
  const f = l.frame;
  const home = homeName();
  return (
    <section class="set devices lend">
      <BackRow label={t("devices.title")} onClick={() => A.closeLend()} />
      <h2 class="lend-title">{t("lend.title")}</h2>
      {step === "ask" && <Pick />}
      {step === "asking" && <Waiting say="lend.loading" />}
      {step === "failed" && (
        <div class="lend-body">
          <p class="lend-bad" role="alert">{t(l.failed ? "lend.fail.error" : "lend.fail.timeout", home)}</p>
          <div class="lend-acts">
            <Btn kind="primary" label={t("lend.retry")} onClick={() => A.lendAsk(l.kind!)} />
          </div>
        </div>
      )}
      {step === "noaddress" && (
        <div class="lend-body">
          <p>{t("lend.noaddress", home)}</p>
          <div class="lend-acts">
            <Btn kind="primary" label={t("lend.noaddress.go")} onClick={() => A.anywhereOn(true)} />
          </div>
        </div>
      )}
      {(step === "line" || step === "expired") && f && (
        <div class="lend-body">
          <div class="lend-chosen">
            <b>{t(l.kind === "mac" ? "lend.kind.mac" : "lend.kind.linux")}</b>
            <Btn kind="text" size="sm" label={t("lend.kind.other")} onClick={() => (A.lend = {}, A.changed())} />
          </div>
          {step === "expired" ? (
            <>
              <p class="lend-bad">{t("lend.expired")}</p>
              <div class="lend-acts">
                <Btn kind="primary" label={t("lend.newcode")} onClick={() => A.lendAsk(l.kind!)} />
              </div>
            </>
          ) : (
            <>
              {l.kind === "mac" && <p class="lend-note">{t("lend.mac.app", home, t("lend.mac.toggle", A.S.personaName))}</p>}
              <div class="lend-step">{t(l.kind === "mac" ? "lend.mac.paste" : "lend.linux.paste")}</div>
              <CopyLine text={f.line!} kind="line" />
              <small class="lend-muted">{t("lend.does")}</small>
              <small class="lend-muted">{t("lend.left", minutesLeft(f, now))}</small>
              {f.sameNetwork && <small class="lend-muted">{t("lend.samenet", home)}</small>}
              <Waiting say="lend.waiting" />
              <details class="lend-agent">
                <summary>{t("lend.agent")}</summary>
                <small>{t("lend.agent.how")}</small>
                <CopyLine text={t("lend.agent.ask", f.line!)} kind="ask" />
              </details>
            </>
          )}
          <Help address={f.address!} check={f.check} open={step === "expired" ? false : undefined} />
        </div>
      )}
      {step === "joined" && (
        <div class="lend-body">
          <Waiting say="lend.joined" />
        </div>
      )}
      {step === "here" && <Here />}
    </section>
  );
}
