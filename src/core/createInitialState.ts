import { gameConfig, perks } from '../data';
import type { Config, GameState } from './types';

/** 从 gameConfig.defaultConfig 生成一份可变的运行期参数副本。 */
export function createDefaultConfig(): Config {
  return { ...gameConfig.defaultConfig };
}

/** 生成一局全新对局的初始状态（等价于原 reset() 内的 state 构造）。 */
export function createInitialState(): GameState {
  return {
    mode: 'ready',
    paused: false,
    time: 0,
    hp: gameConfig.hp.max,
    maxHp: gameConfig.hp.max,
    wave: 0,
    between: 0,
    enemies: [],
    bullets: [],
    particles: [],
    groundDrops: [],
    cards: Array(gameConfig.slots.cards).fill(null),
    equipment: Array(gameConfig.slots.equipment).fill(null),
    tempCards: [],
    nextCardId: 1,
    nextDropId: 1,
    spawnLeft: 0,
    spawnTimer: 0,
    waveClearPending: false,
    damageBonus: 0,
    fireRateBonus: 0,
    multi: 1,
    shotCd: 0,
    turretAngle: -Math.PI / 2,
    xp: 0,
    xpNeed: perks.xpNeedBase,
    level: 1,
    kills: 0,
    merges: 0,
    uses: 0,
    collected: 0,
    expired: 0,
  };
}
