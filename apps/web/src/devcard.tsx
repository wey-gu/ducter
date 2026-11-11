// 你的设备 / Your devices on the phone (D148, D155, D156, D161): one line per device, and a tap
// pushes its character sheet: the device's clay big on top, its name renamed in place, one
// status line, its AI agents as coins whose detail opens in place, its abilities as chips, one
// line of how it is connected (⋯ opens the connections in place), Ducter's version only with an
// update, one 断开这台 {device}. Every control here is a shared one (controls.tsx).
import { PhoneBlock, PhoneInfo, startInstall } from "./phone-use.tsx";
import type { DeviceHarness, DeviceUpdate, DeviceView } from "@ducter/protocol";
import { TRY_LIVE } from "@ducter/protocol";
import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BackRow, Btn, Chip, CoinButton, DangerButton, ListRow, MoreButton, RenameTitle, SocketButton, Toggle } from "./controls.tsx";
import { Coin } from "./coin.tsx";
import { ago, behind, harnessName, memWords, phaseLine as phaseWords } from "./format.ts";
import { agentBehind, agentRunning, androidApp, chipsFor, type Client, listWord, statusLine, versionLine, viaText } from "./sheet.ts";
import { attention, placeOf } from "./store.ts";
import { disablePush } from "./push-client.ts";
import { turnOnPush } from "./views.tsx";
import { liveSize } from "./live.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const art = (n: string) => `app/art/${n}.webp`;

// D155: one computer, one card. The command line (and the app window on a computer that does
// tasks) folds into its computer's card; alone, it stands as its computer, never "CLI on …".
const isCli = (cl: Client) => cl.form === "cli" || (!cl.form && cl.name.startsWith("CLI on "));
function clientComputer(cl: Client): string {
  if (cl.computer) return cl.computer;
  if (isCli(cl)) return cl.name.replace(/^CLI on /, "").trim();
  return /^(darwin|linux|win)/i.test(cl.platform) ? cl.name : "";
}
const clientName = (cl: Client) => (isCli(cl) && cl.name.startsWith("CLI on ") ? clientComputer(cl) || cl.name : cl.name);

/** Which clients fold into which card ("dev:id" | "cl:id"), and which get none of their own. */
export function foldClients(devices: DeviceView[], clients: Client[]): { hidden: Set<string>; members: Map<string, Client[]> } {
  const key = (s: string) => s.trim().toLowerCase();
  const workers = new Map<string, string>();
  for (const dv of devices) if (!dv.home) workers.set(key(dv.computer || dv.name), `dev:${dv.id}`);
  const apps = new Map<string, string>();
  for (const cl of clients) {
    const k = key(clientComputer(cl));
    if (k && !isCli(cl) && !apps.has(k)) apps.set(k, `cl:${cl.id}`);
  }
  const hidden = new Set<string>();
  const members = new Map<string, Client[]>();
  for (const cl of clients) {
    const k = key(clientComputer(cl));
    if (!k) continue;
    const owner = workers.get(k) ?? (isCli(cl) ? apps.get(k) : undefined);
    if (!owner) continue;
    hidden.add(cl.id);
    members.set(owner, [...(members.get(owner) ?? []), cl]);
  }
  return { hidden, members };
}

/** What a phone or a window is, for its accessible name (the clay says it on screen). */
function clientKind(cl: Client): string {
  const p = cl.platform.toLowerCase();
  if (isCli(cl)) return t("device.kind.cli");
  if (p.includes("ios") || p.includes("iphone")) {
    const kind = cl.name.startsWith("iPad") ? "ipad" : "iphone"; // "iPad · Ducter" (D176)
    return t(`device.kind.${kind}.${p.includes("safari") || p.includes("web") ? "safari" : "app"}`);
  }
  if (p.includes("android")) return t(androidApp(cl) ? "device.kind.android.app" : "device.kind.android"); // the Android app (D178)
  if (p.startsWith("darwin") || p.includes("mac")) return t("device.kind.mac.app");
  return p ? t("device.kind.browser") : t("device.kind.other");
}

