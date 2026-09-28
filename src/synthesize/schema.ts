import { isRecord } from "../util/json.js";

/** Infer a lightweight JSON Schema from a sample value */
export function inferJsonSchema(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 6) {
    return { type: "object", description: "truncated" };
  }

  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} };
    }
    return {
      type: "array",
      items: inferJsonSchema(value[0], depth + 1),
    };
  }

  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      if (!isRecord(value)) return { type: "object" };
      const properties: Record<string, unknown> = {};
      const keys = Object.keys(value).slice(0, 40);
      for (const key of keys) {
        properties[key] = inferJsonSchema(value[key], depth + 1);
      }
      return {
        type: "object",
        properties,
      };
    }
    default:
      return {};
  }
}

/** Flatten top-level keys for docs / descriptions */
export function topLevelFieldNames(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0 && isRecord(value[0])) {
    return Object.keys(value[0]).slice(0, 20);
  }
  if (isRecord(value)) {
    return Object.keys(value).slice(0, 20);
  }
  return [];
}
