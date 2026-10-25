import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationClient } from '../dist/esm/index.js';

test('offline puzzle attempts and notebook annotation search preserve queries and bearer', async () => {
  const calls = [];
  const api = new ApplicationClient({ fetch: async (url, init) => {
    calls.push({url: new URL(url), ...init}); return Response.json({});
  }});
  await api.accountPuzzleBatch('fixture', 50, { result: 'missed' });
  assert.equal(calls.at(-1).url.search, '?limit=50&result=missed');
  await api.accountPuzzleNext('fixture', undefined, { result: 'missed' });
  assert.equal(calls.at(-1).url.searchParams.get('result'), 'missed');
  await api.accountPuzzleHistory('fixture', 1, 20, { result: 'missed' });
  assert.equal(calls.at(-1).url.searchParams.get('result'), 'missed');
  const eventId = 'f39112c7-f108-475f-9d44-98e1765bf538';
  await api.accountPuzzleResult('p-00000001', 'missed', 'fixture', {eventId, generation: 3, revision: 'a'.repeat(64)});
  assert.deepEqual(JSON.parse(calls.at(-1).body), {result: 'missed', event_id: eventId, generation: 3, revision: 'a'.repeat(64)});
  await api.accountNotebookAnnotationSearch('fixture', {q: 'king & pawn', kind: 'comments', cursor: 'a:b'});
  assert.equal(calls.at(-1).url.searchParams.get('q'), 'king & pawn');
  assert.equal(calls.at(-1).url.searchParams.get('cursor'), 'a:b');
  assert.equal(new Headers(calls.at(-1).headers).get('Authorization'), 'Bearer fixture');
  const count = calls.length;
  assert.throws(() => api.accountPuzzleBatch('fixture', 101), {code: 'invalid_request'});
  assert.throws(() => api.accountPuzzleResult('p-00000001', 'missed', 'fixture', {generation: 3}), {code: 'invalid_request'});
  assert.equal(calls.length, count);
});
