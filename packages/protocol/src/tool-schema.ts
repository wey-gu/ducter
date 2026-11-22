// D479: what a tool's input schema may hold for each model family an agent sends Ducter's tools
// to. The families and their limits are facts (each carries its evidence); which agent sends to
// which family is in harness-facts (`toolSchema`). Ducter's tools are written once, inside every
// family's limits at the same time, so no agent ever gets a schema its model refuses: an
// Antigravity task's first call failed on hel (2026-11-22) with Gemini's 400
// "...properties[oneOf].items: missing field", and so did every Antigravity task.
//
// The check is structural (keys, types, arrays' items), never about meaning.
import type { Fact } from "./harness-facts.ts";

export type SchemaDialect = "gemini" | "openai" | "openai-strict" | "anthropic";

export interface DialectRules {
  /** Keys a schema node may carry (undefined: any JSON Schema key). */
  keys?: readonly string[];
  /** Every node names exactly one type (a string, not a list); anyOf may stand in for it. */
  typeRequired: boolean;
  /** Types a node may name. */
  types: readonly string[];
  /** An array names the schema of its items. */
  arrayItems: boolean;
  /**
   * A nested object names at least one property: a free-form map can't be said (Ducter writes one
   * as JSON text, read back by jsonArg). The top level is left to the agent: a tool with no
   * arguments is everyday MCP, and an agent sends no parameters for it (INFERRED, not seen failing).
   */
  objectProperties: boolean;
  /** enum only on a string, its values strings. */
  enumStringsOnly: boolean;
  /** The top level is {type: "object"} with no anyOf / oneOf / allOf / enum / not. */
  topObject: boolean;
  /** Every object says additionalProperties: false and requires every property (OpenAI strict). */
  closedObjects: boolean;
  /** What a function's name may be, as the agent names an MCP tool (its server prefix included). */
  name: RegExp;
}

const JSON_TYPES = ["string", "number", "integer", "boolean", "array", "object", "null"] as const;

/**
 * Gemini's FunctionDeclaration.parameters: an OpenAPI 3.0 subset. agy (Antigravity) hands MCP
 * tools to Gemini in this field, not parametersJsonSchema (the error names `parameters`).
 */
const GEMINI_KEYS = [
  "type", "format", "title", "description", "nullable", "enum", "items", "maxItems", "minItems", "properties", "required",
  "minProperties", "maxProperties", "minimum", "maximum", "minLength", "maxLength", "pattern", "example", "anyOf", "propertyOrdering", "default",
] as const;

export const SCHEMA_DIALECTS: Record<SchemaDialect, Fact<DialectRules>> = {
  gemini: {
    value: { keys: GEMINI_KEYS, typeRequired: true, types: JSON_TYPES, arrayItems: true, objectProperties: true, enumStringsOnly: true, topObject: true, closedObjects: false, name: /^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$/ },
    evidence: {
      kind: "VERIFIED",
      how:
        "an Antigravity task on hel failed twice on its first model call: INVALID_ARGUMENT (400) GenerateContentRequest.tools[0].function_declarations[18].parameters.properties[check].properties[succeedWhen].properties[oneOf].items: missing field (wait_for's check). The rest is DOCUMENTED, Gemini API reference, Schema (read 2026-11-22): `type` required; enum only for STRING; items for ARRAY; properties for OBJECT; anyOf supported; no oneOf, allOf, $ref, additionalProperties, const; an OBJECT with no properties is refused (\"should be non-empty for OBJECT type\": DOCUMENTED, discuss.ai.google.dev threads 56501 and 64086, LangChain.Utils.GoogleSchema; additionalProperties does not help)",
      date: "2026-11-22",
      version: "agy 1.5.14",
    },
  },
  openai: {
    value: { typeRequired: false, types: JSON_TYPES, arrayItems: true, objectProperties: false, enumStringsOnly: false, topObject: true, closedObjects: false, name: /^[a-zA-Z0-9_-]{1,64}$/ },
    evidence: {
      kind: "VERIFIED",
      how: "read openai/codex main, codex-rs/tools/src/responses_api.rs (MCP tools are sent with strict: false) and json_schema.rs (sanitize_json_schema fills a missing type); OpenAI's function calling refuses an array schema with no items (\"array schema missing items\", DOCUMENTED in its error text)",
      date: "2026-11-22",
      version: "codex main",
    },
  },
  "openai-strict": {
    value: { typeRequired: true, types: JSON_TYPES, arrayItems: true, objectProperties: false, enumStringsOnly: false, topObject: true, closedObjects: true, name: /^[a-zA-Z0-9_-]{1,64}$/ },
    evidence: { kind: "DOCUMENTED", source: "OpenAI Structured Outputs: every object additionalProperties: false and every property required. No agent Ducter runs sends MCP tools strict (Codex: strict: false), so no harness names this dialect; it is here so a harness that does names it and the test holds Ducter's tools to it" },
  },
  anthropic: {
    value: { typeRequired: false, types: JSON_TYPES, arrayItems: false, objectProperties: false, enumStringsOnly: false, topObject: true, closedObjects: false, name: /^[a-zA-Z0-9_-]{1,64}$/ },
    evidence: { kind: "DOCUMENTED", source: "Anthropic tool use: input_schema is a JSON Schema object (type \"object\" at the top); the API refuses oneOf, allOf or anyOf at the top level (its error text)" },
  },
};

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The longest name an agent gives one of Ducter's tools (Claude Code and Codex: mcp__ducter__<tool>;
 * Antigravity: mcp_ducter_<tool>), checked against a dialect's name rule.
 */
