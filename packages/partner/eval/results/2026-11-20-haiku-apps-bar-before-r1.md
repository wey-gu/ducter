# Partner eval · 2026-11-20 · claude-code · haiku · apps-bar-before-r1

Pass: **3/6** (50%). Judge: haiku. Persona: 27942 chars (≈8732 tokens).
Tokens (partner): in 534023, out 24097, cache read 489571, cache write 44428 → ≈$0.02 at list price; judge $0.005.

| Category | Pass |
|---|---|
| apps | 3/6 |

| Scenario | Lang | Result | Reason |
|---|---|---|---|
| app-make-zh | zh | pass | judge: The partner made the app itself with a short pre-line and a one-line done message, and the card goes under it. The file keys its data through ducter.get/ducter.set, lists costs by day with a total, makes no network calls, and is in Chinese. The done message runs slightly long with a feature gloss and an offer, but it asks no questions and opens no task. |
| app-habit-en | en | pass | judge: The partner built the app immediately with the app tool and gave one short English line describing it, with the card below. The visible file shows the three habits, tick buttons, streaks, and ducter.get/onChange. The ducter.set call sits in the truncated part, so it can't be confirmed, but nothing suggests a failure. No code was pasted, no task was opened, and no question was asked first. |
| app-trip-known-zh | zh | **fail** | judge: The app is correctly named, uses Ducter's kit with no native inputs, shows the total at top, and marks the train and hotel as from bookings. But the message runs to two sentences and the second describes features ('以后吃饭、打车都可以直接记一笔，自动加总'), which the rubric says the one short line must not do. |
| app-generic-en | en | **fail** | judge: The app is built with the app tool, in English, with a top total, Ducter-style chips instead of a select, and an empty list with no invented costs. But the message breaks the rubric by listing the features ('an add form with categories, a by-category breakdown, and a recent list you can delete from'), which the rubric forbids. |
| app-baby-zh | zh | pass | judge: The app opens with the 210 ml total at the top, the two real feeds are preloaded, and entry is a prefilled time plus a ml field and one button, with no native date/time/number inputs. The Chinese reply says it's ready and today's two feeds are in, with no code and no task. The one weakness is a second sentence explaining how to use it, which is slightly over the one-short-line target but not a feature list. |
| app-prs-known-en | en | **fail** | judge: The partner's line is short, in English, and names the four PRs with a tick for each, and the app data has the right waits and count. But the visible app card dumps the page's full CSS/HTML/JS source (2360 characters) to the user, which breaks the rubric's 'no code' requirement. |

## Transcripts

### app-make-zh

```
--- step 1: user says: 给我做个小应用，记一下这趟北京出差的花销，按天列，带个合计
  [partner message] 我来做一个北京出差花销的小应用，按天记，底下带合计。
  [partner message] 做好了，每笔记在对应那天下面，底下自动加总。还没有任何花销，你告诉我金额和用途，我帮你记上。
  [an app card under the message: made "北京出差花销", with Open] the app's file now (v1, 4835 characters): <main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">北京出差 · 花销合计</div>
    <div class="k-sum-value" id="total">¥0.00</div>
    <div class="k-sum-sub" id="sub">还没有记录</div>
  </div>

  <div class="k-card">
    <div class="k-chips" id="days"></div>
    <div class="k-field">
      <label>金额（元）</label>
      <input class="k-num" id="amt" inputmode="decimal" placeholder="0.00">
    </div>
    <div class="k-field">
      <label>用途</label>
      <input class="k-input" id="note" placeholder="例如 午饭、打车、酒店">
    </div>
    <button class="k-btn primary" id="add">记一笔</button>
    <button class="k-btn" id="addday">+ 加一天</button>
  </div>

  <div id="list"></div>
</main>
<style>
  .k-del { padding: 2px 10px; font-size: 13px; margin-left: 8px; }
  .k-dayhead { display: flex; justify-content: space-between; align-items: baseline; }
  .k-daysum { color: var(--d-muted); font-variant-numeric: tabular-nums; }
  .k-rowright { display: flex; align-items: center; }
</style>
<script>
  var DAYS_CN = ['周日','周一','周二','周三','周四','周五','周六'];
  var st = { days: ['2026-11-20'], items: [], day: '2026-11-20' };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.g … ion (e) {
    var t = e.target;
    if (t.dataset && t.dataset.day) { st.day = t.dataset.day; save(); render(); return; }
    if (t.dataset && t.dataset.del) {
      st.items = st.items.filter(function (i) { return i.id !== t.dataset.del; });
      save(); render(); return;
    }
    if (t.id === 'add') {
      var v = parseFloat(document.getElementById('amt').value);
      if (!(v > 0)) { document.getElementById('amt').focus(); return; }
      var note = document.getElementById('note').value.trim();
      st.items.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        day: st.day,
        note: note,
        amount: Math.round(v * 100) / 100
      });
      document.getElementById('amt').value = '';
      document.getElementById('note').value = '';
      save(); render(); return;
    }
    if (t.id === 'addday') {
      var d = parse(st.days[st.days.length - 1]);
      d.setDate(d.getDate() + 1);
      st.days.push(iso(d));
      st.day = iso(d);
      save(); render(); return;
    }
  });

  render();
  Promise.resolve(ducter.get('trip')).then(load);
  ducter.onChange(function () { Promise.resolve(ducter.get('trip')).then(load); });
</script>; its data now (what it opens with): {}
  [also used tools] app
```

