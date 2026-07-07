import { describe, it, expect } from 'vitest';
import { enemyCountFor, startNextWave, checkWaveClear } from '../src/core/systems/waveSystem';
import { determineType, spawnEnemy, moveEnemies } from '../src/core/systems/enemySystem';
import { freshState, createDefaultConfig, constRng, seqRng } from './helpers';

describe('waveSystem · 波次数量与推进', () => {
  it('第 N 波生成数 = 5 + 3N', () => {
    expect(enemyCountFor(1)).toBe(8);
    expect(enemyCountFor(3)).toBe(14);
    expect(enemyCountFor(5)).toBe(20);
  });

  it('startNextWave 推进波数并排定生成数', () => {
    const s = freshState();
    const ev = startNextWave(s);
    expect(s.wave).toBe(1);
    expect(s.spawnLeft).toBe(8);
    expect(ev).toContainEqual({ type: 'waveStart', wave: 1 });
  });
});

describe('waveSystem · boss 与胜负', () => {
  it('第 5 波最后一只强制 boss', () => {
    // 任意 roll 都应判为 boss
    expect(determineType(5, 0.99, 1)).toBe('boss');
    expect(determineType(5, 0.0, 1)).toBe('boss');
    const s = freshState();
    s.wave = 5;
    s.spawnLeft = 1;
    spawnEnemy(s, seqRng(0.99, 0.0));
    expect(s.enemies[0].type).toBe('boss');
    expect(s.enemies[0].hp).toBe(420);
  });

  it('非最后一只按 roll 判定类型', () => {
    expect(determineType(1, 0.1, 8)).toBe('tank'); // < 0.2+0.025
    expect(determineType(1, 0.4, 8)).toBe('fast'); // < 0.47
    expect(determineType(1, 0.8, 8)).toBe('normal');
  });

  it('5 波全清 → 胜利', () => {
    const s = freshState();
    s.wave = 5;
    s.spawnLeft = 0;
    s.enemies = [];
    const ev = checkWaveClear(s);
    expect(ev).toEqual([{ type: 'gameEnd', win: true }]);
    expect(s.mode).toBe('ended');
  });

  it('HP 归零 → 失败', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.hp = 10;
    s.enemies = [{
      x: 480, y: 300, type: 'boss', label: 'b', hp: 100, maxHp: 100,
      speed: 12, r: 35, color: '#fff', damage: 28, xp: 5, hit: 0,
    }];
    const ev = moveEnemies(s, config, constRng(0), 0.016);
    expect(ev).toContainEqual({ type: 'gameEnd', win: false });
    expect(s.hp).toBeLessThanOrEqual(0);
    expect(s.mode).toBe('ended');
  });
});
