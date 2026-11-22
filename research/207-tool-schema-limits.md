# 207: What a tool's schema may hold, per model family (D479)

Why every Antigravity task failed on its first model call on hel (2026-11-22), and what each
agent Ducter runs does with the schemas of Ducter's MCP tools.

## 1. The failure

VERIFIED (the lead, hel, Ducter 0.1.16, agy 1.5.14, twice): an Antigravity task stopped on its
first call with

```
INVALID_ARGUMENT (code 400): * GenerateContentRequest.tools[0].function_declarations[18]
  .parameters.properties[check].properties[succeedWhen].properties[oneOf].items: missing field.
```

The 19th declaration is Ducter's task tool `wait_for`: its `check.succeedWhen.oneOf` was
`{ "type": "array" }` with no `items` (`packages/core/src/work.ts` before D479). Gemini rejects the
whole request, so the task never did anything, on any computer. The same request shows that agy's
sign-in, its model selection and the MCP bridge (OAR's stdio entry) all worked: the call reached
Gemini with Ducter's tools in it.

## 2. Gemini's `parameters` (Antigravity)

DOCUMENTED, Gemini API reference, `Schema` (aistudio.google.com/api-reference, read 2026-11-22):
an OpenAPI 3.0 subset. Fields: `type` (required: STRING, NUMBER, INTEGER, BOOLEAN, ARRAY, OBJECT,
NULL), `format`, `title`, `description`, `nullable`, `enum` (STRING only), `items` (ARRAY),
`maxItems`, `minItems`, `properties` (OBJECT), `required`, `minProperties`, `maxProperties`,
`minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `example`, `anyOf`, `propertyOrdering`,
`default`. Not there: `oneOf`, `allOf`, `not`, `$ref`, `$defs`, `const`, `additionalProperties`.
`parametersJsonSchema` takes full JSON Schema instead, but agy uses `parameters` (the error's
path names it). INFERRED from the error: agy passes MCP schemas through without repairing them.

DOCUMENTED (discuss.ai.google.dev threads 56501 and 64086; LangChain.Utils.GoogleSchema): an
OBJECT with an empty `properties` map is refused ("should be non-empty for OBJECT type");
`additionalProperties` does not help, and a free-form map can't be said at all. The top level of
a tool with no arguments: every MCP client meets those, and Ducter has 13 of them; INFERRED that
agy sends no `parameters` for them (not seen failing; to check live).

Function names: `^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$` (DOCUMENTED, the same reference).

## 3. OpenAI (Codex, DeepSeek Harness)

VERIFIED by reading openai/codex main (2026-11-22): `codex-rs/tools/src/responses_api.rs` sends MCP
tools with `strict: false`; `json_schema.rs` `sanitize_json_schema` fills a missing `type` and turns
`const` into `enum`. So Ducter's tools never meet strict mode on Codex today; its rules
(`additionalProperties: false`, every property required) stay in the registry with no agent
naming them. An array without `items` is refused by OpenAI function calling ("array schema
missing items", its error text; DOCUMENTED). DeepSeek's API takes OpenAI-shaped tools (INFERRED).

## 4. Anthropic (Claude Code)

DOCUMENTED: `input_schema` is a JSON Schema object with `type: "object"` at the top; `oneOf`,
`allOf` and `anyOf` are refused at the top level (the API's error text). Names
`^[a-zA-Z0-9_-]{1,64}$`, which Claude Code's `mcp__ducter__<tool>` must fit.

## 5. pi

INFERRED: pi runs any provider's model (Anthropic, OpenAI, Google), so a tool it lists must suit
all three; its Google provider is the Gemini API.

## 6. Ducter's tools against these rules (before D479)

A structural check of every registered tool (`packages/partner/test/tool-schemas.test.ts`, all
tools, listed or not): 20 breaks, all on Gemini (OpenAI only the missing `items`):

| Tool (role) | Break |
|---|---|
| `wait_for` (task, partner), `keep_going` | `check.succeedWhen.oneOf` array without items; `equals: {}` (no type); `check.failWhen` an object with no properties |
| `wait_for` | `event.config` a free-form object |
| `routine_propose` | `trigger` and `place` objects with no properties |
| `connection_call` (partner), `connection_read` (task) | `input` a free-form object |
| `app` (partner), `app_data` (task) | `data` / `set` free-form objects |

## Implications for Ducter

- One registry: each agent names the model families it sends tools to (`harness-facts.ts`
  `toolSchema`); each family's limits are facts with evidence (`protocol/src/tool-schema.ts`).
- Ducter's tools are written inside every family at once (the intersection), never translated per
  agent: a test fails the build on any break, for every tool registered, listed or not.
- A free-form map (a connection action's input, an app's keys, a trigger's config) is JSON text,
  read back by one function; values matched by a check are text (the check already compares as text).
- Live on hel: one Antigravity task with Ducter's tools, and a tool with no arguments called.

**Summary.** Gemini's function declarations take an OpenAPI subset: arrays need `items`, every node
a type, every object named properties, no `oneOf`/`$ref`/`additionalProperties`. Ducter's
`wait_for` broke the first rule and so every Antigravity task. Codex sends MCP tools non-strict and
repairs types; Claude needs only an object at the top. All of Ducter's tools now sit inside every
family, and a test keeps them there.
