// D322: Settings › 伙伴 / Partner as one story on D273's grid, the same as the Mac's
// (apps/desktop/internal/views/loadout.go): what it thinks with (one row, the switch and the model
// only where there is a choice, the reassurance only then), who does the tasks (one row per signed-in
// AI agent, how Ducter picks, the override in a task), and one place to add another AI (an agent to
// sign in, or a pasted key) with what it would give. Coins at the tile size; the tray is on Devices.
import type { DeviceHarness } from "@ducter/protocol";
import { PARTNER_RESERVE } from "@ducter/protocol/src/loadout.ts";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { AddRow, Btn, DangerButton, Seg, Switch } from "./controls.tsx";
import { KeyCard } from "./first-words.tsx";
import { harnessName, when } from "./format.ts";
import { GBlock, GFoot, GHead, GRow, Group, Said, say, Tile } from "./set-grid.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const pct = (f: number) => Math.round(f * 100);

/** The home's AI agents that can do tasks now: installed and signed in. */
export function readyAgents(): DeviceHarness[] {
  return (A.agents ?? []).filter((h) => h.installed && h.loggedIn);
}

/** The home said what it has, and nothing on it can think. */
export function noBrain(): boolean {
  const hs = A.agents ?? [];
  return hs.length > 0 && !hs.some((h) => h.installed && h.loggedIn && h.canBePartner);
}

function brainNow() {
  return A.brainNow ?? A.settings?.brain ?? { harness: "claude-code", model: "opus" };
}

function AgentTile({ harness, off = false }: { harness: string; off?: boolean }) {
  return (
    <Tile>
      <Coin harness={harness} size={40} off={off} />
    </Tile>
  );
}

const KeyMark = () => (
  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <circle cx="15" cy="20" r="5" />
      <path d="M20 20h11M27 20v4.5M30.5 20v3.5" />
    </g>
  </svg>
);

/** An agent's limit as one phrase, or "" when it says none. */
function limitWords(h: DeviceHarness | undefined, brain: boolean): string {
  const al = h?.allowance;
  if (!al) return "";
  if (brain && al.left <= PARTNER_RESERVE) return t("loadout.left.reserve", pct(al.left), A.S.personaName);
  return al.resetsAt ? t("loadout.left.back", pct(al.left), when(A.L, al.resetsAt)) : t("loadout.left", pct(al.left));
}

/** 想事情用 / What it thinks with. */
export function ThinksSection() {
  const s = A.settings;
  const [choosing, setChoosing] = useState(false);
  if (!s) return null;
  const title = t("loadout.brain.title");
  if (noBrain())
    return (
      <section class="set">
        <h3>{title}</h3>
        <Group label={title}>
          <GHead tile={null} name={t("loadout.brain.none")} line={t("loadout.brain.none.line")} />
        </Group>
      </section>
    );
  const b = brainNow();
  const h = (A.agents ?? []).find((x) => x.harness === b.harness);
  const others = readyAgents().filter((x) => x.canBePartner && x.harness !== b.harness);
  // D150: the models come from the home (settings.brainNow), never a list of the phone's own.
  const models = A.brainNow?.harness === b.harness ? A.brainNow.models : [];
  const lines: string[] = [];
  if (!models.length) lines.push(t("loadout.model.default.line"));
  // Auto: the person never chose; the setting is only Ducter's default.
  if (A.brainNow && !A.brainNow.auto && s.brain?.harness && s.brain.harness !== b.harness) lines.push(t("loadout.brain.fallback", harnessName(s.brain.harness)));
  if (h?.billing === "usage") lines.push(t("loadout.brain.key"));
  else if (h?.allowance) lines.push(h.allowance.left > PARTNER_RESERVE ? t("loadout.left.kept", pct(h.allowance.left), A.S.personaName) : limitWords(h, true));
  const setBrain = (harness: string, model?: string, label?: string) => {
    const m = model ?? (A.agents ?? []).find((x) => x.harness === harness)?.models?.[0]?.id;
    A.setSettings({ brain: { harness: harness as never, ...(m ? { model: m } : {}) } });
    say("brain", t("said.brain", label ?? harnessName(harness)));
  };
  const model = models.find((m) => m.id === b.model) ?? models[0];
  return (
    <section class="set">
      <h3>{title}</h3>
      <Group label={title}>
        <GHead tile={<AgentTile harness={b.harness} />} name={harnessName(b.harness)} line={lines.join("\n")}>
          {choosing ? (
            <Btn kind="secondary" size="sm" label={t("loadout.cancel")} onClick={() => setChoosing(false)} />
          ) : (
            others.length > 0 && <Btn kind="secondary" size="sm" label={t("loadout.switch")} about={title} onClick={() => setChoosing(true)} />
          )}
        </GHead>
        {choosing &&
          others.map((o) => (
            <GRow key={o.harness} tile={<AgentTile harness={o.harness} />} title={harnessName(o.harness)} line={o.billing === "usage" ? t("loadout.acct.paid.short") : limitWords(o, false) || undefined}>
              <Btn kind="secondary" size="sm" label={t("loadout.use")} about={harnessName(o.harness)} onClick={() => (setChoosing(false), setBrain(o.harness))} />
            </GRow>
          ))}
        {models.length > 1 && !choosing && model && (
          <GRow title={t("loadout.brain.model")} line={t(model.kind === "fast" ? "loadout.model.line.fast" : "loadout.model.line.smart", model.label || model.id)}>
            <Seg
              label={t("loadout.brain.model")}
              value={b.model}
              options={models.map((m) => ({ v: m.id, label: m.label || m.id }))}
              onPick={(m) => m !== b.model && setBrain(b.harness, m, t("loadout.brain.with", harnessName(b.harness), models.find((x) => x.id === m)?.label ?? m))}
            />
          </GRow>
        )}
        {(others.length > 0 || models.length > 1) && <GFoot note={t("loadout.brain.keep")} />}
      </Group>
      <Said k="brain" />
    </section>
  );
}

