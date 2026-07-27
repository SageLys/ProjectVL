// 黄金回放（T0.5）：跨引擎一致性基线，同时是 H5 自身的确定性回归防线。
// 本文件**只读**——fixture 只能由 `npm run replay:record` 重生成，避免被无意覆盖。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runReplay } from '../src/core/replay/record';
import { makeRng } from '../src/core/rng';
import { GOLDEN_DIR, loadSpecs, loadSummary } from './golden/fixtures';
import { resetTestEnv } from './helpers';

const specs = loadSpecs();

beforeEach(resetTestEnv);
afterEach(resetTestEnv);

describe('rng · 可播种且跨平台可复刻', () => {
  it('同 seed 逐位相同，不同 seed 立即分叉', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const first = Array.from({ length: 2000 }, () => a());
    const second = Array.from({ length: 2000 }, () => b());
    const other = Array.from({ length: 2000 }, () => c());
    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
    expect(first.every(value => value >= 0 && value < 1)).toBe(true);
  });

  it('前 8 抽是冻结常量：Unity 侧照抄本序列即可自检 mulberry32 实现', () => {
    const rng = makeRng(42);
    const draws = Array.from({ length: 8 }, () => Number(rng().toFixed(12)));
    expect(draws).toEqual([
      0.60110375192, 0.448290558998, 0.85246579349, 0.669734041439,
      0.174813898746, 0.526592542185, 0.27322799433, 0.624744653935,
    ]);
  });
});

describe('rng · core 路径不得混入不可播种随机', () => {
  it('src/core/** 全域没有 Math.random（rng 一律由调用方注入）', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && readFileSync(full, 'utf8').includes('Math.random')) {
          offenders.push(full);
        }
      }
    };
    walk(join(GOLDEN_DIR, '..', '..', 'src', 'core'));
    expect(offenders).toEqual([]);
  });
});

describe('黄金回放 · fixture 与实现一致', () => {
  it('fixture 集合覆盖约定的五个场景', () => {
    expect(specs.map(spec => spec.id)).toEqual([
      '01-slice-combat',
      '02-slice-consumable',
      '03-slice-merge-equip',
      '04-run-victory',
      '05-run-defeat',
    ]);
  });

  it.each(specs.map(spec => [spec.id, spec] as const))('%s 重放结果与已提交 summary 逐位相等', (_id, spec) => {
    expect(runReplay(spec)).toEqual(loadSummary(spec.id));
  });

  it.each(specs.map(spec => [spec.id, spec] as const))('%s 连跑两次自洽（纯确定性）', (_id, spec) => {
    expect(runReplay(spec)).toEqual(runReplay(spec));
  });

  it('五个场景各自命中了它要覆盖的语义', () => {
    const summary = (id: string) => loadSummary(id);

    // ① 纯战斗切片：有击杀与掉落，且不含任何决策事件（Unity 一期可完整复刻）。
    const combat = summary('01-slice-combat');
    expect(combat.counters.kills).toBeGreaterThan(0);
    expect(combat.cumulativeDamageDealt).toBeGreaterThan(0);
    expect(combat.dropSequence.some(drop => drop.action === 'spawned')).toBe(true);
    expect(combat.eventCounts.decisionOffered).toBeUndefined();

    // ③ 消耗态释放。
    expect(summary('02-slice-consumable').counters.consumes).toBe(2);
    expect(summary('02-slice-consumable').eventCounts.skillConsumed).toBe(2);

    // ④ 合成升星 + 装备态：3★ frost 进入装备栏。
    const merge = summary('03-slice-merge-equip');
    expect(merge.counters.merges).toBe(3);
    expect(merge.equipment).toEqual([expect.objectContaining({ slot: 0, cardType: 'frost', star: 3 })]);

    // ① 通关 / ② 失败。
    expect(summary('04-run-victory')).toMatchObject({ mode: 'ended', win: true });
    expect(summary('05-run-defeat')).toMatchObject({ mode: 'ended', win: false });
    expect(summary('05-run-defeat').cumulativeDamageTaken).toBeGreaterThan(0);

    // ⑤ 状态控制：冻结/减速经由消耗态与装备态生效（rng 抽取次数是调用次序指纹）。
    expect(summary('02-slice-consumable').rng.draws).toBeGreaterThan(0);
  });

  it('spec 的关键字段被 summary 原样回写，便于 Unity 端对齐输入', () => {
    for (const spec of specs) {
      const recorded = loadSummary(spec.id).spec;
      expect(recorded).toEqual({
        id: spec.id, seed: spec.seed, variants: spec.variants,
        dt: spec.dt, frames: spec.frames, start: spec.start,
      });
    }
  });
});
