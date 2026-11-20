// D436: a small local shop for the errand to the checkout (research/185). Served on 127.0.0.1 by
// a test or a demo; never a real shop. Search, a product page, a cart, an optional "are you a
// person" step, a checkout with the buyer's details and a pay button that records every press.
// The cart lives in the server (one buyer); `reset()` empties it.
export interface ShopItem {
  id: string;
  name: string;
  price: number; // CNY
  blurb: string;
}

export interface FixtureShop {
  url: string;
  port: number;
  /** Every press of the pay button, with the form it sent. */
  presses: Record<string, string>[];
  cart: string[];
  verified: boolean;
  reset(): void;
  stop(): void;
}

const ITEMS: Record<"zh" | "en", ShopItem[]> = {
  zh: [
    { id: "cable", name: "USB-C 数据线 1.8 米", price: 39.9, blurb: "编织线身，100 W 快充" },
    { id: "beans", name: "云南小粒咖啡豆 500 g", price: 89, blurb: "中度烘焙，下单当天烘" },
    { id: "notebook", name: "A5 方格笔记本 3 本装", price: 25.8, blurb: "80 页，平摊不回弹" },
    { id: "mug", name: "双层玻璃杯 350 ml", price: 45, blurb: "隔热，不烫手" },
  ],
  en: [
    { id: "cable", name: "USB-C cable, 1.8 m", price: 39.9, blurb: "Braided, 100 W charging" },
    { id: "beans", name: "Yunnan coffee beans, 500 g", price: 89, blurb: "Medium roast, roasted the day you order" },
    { id: "notebook", name: "A5 grid notebooks, pack of 3", price: 25.8, blurb: "80 pages, lies flat" },
    { id: "mug", name: "Double-wall glass, 350 ml", price: 45, blurb: "Keeps the heat in" },
  ],
};

const W = {
  zh: { shop: "鹅卵石小铺", search: "搜索", searchPh: "搜商品", results: "搜到 {n} 样", add: "加入购物车", added: "已加入购物车", cart: "购物车", checkout: "去结算", empty: "购物车是空的", total: "合计", buyer: "收货人", phone: "手机号", addr: "收货地址", addrValue: "上海市徐汇区漕溪北路 88 号 12 楼", cardNo: "卡号", cardCode: "安全码", pay: "立即支付", verifyTitle: "请先完成安全验证", verifyBody: "为了确认是你本人在下单，请点一下下面的按钮。", verifyBtn: "我不是机器人", paid: "支付成功", order: "订单号", ship: "预计 11 月 24 日送达" },
  en: { shop: "Pebble Market", search: "Search", searchPh: "Search the shop", results: "{n} found", add: "Add to cart", added: "Added to your cart", cart: "Cart", checkout: "Checkout", empty: "Your cart is empty", total: "Total", buyer: "Name", phone: "Phone", addr: "Delivery address", addrValue: "12F, 88 Caoxi North Rd, Xuhui, Shanghai", cardNo: "Card number", cardCode: "Security code", pay: "Pay", verifyTitle: "Quick security check", verifyBody: "To make sure it's really you placing this order, tap the button below.", verifyBtn: "I'm not a robot", paid: "Payment received", order: "Order", ship: "Arrives Nov 24" },
};

const yuan = (n: number) => `¥${n.toFixed(2)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * `pay: "icon"` (D446): the checkout posts to /order and asks for a card (number and code, never
 * filled by a test), and its pay button is an arrow with no words at all, as some shops draw it.
 */
export function startFixtureShop(o: { lang?: "zh" | "en"; verify?: boolean; hostname?: string; tls?: { cert: string; key: string }; pay?: "words" | "icon" } = {}): FixtureShop {
  const lang = o.lang ?? "zh";
  const w = W[lang];
  const items = ITEMS[lang];
  const state = { cart: [] as string[], presses: [] as Record<string, string>[], verified: !o.verify };
  const byId = (id: string) => items.find((i) => i.id === id);
  const total = () => state.cart.reduce((s, id) => s + (byId(id)?.price ?? 0), 0);

  const page = (title: string, body: string) =>
    new Response(
      `<!doctype html><html lang="${lang === "zh" ? "zh-CN" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · ${w.shop}</title>
