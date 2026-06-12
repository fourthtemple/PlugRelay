import fs from "node:fs";

const PROTOCOL_SCHEMA_URL = new URL("../packages/protocol/schema/protocol.schema.json", import.meta.url);
const KNOWN_COMMANDS = new Set(
  JSON.parse(fs.readFileSync(PROTOCOL_SCHEMA_URL, "utf8")).$defs.command.enum
);
const REQUEST_ENVELOPE_KEYS = new Set(["type", "id", "command", "payload", "sessionToken"]);

export function requestEnvelopeError(envelope) {
  if (!isPlainObject(envelope)) {
    return { code: "bad_envelope", message: "Request envelope is invalid." };
  }

  const unsupportedKeys = Object.keys(envelope).filter((key) => !REQUEST_ENVELOPE_KEYS.has(key));
  if (unsupportedKeys.length > 0) {
    return {
      code: "bad_envelope",
      message: "Request envelope contains unsupported fields.",
      details: { fields: unsupportedKeys }
    };
  }
  if (envelope.type !== "request" || typeof envelope.id !== "string" || envelope.id.length === 0) {
    return { code: "bad_envelope", message: "Request envelope is invalid." };
  }
  if (typeof envelope.command !== "string" || !KNOWN_COMMANDS.has(envelope.command)) {
    return { code: "bad_command", message: "Request command is not supported." };
  }
  if (!isPlainObject(envelope.payload)) {
    return { code: "bad_payload", message: "Request payload must be an object." };
  }
  if (envelope.sessionToken != null && typeof envelope.sessionToken !== "string") {
    return { code: "bad_envelope", message: "Request sessionToken must be a string when supplied." };
  }
  return undefined;
}

export function requestEnvelopeResponseId(envelope) {
  return typeof envelope?.id === "string" && envelope.id.length > 0 ? envelope.id : "unknown";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
