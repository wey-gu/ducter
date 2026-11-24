// The Autofill key's place (D191) lives in protocol/src/lock-key.ts since D539, so a worker (no core)
// locks the keys it keeps with the same code.
export * from "@ducter/protocol/src/lock-key.ts";
