// 黄金回放 harness：固定 seed + 固定配置 + 脚本化输入 → 逐帧推进 → 结束态摘要。
// core 是「纯函数 + 注入 rng」，因此同 spec 逐次运行在 H5 内部逐位相同；
// Unity 侧以同一 spec 重放并按 docs/黄金回放_fixture规格.md 的容差比对。
//
// 本模块**只读取**规则层，不新增任何玩法：它调用的全部是玩家在 UI 上能做的动作。
import { applyVariants, cfg } from '../../config';
import type { DifficultyId } from '../../config/types';
import { createDefaultConfig, createInitialState } from '../createInitialState';
import { makeCountingRng } from '../rng';
import type { CardType, Config, GameEvent, GameState, SlotKind } from '../types';
import { updateGame } from '../updateGame';
import { registerSkillDefs } from '../effects/interpreter';
import { collectNearest, spawnGroundDrop } from '../systems/dropSystem';
import { consumeCard, moveOrSwap } from '../systems/equipmentSystem';
import { resolveCurrentDecision } from '../systems/decisionQueueSystem';
import { beginOpeningIntermission, confirmIntermissionReady } from '../systems/intermissionSystem';
import { startNextWave } from '../systems/waveSystem';

/** 周期重复：`repeatEvery` 帧一次，直到 `repeatUntil`（缺省 = spec.frames）。展开是确定性的。 */
interface ReplayRepeat {
  frame: number;
  repeatEvery?: number;
  repeatUntil?: number;
}

/** 脚本化输入：每一种都对应玩家在 UI 上的一个动作（spawnDrop 除外，见注释）。 */
export type ReplayInput = ReplayRepeat & (
  /** 场景搭建用：直接在落点生成一枚掉落，避免依赖掉落 rng 才能构造合成/装备场景。 */
  | { kind: 'spawnDrop'; x: number; y: number; cardType: CardType; star: number }
  /** 点击拾取：拾取 (x,y) 半径内最近的掉落。 */
  | { kind: 'collectAt'; x: number; y: number; radius?: number }
  /** 点击最早出现的地面掉落（等价玩家按出现顺序点它）；场上无掉落时无动作。 */
  | { kind: 'collectFirstDrop' }
  /** 拖拽：手牌/装备栏之间移动或交换。 */
  | { kind: 'moveOrSwap'; source: SlotKind; index: number; targetKind: SlotKind; targetIndex: number }
  /** 消耗释放：手牌 index 的卡在 (x,y) 落点释放。 */
  | { kind: 'consumeAt'; index: number; x: number; y: number }
  /** 波间「准备完毕」：跳过剩余自由整备时间。 */
  | { kind: 'confirmIntermission' }
);

export type ReplayInputKind = ReplayInput['kind'];

/** 待决策时 core 不推进时间，必须给出确定性选择策略。 */
export type ReplayDecisionPolicy = 'firstCandidate' | 'lastCandidate';

export interface ReplaySpec {
  id: string;
  description: string;
  seed: number;
  /** 配置 variant 名单（深合并覆盖 base）。 */
  variants: string[];
  difficulty?: DifficultyId;
  /** 固定时间步（秒）。 */
  dt: number;
  /** 最多推进帧数；对局提前结束则提前收尾。 */
  frames: number;
  /**
   * 起手方式：
   * - `wave1`：直接开第 1 波，整局不产生决策 —— Unity 一期纵向切片可完整复刻；
   * - `run`：走开局波间（含神池抽选等决策），覆盖完整对局链路。
   */
  start: 'wave1' | 'run';
  decisionPolicy: ReplayDecisionPolicy;
  /** 起手覆盖，用于构造通关/失败局；缺省沿用配置默认值。 */
  overrides?: {
    hp?: number;
    maxHp?: number;
    damage?: number;
    fireRate?: number;
    range?: number;
    dropChance?: number;
  };
  inputs: ReplayInput[];
}

export interface ReplayDropEvent {
  frame: number;
  action: 'spawned' | 'collected' | 'expired';
  dropId: number;
  kind: 'card' | 'wildcard';
  cardType: CardType | null;
  star: number;
}

export interface ReplaySlotSnapshot {
  slot: number;
  cardType: CardType;
  star: number;
  affixes: string[];
  evolutionPath: string[];
}

