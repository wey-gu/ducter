// @ducter/partner: the main AI. Entry point: createPartner(core, runner).
export { createPartner, type PartnerHandle, type PartnerOptions } from "./partner.ts";
export { buildSystemPrompt } from "./persona.ts";
export { renderProjection, renderTrigger, renderHistoryLine, renderTasks, isChinese } from "./render.ts";
export { resolvePlace, findPaths, type PlaceFs } from "./place.ts";
