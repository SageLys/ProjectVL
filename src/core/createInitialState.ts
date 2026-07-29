import { cfg } from '../config';
import type { Card, CardType, CardTypeRunStats, Config, GameState, WildcardInventory } from './types';
import type { DifficultyId } from '../config/types';

function createEmptyWildcardInventory(maxStar: number): WildcardInventory {
  const inv: WildcardInventory = {};
  for (let star = 1; star < maxStar; star++) inv[star] = 0;
  return inv;
}

function createEmptyCardTypeRunStats(): CardTypeRunStats {
  return {
    ordinaryShown: 0,
    totalShown: 0,
    collected: 0,
    mergeOps: 0,
    highestStarReached: 0,
    lastOrdinaryShownAt: 0,
  };
}

/** C0 兼容卡实例工厂：新字段先写空默认值，后续阶段再消费。 */
export function createCardInstance(id: number, type: CardType, star: number): Card {
  return { id, type, star, evolutionPath: [], affixes: [] };
}

/** 从各域 defaults 组装一份可变的运行期参数副本（调参面板操作对象）。 */
export function createDefaultConfig(): Config {
  return {
    ...cfg.combat.defaults,
    ...cfg.economy.defaults,
    ...cfg.enemies.defaults,
  };
}

/** 生成一局全新对局的初始状态。槽位数量为配置变量（handSlots/equipSlots）。 */
export function createInitialState(difficultyId: DifficultyId = 'hell'): GameState {
  return {
    difficultyId,
    mode: 'ready',
    paused: false,
    time: 0,
    hp: cfg.combat.hp.max,
    baseMaxHp: cfg.combat.hp.max,
    maxHp: cfg.combat.hp.max,
    wave: 0,
    decisions: { current: null, pending: [] },
    runBuild: { cardAffixRolls: {} },
    godPool: {
      mainGod: null,
      subGods: [],
      focusGod: null,
      runRoster: [],
      rosterByGod: Object.fromEntries(cfg.gods.gods.map(god => [god.id, []])),
      offerDrought: Object.fromEntries(cfg.gods.gods.map(god => [god.id, 0])),
      bootstrapQueue: [],
      bootstrapDropsRemaining: 0,
      activePool: [],
      previousActivePool: [],
      activePoolHistory: [],
      activePoolWave: 0,
      lastDecisionAfterWave: -1,
      offerRosterPreviews: Object.fromEntries(cfg.gods.gods.map(god => [god.id, []])),
    },
    intermission: {
      active: false,
      afterWave: 0,
      step: 'decide',
      settleRemaining: 0,
      freeRemaining: 0,
      readyConfirmed: false,
      rewardsGranted: [],
    },
    enemies: [],
    bullets: [],
    beams: [],
    vfx: [],
    particles: [],
    groundDrops: [],
    cards: Array(cfg.economy.handSlots).fill(null),
    pendingMergeRefunds: [],
    equipment: Array(cfg.economy.equipSlots).fill(null),
    wildcards: createEmptyWildcardInventory(cfg.economy.maxStar),
    zones: [],
    summons: [],
    shield: null,
    statModifiers: [],
    intervalClocks: {},
    cooldowns: {},
    nextCardId: 1,
    nextDropId: 1,
    nextEnemyId: 1,
    nextZoneId: 1,
    nextSummonId: 1,
    nextAttackId: 1,
    combatTelemetry: { wave: 0, perCard: {} },
    spawnLeft: 0,
    waveSpawnQuota: 0,
    spawnTimer: 0,
    lastSpawnCheckCount: 0,
    wavePhase: 'regular',
    waveBossId: null,
    waveBossSpawnedAt: null,
    bossRewardClaimedWave: 0,
    runBaseStats: {
      damageAdd: 0,
      fireRateAdd: 0,
      rangeAdd: 0,
      multiAdd: 0,
    },
    waveRewardsClaimedWave: 0,
    waveChoiceOfferedWave: 0,
    damageBonus: 0,
    fireRateBonus: 0,
    multi: 1,
    shotCd: 0,
    turretAngle: -Math.PI / 2,
    xp: 0,
    xpNeed: cfg.progression.xpThresholds[0] ?? 0,
    level: 1,
    relicStacks: {},
    buildState: {
      affinity: { projectile: 0, control: 0, domain: 0, defense: 0, utility: 0 },
      godAffinity: Object.fromEntries(cfg.gods.gods.map(god => [god.id, 0])),
      relicHistory: [],
      scalingVersion: 0,
      dropPity: undefined,
    },
    xpGainBonus: 0,
    rangeBonus: 0,
    kills: 0,
    merges: 0,
    completedRecipes: [],
    consumes: 0,
    equipOps: 0,
    equipTelemetry: { durationsMs: [], cancels: 0, rejects: 0 },
    collected: 0,
    expired: 0,
    bountyOffers: [],
    bountyEncounters: [],
    bountyDirector: {
      offersThisWave: 0,
      acceptedThisWave: 0,
      completedThisWave: 0,
      checkTimer: cfg.bounty.offer.checkIntervalSeconds,
      cooldownRemaining: 0,
      lastHpLossAt: 0,
      rewardBag: [],
      lastRewardType: null,
      guaranteedThisWave: false,
    },
    normalDropDirector: {
      roleBag: [],
      recentTypes: [],
      ordinaryDropCount: 0,
      typeStats: Object.fromEntries(
        cfg.skills.cards.map(card => [card.id, createEmptyCardTypeRunStats()]),
      ),
    },
    ordinaryDrop: {
      credit: 0,
      activeRegularSeconds: 0,
      shownThisWave: 0,
      eligibleKillsThisWave: 0,
      buildStageSeconds: 0,
    },
    nextBountyOfferId: 1,
    nextBountyEncounterId: 1,
    runSummary: null,
  };
}
