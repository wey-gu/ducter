// @ducter/partner: the main AI. Entry point: createPartner(core, runner).
export { createPartner, type PartnerHandle, type PartnerOptions } from "./partner.ts";
export { buildSystemPrompt } from "./persona.ts";
export { redactSecrets } from "./partner.ts";
export { renderProjection, renderTrigger, renderHistoryLine, renderTasks, isChinese } from "./render.ts";
export { resolvePlace, findPaths, type PlaceFs } from "./place.ts";
export { createNmemBridge, bridgeFromEnv, inboxIds, senderOf, contactsOf, memberOf, opOf, type BridgeClient, type BridgeMessage, type BridgeContact, type BridgeOp } from "./bridge.ts";
export { createNmemClient, noMemory, provenanceRef, compactHit, type MemoryClient, type MemoryHit, type MemoryAdd, type Provenance } from "./memory.ts";
export { createSpine, memorySpineStore, type Spine, type SpineOptions, type SpineView } from "./spine/spine.ts";
export { createHarnessWriter, writerPrompt, parseDigest, type DigestWriter, type WriterInput } from "./spine/writer.ts";
export { autoRecall, recallIntent, renderRecall } from "./spine/recall.ts";