<style>
body{font:15px/1.55 -apple-system,"PingFang SC",system-ui,sans-serif;margin:0;background:#f6f4ef;color:#22201c}
header{display:flex;gap:16px;align-items:center;padding:14px 22px;background:#fff;border-bottom:1px solid #e7e2d8}
header a{color:#22201c;text-decoration:none}.logo{font-weight:800;color:#a2542c;letter-spacing:.3px}
header form{flex:1;display:flex;gap:8px}header input{flex:1;font:inherit;padding:8px 12px;border:1px solid #d9d2c4;border-radius:8px}
main{max-width:720px;margin:24px auto;padding:0 18px}h1{font-size:22px;margin:0 0 14px}
.card{background:#fff;border:1px solid #e7e2d8;border-radius:12px;padding:16px 18px;margin:0 0 12px}
.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.muted{color:#7a7266}
button,.btn{font:inherit;font-weight:700;padding:10px 18px;border:0;border-radius:9px;background:#a2542c;color:#fff;text-decoration:none;display:inline-block;cursor:pointer}
.ghost{background:#efe9de;color:#22201c}label{display:block;font-weight:600;margin:12px 0 6px}
input.f{box-sizing:border-box;width:100%;font:inherit;padding:9px 12px;border:1px solid #d9d2c4;border-radius:8px}
.total{font-size:20px;font-weight:800}
</style>
<header><a class="logo" href="/">${w.shop}</a><form action="/search"><input name="q" placeholder="${w.searchPh}" aria-label="${w.searchPh}"><button class="ghost" type="submit">${w.search}</button></form><a href="/cart">${w.cart} (${state.cart.length})</a></header>
<main>${body}</main></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  const go = (to: string) => new Response(null, { status: 303, headers: { Location: to } });

  const server = Bun.serve({
    port: 0,
    hostname: o.hostname ?? "127.0.0.1",
    ...(o.tls ? { tls: o.tls } : {}),
    async fetch(req) {
      const u = new URL(req.url);
      const p = u.pathname;
      if (p === "/search") {
        const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
        const hits = items.filter((i) => !q || i.name.toLowerCase().includes(q) || q.split(/\s+/).some((x) => x && i.name.toLowerCase().includes(x)));
        return page(w.search, `<h1>${w.results.replace("{n}", String(hits.length))}</h1>${hits.map((i) => `<div class="card row"><div><a href="/p/${i.id}">${esc(i.name)}</a><div class="muted">${esc(i.blurb)}</div></div><div>${yuan(i.price)}</div></div>`).join("")}`);
      }
      const m = /^\/p\/([a-z]+)$/.exec(p);
      if (m) {
        const i = byId(m[1]!);
        if (!i) return new Response("not found", { status: 404 });
        const added = u.searchParams.get("added") === "1";
        return page(i.name, `<div class="card"><h1>${esc(i.name)}</h1><p class="muted">${esc(i.blurb)}</p><p class="total">${yuan(i.price)}</p>${added ? `<p>${w.added}</p>` : ""}<form method="post" action="/cart/add"><input type="hidden" name="id" value="${i.id}"><button type="submit">${w.add}</button></form></div>`);
      }
      if (p === "/cart/add" && req.method === "POST") {
        const id = String((await req.formData()).get("id") ?? "");
        if (byId(id)) state.cart.push(id);
        return go(`/p/${id}?added=1`);
      }
      if (p === "/cart") {
        if (!state.cart.length) return page(w.cart, `<h1>${w.cart}</h1><p class="muted">${w.empty}</p>`);
        return page(w.cart, `<h1>${w.cart}</h1>${state.cart.map((id) => `<div class="card row"><span>${esc(byId(id)!.name)}</span><span>${yuan(byId(id)!.price)}</span></div>`).join("")}<div class="row"><span class="total">${w.total} ${yuan(total())}</span><a class="btn" href="/checkout">${w.checkout}</a></div>`);
      }
      if (p === "/verify" && req.method === "POST") {
        state.verified = true;
        return go("/checkout");
      }
      if (p === "/verify") return page(w.verifyTitle, `<div class="card"><h1>${w.verifyTitle}</h1><p class="muted">${w.verifyBody}</p><form method="post" action="/verify"><button type="submit">${w.verifyBtn}</button></form></div>`);
      if (p === "/checkout") {
        if (!state.verified) return go("/verify");
        return page(
          w.checkout,
          `<h1>${w.checkout}</h1><div class="card">${state.cart.map((id) => `<div class="row"><span>${esc(byId(id)!.name)}</span><span>${yuan(byId(id)!.price)}</span></div>`).join("")}</div>
<form class="card" method="post" action="${o.pay === "icon" ? "/order" : "/pay"}">
<label for="buyer">${w.buyer}</label><input class="f" id="buyer" name="buyer" autocomplete="name">
<label for="tel">${w.phone}</label><input class="f" id="tel" name="tel" autocomplete="tel" inputmode="tel">
<label>${w.addr}</label><div class="muted">${w.addrValue}</div>
${o.pay === "icon" ? `<label for="cc">${w.cardNo}</label><input class="f" id="cc" name="cc" autocomplete="cc-number" inputmode="numeric"><label for="csc">${w.cardCode}</label><input class="f" id="csc" name="csc" autocomplete="cc-csc" inputmode="numeric">` : ""}
<div class="row" style="margin-top:16px"><span class="total">${w.total} ${yuan(total())}</span>${o.pay === "icon" ? `<button id="go" type="submit"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : `<button type="submit">${w.pay} ${yuan(total())}</button>`}</div>
</form>`,
        );
      }
      if ((p === "/pay" || p === "/order") && req.method === "POST") {
        state.presses.push(Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)])));
        return page(w.paid, `<div class="card"><h1>${w.paid}</h1><p>${w.order} EM-20261121-0042</p><p>${w.total} ${yuan(total())}</p><p class="muted">${w.ship}</p></div>`);
      }
      return page(w.shop, `<h1>${w.shop}</h1>${items.map((i) => `<p><a href="/p/${i.id}">${esc(i.name)}</a></p>`).join("")}`);
    },
  });
  return {
    url: `${o.tls ? "https" : "http"}://${o.hostname ?? "127.0.0.1"}:${server.port}`,
    port: server.port as number,
    get presses() {
      return state.presses;
    },
    get cart() {
      return state.cart;
    },
    get verified() {
      return state.verified;
    },
    reset() {
      state.cart = [];
      state.presses = [];
      state.verified = !o.verify;
    },
    stop: () => server.stop(true),
  };
}