/** 做事的 / Who does the tasks. */
export function TasksSection() {
  const s = A.settings;
  if (!s) return null;
  const ready = readyAgents();
  if (!ready.length) return null; // 想事情用 already says nothing can; adding one is next
  const name = A.S.personaName;
  const title = t("loadout.tasks.title");
  const b = brainNow();
  const rules = A.rules ?? [];
  const note = ready.length === 1 ? t("loadout.tasks.only", harnessName(ready[0]!.harness)) : t("loadout.tasks.how", name);
  if (ready.length === 1 && ready[0]!.harness === b.harness && !rules.length)
    return (
      <section class="set">
        <h3>{title}</h3>
        <p class="g-note">{note}</p>
      </section>
    );
  const accounts = (s.taskAccounts ?? {}) as Record<string, { enabled: boolean }>;
  return (
    <section class="set">
      <h3>{title}</h3>
      <p class="g-note">{note}</p>
      <Group label={title}>
        {ready.map((h) => {
          const agent = harnessName(h.harness);
          const lines: string[] = [];
          if (h.billing === "usage") lines.push(t("loadout.acct.paid.short"));
          else {
            const l = limitWords(h, h.harness === b.harness);
            if (l) lines.push(l);
            if (h.allowance?.sharedBy && h.allowance.sharedBy > 1) lines.push(t("loadout.acct.shared", h.allowance.sharedBy));
          }
          if (h.harness === b.harness && h.canBePartner) lines.push(t("loadout.acct.thinks", name));
          const on = accounts[h.harness]?.enabled !== false;
          return (
            <GRow key={h.harness} tile={<AgentTile harness={h.harness} />} title={agent} line={lines.join("\n") || undefined}>
              {ready.length > 1 && (
                <Switch
                  label={`${t("loadout.acct.tasks")}, ${agent}`}
                  on={on}
                  onChange={(v) => (A.setSettings({ taskAccounts: { ...accounts, [h.harness]: { enabled: v } } }), say("tasks", t(v ? "said.tasks.on" : "said.tasks.off", agent)))}
                />
              )}
            </GRow>
          );
        })}
        {(ready.length > 1 || rules.length > 0) && (
          <>
            {rules.map((r) => (
              <GRow key={r.id} title={r.text} line={t("loadout.rule.line")}>
                <DangerButton quiet label={t("loadout.rule.remove")} about={r.text} onClick={() => (A.send({ t: "rule_remove", id: r.id }), say("tasks", t("loadout.rule.removed", r.text)))} />
              </GRow>
            ))}
            <AddRow label={t("loadout.rule.add", name)} help={t("loadout.rule.add.line")} onClick={() => A.tellRule()} />
            <GFoot note={t("loadout.tasks.override")} />
          </>
        )}
      </Group>
      <Said k="tasks" />
    </section>
  );
}

/** 再添一个 AI agent / Add another AI agent (添一个 / Add an AI agent while none is ready): the subscription agents not signed in yet and a pasted key, said once. */
export function AddSection() {
  const [open, setOpen] = useState(false);
  if (!A.settings) return null;
  const name = A.S.personaName;
  const n = readyAgents().length;
  const note = n === 0 ? t("loadout.add.none", name) : n === 1 ? t("loadout.add.one", name) : t("loadout.add.more", name);
  // Nothing to add "another" to yet: the first one is just "an AI agent".
  const title = t(n === 0 ? "loadout.add.title.first" : "loadout.add.title");
  const missing = (A.agents ?? []).filter((h) => !h.loggedIn && (h.harness === "claude-code" || h.harness === "codex"));
  return (
    <section class="set">
      <h3>{title}</h3>
      <p class="g-note">{note}</p>
      <Group label={title}>
        {missing.map((h) => {
          const agent = harnessName(h.harness);
          return (
            <GRow key={h.harness} tile={<AgentTile harness={h.harness} off />} title={agent} line={h.installed ? t("loadout.add.signin", A.homeName ?? "") : t("loadout.add.install")}>
              <Btn kind="secondary" size="sm" label={t(h.installed ? "loadout.add.signin.go" : "loadout.add.install.go")} about={agent} onClick={() => A.openSettings("devices")} />
            </GRow>
          );
        })}
        <GRow tile={<Tile mark><KeyMark /></Tile>} title={t("key.settings.row")} line={open ? undefined : t("key.paste.instead.note")}>
          {open ? <Btn kind="secondary" size="sm" label={t("key.paste.back")} onClick={() => setOpen(false)} /> : <Btn kind="secondary" size="sm" label={t("key.paste.check.open")} onClick={() => setOpen(true)} />}
        </GRow>
        {open && (
          <GBlock>
            <KeyCard inSettings />
          </GBlock>
        )}
      </Group>
    </section>
  );
}
