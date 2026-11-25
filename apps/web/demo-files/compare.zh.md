# Nowledge Mem：对比 Mem0、Zep、Letta 和 Supermemory

**2026-11-25**

---

你让我看看 Nowledge Mem 在「给 AI 的记忆」这一类里站在哪儿。我读了五家的定价页、文档和开源仓库，把能对上的放进一张表；对不上的写在表下面，不硬凑。

## 一眼看完

| 产品 | 免费档 | 入门价 | 专业档 | 记忆上限（免费） | 能自己部署 | 开源协议 | 知识图谱 | 定价页 |
|---|---|---:|---:|---|---|---|---|---|
| Nowledge Mem | 本机全部功能 | 免费 | 团队版另谈 | 不限（存在你的电脑上） | 是，本机就是 | 闭源，客户端免费 | 有，实体和关系自动连 | https://mem.nowledge.co/pricing |
| Mem0 | Hobby | $19 / 月 | $249 / 月 | 1 万条 | 是（开源版） | Apache-2.0 | Pro 档才有 | https://mem0.ai/pricing |
| Zep | Free | $25 / 月起 | 按用量 | 每月 1 千个片段 | 社区版已停止维护 | Apache-2.0（Graphiti） | 有，时间图谱 | https://www.getzep.com/pricing |
| Letta | Free | $20 / 月 | 企业版另谈 | 按模型调用算 | 是 | Apache-2.0 | 没有，靠分层记忆块 | https://www.letta.com/pricing |
| Supermemory | Free | $19 / 月 | $399 / 月 | 每月 100 万 token | 企业版才行 | MIT（部分） | 没有 | https://supermemory.ai/pricing |

> 价格是各家定价页 2026-11-25 写的；按用量收费的几家，真实花费要看你一天存多少、查多少。

## 我看到的三点

1. **只有 Mem 和 Letta 把记忆放在你自己的机器上不加钱。** Mem0 的开源版也能自己跑，但图谱要 Pro 档（$249 / 月）。
2. **图谱这件事，Zep 做得最早。** 它的 Graphiti 把每条事实带上时间，能回答「上个月我说的是什么」。文档在 https://help.getzep.com/graphiti/graphiti/overview#temporal-awareness-and-bi-temporal-model 。
3. **接入方式差别最大。** Mem0 和 Supermemory 是 API 优先；Mem 和 Letta 先给你一个应用，再给 API 和 MCP。

## 怎么自己试一下

每家都有一个最小的写入调用。Mem0 的是这样（把钥匙换成你自己的）：

```bash
curl -X POST "https://api.mem0.ai/v1/memories/" -H "Authorization: Token $MEM0_API_KEY" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"我更喜欢早上开会，下午留给写代码"}],"user_id":"wey"}'
```

Mem 走本机的 MCP，不需要钥匙：

```json
{
  "mcpServers": {
    "nowledge-mem": { "command": "nmem", "args": ["mcp", "--transport", "stdio", "--space", "default", "--log-level", "warn"] }
  }
}
```

## 还没查清的

- [ ] Supermemory 的「每月 100 万 token」算不算查询时的 token，定价页没写清楚
- [ ] Letta 的免费档每月能跑多少次，要登录才看得到
- [x] Zep 社区版确实已停止维护（仓库 README 里写着）

下一步我建议先拿 Mem0 和 Mem 各存一周你真实的对话，再比查得准不准；要我开始就说一声。