const homeName = () => A.devices?.find((d) => d.home)?.name ?? "";

/** Tasks working on a device now. */
function runningOn(dv: DeviceView): number {
  let n = 0;
  for (const task of A.S.tasks.values()) {
    const d = placeOf(task).device;
    if (attention(task) === "working" && d && (d === dv.id || d === dv.name)) n++;
  }
  return n;
}

/** The device's clay in its state. */
export function deviceArt(dv: DeviceView): string {
  if (dv.state === "unreachable") return art("dev_device_unreachable");
  if (dv.kind === "phone") return art("dev_phone");
  const kind = dv.kind === "mini" || dv.kind === "server" ? dv.kind : "laptop";
  return art(`dev_${kind}_${dv.state === "asleep" ? "asleep" : "awake"}`);
}
const clientArt = (cl: Client) => (/^(darwin|linux|win)/i.test(cl.platform) && !/ios|iphone|android|web/i.test(cl.platform) ? art(cl.connected ? "dev_laptop_awake" : "dev_laptop_asleep") : art("dev_phone"));

// The coins whose update just landed pop once (§7); the phase seen last time, per coin.
const lastPhase = new Map<string, string>();
const popped = new Map<string, number>();

/** 你的设备 / Your devices: one line each; a tap pushes the device's sheet. */
export function DevicesSection() {
  // Every time it opens: the home also reads the latest release again when its answer is older
  // than 15 minutes, so "up to date" is never stale here.
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "devices" });
  }, []);
  const [open, setOpen] = useState<string | null>(null);
  const list = A.devices;
  if (!list?.length) return null;
  const f = foldClients(list, A.reach?.clients ?? []);
  const home = homeName();
  for (const dv of list)
    for (const h of dv.harnesses) {
      const k = `${dv.id}|${h.harness}`;
      const ph = h.update?.phase ?? "";
      const prev = lastPhase.get(k);
      if (prev !== undefined && ph === "done" && prev && prev !== "done" && prev !== "failed") popped.set(k, Date.now());
      lastPhase.set(k, ph);
    }
  const shownDev = open?.startsWith("dev:") ? list.find((d) => `dev:${d.id}` === open) : undefined;
  const shownCl = open?.startsWith("cl:") ? A.reach?.clients.find((c) => `cl:${c.id}` === open && !f.hidden.has(c.id)) : undefined;
  if (shownDev || shownCl)
    return (
      <section class="set devices">
        <BackRow label={t("devices.title")} onClick={() => setOpen(null)} />
        {shownDev ? <DeviceSheet dv={shownDev} folded={f.members.get(`dev:${shownDev.id}`) ?? []} /> : <ClientSheet cl={shownCl!} folded={f.members.get(`cl:${shownCl!.id}`) ?? []} />}
      </section>
    );
  return (
    <section class="set devices">
      <div class="plist">
        {list.map((dv) => {
          const w = listWord(A.L, dv, { home, running: runningOn(dv) });
          return <ListRow key={dv.id} art={deviceArt(dv)} name={dv.name} word={w.text} tone={w.tone} update={dv.update && behind(dv.update) ? t("devices.update_word") : undefined} onClick={() => setOpen(`dev:${dv.id}`)} />;
        })}
        {A.reach?.clients
          .filter((cl) => !f.hidden.has(cl.id))
          .map((cl) => (
            <ListRow
              key={cl.id}
              art={clientArt(cl)}
              name={clientName(cl)}
              word={cl.connected ? t("list.state.now") : cl.lastSeen ? ago(A.L, cl.lastSeen) : t("device.client.never")}
              onClick={() => setOpen(`cl:${cl.id}`)}
            />
          ))}
      </div>
      <Versions />
      {A.settings && (
        <>
          <Toggle label={t("settings.versions.night")} checked={!!A.settings.autoUpdate} onChange={(v) => A.setSettings({ autoUpdate: v })} />
          <div class="small sub">{t("settings.versions.night.note")}</div>
        </>
      )}
    </section>
  );
}

