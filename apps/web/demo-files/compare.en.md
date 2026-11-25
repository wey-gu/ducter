# Nowledge Mem: compared with Mem0, Zep, Letta and Supermemory

**2026-11-25**

---

You asked where Nowledge Mem stands among memory layers for AI. I read the five pricing pages, their docs and their open-source repositories, and put what lines up into one table; what doesn't line up is written under it, not forced in.

## At a glance

| Product | Free tier | Starter | Pro | Free memory limit | Self-hosted | Licence | Knowledge graph | Pricing page |
|---|---|---:|---:|---|---|---|---|---|
| Nowledge Mem | Everything, on your computer | Free | Teams: ask | None (kept on your computer) | Yes, it runs locally | Closed source, free client | Yes, entities and relations linked by themselves | https://mem.nowledge.co/pricing |
| Mem0 | Hobby | $19 / month | $249 / month | 10,000 memories | Yes (open-source edition) | Apache-2.0 | Pro tier only | https://mem0.ai/pricing |
| Zep | Free | From $25 / month | Usage-based | 1,000 episodes a month | Community edition no longer maintained | Apache-2.0 (Graphiti) | Yes, a temporal graph | https://www.getzep.com/pricing |
| Letta | Free | $20 / month | Enterprise: ask | Counted in model calls | Yes | Apache-2.0 | No, layered memory blocks | https://www.letta.com/pricing |
| Supermemory | Free | $19 / month | $399 / month | 1M tokens a month | Enterprise only | MIT (in part) | No | https://supermemory.ai/pricing |

> Prices are as each pricing page showed on 2026-11-25; for the usage-based ones, what you really pay depends on how much you save and look up in a day.

## Three things I saw

1. **Only Mem and Letta keep memory on your own machine at no extra cost.** Mem0's open-source edition runs on your own machine too, but its graph needs the Pro tier ($249 / month).
2. **Zep got to graphs first.** Its Graphiti puts a time on every fact, so it can answer "what did I say last month". The docs are at https://help.getzep.com/graphiti/graphiti/overview#temporal-awareness-and-bi-temporal-model .
3. **How you connect differs the most.** Mem0 and Supermemory are API-first; Mem and Letta give you an app first, then an API and MCP.

## How to try it yourself

Each has a smallest write call. Mem0's looks like this (put in your own key):

```bash
curl -X POST "https://api.mem0.ai/v1/memories/" -H "Authorization: Token $MEM0_API_KEY" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"I prefer meetings in the morning and keep afternoons for code"}],"user_id":"wey"}'
```

Mem goes through MCP on this computer, with no key:

```json
{
  "mcpServers": {
    "nowledge-mem": { "command": "nmem", "args": ["mcp", "--transport", "stdio", "--space", "default", "--log-level", "warn"] }
  }
}
```

## Still open

- [ ] Whether Supermemory's "1M tokens a month" counts the tokens of a lookup: the pricing page doesn't say
- [ ] How many runs Letta's free tier allows a month: shown only after signing in
- [x] Zep's community edition is indeed no longer maintained (its README says so)

Next, I'd save a week of your real conversations in both Mem0 and Mem, then compare how well each finds things; say the word and I'll start.
