export type MakeWebhookResponse =
  | {
      reply?: unknown;
      response?: unknown;
      text?: unknown;
      error?: unknown;
    }
  | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseMakeWebhookResponse = (raw: string): MakeWebhookResponse => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as MakeWebhookResponse;
  } catch {
    return null;
  }
};

const tryParseJson = (value: string): unknown | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  };

  const parsed = tryParse(trimmed);
  if (parsed !== null) return parsed;

  // Some webhook flows return JSON as an escaped string like: { \"reply\": \"...\" }
  // which is not valid JSON until we remove the backslashes before quotes.
  const repaired = trimmed.replace(/\\\"/g, '"');
  if (repaired !== trimmed) return tryParse(repaired);

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const pluckText = (value: unknown, depth = 0): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const maybeJson = tryParseJson(trimmed);
    if (maybeJson !== null && depth < 3) {
      const nested = pluckText(maybeJson, depth + 1);
      if (nested) return nested;
    }
    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pluckText(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value) || depth > 3) return null;

  // Common webhook response shapes, plus nested structures (reply can be an object).
  const keys = ['reply', 'response', 'text', 'message'] as const;
  for (const key of keys) {
    if (!(key in value)) continue;
    const found = pluckText(value[key], depth + 1);
    if (found) return found;
  }

  return null;
};

export const extractMakeAssistantText = (raw: string, parsed: MakeWebhookResponse): string => {
  const fromParsed = pluckText(parsed);
  if (fromParsed) return fromParsed;

  const parsedRaw = tryParseJson(raw);
  const fromRawJson = pluckText(parsedRaw);
  if (fromRawJson) return fromRawJson;

  return raw.trim();
};

export const extractMakeError = (raw: string, parsed: MakeWebhookResponse): string | null => {
  const fromParsed = pluckText(parsed && isRecord(parsed) ? parsed.error : null);
  if (fromParsed) return fromParsed;

  const parsedRaw = tryParseJson(raw);
  if (isRecord(parsedRaw)) {
    const errorText = pluckText(parsedRaw.error);
    if (errorText) return errorText;
  }

  return null;
};