/** Never "latest" without when it was read: 已经是最新的 · 3 小时前查过 / Up to date · checked 3 h ago. */
function upToDate(u: DeviceUpdate): string {
  if (!u.checkedAt) return t("devup.current");
  const age = Date.now() - Date.parse(u.checkedAt);
  return `${t("devup.current")} · ${age < 2 * 60_000 ? t("devup.checked.now") : t("devup.checked", ago(A.L, u.checkedAt))}`;
}

/**
 * D161 (5): the card says Ducter's version only with an update; when it is current, the list says
 * so once, with 现在检查 (在查… in the same place while it asks, D167).
 */
function Versions() {
  const home = A.devices?.find((d) => d.home);
  const u = home?.update;
  if (!home || !u || !u.latest || u.available || u.phase) return null;
  return (
    <div class="dc-versions">
      <span class="small sub">{upToDate(u)}</span>
      {A.checkingUpdates ? <span class="small sub">{t("devup.checking")}</span> : <Btn kind="text" size="sm" label={t("devup.checknow")} onClick={() => A.checkUpdates(home.id)} />}
    </div>
  );
}

/** The clay, big, standing on its own little ground. */
function Hero({ src, grey, tall, motion }: { src: string; grey?: boolean; tall?: boolean; motion: string }) {
  return (
    <div class="dc-hero" aria-hidden="true">
      <div class="ground" />
      <img class={`art${tall ? " tall" : ""}${grey ? " grey" : ""} ${motion}`} src={src} alt="" />
      {grey && <div class="mist" />}
    </div>
  );
}

function DeviceSheet({ dv, folded }: { dv: DeviceView; folded: Client[] }) {
  const s = statusLine(A.L, dv, { persona: A.S.personaName, home: homeName(), running: runningOn(dv), ago: dv.lastSeen ? ago(A.L, dv.lastSeen) : "" });
  const motion = dv.state === "awake" ? (dv.kind === "server" ? "drift" : "float") : dv.state === "asleep" ? "blanket" : "";
  return (
    <div class="dc" role="group" aria-label={dv.name}>
      <Hero src={deviceArt(dv)} grey={dv.state === "unreachable"} tall={dv.kind === "phone"} motion={motion} />
      <div class="dc-name">
        <RenameTitle id={dv.id} name={dv.name} renamable />
      </div>
      <div class={`dc-status ${s.tone}`}>{s.text}</div>
      <CoinTray dv={dv} />
      <Chips dv={dv} />
      {!dv.home && <Via card={`dev:${dv.id}`} list={folded} computer={dv.computer || dv.name} />}
      <DucterLine dv={dv} />
      {!dv.home && <Foot id={dv.id} name={dv.name} means="device.disconnect.means" />}
    </div>
  );
}

function ClientSheet({ cl, folded }: { cl: Client; folded: Client[] }) {
  const name = clientName(cl);
  const mine = A.me?.deviceId === cl.id;
  const line = mine ? t("card.status.this") : cl.connected ? t("device.client.now") : cl.lastSeen ? t("device.client.seen", ago(A.L, cl.lastSeen)) : t("device.client.never");
  const src = clientArt(cl);
  return (
    <div class="dc" role="group" aria-label={`${name}, ${clientKind(cl)}`}>
      <Hero src={src} tall={src.endsWith("dev_phone.webp")} motion={cl.connected ? "float" : ""} />
      <div class="dc-name">
        <RenameTitle id={cl.id} name={name} renamable />
      </div>
      <div class="dc-status">{line}</div>
      {mine && <NotifyChip />}
      <Via card={`cl:${cl.id}`} list={[cl, ...folded]} computer={clientComputer(cl)} />
      <Foot id={cl.id} name={name} confirm={isCli(cl) ? t("device.cli.name", clientComputer(cl)) : name} means={isCli(cl) ? "device.disconnect.means.cli" : "device.disconnect.means.client"} />
    </div>
  );
}

