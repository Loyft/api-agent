/** Print successful JSON to stdout */
export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Print error envelope to stderr and exit 1 */
export function fail(
  code: string,
  message: string,
  extras: Record<string, unknown> = {},
): never {
  const error = {
    error: {
      code,
      message,
      retryable: false,
      ...extras,
    },
  };
  process.stderr.write(`${JSON.stringify(error, null, 2)}\n`);
  process.exit(1);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