export interface ReplaySummary {
  spec: { id: string; seed: number; variants: string[]; dt: number; frames: number; start: string };
  /** 实际推进的帧数；对局提前结束时小于 spec.frames。 */
  framesRun: number;
  mode: GameState['mode'];
  win: boolean | null;
  hp: number;
  maxHp: number;
  wave: {
    wave: number;
    phase: GameState['wavePhase'];
    spawnLeft: number;
    waveSpawnQuota: number;
    intermission: { active: boolean; step: string; afterWave: number };
  };
  enemiesRemaining: number;
  /** 累计观测到的敌人生命减少量：逐帧对同 id 敌人取 max(0, 前帧hp − 本帧hp) 求和。 */
  cumulativeDamageDealt: number;
  /** 累计承伤：breakthrough 与 bossContactDamage 事件携带的 damage 之和。 */
  cumulativeDamageTaken: number;
  counters: {
    kills: number; collected: number; expired: number;
    merges: number; consumes: number; equipOps: number;
    xp: number; level: number;
  };
  cards: ReplaySlotSnapshot[];
  equipment: ReplaySlotSnapshot[];
  wildcards: Record<string, number>;
  relics: string[];
  dropSequence: ReplayDropEvent[];
  /** 事件类型的帧序列（不含载荷，便于跨引擎比对语义顺序）。 */
  eventSequence: Array<{ frame: number; type: GameEvent['type'] }>;
  eventCounts: Record<string, number>;
  /** rng 调用次数与末次取值：调用次序的指纹，比数值更早暴露分叉。 */
  rng: { draws: number; last: number | null };
}

function snapshotSlots(slots: GameState['cards']): ReplaySlotSnapshot[] {
  const out: ReplaySlotSnapshot[] = [];
  slots.forEach((card, slot) => {
    if (!card) return;
    out.push({
      slot,
      cardType: card.type,
      star: card.star,
      affixes: (card.affixes ?? []).map(affix => `${affix.stat}:${affix.value}`),
      evolutionPath: [...(card.evolutionPath ?? [])],
    });
  });
  return out;
}

/** 决策策略：core 在有待决策时不推进时间，这里给出确定性选择。 */
function choiceFor(state: GameState, policy: ReplayDecisionPolicy): string | null {
  const decision = state.decisions.current;
  if (!decision) return null;
  const options = decision.kind === 'godDraft' || decision.kind === 'godFocus'
    || decision.kind === 'waveBaseReward' || decision.kind === 'recipePin'
    ? decision.candidates
    : decision.kind === 'evolutionBranch' || decision.kind === 'relic'
      ? decision.options
      : [];
  if (!options.length) return null;
  return policy === 'lastCandidate' ? options[options.length - 1] : options[0];
}

function applyInput(state: GameState, config: Config, rng: () => number, input: ReplayInput): GameEvent[] {
  switch (input.kind) {
    case 'spawnDrop':
      spawnGroundDrop(state, config, rng, input.x, input.y, input.cardType, input.star);
      return [];
    case 'collectAt':
      return collectNearest(state, config, rng, input.x, input.y, input.radius ?? cfg.economy.drops.pickupRadius);
    case 'collectFirstDrop': {
      const drop = state.groundDrops[0];
      return drop ? collectNearest(state, config, rng, drop.x, drop.y, cfg.economy.drops.pickupRadius) : [];
    }
    case 'moveOrSwap':
      return moveOrSwap(state, config, rng, input.source, input.index, input.targetKind, input.targetIndex);
    case 'consumeAt':
      return consumeCard(state, config, rng, input.index, input.x, input.y);
    case 'confirmIntermission':
      return confirmIntermissionReady(state);
  }
}

/**
 * 跑一遍回放并汇总结束态。同 spec 多次调用结果逐位相同（H5 内部）。
 * 注意：会按 spec.variants 重建全局配置单例，调用方（测试）应在用例间复位。
 */