/** This phone's own 通知 chip: one tap on or off. */
function NotifyChip() {
  const [info, setInfo] = useState(false);
  const on = A.push === "on";
  const can = on || (A.push === "off" && !!A.me?.push.publicKey);
  return (
    <>
      <div class="dc-chips">
        <Chip
          label={t("chip.notify")}
          art={art("wait_mail")}
          look={on ? "on" : can ? "add" : "off"}
          infoOpen={info}
          onInfo={() => setInfo(!info)}
          onClick={async () => {
            if (on) A.push = await disablePush(A.api);
            else if (can) A.push = await turnOnPush();
            else setInfo(true);
            A.changed();
          }}
        />
      </div>
      {info && <div class="dc-note">{t("chip.notify.about")}</div>}
    </>
  );
}

// ---------- what it carries ----------

function CoinTray({ dv }: { dv: DeviceView }) {
  const [open, setOpen] = useState("");
  const shown = dv.harnesses.filter((h) => h.installed);
  const missing = dv.harnesses.filter((h) => !h.installed);
  const n = shown.length + (missing.length ? 1 : 0);
  if (!n) return null;
  const idx = open === "+" ? shown.length : shown.findIndex((h) => h.harness === open);
  const notch = `${((idx + 0.5) / n) * 100}%`;
  return (
    <>
      <div class="dc-tray" role="group" aria-label={t("devices.accounts", dv.name)}>
        {shown.map((h) => {
          const name = harnessName(h.harness);
          const dot = agentBehind(h);
          const label = `${name} · ${dv.name}${!h.loggedIn ? ` · ${t("coin.signed_out")}` : ""}${dot ? ` · ${t("agentv.available", h.latest)}` : ""}`;
          const k = `${dv.id}|${h.harness}`;
          return (
            <CoinButton
              key={h.harness}
              harness={h.harness}
              name={name}
              label={label}
              off={!h.loggedIn || dv.state !== "awake"}
              dot={dot}
              running={agentRunning(h)}
              pop={Date.now() - (popped.get(k) ?? 0) < 600}
              sel={open === h.harness}
              onClick={() => setOpen(open === h.harness ? "" : h.harness)}
            />
          );
        })}
        {!!missing.length && <SocketButton label={t("coin.socket")} sel={open === "+"} onClick={() => setOpen(open === "+" ? "" : "+")} />}
      </div>
      {idx >= 0 && (
        <div class="dc-detail" style={{ "--notch": notch }}>
          {open === "+" ? (
            <>
              <div class="ln">{t("coin.socket.there", dv.name)}</div>
              {missing.map((h) => (
                <div class="dc-missing" key={h.harness}>
                  <Coin harness={h.harness} size={28} off />
                  <b>{harnessName(h.harness)}</b>
                </div>
              ))}
              <div class="ln">{t("coin.there", dv.name)}</div>
            </>
          ) : (
            <CoinDetail dv={dv} h={shown[idx]!} />
          )}
        </div>
      )}
    </>
  );
}

/** The slot for more per-agent lines in a coin's detail (D169: its Nowledge Mem line, below). */
export const coinLines: ((dv: DeviceView, h: DeviceHarness) => string)[] = [];
/** What a coinLines line offers to do, right under the lines, with shared controls only (D169: 装上 Nowledge Mem). */
export const coinActions: ((dv: DeviceView, h: DeviceHarness) => ComponentChildren)[] = [];

function agentPhase(u: NonNullable<DeviceHarness["update"]>): string {
  switch (u.phase) {
    case "waiting":
      return t("agentv.phase.waiting");
    case "updating":
      return t("agentv.phase.updating", u.to ?? "");
    case "checking":
      return t("agentv.phase.checking", u.to ?? "");
    case "done":
      return t("agentv.phase.done", u.to ?? u.from);
    case "failed":
      return u.rolledBack ? t("agentv.phase.rolledback", u.from) : t("agentv.phase.failed");
  }
  return "";
}