export const agentToolName = (tool: string) => `mcp__ducter__${tool}`;

/** Every way `schema` breaks `dialect`'s limits, each with its JSON path; empty: fine. */
export function schemaProblems(schema: unknown, dialect: SchemaDialect): string[] {
  const r = SCHEMA_DIALECTS[dialect].value;
  const out: string[] = [];
  const say = (path: string, what: string) => out.push(`${path || "(top)"}: ${what}`);
  if (r.topObject) {
    if (!isNode(schema) || schema.type !== "object") say("", 'the top level must be {type: "object"}');
    else for (const k of ["anyOf", "oneOf", "allOf", "enum", "not"]) if (k in schema) say("", `no ${k} at the top level`);
  }
  const walk = (n: unknown, path: string, nested: boolean) => {
    if (!isNode(n)) {
      say(path, "a schema must be an object");
      return;
    }
    if (r.keys) for (const k of Object.keys(n)) if (!r.keys.includes(k)) say(path, `key ${k} is not allowed`);
    const t = n.type;
    if (t === undefined) {
      if (r.typeRequired && !Array.isArray(n.anyOf)) say(path, "no type");
    } else if (typeof t !== "string") {
      if (r.typeRequired) say(path, "type must be one name, not a list");
    } else if (!r.types.includes(t)) say(path, `unknown type ${t}`);
    if (n.enum !== undefined) {
      if (!Array.isArray(n.enum)) say(path, "enum must be a list");
      else if (r.enumStringsOnly && (t !== "string" || n.enum.some((v) => typeof v !== "string"))) say(path, "enum only on a string, with string values");
    }
    if (t === "array" || n.items !== undefined) {
      if (n.items === undefined) {
        if (r.arrayItems) say(path, "an array must say what its items are");
      } else walk(n.items, `${path}.items`, true);
    }
    const props = isNode(n.properties) ? n.properties : undefined;
    if (t === "object" || props) {
      const names = Object.keys(props ?? {});
      if (r.objectProperties && nested && !names.length) say(path, "an object must name its properties");
      if (Array.isArray(n.required)) for (const k of n.required) if (typeof k !== "string" || !names.includes(k)) say(path, `required ${String(k)} is not a property`);
      if (r.closedObjects) {
        if (n.additionalProperties !== false) say(path, "additionalProperties must be false");
        const req = Array.isArray(n.required) ? n.required : [];
        for (const k of names) if (!req.includes(k)) say(path, `${k} must be required`);
      }
      for (const k of names) walk(props![k], `${path}.properties.${k}`, true);
    }
    if (Array.isArray(n.anyOf)) n.anyOf.forEach((s, i) => walk(s, `${path}.anyOf[${i}]`, true));
  };
  walk(schema, "", false);
  return out;
}

/**
 * A free-form JSON object in a tool's schema (a connection action's input, an app's keys): no
 * model family can be held to a map with no named properties (Gemini refuses one), so it is
 * written as JSON text. `jsonArg` reads it back.
 */
export function jsonText(description: string): { type: "string"; description: string } {
  return { type: "string", description: `${description}. A JSON object written as text, e.g. {"query":"renew","limit":5}` };
}

/**
 * The object a `jsonText` field holds: parsed from its text, or taken as it is from an agent that
 * sent an object anyway. Undefined when left out; anything else is an error that says the shape.
 */
export function jsonArg(v: unknown, name: string): Record<string, unknown> | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v) as unknown;
      if (x && typeof x === "object" && !Array.isArray(x)) return x as Record<string, unknown>;
    } catch {
      /* said below */
    }
  }
  throw new Error(`${name} must be a JSON object written as text, e.g. {"query":"renew"}; got ${JSON.stringify(v).slice(0, 80)}`);
}
