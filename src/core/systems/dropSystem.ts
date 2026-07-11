import { cfg } from '../../config';
import type { CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng } from '../types';
import { totalDropChance, totalDropLifetime } from '../stats';
import { autoMergeCards } from './cardSystem';
import { addXp } from './progressionSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';

const TAU = Math.PI * 2;
export const CARD_KEYS: CardType[] = ['damage', 'rate', 'multi', 'range', 'luck'];

/** 在 (x,y) 生成一枚限时地面掉落。type 缺省随机；star 缺省按掉落星级策略（普通=1★）。 */
export function spawnGroundDrop(state: GameState, config: Config, rng: Rng, x: number, y: number, forcedType: CardType | null = null, star?: number): void {
  const type = forcedType ?? CARD_KEYS[Math.floor(rng() * CARD_KEYS.length)];
  const life = totalDropLifetime(state, config);
  state.groundDrops.push({
    id: state.nextDropId++,
    x, y, type,
    star: star ?? cfg.economy.dropStarPolicy.normal,
    life,
    maxLife: life,
    pulse: rng() * TAU,
  });
}

/** 击杀掉落判定：概率命中或 boss 必掉，则在敌人位置生成掉落。 */
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  if (rng() < totalDropChance(state, config) || enemy.type === 'boss') {
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y);
  }
}

/**
 * 推进掉落寿命与浮动相位；超时移除并计入 expired。
 * expiryConvert 修饰（丰收 3★）：过期掉落按 ratio 概率转化为经验（破「过期即损失」）。
 */
export function tickDrops(state: GameState, _config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const convert = getModifiers(state).expiryConvert;
  for (let i = state.groundDrops.length - 1; i >= 0; i--) {
    const drop = state.groundDrops[i];
    drop.life -= dt;
    drop.pulse += dt * 3;
    if (drop.life <= 0) {
      state.groundDrops.splice(i, 1);
      state.expired++;
      if (convert && rng() < convert.ratio) {
        state.expiredConverted++;
        events.push(...addXp(state, 1));
      }
    }
  }
  return events;
}

/**
 * 拾取一枚掉落到卡槽空位并触发自动合成 + onPickup 触发。
 * 卡槽已满则拒绝（掉落保留）。返回语义事件。
 */
export function collectDrop(state: GameState, config: Config, rng: Rng, drop: GroundDrop): GameEvent[] {
  const empty = state.cards.findIndex(card => card === null);
  if (empty < 0) return [{ type: 'cardsFull' }];
  state.groundDrops = state.groundDrops.filter(d => d.id !== drop.id);
  state.cards[empty] = { id: state.nextCardId++, type: drop.type, star: drop.star };
  state.collected++;
  const { merged, events: mergeEvents } = autoMergeCards(state, config, rng);
  const events: GameEvent[] = [{ type: 'collected', cardType: drop.type, merges: merged }];
  events.push(...mergeEvents);
  events.push(...fireTrigger(state, config, rng, 'onPickup', { drop, point: { x: drop.x, y: drop.y } }));
  return events;
}

/** 拾取画布上离 (x,y) 最近且在半径内的掉落；无则不动作。 */
export function collectNearest(state: GameState, config: Config, rng: Rng, x: number, y: number, radius: number): GameEvent[] {
  let nearest: GroundDrop | null = null;
  let best = Infinity;
  for (const drop of state.groundDrops) {
    const d = Math.hypot(drop.x - x, drop.y - y);
    if (d < radius && d < best) { nearest = drop; best = d; }
  }
  return nearest ? collectDrop(state, config, rng, nearest) : [];
}

/** 调试用：在固定位置生成 4 份同类型 1 星掉落，类型按已合成次数轮换。 */
export function spawnTestDrops(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const type = CARD_KEYS[state.merges % CARD_KEYS.length];
  for (const x of [360, 440, 520, 600]) spawnGroundDrop(state, config, rng, x, 370, type);
  return [{ type: 'testDrops', cardType: type }];
}
