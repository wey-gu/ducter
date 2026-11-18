// D347, D358: 加一台设备 / Add a device, and 加一台做事的电脑 / Add a computer for tasks
// (design/where.md). 加一台设备 asks what the device is for, as two clay cards: to talk with the
// partner (a phone, a tablet or another window: a one-time code, its QR and the address) or for
// the partner to do tasks on (a Mac or a server: the one line to paste there). The computer's own
// clay tells the wait without words: asleep under its blanket, a ripple under it while it is
// waited for, awake and swelling once as it joins; then its name, its OS and the AI agents
// signed in on it, and a new name. A failure is one sentence and one next step. The same words
// and steps as the Mac's (apps/desktop/internal/views/lend.go). The partner says nothing about it.
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BackRow, Btn, ListRow } from "./controls.tsx";
import { Coin } from "./coin.tsx";
import { harnessName } from "./format.ts";
import { Qr } from "./phone.tsx";
import { arrived, lendStep, minutesLeft, type LendKind } from "./lend-view.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const art = (n: string) => `app/art/${n}.webp`;
const homeName = () => A.devices?.find((d) => d.home)?.name ?? A.homeName ?? "Ducter";

/** D358: the one way in on 你的设备: a row like the devices', an empty clay slot with a drawn plus. */
export function AddDeviceRow() {
  return <ListRow art={art("slot_empty")} name={t("add.row")} word={t("add.row.sub")} plus onClick={() => A.openAdd()} />;
}

/** The partner's 加一台做事的电脑 card (a `lend` block in its words, D303): one button to the sheet. */
export function LendCard() {
  return (
    <div class="rich-card rich-lend">
      <img src={art("dev_server_awake")} alt="" aria-hidden="true" />
      <div class="rl-words">
        <b>{t("lend.card")}</b>
        <small>{t("lend.entry.why")}</small>
      </div>
      <Btn kind="secondary" size="sm" label={t("lend.card.go")} onClick={() => A.openLend()} />
    </div>
  );
}

function CopyLine({ text, kind }: { text: string; kind: "line" | "ask" | "check" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1800))).catch(() => undefined);
  return (
    <div class={`lend-copy ${kind}`}>
      {kind === "line" && (
        <span class="prompt" aria-hidden="true">
          $
        </span>
      )}
      <code>{text}</code>
      <Btn kind="secondary" size="sm" label={t(copied ? "lend.copied" : "lend.copy")} onClick={copy} />
    </div>
  );
}