### app-habit-en

```
--- step 1: user says: make me a little habit tracker: reading, a run, no phone after 11. I want to tick days off and see my streaks
  [partner message] Done: a habit tracker for reading, running and no phone after 11, with a tick per day and your current and best streaks. Its card is below.
  [an app card under the message: made "Habits: reading, run, no phone after 11", with Open] the app's file now (v1, 5231 characters): <main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">Today</div>
    <div class="k-sum-value" id="sumVal">0 / 3</div>
    <div class="k-sum-sub" id="sumSub">Tick what you did today</div>
  </div>

  <div class="k-h">Today</div>
  <div class="k-card">
    <div class="k-list" id="list"></div>
  </div>

  <div class="k-h">Last 14 days</div>
  <div class="k-card" id="grid"></div>
</main>

<style>
  .k-row { align-items: center; }
  .k-tick {
    min-width: 56px; height: 40px; border-radius: 999px;
    border: 1px solid var(--d-line); background: var(--d-sunken);
    color: var(--d-muted); font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .k-tick[aria-pressed="true"] { background: var(--d-good); border-color: var(--d-good); color: #fff; }
  .k-streak { font-size: 12px; color: var(--d-muted); margin-top: 2px; }
  .g-row { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
  .g-name { width: 92px; font-size: 13px; color: var(--d-soft); flex: none; }
  .g-cells { display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px; flex: 1; }
  .g-cell { aspect-ratio: 1; border-radius: 4px; background: var(--d-sunken); border: 1px solid var(--d-line); }
  … k what you did today';

    var grid = document.getElementById('grid');
    var html = '';
    HABITS.forEach(function (h) {
      html += '<div class="g-row"><div class="g-name">' + h.name + '</div><div class="g-cells">';
      for (var i = DAYS - 1; i >= 0; i--) {
        var day = addDays(t, -i);
        html += '<div class="g-cell' + (doneOn(h.id, day) ? ' on' : '') + (i === 0 ? ' now' : '') + '" title="' + day + '"></div>';
      }
      html += '</div></div>';
    });
    html += '<div class="g-days"><span>' + addDays(t, -(DAYS - 1)).slice(5) + '</span><span>today</span></div>';
    grid.innerHTML = html;

    var summary = doneCount + '/' + HABITS.length + ' today';
    var best = Math.max.apply(null, HABITS.map(function (h) { return currentStreak(h.id); }));
    ducter.summary(summary + ' · best current streak ' + best);
  }

  function load(v) {
    state = (v && typeof v === 'object') ? v : {};
    render();
  }

  var got = ducter.get('habits');
  if (got && typeof got.then === 'function') got.then(load); else load(got);
  ducter.onChange(function () {
    var g = ducter.get('habits');
    if (g && typeof g.then === 'function') g.then(load); else load(g);
  });
</script>; its data now (what it opens with): {}
  [also used tools] app
```

### app-trip-known-zh

