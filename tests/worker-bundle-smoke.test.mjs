import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker.js';

test('generated Worker bundle exposes the Cloudflare module handlers', () => {
  assert.deepEqual(Object.keys(worker).sort(), ['fetch', 'scheduled']);
  assert.equal(typeof worker.fetch, 'function');
  assert.equal(typeof worker.scheduled, 'function');
});
