import { redactLocalPaths } from "./local-path-redaction.mjs";

export function safeMatrixArray(value, maxBytes) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => safeMatrixText(entry, maxBytes)).filter(Boolean))];
}

export function safeMatrixInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

export function safeMatrixIntegerArray(value, min, max) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max))]
    .sort((left, right) => left - right);
}

export function safeMatrixText(value, maxBytes) {
  const text = redactLocalPaths(value).replace(/\u0000/g, "");
  let output = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if ((codePoint >= 0 && codePoint < 0x20) || codePoint === 0x7f) {
      continue;
    }
    if (Buffer.byteLength(output + char, "utf8") > maxBytes) {
      break;
    }
    output += char;
  }
  return output;
}

export function removeEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) =>
      entry !== undefined &&
        entry !== "" &&
        (!Array.isArray(entry) || entry.length > 0)
    )
  );
}
