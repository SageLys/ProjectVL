// 无头整局冒烟：真实配置 + 占位技能卡定义，简单 bot 跑完一整局。
// 验证解释器/效果运行时在完整 update 循环中不炸、遥测字段联动、variant 可跑。
import { describe, it, expect, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { updateGame } from '../src/core/updateGame';
import { startNextWave } from '../src/core/systems/waveSystem';
import { collectNearest } from '../src/core/systems/dropSystem';
import { toggleLock, consumeCard, quickEquip } from '../src/core/systems/equipmentSystem';
import { applyPerk } from '../src/core/systems/progressionSystem';
import type { Config, GameState, Rng } from '../src/core/types';
import { freshState, createDefaultConfig, resetTestEnv, applyVariants } from './helpers';

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

/** 简单 bot：点掉落、锁定/装备 2★、手牌将满时消耗释放、升级即选 perk。跑到分出胜负。 */
function runBotGame(s: GameState, config: Config, rng: Rng): void {
  startNextWave(s, config, rng);
  const dt = 1 / 30;
  for (let frame = 0; frame < 30 * 60 * 20 && s.mode === 'playing'; frame++) {
    updateGame(s, config, rng, dt);
    if (s.paused) applyPerk(s, config, ['damage', 'rate', 'repair'][frame % 3]);
    if (frame % 6 === 0 && s.groundDrops.length) {
      const d = s.groundDrops[0];
      collectNearest(s, config, rng, d.x, d.y, cfg.economy.drops.pickupRadius);
    }
    if (frame % 30 === 0) {
      const idx = s.cards.findIndex(c => c && !c.locked && c.star >= cfg.economy.equipThreshold);
      if (idx >= 0) {
        if (cfg.economy.equipMode === 'lock') toggleLock(s, idx);
        else quickEquip(s, config, rng, idx);
      }
    }
    if (frame % 15 === 0 && s.cards.filter(c => c === null).length <= 1) {
      const idx = s.cards.findIndex(c => c && !c.locked);
      if (idx >= 0) consumeCard(s, config, rng, idx, 480 + (rng() - 0.5) * 200, 300 + (rng() - 0.5) * 150);
    }
  }
}

describe('整局冒烟（占位技能卡=配置数据，经通用解释器结算）', () => {
  it('base（方案B 锁定即装备）：整局可跑，拾取/合成/锁定/消耗全联动', () => {
    registerSkillDefs(cfg.skills.cards); // 5 张 legacy 占位卡（burst/冻结区/连锁/击退/掉落雨）
    const s = freshState();
    const config = createDefaultConfig();
    runBotGame(s, config, seeded(20260711));
    expect(s.mode).not.toBe('ready');
    expect(s.collected).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
    expect(s.merges).toBeGreaterThan(0);
    expect(s.equipOps).toBeGreaterThan(0);
    expect(s.consumes).toBeGreaterThan(0);
  });

  it('variant A（equip-slots 独立装备格）：整局可跑', () => {
    applyVariants(['equip-slots']);
    registerSkillDefs(cfg.skills.cards);
    const s = freshState();
    expect(s.cards).toHaveLength(7);
    expect(s.equipment).toHaveLength(3);
    const config = createDefaultConfig();
    runBotGame(s, config, seeded(42));
    expect(s.mode).not.toBe('ready');
    expect(s.kills).toBeGreaterThan(0);
  });

  it('variant 叠加（equip-slots + dev-short）：3 波短局可跑', () => {
    applyVariants(['equip-slots', 'dev-short']);
    registerSkillDefs(cfg.skills.cards);
    const s = freshState();
    const config = createDefaultConfig();
    runBotGame(s, config, seeded(7));
    expect(s.mode).toBe('ended');
    expect(s.wave).toBeLessThanOrEqual(3);
  });
});