```
(earlier) partner: 早上好。今天 09:00 agibar 分享（北京）。
(earlier) user: 帮我订明天去北京的高铁，再订两晚酒店，离 agibar 近一点
(earlier) partner: 订好了：11/20 G1 07:00 上海虹桥到北京南，¥662；亚朵酒店（望京）11/20 和 11/21 两晚，¥1,036。
--- step 1: user says: 给我做个小应用，记一下出差花销
  [partner message] 做好了，11/20 的高铁和两晚酒店已经从你的预订里填进去了。以后出差的吃饭、打车都可以直接记一笔，自动加总。
  [an app card under the message: made "北京出差 11/20–21", with Open] the app's file now (v1, 2774 characters): <main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">出差花销合计</div>
    <div class="k-sum-value" id="total">¥0</div>
    <div class="k-sum-sub" id="count">还没有记录</div>
  </div>
  <h2 class="k-h">花销记录</h2>
  <div class="k-card">
    <ul class="k-list" id="list"></ul>
    <div class="k-empty" id="empty" hidden>还没有记录</div>
  </div>
  <div class="k-card">
    <div class="k-field"><label for="name">项目</label><input class="k-input" id="name" placeholder="比如：午饭"></div>
    <div class="k-field"><label for="amt">金额（元）</label><input class="k-num" id="amt" inputmode="decimal" placeholder="0"></div>
    <button class="k-btn primary" id="add">记一笔</button>
  </div>
</main>
<script>
const KEY = 'items';
let items = [];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmt(n) {
  return Number(n).toLocaleString('zh-CN', {minimumFractionDigits: 0, maximumFractionDigits: 2});
}
function render() {
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  list.innerHTML = items.map((it, i) =>
    '<li class="k-row">' +
      '<div class="k-row-main">' + …  0);
  document.getElementById('total').textContent = '¥' + fmt(total);
  document.getElementById('count').textContent = items.length ? items.length + ' 笔' : '还没有记录';
  ducter.summary(items.length ? items.length + ' 笔,合计 ¥' + fmt(total) : '还没有记录');
}
function save() {
  ducter.set(KEY, items);
  render();
}
Promise.resolve(ducter.get(KEY)).then(v => { items = Array.isArray(v) ? v : []; render(); });
ducter.onChange(() => {
  Promise.resolve(ducter.get(KEY)).then(v => { items = Array.isArray(v) ? v : []; render(); });
});

document.getElementById('add').addEventListener('click', () => {
  const name = document.getElementById('name').value.trim();
  const amount = parseFloat(document.getElementById('amt').value);
  if (!name || !(amount > 0)) return;
  const date = new Date().toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'});
  items.push({name, amount, date, from: '手动记录'});
  document.getElementById('name').value = '';
  document.getElementById('amt').value = '';
  save();
});

document.getElementById('list').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  items.splice(Number(b.dataset.i), 1);
  save();
});
</script>; its data now (what it opens with): {"items":[{"name":"高铁 G1 上海虹桥→北京南","amount":662,"date":"11/20","from":"你的预订"},{"name":"亚朵酒店（望京）2 晚","amount":1036,"date":"11/20–21","from":"你的预订"}]}
  [also used tools] app
```

### app-generic-en