function CoinDetail({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const name = harnessName(h.harness);
  if (!h.loggedIn)
    return (
      <>
        <div class="dh">
          <b>{name}</b>
          <small>{t("coin.signed_out")}</small>
        </div>
        <div class="ln">{t("coin.signin.why", dv.name)}</div>
        <div class="ln">{t("coin.there", dv.name)}</div>
      </>
    );
  const others = (A.devices ?? []).filter((o) => o.id !== dv.id && o.harnesses.some((x) => x.harness === h.harness && x.installed && x.loggedIn)).map((o) => o.name);
  const shared = !!h.allowance && (h.allowance.sharedBy ?? 0) > 1 && others.length > 0;
  const u = h.update;
  const behindNow = agentBehind(h);
  const retry = u?.phase === "failed" && !!h.available;
  const answer = A.agentAnswer?.device === dv.id && A.agentAnswer.harness === h.harness ? A.agentAnswer.reason : undefined;
  const ready = A.settings?.taskAccounts?.[h.harness as keyof NonNullable<typeof A.settings.taskAccounts>]?.enabled ?? true;
  return (
    <>
      <div class="dh">
        <b>{name}</b>
      </div>
      {versionLine(A.L, h) && <div class="ln soft">{versionLine(A.L, h)}</div>}
      {h.how === "unknown" && <div class="ln">{t("agentv.how.unknown")}</div>}
      {(h.standing === "newer" || h.standing === "older") && <div class="ln">{t("agentv.unverified")}</div>}
      {shared && <div class="ln">{t("coin.shared", others.join(t("card.via.and")))}</div>}
      {coinLines.map((f) => f(dv, h)).filter(Boolean).map((line) => (
        <div class="ln">{line}</div>
      ))}
      {coinActions.map((f, i) => (
        <Fragment key={i}>{f(dv, h)}</Fragment>
      ))}
      {(behindNow || retry || (u && agentPhase(u)) || answer) && (
        <div class="dc-upd">
          <div class="tx">
            {u && agentPhase(u) ? <b class={u.phase}>{agentPhase(u)}</b> : behindNow ? <b>{t("agentv.available", h.latest)}</b> : null}
            {u?.phase === "failed" && u.reason && <small>{t(`agentv.why.${u.reason}`)}</small>}
            {(behindNow || retry) && h.latestVerified === false && <small>{t("agentv.latest.unverified", h.latest)}</small>}
            {(behindNow || retry) && dv.state !== "awake" && <small>{t("agentv.away", dv.name)}</small>}
            {answer && <small class="warn">{t(`agentv.why.${answer}`)}</small>}
          </div>
          {(behindNow || retry) && dv.state === "awake" && <Btn kind="primary" size="sm" label={t(retry ? "agentv.retry" : "agentv.button")} about={name} onClick={() => A.updateAgent(dv.id, h.harness)} />}
        </div>
      )}
      {A.settings && <Toggle label={t("loadout.acct.tasks")} checked={ready} onChange={(v) => A.setSettings({ taskAccounts: { ...(A.settings?.taskAccounts ?? {}), [h.harness]: { enabled: v } } })} />}
      <div class="ln small">{t("coin.there", dv.name)}</div>
    </>
  );
}

// ---------- what it can do ----------

function Chips({ dv }: { dv: DeviceView }) {
  const [info, setInfo] = useState("");
  const chips = chipsFor(dv);
  if (!chips.length) return null;
  const web = dv.abilities.find((a) => a.id === "web");
  const about = (id: string) => (id === "web" && web?.where === "chrome" ? "ability.web.about.chrome" : id === "web" && web?.where === "ducter" ? "ability.web.about.ducter" : id === "phone" && chips.find((c) => c.id === id)?.look === "later" ? "ability.phone.later" : `ability.${id}.about`);
  const set = (id: string, on: boolean) => A.send({ t: "ability", device: dv.id, ability: id as "web", on });
  const look = (id: string) => chips.find((c) => c.id === id)?.look;
  return (
    <>
      <div class="dc-chips">
        {chips.map((c) => (
          <Chip
            key={c.id}
            label={t(`chip.${c.id}`)}
            art={art(c.look === "later" ? `ab_${c.id}_later` : `ab_${c.id}`)}
            look={c.look}
            {...(c.id === "call" && c.look === "fail" ? { state: t("chip.call.signed_out") } : {})}
            infoOpen={info === c.id}
            onInfo={() => setInfo(info === c.id ? "" : c.id)}
            onClick={() => {
              // D199: 打电话 lives in Accounts (the phone card); + starts the same Tuwa sign-in as its offer.
              if (c.id === "call") return A.openCalls(c.look === "add");
              // D214: + 用手机 opens what it downloads and Google's licenses; on, the ⓘ says where it lives.
              if (c.id === "phone") return c.look === "add" || c.look === "fail" ? startInstall(dv.id) : setInfo(info === c.id ? "" : c.id);
              if (c.look === "later" || c.id === "remote" || c.look === "off" || c.look === "fail") return setInfo(info === c.id ? "" : c.id);
              if (dv.state === "awake") set(c.id, c.look !== "on");
            }}
          />
        ))}
      </div>
      {web?.where === "ducter" && web.state === "on" && <Browsing dv={dv} />}
      <PhoneBlock dv={dv} />
      {web?.where === "ducter" && web.setup === "installing" && <div class="dc-note">{t("web.installing")}</div>}
      {web?.where === "ducter" && web.state === "unavailable" && web.reason !== "env_off" && (
        <div class="dc-note">
          {web.reason === "browser_deps" ? t("web.deps") : web.reason === "browser_sandbox" ? t("web.sandbox") : t("web.failed", web.detail ?? "")}
          {(web.reason === "browser_deps" || web.reason === "browser_sandbox") && <code class="dev-cmd">{web.detail}</code>}
          <div class="acts">
            <Btn kind="secondary" size="sm" label={t("web.retry")} onClick={() => set("web", true)} />
          </div>
        </div>
      )}
      {info && (
        <div class="dc-note">
          {t(about(info))}
          {info === "call" && <div class="small sub">{t(look("call") === "fail" ? "ability.call.signed_out" : "ability.call.where")}</div>}
          {info === "web" && web?.where === "ducter" && web.state === "on" && !web.setup && <Sites dv={dv} />}
          {info === "phone" && <PhoneInfo dv={dv} />}
          {info !== "remote" && look(info) === "off" && dv.state !== "awake" && <div class="small sub">{t("ability.reason.asleep")}</div>}
        </div>
      )}
    </>
  );
}

/** D190: the tasks using Ducter's browser on this computer now, each with 看看 / Watch. */
function Browsing({ dv }: { dv: DeviceView }) {
  const busy = (A.S.onHand?.tasks ?? []).filter((c) => c.browsing?.device === dv.id && ["working", "queued", "needs_you", "blocked"].includes(c.attention));
  if (!busy.length) return null;
  return (
    <div class="dev-browsing">
      {busy.map((c) => (
        <div class="dev-site" key={c.taskId}>
          <div class="dev-site-what">
            <div class="small">{t("live.using", c.title)}</div>
          </div>
          <Btn kind="secondary" size="sm" label={t("live.watch")} about={c.title} onClick={() => A.watchLive(c.taskId, liveSize())} />
        </div>
      ))}
    </div>
  );
}

/** D151/D154: Ducter's own browser: Try it, then the sites signed in to (in 上网's ⓘ). */
function Sites({ dv }: { dv: DeviceView }) {
  const [clearing, setClearing] = useState(false);
  useEffect(() => A.send({ t: "browser_sites" }), []);
  const sites = A.sites?.sites ?? [];
  return (
    <div class="dev-web">
      {dv.state === "awake" && (
        <div class="dev-try">
          <div class="small">{t("web.try.about")}</div>
          <Btn kind="secondary" size="sm" label={t("web.try")} about={t("web.title")} onClick={() => A.openLive(TRY_LIVE, "example.com", liveSize(), true, dv.id)} />
        </div>
      )}
      <div class="dev-sub">{t("sites.title")}</div>
      {!sites.length && <div class="small">{t("sites.none")}</div>}
      {sites.map((s) => (
        <div class="dev-site" key={s.site}>
          <div class="dev-site-what">
            <div class="dev-site-name">{s.site}</div>
            <div class="small">{s.cookies ? t("sites.when", ago(A.L, s.signedInAt)) : t("sites.gone")}</div>
          </div>
          <Btn kind="text" size="sm" label={t("sites.signout")} about={s.site} onClick={() => A.send({ t: "browser_site_signout", site: s.site })} />
        </div>
      ))}
      {!!sites.length &&
        (clearing ? (
          <>
            <div class="small">{t("sites.clear.ask")}</div>
            <div class="btns">
              <Btn kind="secondary" size="sm" label={t("sites.keep")} onClick={() => setClearing(false)} />
              <Btn kind="primary" size="sm" label={t("sites.clear.go")} onClick={() => (setClearing(false), A.send({ t: "browser_sites_clear" }))} />
            </div>
          </>
        ) : (
          <Btn kind="text" size="sm" label={t("sites.clear")} onClick={() => setClearing(true)} />
        ))}
    </div>
  );
}

// ---------- Nowledge Mem in this agent (D169) ----------

/**
 * D169: what 装上 / 更新 / 理一下 on an agent's Nowledge Mem line does: it asks in place first (what
 * changes and where), then one task on that computer follows Mem's own setup guide. A computer
 * that is away shows the line alone.
 */
function MemAction({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const [asking, setAsking] = useState(false);
  if (!h.mem || !h.installed || !h.loggedIn) return null;
  const w = memWords(A.L, h.mem);
  if (!w.action || dv.state !== "awake") return null;
  const agent = harnessName(h.harness);
  const about = `${agent} · Nowledge Mem`;
  const answer = A.memAnswer?.device === dv.id && A.memAnswer.harness === h.harness ? A.memAnswer.reason : undefined;
  return (
    <>
      {asking ? (
        <div class="dev-cut">
          <div class="dev-cut-q">{t("memp.ask", agent, dv.name)}</div>
          <div class="small sub">{t("memp.means", agent, dv.name)}</div>
          <div class="btns">
            <Btn kind="secondary" size="sm" label={t("memp.ok")} about={about} onClick={() => (A.installMem(dv.id, h.harness), setAsking(false))} />
            <Btn kind="text" size="sm" label={t("memp.cancel")} about={about} onClick={() => setAsking(false)} />
          </div>
        </div>
      ) : (
        <div class="btns">
          <Btn kind="secondary" size="sm" label={w.action} about={about} onClick={() => setAsking(true)} />
        </div>
      )}
      {answer && <div class="ln warn">{t(`memp.why.${answer}`)}</div>}
    </>
  );
}

coinLines.push((_dv, h) => (h.mem && h.installed ? memWords(A.L, h.mem).line : ""));
coinActions.push((dv, h) => <MemAction dv={dv} h={h} />);

// ---------- how it's connected ----------

/** The confirm in place: what disconnecting means, 断开 or 算了. */
function Confirm({ id, name, means, onDone }: { id: string; name: string; means: string; onDone: () => void }) {
  return (
    <div class="dev-cut">
      <div class="dev-cut-q">{t("device.disconnect.ask", name)}</div>
      <div class="small sub">{t(means)}</div>
      <div class="btns">
        <Btn kind="secondary" size="sm" label={t("device.disconnect.ok")} about={name} onClick={() => (A.disconnectDevice(id), onDone())} />
        <Btn kind="text" size="sm" label={t("device.disconnect.cancel")} onClick={onDone} />
      </div>
    </div>
  );
}

function Via({ card, list, computer }: { card: string; list: Client[]; computer: string }) {
  const [open, setOpen] = useState(false);
  const [cutting, setCutting] = useState("");
  if (!list.length) return null;
  return (
    <>
      <div class="dc-via">
        {viaText(A.L, list)}
        <MoreButton label={t("card.via.more")} open={open} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div class="dc-conns" id={`conns-${card}`}>
          {list.map((cl) => {
            const cli = isCli(cl);
            const way = cli ? "cli" : /ios|iphone/i.test(cl.platform) && /safari|web/i.test(cl.platform) ? "safari" : /^(darwin|ios)/i.test(cl.platform) ? "app" : "browser";
            const name = computer ? t(cli ? "device.cli.name" : "device.app.name", computer) : clientName(cl);
            if (cutting === cl.id) return <Confirm key={cl.id} id={cl.id} name={name} means={cli ? "device.disconnect.means.cli" : "device.disconnect.means.client"} onDone={() => setCutting("")} />;
            return (
              <div class="dc-conn" key={cl.id}>
                <b>{t(`card.conn.${way}`)}</b>
                <small>{cl.connected ? t("device.client.now") : cl.lastSeen ? ago(A.L, cl.lastSeen) : t("device.client.never")}</small>
                <DangerButton label={t("device.disconnect")} about={name} onClick={() => setCutting(cl.id)} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- the foot ----------

/** Ducter's own version, only when it says something: an update, its steps, how it ended. */
function DucterLine({ dv }: { dv: DeviceView }) {
  const [why, setWhy] = useState(false);
  const u = dv.update;
  const answer = A.deviceAnswer?.device === dv.id ? A.deviceAnswer.reason : undefined;
  if (!u || (!behind(u) && !u.phase && !answer)) return null;
  const line = phaseWords(A.L, u as DeviceUpdate);
  const offer = behind(u) || (u.phase === "failed" && u.available);
  const failed = u.phase === "failed";
  // D187: a Mac that updates with its app updates from here too, when its Ducter can ask the app.
  const here = u.how === "self" || (u.how === "app" && Boolean(u.fromHere));
  return (
    <div class="dc-ver">
      <div class="row1">
        {!line && behind(u) && <i class="vd" aria-hidden="true" />}
        {failed ? (
          // D167: 没更新成 opens its why (and what was seen) on a tap.
          <Btn kind="text" size="sm" class="tx failed" label={line} about={dv.name} expanded={why} onClick={() => setWhy(!why)} />
        ) : (
          <span class={`tx ${u.phase ?? ""}`}>{line || t("card.ducter.update", u.latest)}</span>
        )}
        {offer && here && dv.state === "awake" && <Btn kind="secondary" size="sm" label={t(u.phase === "failed" ? "devup.retry" : "devup.button")} about={dv.name} onClick={() => A.updateDevice(dv.id)} />}
      </div>
      {failed && why && <div class="small sub">{t(`devup.why.${u.reason ?? "failed"}`)}</div>}
      {failed && why && u.detail && <div class="small sub">{u.detail}</div>}
      {u.phase === "downloading" && !!u.progress && (
        <div class="dev-bar">
          <i style={{ width: `${Math.round(u.progress * 100)}%` }} />
        </div>
      )}
      {behind(u) && u.how === "self" && u.notesBy?.[A.L.lang]?.map((n) => <div class="small sub">{n}</div>)}
      {offer && !failed && here && u.how === "app" && dv.state === "awake" && <div class="small sub">{t("devup.how.app.here", dv.name)}</div>}
      {offer && !here && <div class="small sub">{u.how === "app" ? t("devup.how.app", dv.name) : u.how === "manual" ? t("devup.how.manual", dv.name) : t("devup.how.source")}</div>}
      {offer && here && dv.state !== "awake" && <div class="small sub">{t("devup.how.away", dv.name)}</div>}
      {answer && <div class="small warn">{t(answer === "name_taken" ? "device.rename.name_taken" : `devup.why.${answer}`)}</div>}
    </div>
  );
}

/** A hairline, then one 断开这台 {device}, confirmed in place. */
function Foot({ id, name, confirm, means }: { id: string; name: string; confirm?: string; means: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <div class="dc-foot">
      {asking ? <Confirm id={id} name={confirm ?? name} means={means} onDone={() => setAsking(false)} /> : <DangerButton label={t("card.disconnect.device", name)} onClick={() => setAsking(true)} />}
    </div>
  );
}
