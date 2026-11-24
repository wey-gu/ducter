// D538: 关于这台 / About this computer, on a device card. What the computer measured of itself, in
// plain words (内存 64 GB，现在空着 41 GB), and what the person said about it: their computer rules
// (多放 / 少放 this computer for heavy work, web work or all work), each changed or removed here, and
// one added here as well as by saying it. The Mac's views/aboutcomputer.go is the same.
import { useEffect, useState } from "preact/hooks";
import type { DeviceView, RuleView } from "@ducter/protocol";
import { aboutFacts, aboutSummary, rulesAbout, ruleWork } from "@ducter/protocol/src/about-computer.ts";
import { A } from "./app.ts";
import { Btn, DangerButton, Fold, Seg } from "./controls.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
type Work = "heavy" | "web" | "all";

/** A rule in literal words: 这台多放构建、测试这类重活 / More heavy work (builds, tests) here. */
export const ruleLine = (avoid: boolean, work: Work) => t(avoid ? "about.rule.less" : "about.rule.more", t(`about.rule.w.${work}`));

/** A rule being changed (rule) or added: more or less here, and which work; 算了 and 记下. */
function RuleEdit({ dv, rule, onDone }: { dv: DeviceView; rule?: RuleView; onDone: () => void }) {
  const [avoid, setAvoid] = useState(!!rule?.where?.avoid);
  const [work, setWork] = useState<Work>(rule ? ruleWork(rule) : "heavy");
  return (
    <div class="about-edit">
      {/* The rule being changed, in the person's words, so the choices read as about it. */}
      {rule && <div class="dev-site-name about-said">{rule.text}</div>}
      <Seg label={t("about.way")} value={avoid ? "less" : "more"} options={[{ v: "more", label: t("about.more") }, { v: "less", label: t("about.less") }]} onPick={(v) => setAvoid(v === "less")} />
      <Seg label={t("about.which")} value={work} options={[{ v: "heavy", label: t("about.w.heavy") }, { v: "web", label: t("about.w.web") }, { v: "all", label: t("about.w.all") }]} onPick={setWork} />
      <div class="btns">
        <Btn kind="secondary" size="sm" label={t("about.cancel")} onClick={onDone} />
        <Btn kind="primary" size="sm" label={t("about.keep")} onClick={() => (A.send({ t: "rule_where", ...(rule ? { id: rule.id } : {}), device: dv.name, avoid, work, lang: String(A.L.lang) }), onDone())} />
      </div>
    </div>
  );
}

/** One of the person's rules: their words across the row, the rule in literal words with 改 and 移除 under them. */
function RuleRow({ rule, onEdit }: { rule: RuleView; onEdit: () => void }) {
  return (
    <div class="about-rule">
      <div class="dev-site-name about-said">{rule.text}</div>
      <div class="about-rule-line">
        <span class="small">{ruleLine(!!rule.where?.avoid, ruleWork(rule))}</span>
        <Btn kind="text" size="sm" label={t("about.edit")} about={rule.text} onClick={onEdit} />
        <DangerButton quiet label={t("about.remove")} about={rule.text} onClick={() => A.send({ t: "rule_remove", id: rule.id })} />
      </div>
      {rule.where?.mem && <div class="small about-mem">{t("about.inmem")}</div>}
    </div>
  );
}

/** Asks for the rules frame once the fold is open (this socket keeps them fresh once it asked). */
function AskRules() {
  useEffect(() => A.send({ t: "rules" }), []);
  return null;
}

export function AboutComputer({ dv }: { dv: DeviceView }) {
  // One edit at a time: a rule's id, or "+" for a new one.
  const [edit, setEdit] = useState<string | null>(null);
  const facts = aboutFacts(dv);
  const mine = rulesAbout(A.rules ?? [], dv);
  const sum = aboutSummary(dv);
  return (
    <Fold title={t("about.title")} summary={sum ? t(sum.key, ...sum.args) : ""}>
      <AskRules />
      <div class="about">
        {facts.length > 0 && (
          <div class="about-group">
            <div class="dev-sub">{t("about.measured")}</div>
            <ul class="about-facts">
              {facts.map((f) => (
                <li key={f.key}>{t(f.key, ...f.args)}</li>
              ))}
            </ul>
          </div>
        )}
        <div class="about-group">
          <div class="dev-sub">{t("about.said")}</div>
          {!mine.length && edit !== "+" && <div class="small">{t("about.none")}</div>}
          {mine.map((r) => (edit === r.id ? <RuleEdit key={r.id} dv={dv} rule={r} onDone={() => setEdit(null)} /> : <RuleRow key={r.id} rule={r} onEdit={() => setEdit(r.id)} />))}
          {edit === "+" && <RuleEdit dv={dv} onDone={() => setEdit(null)} />}
          {edit === null && <Btn kind="secondary" size="sm" grow label={t("about.add")} onClick={() => setEdit("+")} />}
        </div>
      </div>
    </Fold>
  );
}
