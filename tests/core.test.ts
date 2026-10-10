import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { FixedLoop, STEP } from '../src/core/fixedLoop';
import { angleDiff, segmentDistSq } from '../src/core/math';

describe('Rng', () => {
  it('replays identically from the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('stays within [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('FixedLoop', () => {
  it('advances in exact steps and reports interpolation alpha', () => {
    let steps = 0;
    let lastAlpha = -1;
    const loop = new FixedLoop({
      step: (dt) => {
        expect(dt).toBe(STEP);
        steps++;
      },
      render: (alpha) => {
        lastAlpha = alpha;
      },
    });
    loop.frame(0);
    loop.frame(1000 / 60 * 3 + 1);
    expect(steps).toBe(3);
    expect(lastAlpha).toBeGreaterThanOrEqual(0);
    expect(lastAlpha).toBeLessThan(1);
  });

  it('caps catch-up steps after a long hitch', () => {
    let steps = 0;
    const loop = new FixedLoop({ step: () => steps++, render: () => {} });
    loop.frame(0);
    loop.frame(5000);
    expect(steps).toBe(loop.maxStepsPerFrame);
  });
});

describe('math', () => {
  it('angleDiff wraps to the short way round', () => {
    expect(angleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
  });

  it('segmentDistSq measures to the nearest point of the segment', () => {
    expect(segmentDistSq(0, 0, 10, 0, 5, 3)).toBeCloseTo(9);
    expect(segmentDistSq(0, 0, 10, 0, 13, 4)).toBeCloseTo(25);
  });
});
