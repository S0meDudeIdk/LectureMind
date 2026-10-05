import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLectureContent, timestampSeconds, validateMedia, UUID_PATTERN } from '../shared/lectureContract.js';

test('lecture content requires every section and rejects malformed entries', () => {
  const good = { markdown: '# Topic', notes: '# Notes', transcript: [] };
  assert.deepEqual(validateLectureContent(good), good);
  for (const invalid of [{ ...good, notes: '' }, { ...good, markdown: '' }, { ...good, transcript: undefined }, { ...good, transcript: [{ startTime: '00:00', textBlock: '' }] }]) assert.throws(() => validateLectureContent(invalid));
});
test('ordered valid timestamps support hours and reject impossible seconds', () => {
  assert.equal(timestampSeconds('01:02:03'), 3723);
  assert.equal(timestampSeconds('12:34'), 754);
  assert.throws(() => timestampSeconds('00:99'));
  assert.throws(() => validateLectureContent({ markdown: '# Map', notes: '# Notes', transcript: [{ startTime: '00:02', textBlock: 'first' }, { startTime: '00:01', textBlock: 'second' }] }));
});
test('file limits and types are checked at the boundary', () => {
  assert.equal(validateMedia({ type: 'video/mp4', size: 100 }, 100), 'video/mp4');
  for (const file of [{ type: 'video/mp4', size: 101 }, { type: 'text/html', size: 10 }, { type: 'audio/mpeg', size: 0 }]) assert.throws(() => validateMedia(file, 100));
  assert(UUID_PATTERN.test(crypto.randomUUID()));
  assert(!UUID_PATTERN.test('../outside'));
});
