// D312: which partner is acting now. A tool call from another partner than the default (or from a
// task of another partner) runs inside actAs(id), so whatever core writes to the conversation while
// it handles the call (a wait, a routine's proposal, a card) lands in that partner's own
// conversation (partner-view.ts routes it). Undefined: the default partner, or nobody (a timer).
import { AsyncLocalStorage } from "node:async_hooks";

const acting = new AsyncLocalStorage<string | undefined>();

export function actAs<T>(persona: string | undefined, fn: () => T): T {
  return acting.run(persona, fn);
}

export function actingPersona(): string | undefined {
  return acting.getStore();
}
