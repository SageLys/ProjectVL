import { cfg } from '../config';
import type { Config, GameState } from './types';

/** 从各域 defaults 组装一份可变的运行期参数副本（调参面板操作对象）。 */
export function createDefaultConfig(): Config {
  return {
    ...cfg.combat.defaults,
    ...cfg.economy.defaults,
    ...cfg.enemies.defaults,
    metaPowerMultiplier: cfg.progression.metaPowerMultiplier,
  };
}

/** 生成一局全新对局的初始状态。槽位数量为配置变量（handSlots/equipSlots）。 */
export function createInitialState(): GameState {
  return {
    mode: 'ready',
    paused: false,
    time: 0,
    hp: cfg.combat.hp.max,
    maxHp: cfg.combat.hp.max,
    wave: 0,
    between: 0,
    enemies: [],
    bullets: [],
    particles: [],
    groundDrops: [],
    cards: Array(cfg.economy.handSlots).fill(null),
    equipment: Array(cfg.economy.equipSlots).fill(null),
    zones: [],
    summons: [],
    shield: null,
    buffs: [],
    intervalClocks: {},
    nextCardId: 1,
    nextDropId: 1,
    nextEnemyId: 1,
    nextZoneId: 1,
    nextSummonId: 1,
    spawnLeft: 0,
    spawnTimer: 0,
    waveClearPending: false,
    damagePerkMultiplier: 1,
    fireRatePerkMultiplier: 1,
    multi: 1,
    shotCd: 0,
    turretAngle: -Math.PI / 2,
    xp: 0,
    xpNeed: cfg.progression.xpNeedBase,
    level: 1,
    kills: 0,
    merges: 0,
    consumes: 0,
    equipOps: 0,
    collected: 0,
    expired: 0,
    expiredConverted: 0,
  };
}
