import { fail } from './errors';
import { validateLectureContent } from '../shared/lectureContract.js';

export function parseLectureResponse(response: any) {
  const finishReason = response?.candidates?.[0]?.finishReason;
  if (finishReason !== 'STOP') fail(502, 'INCOMPLETE_GENERATION', 'AI output was incomplete. Try a shorter recording.');
  const raw = typeof response.text === 'string' ? response.text.trim() : '';
  if (!raw || raw.length > 400000) fail(502, 'INVALID_GENERATION', 'AI returned empty or oversized lecture content.');
  const section = (name: string) => {
    const start = `===${name}_START===`, end = `===${name}_END===`;
    const begin = raw.indexOf(start), finish = raw.indexOf(end, begin + start.length);
    if (begin < 0 || finish < 0) fail(502, 'INCOMPLETE_GENERATION', `AI output is missing a complete ${name.toLowerCase()} section.`);
    const value = raw.slice(begin + start.length, finish).trim().replace(/^```(?:markdown|json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    if (!value) fail(502, 'INCOMPLETE_GENERATION', `AI output has an empty ${name.toLowerCase()} section.`);
    return value;
  };
  const markdown = section('MINDMAP'), notes = section('NOTES');
  let transcript: any;
  try { transcript = JSON.parse(section('TRANSCRIPT')); } catch (error) {
    if ((error as any).code) throw error;
    fail(502, 'INVALID_TRANSCRIPT', 'AI returned an invalid transcript.');
  }
  let previous = -1;
  if (!Array.isArray(transcript) || transcript.length > 5000) fail(502, 'INVALID_TRANSCRIPT', 'AI returned an invalid or oversized transcript.');
  transcript = transcript.map((chunk: any) => {
    if (!chunk || typeof chunk.startTime !== 'string' || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(chunk.startTime) || typeof chunk.textBlock !== 'string' || !chunk.textBlock.trim()) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps or text.');
    const parts = chunk.startTime.split(':').map(Number);
    if (parts.slice(1).some((part: number) => part > 59)) fail(502, 'INVALID_TRANSCRIPT', 'AI returned invalid transcript timestamps.');
    const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    if (seconds < previous) fail(502, 'INVALID_TRANSCRIPT', 'AI returned transcript timestamps out of order.');
    previous = seconds;
    return { startTime: chunk.startTime, textBlock: chunk.textBlock.trim() };
  });
  const result = {markdown, notes, transcript};
  try { validateLectureContent(result); } catch { fail(502,'INVALID_GENERATION','AI returned invalid lecture content.'); }
  if (Buffer.byteLength(JSON.stringify(result)) > 700000) fail(502, 'INVALID_GENERATION', 'AI returned oversized lecture content.');
  return result;
}
