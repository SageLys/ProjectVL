import { describe, expect, it } from 'vitest';
import { resolveArenaTapTarget } from '../src/input/arenaTapResolver';
import { enemy, freshState } from './helpers';

describe('arenaTapResolver · 掉落/Bounty 主动意图仲裁', () => {
  it('单一候选直接解析', () => {
    const s = freshState();
    s.groundDrops.push({ id: 1, x: 100, y: 100, type: 'damage', star: 1, life: 5, maxLife: 5, pulse: 0 });
    expect(resolveArenaTapTarget(s, 102, 100, 34, 12)).toMatchObject({ kind: 'drop', ambiguous: false });
  });

  it('同位置或归一化距离相同一律优先无风险掉落，避免扩张热区强制接单', () => {
    const s = freshState();
    s.groundDrops.push({ id: 1, x: 100, y: 100, type: 'damage', star: 1, life: 5, maxLife: 5, pulse: 0 });
    s.enemies.push(enemy({ id: 2, x: 100, y: 100, r: 16, bounty: { phase: 'offered', remaining: 8 } }));
    expect(resolveArenaTapTarget(s, 100, 100, 34, 18)).toMatchObject({ kind: 'drop', ambiguous: true });
  });

  it('赏金明显更靠近点击中心时仍可主动接单', () => {
    const s = freshState();
    s.groundDrops.push({ id: 1, x: 122, y: 100, type: 'damage', star: 1, life: 5, maxLife: 5, pulse: 0 });
    s.enemies.push(enemy({ id: 2, x: 100, y: 100, r: 16, bounty: { phase: 'offered', remaining: 8 } }));
    const result = resolveArenaTapTarget(s, 100, 100, 34, 18);
    expect(result).toMatchObject({ kind: 'bounty', ambiguous: true });
  });
});
