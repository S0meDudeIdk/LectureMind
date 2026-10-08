import { fail } from './errors';
import { validateLectureContent } from '../shared/lectureContract.js';

function parseTranscriptSection(rawSection: string): any[] {
  let cleaned = rawSection.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  if (cleaned === '[]' || cleaned === '') return [];

  try {
    const direct = JSON.parse(cleaned);
    if (Array.isArray(direct)) return direct;
  } catch {}

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const sliced = cleaned.slice(firstBracket, lastBracket + 1);
    const noTrailingCommas = sliced.replace(/,\s*([\]}])/g, '$1');
    try {
      const parsed = JSON.parse(noTrailingCommas);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  const items: any[] = [];
  const objRegex = /\{[^{}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(cleaned)) !== null) {
    const block = match[0].replace(/,\s*\}/g, '}');
    try {
      const item = JSON.parse(block);
      if (item && typeof item === 'object') {
        items.push(item);
        continue;
      }
    } catch {}
    const timeMatch = /"(?:startTime|timestamp|start|time)"\s*:\s*"([^"]+)"/i.exec(block);
    const textMatch = /"(?:textBlock|text|content|sentence)"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(block);
    if (timeMatch && textMatch) {
      let text = textMatch[1];
      try { text = JSON.parse(`"${text}"`); } catch {}
      items.push({ startTime: timeMatch[1], textBlock: text });
    }
  }

  if (items.length > 0) return items;

  if (/^(?:\[\s*\]|none|no\s+(?:audio|speech|spoken\s+words?)|n\/a)$/i.test(cleaned)) {
    return [];
  }

  fail(502, 'INVALID_TRANSCRIPT', 'AI returned an invalid transcript.');
}

export function parseLectureResponse(response: any) {
  const finishReason = response?.candidates?.[0]?.finishReason;
  if (finishReason !== 'STOP') fail(502, 'INCOMPLETE_GENERATION', 'AI output was incomplete. Try a shorter recording.');
  const raw = typeof response.text === 'string' ? response.text.trim() : '';
  if (!raw || raw.length > 400000) fail(502, 'INVALID_GENERATION', 'AI returned empty or oversized lecture content.');
  const section = (name: string) => {
    const regex = new RegExp(`===\\s*${name}_START\\s*===([\\s\\S]*?)===\\s*${name}_END\\s*===`, 'i');
    const match = regex.exec(raw);
    if (!match) fail(502, 'INCOMPLETE_GENERATION', `AI output is missing a complete ${name.toLowerCase()} section.`);
    const value = match[1].trim().replace(/^```(?:markdown|json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    if (!value) fail(502, 'INCOMPLETE_GENERATION', `AI output has an empty ${name.toLowerCase()} section.`);
    return value;
  };
  const markdown = section('MINDMAP'), notes = section('NOTES');
  let transcript: any;
  try { transcript = parseTranscriptSection(section('TRANSCRIPT')); } catch (error) {
    if ((error as any).code) throw error;
    fail(502, 'INVALID_TRANSCRIPT', 'AI returned an invalid transcript.');
  }
  let previous = -1;
  if (!Array.isArray(transcript) || transcript.length > 5000) fail(502, 'INVALID_TRANSCRIPT', 'AI returned an invalid or oversized transcript.');
  const mappedTranscript = transcript.map((chunk: any) => {
    if (!chunk || typeof chunk !== 'object') fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps or text.');
    const rawText = typeof chunk.textBlock === 'string'
      ? chunk.textBlock
      : (typeof chunk.text === 'string' ? chunk.text : (typeof chunk.content === 'string' ? chunk.content : (typeof chunk.sentence === 'string' ? chunk.sentence : '')));
    if (!rawText.trim()) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps or text.');

    const rawTime = typeof chunk.startTime === 'string'
      ? chunk.startTime
      : (typeof chunk.timestamp === 'string' ? chunk.timestamp : (typeof chunk.start === 'string' ? chunk.start : (typeof chunk.time === 'string' ? chunk.time : '')));
    if (!rawTime.trim()) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps or text.');

    let timeStr = rawTime.trim().replace(/[.,]\d+$/, '');
    if (/^\d:\d{2}$/.test(timeStr)) timeStr = `0${timeStr}`;
    else if (/^\d:\d{2}:\d{2}$/.test(timeStr)) timeStr = `0${timeStr}`;
    else if (/^\d+$/.test(timeStr)) {
      const totalSec = Number(timeStr);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(timeStr)) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps or text.');
    const parts = timeStr.split(':').map(Number);
    if (parts.slice(1).some((part: number) => part > 59)) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps.');
    const seconds = parts.reduce((acc, n) => acc * 60 + n, 0);
    return { seconds, startTime: timeStr, textBlock: rawText.trim() };
  });
  mappedTranscript.sort((a: any, b: any) => a.seconds - b.seconds);
  transcript = mappedTranscript.map((chunk: any) => {
    const current = Math.max(chunk.seconds, previous);
    previous = current;
    const h = Math.floor(current / 3600);
    const m = Math.floor((current % 3600) / 60);
    const s = current % 60;
    const formatted = h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return { startTime: formatted, textBlock: chunk.textBlock };
  });
  const result = {markdown, notes, transcript};
  try { validateLectureContent(result); } catch { fail(502,'INVALID_GENERATION','AI returned invalid lecture content.'); }
  if (Buffer.byteLength(JSON.stringify(result)) > 700000) fail(502, 'INVALID_GENERATION', 'AI returned oversized lecture content.');
  return result;
}
