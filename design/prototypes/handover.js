// Prototype for design/handover.md (D385, proposed). Decides nothing: it draws the note's screens
// into the real web app running on a demo core (apps/web/demo-todos.ts, DEMO_TODOS=pile), using the
// app's own stylesheet, classes and tokens, so the shots sit in the real conversation and On hand.
// Injected by a headless browser; never loaded by the app.
//   HO("pile" | "pick" | "brief" | "plan" | "conv" | "review", "zh" | "en")
(() => {
  const L = {
    zh: {
      subjects: "讲的是",
      chips: [["记忆提炼", 9], ["登录", 12], ["离线模式", 8], ["Windows 安装", 6], ["文档", 14]],
      more: "还有 11 类",
      sheet: "交给小鸭",
      find: "memory distill",
      found: "找到 9 个讲记忆提炼的",
      foundHow: ["标题里写着的 6 个", "说的是同一回事的 3 个"],
      g: { all: "全部", do: "可以交给小鸭做的", decide: "要你拿主意的", later: "可以先放着的" },
      note: "给小鸭的话",
      notePh: "比如：先别动数据库；验证去 haswell 上跑",
      noteText: "先别动数据库迁移。验证都去 haswell 上跑，那台装了 Rust。",
      perItem: "给这个的话…",
      perItemText: "这个按你的建议：失败后给一次有限的重试。",
      how: "怎么做",
      shapes: [
        ["plan", "先出个方案", "你点头再做", "这几个说的是同一回事：先看一遍，哪些已经修好、哪些该合在一起，给你过目。"],
        ["one", "合成一个任务做", "一个任务，一个 PR 修好这几个", ""],
        ["line", "一个做完接下一个", "在 acme/mem 里排着，每个从上一个的分支接着做", ""],
        ["side", "同时做", "一次 3 个，各自一个 PR", ""],
      ],
      suggested: "建议",
      where: "在哪儿做",
      whereV: "haswell",
      whereWhy: "你写了 haswell",
      who: "谁来做",
      whoV: "Codex",
      whoWhy: "写代码的事按你的规则",
      go: "交给小鸭这 7 个",
      goSub: "先出个方案",
      next: "下一步：怎么做",
      picked: "勾了 7 个",
      items: [
        ["do", "#412", "Distillation: fall back to a smaller result instead of failing", "说得清楚，改一处", "medium", true],
        ["do", "#398", "Automatic distillation: the error says nothing useful", "说得清楚，改动小", "small", true],
        ["do", "#377", "Distillation gets slow on very long threads", "说得清楚，要测性能", "medium", true],
        ["do", "#351", "Newer facts should replace older ones by when they were said", "说得清楚，改动小", "small", true],
        ["do", "#340", "Distillation's first try often fails on long threads", "说得清楚，要跑一批对话验证", "medium", true],
        ["do", "#322", "Show when automatic distillation has paused", "说得清楚，改动小", "small", true],
        ["decide", "#405", "Retry a failed automatic distillation once?", "要不要给失败的自动提炼一次有限的重试？建议：给一次", "", true, "meaning"],
        ["later", "#366", "长对话的自动提炼总是失败", "改动大，得先查清原因", "large", false, "meaning"],
        ["later", "#290", "Distillation as a tool loop", "改动大，得先拆开", "large", false, "meaning"],
      ],
      size: { small: "小改动", medium: "中等", large: "大改动" },
      byMeaning: "意思相近",
      u1: "把 memory distill 相关的拉出来我们看看",
      p1: "找到 9 个讲记忆提炼的。能直接交给我的 6 个先勾上了；#405 要你定一下；两个改动大，先放着。",
      setTitle: "记忆提炼",
      setMore: "还有 5 个",
      setGo: "交给小鸭这 6 个…",
      setOr: "也可以直接说怎么做",
      u2: "就这几个，#405 也加上，按你的建议。先别动数据库迁移，验证都去 haswell 上跑。",
      p2: "好，我先看一遍，出个方案给你，你点头再做。",
      line2: ["记忆提炼", "在出方案", "haswell", "Codex"],
      planTitle: "记忆提炼：方案",
      planSub: "看了这 7 个和 acme/mem 的代码",
      planParts: [
        ["已经修好了，只差关掉", [["#351", "在 PR #360 里已经合并了：留一句，关掉"]]],
        ["合成一个任务做", [["#398 + #412 + #405", "都是自动提炼失败时怎么退一步，改的是同一处；加上一次有限的重试（你定的）"]]],
        ["一个做完接下一个", [["1  #377", "先做：后面两个都用到它改的组包"], ["2  #340", "从 #377 的分支接着做"], ["3  #322", "最后：把暂停的样子放进任务记录"]]],
      ],
      planFoot: ["都在 haswell 上验证", "不动数据库迁移"],
      planNote: "给这个的话…",
      planGo: "照这个做",
      hold: "先等等",
      reply: "回复…",
      groupName: "记忆提炼",
      groupFacts: ["4 个排着", "等你看方案"],
      reviewTitle: "一起过目",
      reviewSub: "记忆提炼：5 个都做完了",
      reviewLede: "3 个 PR 等你合并；1 个本来就修好了。看过就在每个 issue 下留一句。",
      reviewRows: [
        ["#398 + #412 + #405", "PR #420", "检查都过了", "+212 −40", "失败时退回只用结构化结果，并重试一次；在 haswell 上跑过测试。", "Fixed in #420: distillation now degrades to the structured result and retries once."],
        ["#377", "PR #421", "检查都过了", "+96 −71", "组包改成按消息数线性增长；加了一个长对话的性能测试。", "Fixed in #421: packet assembly is linear in the number of messages now."],
        ["#340", "PR #422", "1 项没过", "+58 −12", "第一次提交前先检查每一条；Windows 的检查没过，看起来跟这次改动无关。", "Fixed in #422: per-proposal fields are checked before the first attempt."],
        ["#322", "PR #423", "检查都过了", "+120 −8", "任务记录里多了一行「已暂停，等你处理」。", "Fixed in #423: Task History shows the pause and why."],
        ["#351", "已在 #360 合并", "", "", "不用改：#360 已经修好了。", "This was fixed in #360 (merged). Closing."],
      ],
      says: "会留一句",
      drop: "不留这条",
      reviewGo: "在这 5 个下面留言",
      reviewFoot: "#351 留言后关掉；其余在 PR 合并时由 GitHub 自己关上。",
      openPr: "在 GitHub 上看",
    },
    en: {
      subjects: "Subjects",
      chips: [["Distillation", 9], ["Sign-in", 12], ["Offline mode", 8], ["Windows install", 6], ["Docs", 14]],
      more: "11 more",
      sheet: "Hand to Duckie",
      find: "memory distill",
      found: "9 about memory distillation",
      foundHow: ["6 say it in the title", "3 are about the same thing"],
      g: { all: "All", do: "You could hand to Duckie", decide: "Need your call", later: "Can wait" },
      note: "A note for Duckie",
      notePh: "For example: don't touch the database; check it on haswell",
      noteText: "Leave the database migrations alone. Run every check on haswell; it has Rust.",
      perItem: "A note for this one…",
      perItemText: "This one as you suggest: one bounded retry after a failure.",
      how: "How",
      shapes: [
        ["plan", "Plan first", "Starts when you say so", "These are about one thing: read them all first, find what's already fixed and what belongs together, and show you."],
        ["one", "As one task", "One task, one PR fixes them all", ""],
        ["line", "One after another", "In line in acme/mem, each from the one before's branch", ""],
        ["side", "Side by side", "3 at a time, a PR each", ""],
      ],
      suggested: "Suggested",
      where: "Where",
      whereV: "haswell",
      whereWhy: "Your note says haswell",
      who: "Who does it",
      whoV: "Codex",
      whoWhy: "Your rule for code",
      go: "Hand these 7 to Duckie",
      goSub: "Plan first",
      next: "Next: how",
      picked: "7 ticked",
      items: null,
      size: { small: "Small change", medium: "Medium", large: "Big change" },
      byMeaning: "Same subject",
      u1: "Pull out everything about memory distill so we can look",
      p1: "9 are about memory distillation. I ticked the 6 I can take now; #405 needs your call; two are big, so they wait.",
      setTitle: "Distillation",
      setMore: "5 more",
      setGo: "Hand these 6 to Duckie…",
      setOr: "Or just say how",
      u2: "Just these, plus #405 your way. Leave the database migrations alone and run the checks on haswell.",
      p2: "OK. I'll read them first and show you a plan; nothing starts until you say so.",
      line2: ["Distillation", "Making a plan", "haswell", "Codex"],
      planTitle: "Distillation: the plan",
      planSub: "Read these 7 and acme/mem's code",
      planParts: [
        ["Already fixed, only to close", [["#351", "Merged in PR #360: comment and close"]]],
        ["As one task", [["#398 + #412 + #405", "All about how distillation steps back when it fails, in the same place; plus one bounded retry (your call)"]]],
        ["One after another", [["1  #377", "First: the other two use the packet code it changes"], ["2  #340", "From #377's branch"], ["3  #322", "Last: the pause shown in Task History"]]],
      ],
      planFoot: ["Every check on haswell", "No database migrations"],
      planNote: "A note for this one…",
      planGo: "Go with this",
      hold: "Hold",
      reply: "Reply…",
      groupName: "Distillation",
      groupFacts: ["4 in line", "Needs you"],
      reviewTitle: "Review together",
      reviewSub: "Distillation: all 5 done",
      reviewLede: "3 PRs wait for you to merge; 1 was already fixed. Once you've looked, each issue gets a line.",
      reviewRows: [
        ["#398 + #412 + #405", "PR #420", "Checks passed", "+212 −40", "On failure it falls back to the structured result and retries once; tests run on haswell.", "Fixed in #420: distillation now degrades to the structured result and retries once."],
        ["#377", "PR #421", "Checks passed", "+96 −71", "Packet assembly now grows linearly with messages; a long-thread speed test added.", "Fixed in #421: packet assembly is linear in the number of messages now."],
        ["#340", "PR #422", "1 check failed", "+58 −12", "Each proposal is checked before the first try; the Windows check failed and looks unrelated.", "Fixed in #422: per-proposal fields are checked before the first attempt."],
        ["#322", "PR #423", "Checks passed", "+120 −8", "Task History has a line: paused, waiting for you.", "Fixed in #423: Task History shows the pause and why."],
        ["#351", "Merged in #360", "", "", "Nothing to change: #360 already fixed it.", "This was fixed in #360 (merged). Closing."],
      ],
      says: "Will comment",
      drop: "Not this one",
      reviewGo: "Comment on these 5",
      reviewFoot: "#351 closes after its comment; the rest close themselves when their PR merges.",
      openPr: "See on GitHub",
    },
  };
  L.en.items = L.zh.items.map((r, k) => {
    const why = ["Clear; one place to change", "Clear, and a small change", "Clear; needs a speed test", "Clear, and a small change", "Clear; check on a batch of threads", "Clear, and a small change", "Retry a failed automatic distillation once? Suggested: once", "Big; find the cause first", "Big; needs breaking down first"][k];
    const title = k === 7 ? "Automatic distillation keeps failing on long threads" : r[2];
    return [r[0], r[1], title, why, r[4], r[5], r[6]];
  });

  const css = `
  .ho-subjects{display:flex;align-items:center;gap:10px;margin:14px 0 2px;flex-wrap:wrap}
  .ho-subjects>small{font-size:var(--xs);font-weight:700;color:var(--ink-muted);flex:none}
  .ho-subjects .nt-chip b{font-weight:700;color:var(--ink)}
  .ho-subjects .nt-chip .n{color:var(--ink-muted);font-variant-numeric:tabular-nums}
  .ho-subjects .nt-chip.hot{background:var(--surface);box-shadow:0 0 0 1px var(--line-2),0 2px 0 var(--line-2)}
  .past-sheet.ho-wide{width:min(1240px,calc(100vw - 32px))}
  .ho-cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,1fr);gap:0}
  .ho-left{min-height:0;overflow:auto;padding:0 0 24px;display:flex;flex-direction:column}
  .ho-right{min-height:0;overflow:auto;padding:14px 28px 24px;background:var(--bg-deep,var(--sunken));display:flex;flex-direction:column;gap:18px;border-top-left-radius:var(--r-lg)}
  .ho-found{margin:10px 30px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:baseline}
  .ho-found b{font-family:var(--head);font-size:17px}
  .ho-found span{font-size:var(--sm);color:var(--ink-muted)}
  .ho-list{display:flex;flex-direction:column;gap:10px;padding:10px 28px 0}
  .ho-gh{font-size:var(--xs);font-weight:700;color:var(--ink-muted);margin:14px 2px 0;letter-spacing:.02em}
  .ho-meaning{font-size:var(--xs);color:var(--dusk-ink,#4b4a7a);background:var(--sunken);border-radius:999px;padding:1px 8px}
  .ho-num{color:var(--ink-muted);font-variant-numeric:tabular-nums;font-weight:600;font-size:var(--sm);flex:none}
  .ho-note-link{align-self:flex-start;border:0;background:none;padding:0;color:var(--ink-muted);font:inherit;font-size:var(--sm);cursor:pointer;text-decoration:underline;text-decoration-color:var(--line-2);text-underline-offset:3px}
  .ho-itemnote{font-size:var(--sm);color:var(--ink-soft);background:var(--sunken);border-radius:12px;padding:8px 10px}
  .ho-h{font-family:var(--head);font-weight:700;font-size:16px;margin:0}
  .ho-field{display:flex;flex-direction:column;gap:8px}
  .ho-ta{min-height:96px;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 2px var(--accent),0 2px 0 var(--line);padding:12px 14px;color:var(--ink);font-size:var(--body,15px);line-height:1.55}
  .ho-shapes{display:flex;flex-direction:column;gap:8px}
  .ho-shape{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:var(--surface);box-shadow:0 2px 0 var(--line)}
  .ho-shape .dot{flex:none;width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--line-2);margin-top:2px}
  .ho-shape.on{box-shadow:0 0 0 2px var(--ink),0 3px 0 var(--line-2)}
  .ho-shape.on .dot{box-shadow:inset 0 0 0 6px var(--ink)}
  .ho-shape .t{display:flex;flex-direction:column;gap:2px;min-width:0}
  .ho-shape .t b{font-weight:700}
  .ho-shape .t span{font-size:var(--sm);color:var(--ink-muted)}
  .ho-shape .t em{font-style:normal;font-size:var(--sm);color:var(--ink-soft);margin-top:4px}
  .ho-sug{font-size:var(--xs);font-weight:700;color:var(--needs-ink);background:var(--needs-surface);border-radius:999px;padding:1px 8px;margin-left:6px}
  .ho-rows{display:flex;flex-direction:column;gap:2px;border-radius:16px;background:var(--surface);box-shadow:0 2px 0 var(--line)}
  .ho-row{display:flex;align-items:center;gap:12px;padding:12px 14px;min-height:48px}
  .ho-row+.ho-row{border-top:1px solid var(--line-soft)}
  .ho-row small{flex:0 0 6.5em;font-size:var(--sm);font-weight:700;color:var(--ink-muted)}
  .ho-row b{font-weight:700}
  .ho-row span.why{flex:1;text-align:right;font-size:var(--sm);color:var(--ink-muted)}
  .ho-row .chg{font-size:var(--sm);font-weight:700;color:var(--ink-soft)}
  .ho-foot{padding:14px 28px 22px;border-top:1px solid var(--line-soft);display:flex;flex-direction:column;gap:8px;background:var(--bg)}
  .ho-foot .sub{font-size:var(--sm);color:var(--ink-muted);text-align:right}
  .ho-foot-row{display:flex;gap:10px;align-items:center}
  .ho-foot-row .facts{font-size:var(--sm);color:var(--ink-muted);flex:1}
  .ho-set{align-self:flex-start;width:min(560px,92%);background:var(--surface);border-radius:20px;box-shadow:0 2px 0 var(--line);padding:14px 16px;display:flex;flex-direction:column;gap:8px;margin-top:4px}
  .ho-set-h{display:flex;align-items:baseline;gap:10px}
  .ho-set-h b{font-family:var(--head);font-size:17px}
  .ho-set-h span{color:var(--ink-muted);font-size:var(--sm)}
  .ho-set-row{display:flex;gap:10px;align-items:center;font-size:var(--sm);min-height:32px}
  .ho-set-row input{width:20px;height:20px;accent-color:var(--accent);flex:none;margin:0}
  .ho-set-row .tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
  .ho-set-more{font-size:var(--sm);color:var(--ink-muted);font-weight:700}
  .ho-set-foot{display:flex;gap:12px;align-items:center;margin-top:6px;flex-wrap:wrap}
  .ho-set-foot span{font-size:var(--sm);color:var(--ink-muted)}
  .ho-taskline{align-self:flex-start;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:var(--sm);color:var(--ink-soft);background:var(--working-surface);border-radius:999px;padding:5px 12px 5px 8px;margin-top:2px}
  .ho-taskline i{width:8px;height:8px;border-radius:50%;background:var(--working-dot);display:inline-block}
  .ho-taskline b{color:var(--working-ink)}
  .ho-plan{align-self:flex-start;width:min(620px,96%);background:var(--surface);border-radius:22px;box-shadow:0 0 0 2px var(--needs-surface),0 3px 0 var(--line-2);padding:16px 18px;display:flex;flex-direction:column;gap:12px}
  .ho-plan-h b{font-family:var(--head);font-size:19px;display:block}
  .ho-plan-h span{font-size:var(--sm);color:var(--ink-muted)}
  .ho-plan-sec{display:flex;flex-direction:column;gap:6px}
  .ho-plan-sec>small{font-size:var(--xs);font-weight:700;color:var(--ink-muted);letter-spacing:.02em}
  .ho-plan-part{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:14px;background:var(--sunken)}
  .ho-plan-part b{font-weight:700;font-variant-numeric:tabular-nums}
  .ho-plan-part span{font-size:var(--sm);color:var(--ink-soft)}
  .ho-plan-part button{margin-top:2px}
  .ho-plan-facts{display:flex;gap:8px;flex-wrap:wrap}
  .ho-plan-facts span{font-size:var(--sm);background:var(--sunken);border-radius:999px;padding:3px 10px;color:var(--ink-soft)}
  .ho-plan-btns{display:flex;gap:10px;flex-wrap:wrap}
  .ho-group{background:var(--surface);border-radius:20px;box-shadow:0 2px 0 var(--line);padding:16px 18px;display:flex;flex-direction:column;gap:10px}
  .ho-group-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .ho-group-h b{font-family:var(--head);font-size:20px}
  .ho-group-h span{font-size:var(--sm);color:var(--ink-muted)}
  .ho-beads{display:flex;gap:6px}
  .ho-beads i{width:12px;height:12px;border-radius:50%;background:var(--line);display:inline-block}
  .ho-beads i.d{background:var(--done-ink)} .ho-beads i.n{background:var(--needs-ink)}
  .ho-thread{display:flex;flex-direction:column;gap:6px}
  .ho-thread div{display:flex;gap:10px;align-items:baseline;font-size:var(--sm)}
  .ho-thread div small{flex:0 0 5.5em;color:var(--ink-muted);font-weight:700}
  .ho-thread div.need small{color:var(--needs-ink)}
  .ho-rv{display:flex;flex-direction:column;gap:6px}
  .ho-rv-facts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .ho-rv-facts span{font-size:var(--sm);color:var(--ink-soft)}
  .ho-rv-facts .ok{color:var(--done-ink);font-weight:700}
  .ho-rv-facts .bad{color:var(--needs-ink);font-weight:700}
  .ho-rv-facts .pr{font-weight:700;background:var(--sunken);border-radius:999px;padding:1px 9px}
  @media (max-width:700px){
    .ho-cols{grid-template-columns:1fr}
    .ho-right{border-radius:0}
    .ho-list{padding:10px 16px 0}.ho-found{margin:8px 18px 0}
    .ho-foot{padding:12px 16px 18px}
    .ho-row small{flex-basis:5.5em}
    .ho-set,.ho-plan{width:100%}
  }`;

  const h = (s) => {
    const t = document.createElement("template");
    t.innerHTML = s.trim();
    return t.content.firstElementChild;
  };
  const gh = `<span class="todo-mark small"><span class="brand-mark" style="width:16px;height:16px"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg></span></span>`;
  const btn = (kind, label, extra = "") => `<button class="btn ${kind}${extra}"><span class="lbl">${label}</span></button>`;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function style() {
    if (document.getElementById("ho-css")) return;
    const s = document.createElement("style");
    s.id = "ho-css";
    s.textContent = css;
    document.head.append(s);
  }
  const clear = () => document.querySelectorAll(".ho-x").forEach((n) => n.remove());

  function item(w, r, opts = {}) {
    const [g, num, title, why, size, on, how] = r;
    const facts = [`<span class="ho-num">acme/mem${num}</span>`];
    if (size) facts.push(`<span class="todo-label">${w.size[size]}</span>`);
    if (how === "meaning") facts.push(`<span class="ho-meaning">${w.byMeaning}</span>`);
    const note = opts.note ? `<span class="ho-itemnote">${esc(opts.note)}</span>` : opts.first ? `<button class="ho-note-link">${w.perItem}</button>` : "";
    return `<label class="pile-item pick${on ? " on" : ""}"><input type="checkbox" ${on ? "checked" : ""}><span class="pile-item-body"><span class="pile-item-head">${gh}<a class="pile-item-title">${esc(title)}</a></span><span class="${g === "decide" ? "pile-ask" : "pile-why"}">${esc(why)}</span><span class="pile-item-facts">${facts.join("")}</span>${on ? note : ""}</span></label>`;
  }

  function listHtml(w) {
    const groups = ["do", "decide", "later"];
    let out = "";
    for (const g of groups) {
      const rows = w.items.filter((r) => r[0] === g);
      out += `<div class="ho-gh">${w.g[g]}</div>`;
      out += rows.map((r) => item(w, r, r[1] === "#405" ? { note: w.perItemText } : r[1] === "#412" ? { first: true } : {})).join("");
    }
    return out;
  }

  function briefHtml(w) {
    const shapes = w.shapes
      .map(([k, a, b, c], i) => `<div class="ho-shape${i === 0 ? " on" : ""}"><span class="dot"></span><span class="t"><b>${a}${i === 0 ? `<span class="ho-sug">${w.suggested}</span>` : ""}</b><span>${b}</span>${c ? `<em>${c}</em>` : ""}</span></div>`)
      .join("");
    return `<div class="ho-field"><h3 class="ho-h">${w.note}</h3><div class="ho-ta">${esc(w.noteText)}</div></div>
      <div class="ho-field"><h3 class="ho-h">${w.how}</h3><div class="ho-shapes">${shapes}</div></div>
      <div class="ho-rows"><div class="ho-row"><small>${w.where}</small><b>${w.whereV}</b><span class="why">${w.whereWhy}</span><span class="chg">›</span></div><div class="ho-row"><small>${w.who}</small><b>${w.whoV}</b><span class="why">${w.whoWhy}</span><span class="chg">›</span></div></div>`;
  }

  function sheet(w, body, foot, wide) {
    const s = h(`<div class="ho-x"><div class="scrim"></div><div class="past-sheet pile-sheet${wide ? " ho-wide" : ""}" role="dialog"><div class="past-head"><h2><span>${w.sheet}</span></h2><button class="past-x">×</button></div>${body}${foot}</div></div>`);
    document.body.append(s);
  }

  function pickTop(w) {
    return `<label class="past-find"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input value="${w.find}"></label>
      <div class="ho-found"><b>${w.found}</b>${w.foundHow.map((x) => `<span>${x}</span>`).join("")}</div>`;
  }

  const S = {
    pile(w) {
      const head = document.querySelector(".pile .pile-head");
      if (!head) return;
      const row = h(`<div class="ho-subjects ho-x"><small>${w.subjects}</small>${w.chips.map(([n, c], i) => `<button class="nt-chip${i === 0 ? " hot" : ""}"><b>${n}</b><span class="n">${c}</span></button>`).join("")}<button class="nt-chip"><span class="n">${w.more}</span></button></div>`);
      head.after(row);
    },
    pick(w) {
      const narrow = innerWidth < 700;
      if (narrow) {
        sheet(w, `<div class="past-list ho-left">${pickTop(w)}<div class="ho-list">${listHtml(w)}</div></div>`, `<div class="ho-foot"><div class="ho-foot-row"><span class="facts">${w.picked}</span>${btn("primary", w.next)}</div></div>`, false);
      } else {
        sheet(w, `<div class="ho-cols"><div class="ho-left">${pickTop(w)}<div class="ho-list">${listHtml(w)}</div></div><div class="ho-right">${briefHtml(w)}</div></div>`, `<div class="ho-foot"><div class="ho-foot-row"><span class="facts">${w.picked}</span>${btn("primary", `${w.go}`, " grow")}</div><div class="sub">${w.goSub}</div></div>`, true);
      }
    },
    brief(w) {
      sheet(w, `<div class="past-list ho-right" style="background:var(--bg)">${briefHtml(w)}</div>`, `<div class="ho-foot">${btn("primary", w.go, " grow")}<div class="sub">${w.goSub}</div></div>`, false);
    },
    conv(w) {
      const sc = document.querySelector(".pane.conv .scroll") || document.querySelector("main.scroll");
      const rows = w.items.slice(0, 4).map((r) => `<label class="ho-set-row"><input type="checkbox" ${r[0] === "do" ? "checked" : ""}><span class="ho-num">#${r[1].slice(1)}</span><span class="tt">${esc(r[2])}</span></label>`).join("");
      const add = [
        h(`<div class="user ho-x">${esc(w.u1)}</div>`),
        h(`<div class="partner ho-x"><div class="bubble"><div class="md"><p>${esc(w.p1)}</p></div></div></div>`),
        h(`<div class="partner ho-x" style="display:flex;flex-direction:column"><div class="ho-set"><div class="ho-set-h"><b>${w.setTitle}</b><span>9</span></div>${rows}<span class="ho-set-more">${w.setMore}</span><div class="ho-set-foot"><button class="btn primary sm" style="opacity:1;color:#fff"><span class="lbl">${w.setGo}</span></button><span>${w.setOr}</span></div></div></div>`),
        h(`<div class="user ho-x">${esc(w.u2)}</div>`),
        h(`<div class="partner ho-x" style="display:flex;flex-direction:column;gap:6px"><div class="bubble"><div class="md"><p>${esc(w.p2)}</p></div></div><div class="ho-taskline"><i></i><b>${w.line2[0]}</b><span>${w.line2[1]}</span><span>${w.line2[2]}</span><span>${w.line2[3]}</span></div></div>`),
      ];
      sc.querySelectorAll(".new-divider").forEach((n) => (n.style.display = "none"));
      for (const n of add) sc.append(n);
      sc.scrollTop = sc.scrollHeight;
      scrollTo(0, document.body.scrollHeight);
    },
    plan(w) {
      const sc = document.querySelector(".pane.conv .scroll") || document.querySelector("main.scroll");
      const secs = w.planParts
        .map(([t, parts], si) => `<div class="ho-plan-sec"><small>${t}</small>${parts.map(([a, b], pi) => `<div class="ho-plan-part"><b>${esc(a)}</b><span>${esc(b)}</span>${si === 2 && pi === 1 ? `<button class="ho-note-link">${w.planNote}</button>` : ""}</div>`).join("")}</div>`)
        .join("");
      const card = h(`<div class="partner ho-x" style="display:flex;flex-direction:column"><div class="ho-plan"><div class="ho-plan-h"><b>${w.planTitle}</b><span>${w.planSub}</span></div>${secs}<div class="ho-plan-facts">${w.planFoot.map((x) => `<span>${x}</span>`).join("")}</div><div class="ho-plan-btns">${btn("primary", w.planGo)}${btn("secondary", w.hold)}${btn("text", w.reply)}</div></div></div>`);
      sc.querySelectorAll(".new-divider").forEach((n) => (n.style.display = "none"));
      sc.append(h(`<div class="user ho-x">${esc(w.u2)}</div>`));
      sc.append(card);
      sc.scrollTop = sc.scrollHeight;
      scrollTo(0, document.body.scrollHeight);
      // On hand: the group's card on top (wide only; the phone shows the conversation).
      const side = document.querySelector(".pane.side .onhand-list .board-top");
      if (side) {
        const g = h(`<div class="ho-group ho-x"><div class="ho-group-h"><b>${w.groupName}</b><span>${w.groupFacts[0]}</span></div><div class="ho-beads"><i class="n"></i><i></i><i></i><i></i><i></i></div><div class="ho-thread"><div class="need"><small>${w.groupFacts[1]}</small><span>${w.planTitle}</span></div><div><small>${w.lang === "zh" ? "排着" : "In line"}</small><span>#398 + #412 + #405</span></div><div><small>${w.lang === "zh" ? "排着" : "In line"}</small><span>#377 → #340 → #322</span></div></div></div>`);
        side.after(g);
      }
    },
    review(w) {
      const rows = w.reviewRows
        .map(([what, pr, chk, diff, said, comment]) => `<div class="pile-item close"><span class="pile-item-body"><span class="pile-item-head">${gh}<a class="pile-item-title">acme/mem ${esc(what)}</a></span><span class="ho-rv-facts"><span class="pr">${pr}</span>${chk ? `<span class="${/过了|passed/.test(chk) ? "ok" : "bad"}">${chk}</span>` : ""}${diff ? `<span>${diff}</span>` : ""}</span><span class="pile-why">${esc(said)}</span><span class="pile-says"><span class="pile-says-label">${w.says}</span><q class="pile-says-text">${esc(comment)}</q></span></span>${btn("secondary sm", w.drop)}</div>`)
        .join("");
      const s = h(`<div class="ho-x"><div class="scrim"></div><div class="past-sheet pile-sheet" role="dialog"><div class="past-head"><h2><span>${w.reviewTitle}</span><span class="n">${w.reviewSub}</span></h2><button class="past-x">×</button></div><div class="past-list pile-body"><p class="pile-lede">${w.reviewLede}</p><div class="pile-list">${rows}</div></div><div class="ho-foot"><div class="ho-foot-row">${btn("secondary", w.hold)}${btn("primary", w.reviewGo, " grow")}</div><div class="sub">${w.reviewFoot}</div></div></div></div>`);
      document.body.append(s);
    },
  };

  window.HO = (screen, lang) => {
    style();
    clear();
    const w = { ...L[lang], lang };
    S[screen](w);
    return "ok";
  };
})();
