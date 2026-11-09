// @ducter/partner: the main AI. Entry point: createPartner(core, runner).
export { createPartner, type PartnerHandle, type PartnerOptions } from "./partner.ts";
export { buildSystemPrompt } from "./persona.ts";
export { redactSecrets } from "./partner.ts";
export { renderProjection, renderTrigger, renderHistoryLine, renderTasks, isChinese } from "./render.ts";
export { resolvePlace, findPaths, type PlaceFs } from "./place.ts";
export { createNmemBridge, bridgeFromEnv, inboxIds, senderOf, contactsOf, memberOf, opOf, type BridgeClient, type BridgeMessage, type BridgeContact, type BridgeOp } from "./bridge.ts";
export { createNmemClient, noMemory, provenanceRef, compactHit, type MemoryClient, type MemoryHit, type MemoryAdd, type Provenance } from "./memory.ts";
