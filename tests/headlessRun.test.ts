// 无头整局冒烟：真实配置 + 占位技能卡定义，简单 bot 跑完一整局。
// 验证解释器/效果运行时在完整 update 循环中不炸、遥测字段联动、variant 可跑。
import { describe, it, expect, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { updateGame } from '../src/core/updateGame';
import { startNextWave } from '../src/core/systems/waveSystem';
import { collectNearest } from '../src/core/systems/dropSystem';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { applyPerk } from '../src/core/systems/progressionSystem';
import type { Config, GameState, Rng } from '../src/core/types';
import { freshState, createDefaultConfig, resetTestEnv, applyVariants } from './helpers';
import { stageForWave } from '../src/core/runStage';
import { calculateBuildMaturity } from '../src/core/systems/dropTypePolicy';

beforeEach(resetTestEnv);

/** 确定性伪随机（mulberry32）。 */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 简单 bot：点掉落、装备 3★、手牌将满时消耗释放、升级即选 perk。 */
interface ValidationEntrySnapshot { wave: number; maturity: number; highestStar: number; equippedCount: number }

function runBotGame(s: GameState, config: Config, rng: Rng): ValidationEntrySnapshot | undefined {
  startNextWave(s, config, rng);
  const dt = 1 / 30;
  let validationEntry: ValidationEntrySnapshot | undefined;
  for (let frame = 0; frame < 30 * 60 * 25 && s.mode === 'playing'; frame++) {
    updateGame(s, config, rng, dt);
    if (!validationEntry && stageForWave(s.wave, cfg.waves.totalWaves, cfg.waves.stagePlan) === 'validation') {
      const cards = [...s.cards, ...s.equipment].filter(card => card !== null);
      validationEntry = {
        wave: s.wave,
        maturity: Number(calculateBuildMaturity(s).toFixed(4)),
        highestStar: cards.reduce((highest, card) => Math.max(highest, card.star), 0),
        equippedCount: s.equipment.filter(card => card !== null).length,
      };
    }
    if (s.paused && s.offeredPerks.length) applyPerk(s, config, s.offeredPerks[frame % s.offeredPerks.length], rng);
    if (frame % 6 === 0 && s.groundDrops.length) {
      const d = s.groundDrops[0];
      collectNearest(s, config, rng, d.x, d.y, cfg.economy.drops.pickupRadius);
    }
    if (frame % 30 === 0) {
      const idx = s.cards.findIndex(c => c && c.star >= cfg.economy.equipThreshold);
      if (idx >= 0) {
        const target = s.equipment.findIndex(c => c === null);
        if (target >= 0) moveOrSwap(s, config, rng, 'cards', idx, 'equipment', target);
      }
    }
    if (frame % 15 === 0 && s.cards.filter(c => c === null).length <= 1) {
      const oneStarIndex = s.cards.findIndex(card => card?.star === 1);
      const idx = oneStarIndex >= 0 ? oneStarIndex : s.cards.findIndex(Boolean);
      if (idx >= 0) consumeCard(s, config, rng, idx, 480 + (rng() - 0.5) * 200, 300 + (rng() - 0.5) * 150);
    }
  }
  return validationEntry;
}

describe('整局冒烟（占位技能卡=配置数据，经通用解释器结算）', () => {
  it('base（方案A独立装备格）：整局可跑，拾取/合成/装备/消耗全联动', () => {
    registerSkillDefs(cfg.skills.cards); // 全部正式卡（批次1+批次2）
    const s = freshState();
    const config = createDefaultConfig();
    // 固定使用能在当前控制预算与 11 卡池下跑满拾取、合成、装备与消耗路径的 seed。
    runBotGame(s, config, seeded(3));
    expect(s.mode).toBe('ended');
    expect(s.collected).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
    expect(s.merges).toBeGreaterThan(0);
    expect(s.equipOps).toBeGreaterThan(0);
    expect(s.consumes).toBeGreaterThan(0);
  });

  it('dev-short variant：3 波短局可跑', () => {
    applyVariants(['dev-short']);
    registerSkillDefs(cfg.skills.cards);
    const s = freshState();
    const config = createDefaultConfig();
    runBotGame(s, config, seeded(7));
    expect(s.mode).toBe('ended');
    expect(s.wave).toBeLessThanOrEqual(3);
  });

  it('compares build maturity at validation entry for 8-wave and 10-wave layouts with one fixed seed', () => {
    const seed = 42;
    registerSkillDefs(cfg.skills.cards);
    const baseState = freshState();
    const baseConfig = createDefaultConfig();
    baseState.hp = 1_000_000;
    baseConfig.damage = 200;
    const base = runBotGame(baseState, baseConfig, seeded(seed));

    applyVariants(['validation-10']);
    registerSkillDefs(cfg.skills.cards);
    const variantState = freshState();
    const variantConfig = createDefaultConfig();
    variantState.hp = 1_000_000;
    variantConfig.damage = 200;
    const variant = runBotGame(variantState, variantConfig, seeded(seed));

    expect(base).toMatchObject({ wave: 7, maturity: expect.any(Number), highestStar: expect.any(Number), equippedCount: expect.any(Number) });
    expect(variant).toMatchObject({ wave: 9, maturity: expect.any(Number), highestStar: expect.any(Number), equippedCount: expect.any(Number) });
    expect(variant!.equippedCount).toBeGreaterThanOrEqual(base!.equippedCount);
  });
});
