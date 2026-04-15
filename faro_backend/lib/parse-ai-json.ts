/**
 * Strip markdown code fences that AI models sometimes add despite being told not to,
 * then parse the result as JSON.
 */
export function parseAiJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(stripped);
}
