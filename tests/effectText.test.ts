import { describe, expect, it } from 'vitest';
import type { AtomName, EffectDef, Trigger } from '../src/core/effects/defs';
import { ATOM_LABELS, formatEffect, formatTrigger } from '../src/ui/effectText';

const atoms = Object.keys(ATOM_LABELS) as AtomName[];
const triggers: Trigger[] = [
  'onFire', 'onHit', 'onKill', 'onWaveStart', 'onBreach',
  'onPickup', 'interval', 'onMerge', 'passive',
];

describe('effect text coverage', () => {
  it.each(atoms)('formats %s as a Chinese mechanism sentence', atom => {
    // 故意用「全参数」超集喂给每个原子，验证文案层对任意原子都能成句；判别联合在此需显式放宽。
    const text = formatEffect({
      atom,
      params: {
        count: 2, bounces: 2, damageRetention: 0.7, searchRange: 120,
        ratio: 0.2, duration: 2, tickInterval: 0.5, damageRatio: 0.65,
        radius: 65, falloff: 0.5, distance: 30, mul: 1.2, amount: 10,
        damageMul: 1.5, absorbHits: 2, regenSeconds: 4, hpThresholdRatio: 0.2,
      },
    } as unknown as EffectDef).map(line => line.text).join(' ');
    expect(text).toMatch(/[\u4e00-\u9fff]/);
    expect(text).not.toContain('damageRetention');
    expect(text).not.toContain('tickInterval');
  });

  it.each(triggers)('formats trigger %s', trigger => {
    const text = formatTrigger(trigger, {
      seconds: 2,
      cooldownSeconds: 3,
      ...(trigger === 'onKill' ? { requiresSource: 'chain', requiresStatus: 'frozen' } : {}),
    });
    expect(text).toMatch(/[\u4e00-\u9fff]/);
    expect(text).not.toContain('requires');
  });

  it('recursively expands nested domain effects', () => {
    const lines = formatEffect({
      atom: 'groundZone',
      params: {
        radius: 80,
        duration: 3,
        effects: [
          { atom: 'dot', params: { damageRatio: 0.08, tickInterval: 0.5, duration: 2 } },
          { atom: 'slow', params: { ratio: 0.2, duration: 1.2 } },
        ],
      },
    });
    expect(lines.map(line => line.text).join(' ')).toContain('持续掉血');
    expect(lines.map(line => line.text).join(' ')).toContain('腿变慢 20%');
    expect(lines.some(line => line.depth === 1)).toBe(true);
  });

  it('formats line ground zones with their derived length and width', () => {
    const text = formatEffect({
      atom: 'groundZone',
      params: { shape: 'line', radius: 70, duration: 3, tickInterval: 0.5, effects: [] },
    }).map(line => line.text).join(' ');
    expect(text).toContain('拉出一条');
    expect(text).toContain('长 140');
    expect(text).toContain('宽 70');
  });
});
