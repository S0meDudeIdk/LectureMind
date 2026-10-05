export const SCHEMA_VERSION: number;
export const MEDIA_TYPES: readonly string[];
export const UUID_PATTERN: RegExp;
export interface TranscriptEntry { startTime: string; textBlock: string }
export interface LectureContent { markdown: string; notes: string; transcript: TranscriptEntry[] }
export function timestampSeconds(value: unknown): number;
export function validateLectureContent(value: unknown): LectureContent;
export function validateMedia(file: { size: number; type?: string }, limit: number): string;
