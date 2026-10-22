import type { VoiceTimestamp } from "../project-schema";

function seconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeTimestampArray(value: unknown): VoiceTimestamp[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const start = seconds(item.start ?? item.start_time ?? item.startSeconds);
    const end = seconds(item.end ?? item.end_time ?? item.endSeconds);
    if (start === undefined || end === undefined || end < start) return [];
    const text = typeof item.word === "string" ? item.word : typeof item.text === "string" ? item.text : typeof item.character === "string" ? item.character : "";
    return [{ text, startSeconds: start, endSeconds: end }];
  });
}

function normalizeAlignment(value: unknown): VoiceTimestamp[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const alignment = value as Record<string, unknown>;
  const characters = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return [];
  return characters.flatMap((character, index) => {
    const start = seconds(starts[index]);
    const end = seconds(ends[index]);
    if (typeof character !== "string" || start === undefined || end === undefined || end < start) return [];
    return [{ text: character, startSeconds: start, endSeconds: end }];
  });
}

export function normalizeFalVoiceTimestamps(data: Record<string, unknown>): VoiceTimestamp[] {
  const directTimestamps = normalizeTimestampArray(data.timestamps);
  if (directTimestamps.length > 0) return directTimestamps;

  if (Array.isArray(data.timestamps)) {
    const nestedAlignments = data.timestamps.flatMap((entry) => normalizeAlignment(entry));
    if (nestedAlignments.length > 0) return nestedAlignments;
  }

  return normalizeAlignment(data.alignment);
}
