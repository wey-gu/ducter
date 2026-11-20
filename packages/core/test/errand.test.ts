// D436: an errand to the checkout, with fakes (no browser): the words that count as paying, the
// 去付款 card made from the tool's question (no default, ever), what the task is told on 付好了,
// 先不买 and a step's 好了, the card never answered from a chat app or by a reply, the Done for you
// line for what the person paid themselves, and needs.buy as web work.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, CheckoutAsk } from "@ducter/protocol";
import { PAYS, paysAt } from "../src/browser/tools.ts";
import { cardPolicy } from "../src/channels/hub.ts";
import { kindOf } from "../src/candidates.ts";
import { forwardText } from "../src/decisions.ts";
import { startCore } from "../src/core.ts";
import { createDid } from "../src/did.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const CHECKOUT: CheckoutAsk = { site: "kyfw.12306.cn", url: "https://kyfw.12306.cn/otn/confirmPassenger/initDc", what: "G7311 上海虹桥→杭州东 11-28 08:05 二等座", total: "73.00", currency: "CNY" };

test("the words that pay, and the ones that only open the next page", () => {
  for (const w of ["立即支付 ¥154.70", "提交订单", "确认下单", "去支付", "Pay ¥38,400", "Place your order", "Complete purchase", "Buy now", "Confirm and pay", "注文を確定する"]) expect(PAYS.test(w)).toBe(true);
  // A choice of how to pay is not a pay (server-browser-chrome.test.ts clicks "Pay with card").
  for (const w of ["去结算", "Proceed to checkout", "加入购物车", "Add to cart", "PayPal", "Payment methods", "Pay with card", "查看订单"]) expect(PAYS.test(w)).toBe(false);
  expect(paysAt({ label: "立即支付", tag: "button" })).toBe(true);
  expect(paysAt({ label: "Pay now", tag: "input", type: "submit" })).toBe(true);
  // A field whose label mentions paying is typed into, never pressed.
  expect(paysAt({ label: "付款备注", tag: "input", type: "text", field: true })).toBe(false);
  expect(paysAt({ label: "支付方式", tag: "select" })).toBe(false);
});

test("D446: a pay button with no words is still a pay: its other names, its form's address, a card in its form", () => {
  const icon = { label: "", tag: "button", type: "submit" };
  // Its names other than its text: aria-label, title, an icon's label, an image's alt.
  for (const w of ["立即支付", "Pay ¥154.70", "Place order"]) expect(paysAt({ ...icon, pay: { words: [w], submit: true } })).toBe(true);
  expect(paysAt({ ...icon, pay: { words: ["→"], submit: true } })).toBe(false);
  // A submit whose form posts to a pay address (or its own formaction).
  for (const a of ["/pay", "https://shop.example/checkout/place-order", "/order/submit_order?x=1", "/api/purchase", "/buy-now"]) expect(paysAt({ ...icon, pay: { submit: true, action: a } })).toBe(true);
  for (const a of ["/checkout", "/payment-methods", "/paypal/redirect", "/cart/add", "/search", ""]) expect(paysAt({ ...icon, pay: { submit: true, action: a } })).toBe(false);
  // A submit inside a form that holds a card's number or code.
  expect(paysAt({ ...icon, pay: { submit: true, cardForm: true } })).toBe(true);
  expect(paysAt({ label: "¥154.70", tag: "input", type: "submit", pay: { submit: true, cardForm: true } })).toBe(true);
  // Not a submit (a plain button, a link): the form says nothing about it.
  expect(paysAt({ label: "", tag: "button", type: "button", pay: { submit: false, cardForm: true, action: "/pay" } })).toBe(false);
  expect(paysAt({ label: "", tag: "a", pay: { submit: false } })).toBe(false);
  // A field in a card form is typed into, never pressed.
  expect(paysAt({ label: "卡号", tag: "input", type: "text", field: true, pay: { submit: false, cardForm: true } })).toBe(false);
});

test("the checkout question becomes one card with no default; its answers tell the task what happened", () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, browser: false });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "订去杭州的高铁", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "帮我订下周五去杭州的高铁", needs: { buy: true, browse: true } } });
  core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "needs_input", summary: "At the checkout", questions: [{ id: "checkout", text: "Ready to pay CNY 73.00 on kyfw.12306.cn", blocking: true, reversible: false, default: "anything", checkout: CHECKOUT }], evidence: [] } });
  const d = core.log.read({ fromSeq: 0, limit: 100, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).at(-1)!;
  expect(d.checkout).toMatchObject({ site: "kyfw.12306.cn", total: "73.00" });
  expect(d).toMatchObject({ defaultOption: "hold", reversible: false, goLabel: "I've paid" });
  expect(d.defaultAt).toBeUndefined();
  expect(cardPolicy(d)).toBe("never");

  const go = forwardText(d, { decisionId: d.decisionId, option: "go", by: "user" } as Bodies["decision_resolved"]);
  expect(go).toContain("paid on kyfw.12306.cn themselves");
  expect(go).toContain("never press pay");
  const hold = forwardText(d, { decisionId: d.decisionId, option: "hold", by: "user" } as Bodies["decision_resolved"]);
  expect(hold).toContain("isn't buying now");
  expect(hold).toContain("press nothing");
  const step = forwardText({ ...d, checkout: undefined, signIn: { site: "shop.example", step: "输入发到手机的验证码" } }, { decisionId: d.decisionId, option: "go", by: "user" } as Bodies["decision_resolved"]);
  expect(step).toContain("did the step on shop.example");

  // 付好了: Done for you lists what the person paid themselves; 先不买 lists nothing.
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "go", by: "user" } });
  const items = createDid({ log: core.log, tasks: core.tasks }).query({}).items.filter((i) => i.kind === "paid");
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ sub: "checkout", to: "kyfw.12306.cn", amount: "CNY 73.00", line: CHECKOUT.what, go: { by: "paid" }, where: { kind: "browser" }, taskId: "t1" });
});

test("先不买 records nothing in Done for you", () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, browser: false });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.log.append({ stream: "task:t2", origin: "partner", kind: "task_open", body: { taskId: "t2", title: "买购物车里的", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "x" } });
  core.log.append({ stream: "task:t2", origin: "task", kind: "report", body: { taskId: "t2", state: "needs_input", summary: "At the checkout", questions: [{ id: "checkout", text: "Ready to pay", blocking: true, reversible: false, checkout: CHECKOUT }], evidence: [] } });
  const d = core.log.read({ fromSeq: 0, limit: 100, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).at(-1)!;
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "hold", by: "user" } });
  expect(createDid({ log: core.log, tasks: core.tasks }).query({}).items.filter((i) => i.kind === "paid")).toHaveLength(0);
});

test("needs.buy is web work of kind errand", () => {
  expect(kindOf(undefined, { buy: true })).toBe("errand");
});