```
--- step 1: user says: make me a little app to keep track of what I spend
  [partner message] Done: a Spending app with a total, an add form with categories, a by-category breakdown, and a recent list you can delete from. It's empty for now, so add your first expense whenever you're ready.
  [an app card under the message: made "Spending", with Open] the app's file now (v1, 4134 characters): <main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">Total spent</div>
    <div class="k-sum-value" id="total">$0.00</div>
    <div class="k-sum-sub" id="sub">No expenses yet</div>
  </div>

  <div class="k-card">
    <div class="k-h">Add expense</div>
    <div class="k-field">
      <label for="amt">Amount</label>
      <input class="k-num" id="amt" inputmode="decimal" placeholder="0.00">
    </div>
    <div class="k-field">
      <label for="note">Note</label>
      <input class="k-input" id="note" placeholder="Coffee, rent, taxi…">
    </div>
    <div class="k-chips" id="cats"></div>
    <div style="height:12px"></div>
    <button class="k-btn primary" id="add">Add</button>
  </div>

  <div class="k-card">
    <div class="k-h">By category</div>
    <div class="k-list" id="bycat"></div>
  </div>

  <div class="k-card">
    <div class="k-h">Recent</div>
    <div class="k-list" id="list"></div>
  </div>
</main>

<script>
(function () {
  var cats = ['Food', 'Transport', 'Home', 'Fun', 'Other'];
  var sel = 'Food';
  var items = [];

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, funct … + items.length + (items.length === 1 ? ' item' : ' items'));
  }

  function save() {
    ducter.set('expenses', items);
    render();
  }

  function load() {
    Promise.resolve(ducter.get('expenses')).then(function (v) {
      items = Array.isArray(v) ? v : [];
      render();
    });
  }

  $('cats').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-cat]');
    if (!b) return;
    sel = b.getAttribute('data-cat');
    renderChips();
  });

  $('add').addEventListener('click', function () {
    var amt = parseFloat($('amt').value);
    if (!(amt > 0)) { $('amt').focus(); return; }
    items.unshift({
      id: Date.now(),
      amt: Math.round(amt * 100) / 100,
      cat: sel,
      note: $('note').value.trim(),
      date: new Date().toISOString().slice(0, 10)
    });
    $('amt').value = '';
    $('note').value = '';
    save();
  });

  $('list').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-del]');
    if (!b) return;
    var id = Number(b.getAttribute('data-del'));
    items = items.filter(function (e) { return e.id !== id; });
    save();
  });

  ducter.onChange(load);
  renderChips();
  load();
})();
</script>; its data now (what it opens with): {}
  [also used tools] app
```

### app-baby-zh

```
--- step 1: user says: 做个小应用记宝宝喝奶。今天早上 6:10 喝了 120ml，9:05 喝了 90ml
  [partner message] 做好了，今天的两次已经记上：6:10 的 120ml 和 9:05 的 90ml，合计 210ml。以后每次喂完直接填时间和奶量，就会自动加总。
  [an app card under the message: made "宝宝喝奶记录", with Open] the app's file now (v1, 3250 characters): <main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">今天喝奶</div>
    <div class="k-sum-value" id="total">0 ml</div>
    <div class="k-sum-sub" id="count">0 次</div>
  </div>

  <div class="k-card">
    <div class="k-h">记一笔</div>
    <div class="k-field">
      <label for="time">时间</label>
      <input class="k-input" id="time" placeholder="HH:MM" maxlength="5">
    </div>
    <div class="k-field">
      <label for="ml">奶量 (ml)</label>
      <input class="k-num" id="ml" inputmode="decimal" placeholder="120">
    </div>
    <button class="k-btn primary" id="add">记下来</button>
  </div>

  <div class="k-card">
    <div class="k-h">今天的记录</div>
    <div class="k-list" id="list"></div>
    <div class="k-empty" id="empty" hidden>还没有记录</div>
  </div>
</main>
<script>
(function () {
  var feeds = [];
  function $(id) { return document.getElementById(id); }
  function p(n) { return (n < 10 ? '0' : '') + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function nowHM() {
    var d = new Date();
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function todays() {
    var t = today(); … t = f.ml + ' ml';
      var del = document.createElement('button');
      del.className = 'k-btn';
      del.textContent = '删';
      del.onclick = function () {
        feeds = feeds.filter(function (x) { return x.id !== f.id; });
        save(); render();
      };
      row.appendChild(main);
      row.appendChild(val);
      row.appendChild(del);
      box.appendChild(row);
    });
    try { ducter.summary('今天 ' + list.length + ' 次,合计 ' + total + ' ml'); } catch (e) {}
  }
  function load(v) {
    feeds = Array.isArray(v) ? v : [];
    $('time').value = $('time').value || nowHM();
    render();
  }
  $('add').onclick = function () {
    var t = $('time').value.trim();
    var ml = parseFloat($('ml').value);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t) || !(ml > 0)) return;
    feeds.push({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6), d: today(), t: t, ml: ml });
    $('ml').value = '';
    $('time').value = nowHM();
    save(); render();
  };
  $('time').value = nowHM();
  try {
    Promise.resolve(ducter.get('feeds')).then(load);
    ducter.onChange(function () { Promise.resolve(ducter.get('feeds')).then(load); });
  } catch (e) { render(); }
})();
</script>; its data now (what it opens with): {"feeds":[{"id":"f1","d":"2026-11-20","t":"06:10","ml":120},{"id":"f2","d":"2026-11-20","t":"09:05","ml":90}]}
  [also used tools] app
```

