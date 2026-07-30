// 无头整局冒烟：真实配置 + 占位技能卡定义，简单 bot 跑完一整局。
// 验证解释器/效果运行时在完整 update 循环中不炸、遥测字段联动、variant 可跑。
import { describe, it, expect, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { updateGame } from '../src/core/updateGame';
import { makeRng } from '../src/core/rng';
import { collectNearest } from '../src/core/systems/dropSystem';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { confirmRewardReceipt } from '../src/core/systems/rewardMeterSystem';
import { beginOpeningIntermission, confirmIntermissionReady } from '../src/core/systems/intermissionSystem';
import type { Config, GameState, Rng } from '../src/core/types';
import { freshState, createDefaultConfig, resetTestEnv, applyVariants } from './helpers';
import { stageForWave } from '../src/core/runStage';
import { calculateBuildMaturity } from '../src/core/systems/dropTypePolicy';

beforeEach(resetTestEnv);

/** 确定性伪随机（mulberry32）：与黄金回放共用 core/rng.ts 的唯一实现。 */
const seeded = (seed: number): Rng => makeRng(seed);

/** 简单 bot：点掉落、装备 3★、手牌将满时消耗释放、决策即选择。 */
interface ValidationEntrySnapshot { wave: number; maturity: number; highestStar: number; equippedCount: number }

function runBotGame(s: GameState, config: Config, rng: Rng): ValidationEntrySnapshot | undefined {
  beginOpeningIntermission(s);
  const dt = 1 / 30;
  let validationEntry: ValidationEntrySnapshot | undefined;
  for (let frame = 0; frame < 30 * 60 * 25 && s.mode === 'playing'; frame++) {
    updateGame(s, config, rng, dt);
    while (s.rewardMeter.currentReceipt) confirmRewardReceipt(s, config, rng);
    if (!validationEntry && stageForWave(s.wave, cfg.waves.totalWaves, cfg.waves.stagePlan) === 'validation') {
      const cards = [...s.cards, ...s.equipment].filter(card => card !== null);
      validationEntry = {
        wave: s.wave,
        maturity: Number(calculateBuildMaturity(s).toFixed(4)),
        highestStar: cards.reduce((highest, card) => Math.max(highest, card.star), 0),
        equippedCount: s.equipment.filter(card => card !== null).length,
      };
    }
    if (s.decisions.current) {
      const decision = s.decisions.current;
      const choice = decision.kind === 'godDraft' || decision.kind === 'godFocus' || decision.kind === 'recipePin'
        ? decision.candidates[0]
        : decision.kind === 'waveBaseReward'
          ? decision.candidates[0]
        : decision.kind === 'evolutionBranch'
          ? decision.options[0]
          : '';
      resolveCurrentDecision(s, config, rng, choice);
    }
    if (s.intermission.active && s.intermission.step === 'free') confirmIntermissionReady(s);
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
    s.hp = 1_000_000;
    s.maxHp = 1_000_000;
    config.damage = 200;
    // 固定使用能在当前控制预算与 11 卡池下跑满拾取、合成、装备与消耗路径的 seed。
    runBotGame(s, config, seeded(3));
    expect(s.mode).toBe('ended');
    expect(s.collected).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
    expect(s.merges).toBeGreaterThan(0);
    expect(s.equipOps).toBeGreaterThan(0);
    expect(s.consumes).toBeGreaterThan(0);
    expect(s.godPool.mainGod).not.toBeNull();
    expect(s.godPool.subGods).toHaveLength(2);
    expect(s.godPool.runRoster).toHaveLength(11);
    expect(s.godPool.activePool.length).toBeLessThanOrEqual(7);
    const shownTypes = Object.entries(s.normalDropDirector.typeStats)
      .filter(([, stats]) => stats.totalShown > 0)
      .map(([type]) => type);
    expect(shownTypes.every(type => s.godPool.runRoster.includes(type))).toBe(true);
    expect(s.rewardMeter.activationCount).toBeGreaterThanOrEqual(5);
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

  it('reproduces the 10-wave validation-entry snapshot with one fixed seed', () => {
    const seed = 42;
    registerSkillDefs(cfg.skills.cards);
    const baseState = freshState();
    const baseConfig = createDefaultConfig();
    baseState.hp = 1_000_000;
    baseConfig.damage = 200;
    const first = runBotGame(baseState, baseConfig, seeded(seed));

    const repeatState = freshState();
    const repeatConfig = createDefaultConfig();
    repeatState.hp = 1_000_000;
    repeatConfig.damage = 200;
    const repeat = runBotGame(repeatState, repeatConfig, seeded(seed));

    expect(first).toMatchObject({ wave: 9, maturity: expect.any(Number), highestStar: expect.any(Number), equippedCount: expect.any(Number) });
    expect(repeat).toEqual(first);
  });
});
