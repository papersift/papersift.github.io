import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { wrapOffset } from '../../js/ui.js';

const offsets = (k, n) => Array.from({ length: n }, (_, i) => wrapOffset(i, k, n));

describe('wrapOffset', () => {
  test('active row is 0, the next one is below (+1), the previous above (-1)', () => {
    assert.deepEqual(offsets(0, 8), [0, 1, 2, 3, -4, -3, -2, -1]);
    assert.deepEqual(offsets(3, 8), [-3, -2, -1, 0, 1, 2, 3, -4]);
  });

  test('every offset falls in [-n/2, n/2) for even and odd n', () => {
    for (const n of [5, 7, 8]) {
      const half = Math.floor(n / 2);
      for (let k = -20; k <= 20; k++) {
        const o = offsets(k, n);
        assert.ok(o.every(v => v >= -half && v < n - half), `n=${n} k=${k}: ${o}`);
        assert.equal(new Set(o).size, n);
      }
    }
  });

  test('negative and large counters wrap like their remainder', () => {
    assert.deepEqual(offsets(-1, 8), offsets(7, 8));
    assert.deepEqual(offsets(19, 7), offsets(5, 7));
  });

  test('a single step moves every row by one except the one crossing the seam', () => {
    const n = 8, before = offsets(2, n), after = offsets(3, n);
    const jumps = before.filter((v, i) => Math.abs(after[i] - v) > 1);
    assert.equal(jumps.length, 1);
  });
});