/** A big choice: the clay on its own light, the words under it. */
function ClayCard({ arts, title, sub, onClick }: { arts: string[]; title: string; sub?: string; onClick: () => void }) {
  return (
    <button class={`clay-card${arts.length > 1 ? " two" : ""}`} onClick={onClick}>
      <span class="cc-stage" aria-hidden="true">
        {arts.map((a) => (
          <img key={a} src={art(a)} alt="" />
        ))}
        <i class="cc-ground" />
      </span>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** The computer being added, in clay: its state is its pose (the caption under it says it in words). */
function Hero({ kind, phase, say, dots }: { kind: "server" | "laptop" | "phone"; phase: "asleep" | "waiting" | "joined" | "here" | "stopped"; say?: string; dots?: boolean }) {
  const awake = phase === "joined" || phase === "here";
  const pic = kind === "phone" ? "dev_phone" : `dev_${kind}_${awake ? "awake" : "asleep"}`;
  return (
    <div class={`lend-hero ${phase}`}>
      <div class="lh-stage" aria-hidden="true">
        {phase === "waiting" && <i class="lh-ring" />}
        <i class="lh-ground" />
        <img src={art(pic)} alt="" />
      </div>
      {say && (
        <div class={`lend-cap ${phase}`} role="status" aria-live="polite">
          {dots && (
            <i class="lend-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </i>
          )}
          {say}
        </div>
      )}
    </div>
  );
}

/** 没连上？ / Didn't connect?: each a bold sentence and one next step. */
function Help({ address, check, kind }: { address: string; check?: string; kind: LendKind }) {
  return (
    <details class="lend-help">
      <summary>{t("lend.help")}</summary>
      <dl>
        <dt>{t("lend.help.expired")}</dt>
        <dd>
          <span>{t("lend.help.expired.do")}</span>
          <div class="lend-acts">
            <Btn kind="secondary" size="sm" label={t("lend.newcode")} onClick={() => A.lendAsk(kind)} />
          </div>
        </dd>
        <dt>{t("lend.help.reach", homeName())}</dt>
        <dd>
          <span>{t("lend.help.reach.do", address)}</span>
          {check && <CopyLine text={check} kind="check" />}
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

/** 加一台设备's first step: what it is for. */
function AddStep() {
  const name = A.S.personaName;
  return (
    <div class="lend-ask">
      <div class="lend-q">{t("add.question")}</div>
      <div class="lend-kinds">
        <ClayCard arts={["dev_tablet", "dev_phone"]} title={t("add.talk", name)} sub={t("add.talk.sub")} onClick={() => A.addPair()} />
        <ClayCard arts={["dev_laptop_awake", "dev_server_awake"]} title={t("add.work", name)} sub={t("add.work.sub")} onClick={() => ((A.lend = { fromAdd: true }), A.changed())} />
      </div>
    </div>
  );
}

function Pick() {
  return (
    <div class="lend-ask">
      <div class="lend-q">{t("lend.question")}</div>
      <div class="lend-kinds">
        <ClayCard arts={["dev_server_awake"]} title={t("lend.kind.linux")} sub={t("lend.kind.linux.sub")} onClick={() => A.lendAsk("linux")} />
        <ClayCard arts={["dev_laptop_awake"]} title={t("lend.kind.mac")} sub={t("lend.kind.mac.sub")} onClick={() => A.lendAsk("mac")} />
      </div>
    </div>
  );
}

/** Copy, paste there, it joins by itself. */
function Steps({ kind }: { kind: LendKind }) {
  return (
    <ol class="lend-steps">
      {["lend.step.copy", `lend.step.paste.${kind}`, "lend.step.joins"].map((k) => (
        <li key={k}>{t(k)}</li>
      ))}
    </ol>
  );
}

/** D358: a phone, a tablet or another window: the code, its QR, the address; the phone's clay waits for it. */
function Pair() {
  const p = A.lend!.pair!;
  const home = homeName();
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(h);
  }, []);
  if (p === "asking") return <Hero kind="phone" phase="asleep" say={t("add.pair.asking")} dots />;
  const clients = A.reach?.clients ?? [];
  const joined = clients.length > (A.lend!.pairFrom ?? 0) ? clients[clients.length - 1] : undefined;
  if (joined)
    return (
      <div class="lend-body">
        <Hero kind="phone" phase="here" say={t("add.pair.here", joined.name)} />
        <div class="lend-acts center">
          <Btn kind="primary" label={t("lend.done")} onClick={() => A.closeLend()} />
        </div>
      </div>
    );
  if (!p.address || !p.link)
    return (
      <div class="lend-body">
        <Hero kind="phone" phase="stopped" />
        <p class="lend-say">{t("add.pair.noaddress", home)}</p>
        <div class="lend-acts center">
          <Btn kind="primary" label={t("lend.noaddress.go")} onClick={() => A.anywhereOn(true)} />
        </div>
      </div>
    );
  if (Date.now() >= Date.parse(p.expiresAt))
    return (
      <div class="lend-body">
        <Hero kind="phone" phase="stopped" />
        <p class="lend-say">{t("lend.expired")}</p>
        <div class="lend-acts center">
          <Btn kind="primary" label={t("lend.newcode")} onClick={() => A.addPair()} />
        </div>
      </div>
    );
  return (
    <div class="lend-body">
      <Hero kind="phone" phase="waiting" say={t("lend.waiting")} dots />
      <div class="pair-card">
        {p.qr && <Qr rows={p.qr} label={t("add.pair.scan")} />}
        <div class="pair-words">
          <code class="pair-code">{p.code}</code>
          <small>{t("add.pair.once", minutesLeft(p, Date.now()))}</small>
          <p>{t("add.pair.how")}</p>
          <code class="pair-addr">{p.address}</code>
        </div>
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
      <Hero kind={d.os === "mac" ? "laptop" : "server"} phase="here" />
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

/** The sheet, pushed inside 你的设备; its back row goes one step back (to 你的设备 from the first). */
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
  const kind = l.kind === "mac" ? "laptop" : "server";
  const first = step === "add" || (step === "ask" && !l.fromAdd);
  const backTo = first ? t("devices.title") : l.kind && step !== "joined" && step !== "here" ? t("lend.title") : t("add.back");
  const title = step === "add" ? t("add.title") : step === "pair" ? t("add.talk", A.S.personaName) : t("lend.title");
  return (
    <section class="set devices lend">
      <BackRow label={backTo} onClick={() => (first || step === "here" ? A.closeLend() : A.lendBack())} />
      <h2 class="lend-title">{title}</h2>
      {step === "add" && <AddStep />}
      {step === "pair" && <Pair />}
      {step === "ask" && <Pick />}
      {step === "asking" && (
        <div class="lend-body">
          <Hero kind={kind} phase="asleep" say={t("lend.loading")} dots />
          <Steps kind={l.kind!} />
          <div class="lend-copy line ghost" aria-hidden="true" />
        </div>
      )}
      {step === "failed" && (
        <div class="lend-body">
          <Hero kind={kind} phase="stopped" />
          <p class="lend-say" role="alert">{t(l.failed ? "lend.fail.error" : "lend.fail.timeout", home)}</p>
          <div class="lend-acts center">
            <Btn kind="primary" label={t("lend.retry")} onClick={() => A.lendAsk(l.kind!)} />
          </div>
        </div>
      )}
      {step === "noaddress" && (
        <div class="lend-body">
          <Hero kind={kind} phase="stopped" />
          <p class="lend-say">{t("lend.noaddress", home)}</p>
          <div class="lend-acts center">
            <Btn kind="primary" label={t("lend.noaddress.go")} onClick={() => A.anywhereOn(true)} />
          </div>
        </div>
      )}
      {step === "expired" && (
        <div class="lend-body">
          <Hero kind={kind} phase="stopped" />
          <p class="lend-say">{t("lend.expired")}</p>
          <div class="lend-acts center">
            <Btn kind="primary" label={t("lend.newcode")} onClick={() => A.lendAsk(l.kind!)} />
          </div>
        </div>
      )}
      {step === "line" && f && (
        <div class="lend-body">
          <Hero kind={kind} phase="waiting" say={t("lend.waiting")} dots />
          {l.kind === "mac" && <p class="lend-note">{t("lend.mac.app", home, t("lend.mac.toggle", A.S.personaName))}</p>}
          <Steps kind={l.kind!} />
          <CopyLine text={f.line!} kind="line" />
          <div class="lend-facts">
            <small class="lend-muted">{t("lend.left", minutesLeft(f, now))}</small>
            <small class="lend-muted">{t("lend.does")}</small>
            {f.sameNetwork && <small class="lend-same">{t("lend.samenet", home)}</small>}
          </div>
          <details class="lend-agent">
            <summary>{t("lend.agent")}</summary>
            <small>{t("lend.agent.how")}</small>
            <CopyLine text={t("lend.agent.ask", f.line!)} kind="ask" />
          </details>
          <Help address={f.address!} check={f.check} kind={l.kind!} />
        </div>
      )}
      {step === "joined" && (
        <div class="lend-body">
          <Hero kind={kind} phase="joined" say={t("lend.joined")} dots />
        </div>
      )}
      {step === "here" && <Here />}
    </section>
  );
}