### app-prs-known-en

```
(earlier) user: which of my PRs are still waiting on someone?
(earlier) partner: Four: wey-gu/ducter#412 (compaction cut) waits on Weizhen's review since Monday; nowledge-co/mem#10287 (retry on 502) on CI, failing; nowledge-co/hawdb#1592 (flaky compaction test) on Alice since Tuesday; wey-gu/ducter#418 (apps bar) is a draft.
--- step 1: user says: make that a little page I can keep and tick off as they land
  [partner message] Done: "PRs waiting on someone" is on your shelf, with the four PRs and a tick for each one as it lands.
  [an app card under the message: made "PRs waiting on someone", with Open] the app's file now (v1, 2360 characters): <style>
.k-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--d-line)}
.k-row:last-child{border-bottom:none}
.k-row-main{flex:1;min-width:0}
.k-row.done .k-row-main{opacity:.5;text-decoration:line-through}
.tick{width:26px;height:26px;flex:none;border-radius:7px;border:1.5px solid var(--d-line);background:var(--d-card);color:#fff;font-size:15px;line-height:22px;padding:0;cursor:pointer}
.tick[aria-pressed="true"]{background:var(--d-good);border-color:var(--d-good)}
</style>
<main class="k-app">
  <div class="k-sum">
    <div class="k-sum-label">Waiting on someone</div>
    <div class="k-sum-value" id="n">0</div>
    <div class="k-sum-sub" id="s"></div>
  </div>
  <h2 class="k-h">My PRs</h2>
  <div class="k-card"><div class="k-list" id="list"></div></div>
</main>
<script>
var items = [];
function save() { ducter.set('prs', items); }
function render() {
  var list = document.getElementById('list');
  list.textContent = '';
  var open = 0;
  items.forEach(function (it, i) {
    if (!it.done) open++;
    var row = document.createElement('div');
    row.className = 'k-row' + (it.done ? ' done' : '');
    var b = document.createElement('button');
    b.className = 'tick';
    b.setAttribute('aria-pressed', it.done ? 'true' : 'false');
    b.setAttribute('aria-label', 'Mark landed');
    b.textContent = it.done ? '✓' : '';
    b.onclick = function () { items[i].done = !items[i].done; save(); render(); };
    var main = document.createElement('div');
    main.className = 'k-row-main';
    var t = document.createElement('div');
    t.textContent = it.title + ' · ' + it.repo;
    var sub = document.createElement('div');
    sub.className = 'k-row-sub';
    sub.textContent = it.done ? 'Landed' : 'Waiting: ' + it.waiting;
    main.appendChild(t);
    main.appendChild(sub);
    row.appendChild(b);
    row.appendChild(main);
    list.appendChild(row);
  });
  document.getElementById('n').textContent = open;
  document.getElementById('s').textContent = open + ' of ' + items.length + ' still open';
  ducter.summary(open + ' open');
}
Promise.resolve(ducter.get('prs')).then(function (v) {
  items = Array.isArray(v) ? v : [];
  render();
});
ducter.onChange(function () {
  Promise.resolve(ducter.get('prs')).then(function (v) {
    items = Array.isArray(v) ? v : [];
    render();
  });
});
</script>; its data now (what it opens with): {"prs":[{"title":"Compaction cut","repo":"wey-gu/ducter#412","waiting":"Weizhen's review, since Monday","done":false},{"title":"Retry on 502","repo":"nowledge-co/mem#10287","waiting":"CI, failing","done":false},{"title":"Flaky compaction test","repo":"nowledge-co/hawdb#1592","waiting":"Alice, since Tuesday","done":false},{"title":"Apps bar","repo":"wey-gu/ducter#418","waiting":"Still a draft","done":false}]}
  [also used tools] app
```
