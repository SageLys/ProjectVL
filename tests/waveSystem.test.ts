import { describe, it, expect, beforeEach } from 'vitest';
import { enemyCountFor, startNextWave, checkWaveClear } from '../src/core/systems/waveSystem';
import { determineType, spawnEnemy, moveEnemies } from '../src/core/systems/enemySystem';
import { enemy, freshState, createDefaultConfig, constRng, seqRng, resetTestEnv, applyVariants } from './helpers';
import { cfg } from '../src/config';

beforeEach(resetTestEnv);
const rng = constRng(0.5);

describe('waveSystem · 波次数量与推进', () => {
  it('第 N 波生成数 = 5 + 3N（8 个普通波 + 第 9 阶段 Boss）', () => {
    expect(enemyCountFor(1)).toBe(8);
    expect(enemyCountFor(3)).toBe(14);
    expect(enemyCountFor(9)).toBe(32);
  });

  it('startNextWave 推进波数并排定生成数', () => {
    const s = freshState();
    const ev = startNextWave(s, createDefaultConfig(), rng);
    expect(s.wave).toBe(1);
    expect(s.spawnLeft).toBe(8);
    expect(ev).toContainEqual({ type: 'waveStart', wave: 1 });
  });

  it('totalWaves 是配置变量：dev-short variant 3 波即胜利', () => {
    applyVariants(['dev-short']);
    const s = freshState();
    s.wave = 3;
    s.spawnLeft = 0;
    s.enemies = [];
    expect(checkWaveClear(s)).toEqual([{ type: 'gameEnd', win: true }]);
  });
});

describe('waveSystem · boss 与胜负', () => {
  it('第 9 阶段最后一只强制 boss', () => {
    expect(determineType(9, 0.99, 1)).toBe('boss');
    expect(determineType(9, 0.0, 1)).toBe('boss');
    const s = freshState();
    s.wave = 9;
    s.spawnLeft = 1;
    spawnEnemy(s, seqRng(0.99, 0.0));
    expect(s.enemies[0].type).toBe('boss');
    expect(s.enemies[0].hp).toBe(cfg.enemies.types.boss.hpBase);
  });

  it('非最后一只按 roll 判定类型', () => {
    expect(determineType(1, 0.1, 8)).toBe('tank');
    expect(determineType(1, 0.4, 8)).toBe('fast');
    expect(determineType(1, 0.8, 8)).toBe('normal');
  });

  it('8 个普通波 + Boss 阶段全清 → 胜利', () => {
    const s = freshState();
    s.wave = 9;
    s.spawnLeft = 0;
    s.enemies = [];
    const ev = checkWaveClear(s);
    expect(ev).toEqual([{ type: 'gameEnd', win: true }]);
    expect(s.mode).toBe('ended');
  });

  it('尾波有地面奖励时等待拾取/过期后再胜利结算', () => {
    const s = freshState();
    s.wave = 9;
    s.spawnLeft = 0;
    s.enemies = [];
    s.groundDrops = [{ id: 1, x: 10, y: 10, type: 'damage', star: 2, life: 2, maxLife: 2, pulse: 0 }];
    expect(checkWaveClear(s)).toEqual([]);
    expect(s.mode).toBe('playing');
    s.groundDrops = [];
    expect(checkWaveClear(s)).toEqual([{ type: 'gameEnd', win: true }]);
  });

  it('HP 归零 → 失败', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.hp = 10;
    s.enemies = [enemy({ x: 480, y: 300, type: 'boss', hp: 100, maxHp: 100, speed: 12, r: 35, damage: 28, xp: 5 })];
    const ev = moveEnemies(s, config, constRng(0), 0.016);
    expect(ev).toContainEqual({ type: 'gameEnd', win: false });
    expect(s.hp).toBeLessThanOrEqual(0);
    expect(s.mode).toBe('ended');
  });
});