export function runReplay(spec: ReplaySpec): ReplaySummary {
  applyVariants(spec.variants);
  registerSkillDefs(cfg.skills.cards);

  const counting = makeCountingRng(spec.seed);
  const rng = counting.rng;
  const state = createInitialState(spec.difficulty ?? 'hell');
  const config = createDefaultConfig();
  state.mode = 'playing';

  const overrides = spec.overrides ?? {};
  if (overrides.maxHp !== undefined) { state.baseMaxHp = overrides.maxHp; state.maxHp = overrides.maxHp; }
  if (overrides.hp !== undefined) state.hp = overrides.hp;
  for (const key of ['damage', 'fireRate', 'range', 'dropChance'] as const) {
    if (overrides[key] !== undefined) config[key] = overrides[key];
  }

  // 输入按帧分桶：周期输入先按 repeatEvery 展开，同帧多条按声明顺序执行。
  const byFrame = new Map<number, ReplayInput[]>();
  for (const input of spec.inputs) {
    const step = input.repeatEvery && input.repeatEvery > 0 ? Math.trunc(input.repeatEvery) : 0;
    const until = step ? Math.min(input.repeatUntil ?? spec.frames, spec.frames) : input.frame;
    for (let frame = input.frame; frame <= until; frame += step || 1) {
      const bucket = byFrame.get(frame) ?? [];
      bucket.push(input);
      byFrame.set(frame, bucket);
      if (!step) break;
    }
  }

  const eventSequence: ReplaySummary['eventSequence'] = [];
  const eventCounts: Record<string, number> = {};
  const dropSequence: ReplayDropEvent[] = [];
  let cumulativeDamageDealt = 0;
  let cumulativeDamageTaken = 0;
  let win: boolean | null = null;

  const record = (frame: number, events: readonly GameEvent[]): void => {
    for (const event of events) {
      eventSequence.push({ frame, type: event.type });
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      if (event.type === 'gameEnd') win = event.win;
      if (event.type === 'breakthrough' || event.type === 'bossContactDamage') cumulativeDamageTaken += event.damage;
      if (event.type === 'collected' && event.dropId !== undefined) {
        dropSequence.push({
          frame, action: 'collected', dropId: event.dropId,
          kind: 'card', cardType: event.cardType, star: event.star ?? 0,
        });
      }
      if (event.type === 'dropExpired') {
        dropSequence.push({
          frame, action: 'expired', dropId: event.dropId,
          kind: 'card', cardType: null, star: event.star,
        });
      }
    }
  };

  const seenDropIds = new Set<number>();
  const recordSpawnedDrops = (frame: number): void => {
    for (const drop of state.groundDrops) {
      if (seenDropIds.has(drop.id)) continue;
      seenDropIds.add(drop.id);
      dropSequence.push({
        frame, action: 'spawned', dropId: drop.id, kind: drop.kind,
        cardType: drop.kind === 'card' ? drop.type : null, star: drop.star,
      });
    }
  };

  const enemyHp = new Map<number, number>();
  const accumulateDamage = (): void => {
    for (const enemy of state.enemies) {
      const previous = enemyHp.get(enemy.id);
      if (previous !== undefined && enemy.hp < previous) cumulativeDamageDealt += previous - enemy.hp;
      enemyHp.set(enemy.id, enemy.hp);
    }
  };

  if (spec.start === 'run') record(0, beginOpeningIntermission(state));
  else record(0, startNextWave(state, config, rng));
  recordSpawnedDrops(0);
  accumulateDamage();

  let framesRun = 0;
  for (let frame = 1; frame <= spec.frames; frame++) {
    framesRun = frame;
    record(frame, updateGame(state, config, rng, spec.dt));

    // 待决策时 core 不推进时间：同一帧内把队列清空，再执行脚本输入。
    for (let guard = 0; state.decisions.current && guard < 16; guard++) {
      const choice = choiceFor(state, spec.decisionPolicy);
      if (choice === null) break;
      record(frame, resolveCurrentDecision(state, config, rng, choice));
    }

    for (const input of byFrame.get(frame) ?? []) record(frame, applyInput(state, config, rng, input));

    recordSpawnedDrops(frame);
    accumulateDamage();
    if (state.mode !== 'playing') break;
  }

  return {
    spec: {
      id: spec.id, seed: spec.seed, variants: [...spec.variants],
      dt: spec.dt, frames: spec.frames, start: spec.start,
    },
    framesRun,
    mode: state.mode,
    win,
    hp: state.hp,
    maxHp: state.maxHp,
    wave: {
      wave: state.wave,
      phase: state.wavePhase,
      spawnLeft: state.spawnLeft,
      waveSpawnQuota: state.waveSpawnQuota,
      intermission: {
        active: state.intermission.active,
        step: state.intermission.step,
        afterWave: state.intermission.afterWave,
      },
    },
    enemiesRemaining: state.enemies.length,
    cumulativeDamageDealt,
    cumulativeDamageTaken,
    counters: {
      kills: state.kills, collected: state.collected, expired: state.expired,
      merges: state.merges, consumes: state.consumes, equipOps: state.equipOps,
      xp: state.xp, level: state.level,
    },
    cards: snapshotSlots(state.cards),
    equipment: snapshotSlots(state.equipment),
    wildcards: Object.fromEntries(Object.entries(state.wildcards).map(([star, count]) => [star, count ?? 0])),
    relics: [...state.buildState.relicHistory],
    dropSequence,
    eventSequence,
    eventCounts,
    rng: { draws: counting.draws(), last: counting.last() },
  };
}
