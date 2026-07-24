import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { tickEffects } from '../src/core/effects/runtime';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { moveEnemies } from '../src/core/systems/enemySystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import type { GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
  cfg.economy.equipSwappable = true;
});
afterEach(resetTestEnv);

function equipDecoy(state: GameState, star: number, slot = 0): void {
  const decoy = card('decoy', star);
  state.cards[0] = decoy;
  state.runBuild.evolutionChoices.decoy = Object.fromEntries(
    (decoy.evolutionPath ?? []).map(token => {
      const [checkpoint, optionId] = token.split(':');
      return [Number(checkpoint), optionId];
    }),
  );
  const events = moveOrSwap(state, config, rng, 'cards', 0, 'equipment', slot);
  expect(events).toContainEqual({ type: 'equipped', cardType: 'decoy', star, slotIndex: slot });
}

function polarFromTurret(x: number, y: number): { distance: number; angle: number } {
  const dx = x - cfg.combat.turret.x;
  const dy = y - cfg.combat.turret.y;
  return { distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

describe('装备态 summon 声明式生命周期', () => {
  it('波中装备 decoy 3★ 会立即在炮台外围生成一个常驻诱饵', () => {
    const state = freshState();
    equipDecoy(state, 3);

    expect(state.summons).toHaveLength(1);
    const summon = state.summons[0];
    expect(summon.kind).toBe('decoy');
    expect(polarFromTurret(summon.x, summon.y).distance).toBeCloseTo(150, 6);
    expect(summon.x).not.toBe(cfg.combat.turret.x);
    expect(summon.sourceCardId).toBe(state.equipment[0]!.id);
    expect(summon.sourceBindingIndex).toBe(0);
    expect(summon.remaining).toBeUndefined();
  });

  it('有敌人时朝 1/dist 加权威胁方向放置；无敌人时按装备槽方位回退', () => {
    const threatened = freshState();
    threatened.enemies = [
      enemy({ x: cfg.combat.turret.x, y: cfg.combat.turret.y - 200 }),
      enemy({ x: cfg.combat.turret.x, y: cfg.combat.turret.y - 300 }),
    ];
    equipDecoy(threatened, 3, 0);
    const towardEnemies = polarFromTurret(threatened.summons[0].x, threatened.summons[0].y);
    expect(towardEnemies.distance).toBeCloseTo(150, 6);
    expect(towardEnemies.angle).toBeCloseTo(-Math.PI / 2, 6);

    const fallback = freshState();
    equipDecoy(fallback, 3, 1);
    const bySlot = polarFromTurret(fallback.summons[0].x, fallback.summons[0].y);
    expect(bySlot.angle).toBeCloseTo(1 / fallback.equipment.length * Math.PI * 2, 6);
  });

  it('嘲讽半径内的射程外/内敌人都会撞击诱饵；半径外敌人仍朝炮台移动', () => {
    const state = freshState();
    equipDecoy(state, 3); // slot 0 无敌人回退到炮台右侧 150px
    const summon = state.summons[0];
    const attracted = enemy({ x: summon.x + 110, y: summon.y, speed: 40, damage: 8, r: 12 });
    const attractedInRange = enemy({ x: cfg.combat.turret.x + 121, y: summon.y, speed: 20, damage: 8, r: 12 });
    const unaffected = enemy({ x: cfg.combat.turret.x, y: cfg.combat.turret.y - 260, speed: 20, r: 12 });
    state.enemies = [attracted, attractedInRange, unaffected];
    const unaffectedStartY = unaffected.y;

    moveEnemies(state, config, rng, 0.1);
    expect(attracted.x).toBeLessThan(summon.x + 110);
    expect(state.enemies).not.toContain(attractedInRange);
    expect(unaffected.y).toBeGreaterThan(unaffectedStartY);

    for (let i = 0; i < 30 && state.enemies.includes(attracted); i++) {
      moveEnemies(state, config, rng, 0.1);
    }
    expect(state.enemies).not.toContain(attracted);
    expect(summon.hp).toBe(summon.maxHp - attracted.damage - attractedInRange.damage);
    expect(state.kills).toBe(0); // 撞诱饵消散刻意不给击杀奖励
    expect(state.enemies).toContain(unaffected);
  });

  it('连续三波始终单实例，每波回满并按新威胁方向重定位', () => {
    const state = freshState();
    equipDecoy(state, 3);
    const directions = [0, Math.PI / 2, Math.PI];
    for (const angle of directions) {
      state.summons[0].hp = 1;
      state.enemies = [enemy({
        x: cfg.combat.turret.x + Math.cos(angle) * 250,
        y: cfg.combat.turret.y + Math.sin(angle) * 250,
      })];
      startNextWave(state, config, rng);
      expect(state.summons).toHaveLength(1);
      expect(state.summons[0].hp).toBe(state.summons[0].maxHp);
      expect(polarFromTurret(state.summons[0].x, state.summons[0].y).angle).toBeCloseTo(angle, 6);
    }
  });

  it('卸下或替换装备会立即清理来源诱饵', () => {
    const unloaded = freshState();
    equipDecoy(unloaded, 3);
    moveOrSwap(unloaded, config, rng, 'equipment', 0, 'cards', 0);
    expect(unloaded.summons).toHaveLength(0);

    const replaced = freshState();
    equipDecoy(replaced, 3);
    replaced.cards[0] = card('frost', 3);
    moveOrSwap(replaced, config, rng, 'cards', 0, 'equipment', 0);
    expect(replaced.equipment[0]?.type).toBe('frost');
    expect(replaced.summons).toHaveLength(0);
  });

  it('5★ 每波只重生一次，下一波刷新后恢复重生资格', () => {
    const state = freshState();
    equipDecoy(state, 5);
    state.summons[0].hp = 0;
    tickEffects(state, config, rng, 0.01);
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0].respawned).toBe(true);
    expect(polarFromTurret(state.summons[0].x, state.summons[0].y).distance).toBeCloseTo(150, 6);

    state.summons[0].hp = 0;
    tickEffects(state, config, rng, 0.01);
    expect(state.summons).toHaveLength(0);

    startNextWave(state, config, rng);
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0].hp).toBe(state.summons[0].maxHp);
    expect(state.summons[0].respawned).toBe(false);
  });

  it('6★ mirrorTurret 同样单实例、外围放置，卸下立即清理', () => {
    const state = freshState();
    equipDecoy(state, 6);
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0].kind).toBe('mirrorTurret');
    expect(polarFromTurret(state.summons[0].x, state.summons[0].y).distance).toBeCloseTo(150, 6);

    startNextWave(state, config, rng);
    startNextWave(state, config, rng);
    expect(state.summons).toHaveLength(1);
    moveOrSwap(state, config, rng, 'equipment', 0, 'cards', 0);
    expect(state.summons).toHaveLength(0);
  });

  it('喂养升到 6★ 会把同来源 5★ decoy 原地同步为 mirrorTurret', () => {
    const state = freshState();
    equipDecoy(state, 5);
    const sourceId = state.summons[0].sourceCardId;
    state.cards[0] = card('decoy', 5);
    moveOrSwap(state, config, rng, 'cards', 0, 'equipment', 0);
    expect(state.equipment[0]?.star).toBe(6);
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0]).toMatchObject({ kind: 'mirrorTurret', sourceCardId: sourceId, hp: 80, maxHp: 80 });
  });

  it('消耗态诱饵仍在指定落点生成且按 duration 到期，不带装备来源', () => {
    const state = freshState();
    state.cards[0] = card('decoy', 1);
    consumeCard(state, config, rng, 0, 300, 280);
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0]).toMatchObject({ x: 300, y: 280, kind: 'decoy' });
    expect(state.summons[0].sourceCardId).toBeUndefined();
    expect(state.summons[0].remaining).toBe(4);

    tickEffects(state, config, rng, 4.1);
    expect(state.summons).toHaveLength(0);
  });
});
