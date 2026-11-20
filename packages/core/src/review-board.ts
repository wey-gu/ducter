// D407: 审查看板 / Review board (design/apps.md "A routine fills an app"). The small app Ducter makes
// from this template when the person says Go on the offer (or the partner makes one for a review
// task without writing its own file): every pull request waiting on the person, as the review
// task's last round saw it, each with its checks, what the review found and its draft's state.
// Its one key, "board" (ReviewBoard), is written by the home from review_report and the drafts'
// state, the same state the Ongoing card's line reads: one truth, two views. 看草稿 / Read draft
// opens that PR's draft sheet over the app (ducter.open); nothing here sends anything.
// One file in both languages (ducter.lang), Pebble's tokens, 360 px wide first.

export const REVIEW_BOARD_NAME = { zh: "审查看板", en: "Review board" } as const;

export const REVIEW_BOARD_HTML = `<style>
*{box-sizing:border-box}
body{padding:18px 16px 28px;line-height:1.45}
.wrap{max-width:860px;margin:0 auto}
.stand{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;margin:0 0 4px}
.big{font-size:34px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.what{font-size:15px;color:var(--d-soft);font-weight:600}
.when{font-size:13px;color:var(--d-muted);margin:2px 0 14px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.chip{font:inherit;font-size:14px;font-weight:700;border:0;border-radius:999px;padding:7px 14px;background:var(--d-sunken);color:var(--d-soft);cursor:pointer;min-height:36px}
.chip[aria-pressed=true]{background:var(--d-ink);color:var(--d-bg)}
.chip .n{font-variant-numeric:tabular-nums;opacity:.7;margin-inline-start:6px}
.list{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:760px){.list{grid-template-columns:1fr 1fr}}
.pr{background:var(--d-card);border-radius:var(--d-radius);padding:14px 14px 12px;box-shadow:0 2px 0 var(--d-line);display:flex;flex-direction:column;gap:8px;min-width:0}
.pr.draft{box-shadow:0 2px 0 var(--d-accent),inset 0 0 0 1.5px var(--d-accent)}
.top{display:flex;align-items:center;gap:8px;min-width:0}
.repo{font-family:var(--d-mono);font-size:12.5px;color:var(--d-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.repo b{color:var(--d-soft);font-weight:700}
.ci{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;border-radius:999px;padding:3px 10px 3px 8px;white-space:nowrap;flex:none}
.ci i{width:8px;height:8px;border-radius:50%;display:inline-block;background:currentColor}
.ci.passing{background:var(--d-good-bg);color:var(--d-good)}
.ci.failing{background:var(--d-bad-bg);color:var(--d-bad)}
.ci.pending{background:var(--d-sunken);color:var(--d-muted)}
.ci.pending i{background:none;border:2px solid currentColor;border-right-color:transparent;animation:spin 1.1s linear infinite;width:9px;height:9px}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ci.pending i{animation:none}}
.title{font-size:16px;font-weight:750;margin:0;line-height:1.3;overflow-wrap:anywhere}
.gist{font-size:14px;color:var(--d-soft);margin:0}
.found{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:12.5px;font-weight:700;border-radius:8px;padding:3px 8px;background:var(--d-sunken);color:var(--d-soft)}
.tag.bad{background:var(--d-bad-bg);color:var(--d-bad)}
.tag.new{background:var(--d-highlight);color:var(--d-ink)}
.tag.quiet{color:var(--d-muted)}
.foot{display:flex;align-items:center;gap:10px;margin-top:2px;min-width:0}
.head{font-family:var(--d-mono);font-size:12px;color:var(--d-muted);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.state{font-size:13px;font-weight:700;white-space:nowrap}
.state.sent{color:var(--d-good)}
.state.drafted{color:var(--d-accent)}
.go{font:inherit;font-size:14px;font-weight:800;border:0;border-radius:12px;padding:8px 14px;min-height:38px;cursor:pointer;background:var(--d-sunken);color:var(--d-ink);white-space:nowrap}
.go.primary{background:var(--d-accent);color:var(--d-on-accent);box-shadow:0 2px 0 rgba(0,0,0,.18)}
.go:active{transform:translateY(1px)}
.none{background:var(--d-card);border-radius:var(--d-radius);padding:28px 18px;text-align:center;color:var(--d-soft)}
.note{font-size:13px;color:var(--d-muted);margin:18px 2px 0;text-align:center}
</style>
<div class="wrap">
  <div class="stand" id="stand"></div>
  <div class="when" id="when"></div>
  <div class="chips" id="chips" role="group"></div>
  <div class="list" id="list"></div>
  <p class="note" id="note"></p>
</div>
<script>
(function () {
  var zh = String(ducter.lang || "").indexOf("zh") === 0;
  var W = zh
    ? { waiting: "个 PR 在等你", none: "没有在等你的 PR。", wait: "还没看过一轮。下一轮看完，这里就有了。", drafted: function (n) { return n + " 份草稿没发"; }, again: function (n) { return n + " 个有新提交，复审了"; }, all: "全部", hasDraft: "有草稿", ciBad: "CI 没过", passing: "CI 通过", failing: "CI 没过", pending: "CI 在跑", problems: function (n) { return n + " 个问题"; }, suggestions: function (n) { return n + " 条建议"; }, clean: "没发现问题", unread: "没有新提交", changed: "有新提交", head: function (h) { return "看的是 " + h; }, sent: "已发到 GitHub", waitingGo: "等你说好", read: "看草稿", round: function (w) { return "上一轮：" + w; }, now: "刚刚", min: function (n) { return n + " 分钟前"; }, hour: function (n) { return n + " 小时前"; }, day: function (n) { return n + " 天前"; }, note: "草稿要你说好才会发到 GitHub。", empty: "这一类现在没有。" }
    : { waiting: "PRs wait on you", one: "PR waits on you", none: "No PRs wait on you.", wait: "No round yet. After the next one, they show here.", drafted: function (n) { return n === 1 ? "1 draft not sent" : n + " drafts not sent"; }, again: function (n) { return n + " with new commits, reviewed again"; }, all: "All", hasDraft: "Drafts", ciBad: "CI failing", passing: "CI passing", failing: "CI failing", pending: "CI running", problems: function (n) { return n === 1 ? "1 problem" : n + " problems"; }, suggestions: function (n) { return n === 1 ? "1 suggestion" : n + " suggestions"; }, clean: "No problems found", unread: "No new commits", changed: "New commits", head: function (h) { return "Looked at " + h; }, sent: "Posted to GitHub", waitingGo: "Waits for your Go", read: "Read draft", round: function (w) { return "Last round: " + w; }, now: "just now", min: function (n) { return n + " min ago"; }, hour: function (n) { return n === 1 ? "1 hour ago" : n + " hours ago"; }, day: function (n) { return n === 1 ? "1 day ago" : n + " days ago"; }, note: "A draft goes to GitHub only after your Go.", empty: "None of these right now." };
  var filter = "all";
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(iso) {
    var t = Date.parse(iso || ""); if (!t) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? W.now : m < 60 ? W.min(m) : m < 48 * 60 ? W.hour(Math.round(m / 60)) : W.day(Math.round(m / 1440));
  }
  function rank(p) { return p.draft === "drafted" ? 0 : p.ci === "failing" ? 1 : p.changed ? 2 : 3; }
  function num(ref) { return Number(String(ref).split("#")[1] || 0); }
  function card(p) {
    var c = el("article", "pr" + (p.draft === "drafted" ? " draft" : ""));
    var repo = String(p.ref).split("#")[0], parts = repo.split("/");
    var top = el("div", "top");
    var r = el("span", "repo"); r.appendChild(document.createTextNode((parts[0] || "") + "/")); r.appendChild(el("b", null, parts[1] || "")); r.appendChild(document.createTextNode(" #" + num(p.ref)));
    top.appendChild(r);
    if (p.ci && p.ci !== "none") { var ci = el("span", "ci " + p.ci); ci.appendChild(el("i")); ci.appendChild(document.createTextNode(W[p.ci])); top.appendChild(ci); }
    c.appendChild(top);
    c.appendChild(el("h2", "title", p.title || p.ref));
    if (p.gist) c.appendChild(el("p", "gist", p.gist));
    var f = el("div", "found");
    if (p.changed) f.appendChild(el("span", "tag new", W.changed));
    if (p.draft !== "none") {
      if (p.problems) f.appendChild(el("span", "tag bad", W.problems(p.problems)));
      if (p.suggestions) f.appendChild(el("span", "tag", W.suggestions(p.suggestions)));
      if (!p.problems && !p.suggestions) f.appendChild(el("span", "tag", W.clean));
    } else if (!p.changed) f.appendChild(el("span", "tag quiet", W.unread));
    if (f.childNodes.length) c.appendChild(f);
    var foot = el("div", "foot");
    foot.appendChild(el("span", "head", p.head ? W.head(p.head) : ""));
    if (p.draft === "sent") foot.appendChild(el("span", "state sent", W.sent));
    if (p.draft === "drafted") foot.appendChild(el("span", "state drafted", W.waitingGo));
    if (p.draft !== "none") {
      var b = el("button", "go" + (p.draft === "drafted" ? " primary" : ""), W.read);
      b.type = "button";
      b.setAttribute("aria-label", W.read + " " + (p.title || p.ref));
      b.addEventListener("click", function () { ducter.open({ draft: p.ref }); });
      foot.appendChild(b);
    }
    c.appendChild(foot);
    return c;
  }
  function draw() {
    var B = ducter.get("board");
    var stand = document.getElementById("stand"), when = document.getElementById("when"), chips = document.getElementById("chips"), list = document.getElementById("list");
    stand.textContent = ""; when.textContent = ""; chips.textContent = ""; list.textContent = "";
    document.getElementById("note").textContent = B && B.prs && B.prs.length ? W.note : "";
    if (!B) { list.appendChild(el("div", "none", W.wait)); return; }
    var prs = (B.prs || []).slice().sort(function (a, b) { return rank(a) - rank(b) || num(b.ref) - num(a.ref); });
    if (!prs.length) { list.appendChild(el("div", "none", W.none)); when.textContent = W.round(ago(B.at)); return; }
    stand.appendChild(el("span", "big", String(prs.length)));
    stand.appendChild(el("span", "what", !zh && prs.length === 1 ? W.one : W.waiting));
    when.textContent = W.round(ago(B.at));
    var drafts = prs.filter(function (p) { return p.draft === "drafted"; }).length;
    var bad = prs.filter(function (p) { return p.ci === "failing"; }).length;
    [["all", W.all, prs.length], ["draft", W.hasDraft, drafts], ["ci", W.ciBad, bad]].forEach(function (x) {
      if (x[0] !== "all" && !x[2]) return;
      var b = el("button", "chip"); b.type = "button";
      b.setAttribute("aria-pressed", String(filter === x[0]));
      b.appendChild(document.createTextNode(x[1])); b.appendChild(el("span", "n", String(x[2])));
      b.addEventListener("click", function () { filter = x[0]; draw(); });
      chips.appendChild(b);
    });
    var shown = prs.filter(function (p) { return filter === "draft" ? p.draft === "drafted" : filter === "ci" ? p.ci === "failing" : true; });
    if (!shown.length) list.appendChild(el("div", "none", W.empty));
    shown.forEach(function (p) { list.appendChild(card(p)); });
  }
  ducter.onChange(function (k) { if (k === "board") draw(); });
  setInterval(draw, 60000);
  draw();
})();
</script>`;
