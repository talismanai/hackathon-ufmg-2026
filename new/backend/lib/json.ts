export function safeStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) =>
      currentValue instanceof Date ? currentValue.toISOString() : currentValue,
    2
  );
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
