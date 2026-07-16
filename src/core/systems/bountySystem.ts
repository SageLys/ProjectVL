import { cfg } from '../../config';
import type { BountyEncounter, BountyOffer, BountySide, CardType, Config, Enemy, EnemyType, GameEvent, GameState, Rng } from '../types';
import { CARD_KEYS, spawnGroundDrop, spawnWildcardDrop } from './dropSystem';
import { createEnemy } from './enemySystem';

const SIDES: BountySide[] = ['top', 'right', 'bottom', 'left'];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Current adaptive probability used by the Director and the live tuner status. */
export function calculateOfferChance(state: GameState): number {
  const o = cfg.bounty.offer;
  const hpRatio = state.maxHp > 0 ? state.hp / state.maxHp : 0;
  const healthyDenominator = Math.max(Number.EPSILON, 1 - o.healthyHpThreshold);
  const healthyScore = clamp01((hpRatio - o.healthyHpThreshold) / healthyDenominator);
  const noDamageSeconds = Math.max(0, state.time - state.bountyDirector.lastHpLossAt);
  const noDamageScore = clamp01(noDamageSeconds / Math.max(Number.EPSILON, o.noDamageRampSeconds));
  const recentDamageScore = clamp01(1 - noDamageSeconds / Math.max(Number.EPSILON, o.recentDamagePenaltySeconds));
  return clamp(
    o.baseChancePerCheck
      + healthyScore * o.healthyHpBonusMax
      + noDamageScore * o.noDamageBonusMax
      - recentDamageScore * o.recentDamagePenalty,
    o.minChancePerCheck,
    o.maxChancePerCheck,
  );
}

function shuffleRewardBag(rng: Rng, last: CardType | null): CardType[] {
  const bag = [...CARD_KEYS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const protectedType = cfg.bounty.reward.repeatProtection > 0 ? last : null;
  if (protectedType !== null && bag.length > 1 && bag[bag.length - 1] === protectedType) {
    const swapIndex = bag.findIndex(type => type !== protectedType);
    if (swapIndex >= 0) [bag[swapIndex], bag[bag.length - 1]] = [bag[bag.length - 1], bag[swapIndex]];
  }
  return bag;
}

function drawRewardType(state: GameState, rng: Rng): CardType {
  if (!state.bountyDirector.rewardBag.length) {
    state.bountyDirector.rewardBag = shuffleRewardBag(rng, state.bountyDirector.lastRewardType);
  }
  const type = state.bountyDirector.rewardBag.pop() ?? CARD_KEYS[0];
  state.bountyDirector.lastRewardType = type;
  return type;
}

function rewardStar(base: number, every: number, max: number, wave: number): number {
  return Math.min(max, base + Math.floor((wave - 1) / Math.max(1, every)));
}

function offerAnchor(side: BountySide, rng: Rng): { x: number; y: number } {
  const { width, height } = cfg.combat.canvas;
  const inset = Math.max(cfg.bounty.visual.offerEdgeInset, cfg.bounty.visual.offerRadius + 2);
  if (side === 'top' || side === 'bottom') {
    return { x: inset + rng() * Math.max(0, width - inset * 2), y: side === 'top' ? inset : height - inset };
  }
  return { x: side === 'left' ? inset : width - inset, y: inset + rng() * Math.max(0, height - inset * 2) };
}

function unresolvedEncounterCount(state: GameState): number {
  return state.bountyEncounters.filter(encounter => encounter.status === 'spawning' || encounter.status === 'active').length;
}

function canCreateOffer(state: GameState): boolean {
  const o = cfg.bounty.offer;
  return cfg.bounty.enabled
    && state.wave >= o.enabledFromWave
    && state.mode === 'playing'
    && state.between <= 0
    && state.bountyDirector.offersThisWave < o.maxOffersPerWave
    && state.bountyOffers.length < o.maxConcurrentOffers
    && unresolvedEncounterCount(state) < o.maxConcurrentEncounters;
}

function createOffer(state: GameState, rng: Rng, guaranteed: boolean): GameEvent {
  const side = SIDES[Math.min(SIDES.length - 1, Math.floor(rng() * SIDES.length))];
  const anchor = offerAnchor(side, rng);
  const reward = cfg.bounty.reward;
  const offer: BountyOffer = {
    id: state.nextBountyOfferId++,
    rewardCardType: drawRewardType(state, rng),
    rewardCardStar: rewardStar(reward.cardStarBase, reward.cardStarUpgradeEveryWaves, reward.cardStarMax, state.wave),
    rewardCardCount: reward.cardCount,
    wildcardStar: rewardStar(reward.wildcardStarBase, reward.wildcardStarUpgradeEveryWaves, reward.wildcardStarMax, state.wave),
    wildcardCount: reward.wildcardCount,
    side,
    ...anchor,
    remaining: cfg.bounty.offer.markWindowSeconds,
    guaranteed,
    createdAt: state.time,
  };
  state.bountyOffers.push(offer);
  state.bountyDirector.offersThisWave++;
  if (guaranteed) state.bountyDirector.guaranteedThisWave = true;
  state.bountyDirector.cooldownRemaining = cfg.bounty.offer.cooldownSeconds;
  return { type: 'bountyOfferSpawned', offerId: offer.id, rewardCardType: offer.rewardCardType, guaranteed };
}

function tickOffers(state: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.bountyOffers.length - 1; i >= 0; i--) {
    const offer = state.bountyOffers[i];
    offer.remaining -= dt;
    if (offer.remaining > 0) continue;
    state.bountyOffers.splice(i, 1);
    events.push({ type: 'bountyOfferExpired', offerId: offer.id });
  }
  return events;
}

function encounterEnemyType(rng: Rng): EnemyType {
  const weights = cfg.bounty.encounter.composition;
  const normal = Math.max(0, weights.normalWeight);
  const fast = Math.max(0, weights.fastWeight);
  const tank = Math.max(0, weights.tankWeight);
  const total = normal + fast + tank;
  if (total <= 0) return 'normal';
  const roll = rng() * total;
  return roll < normal ? 'normal' : roll < normal + fast ? 'fast' : 'tank';
}

function encounterSpawnPosition(encounter: BountyEncounter, rng: Rng): { x: number; y: number } {
  const { width, height } = cfg.combat.canvas;
  const margin = cfg.waves.spawnMargin;
  const offset = (rng() - 0.5) * cfg.bounty.encounter.spawnSpread;
  if (encounter.side === 'top' || encounter.side === 'bottom') {
    return {
      x: clamp(encounter.lastKillX + offset, 35, width - 35),
      y: encounter.side === 'top' ? -margin : height + margin,
    };
  }
  return {
    x: encounter.side === 'left' ? -margin : width + margin,
    y: clamp(encounter.lastKillY + offset, 35, height - 35),
  };
}

function tickEncounterSpawns(state: GameState, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const interval = Math.max(Number.EPSILON, cfg.bounty.encounter.spawnIntervalSeconds);
  for (const encounter of state.bountyEncounters) {
    if (encounter.status !== 'spawning') continue;
    encounter.spawnTimer -= dt;
    while (encounter.pendingSpawnCount > 0 && encounter.spawnTimer <= 0) {
      const enemy = createEnemy(
        state,
        encounterEnemyType(rng),
        state.wave,
        encounterSpawnPosition(encounter, rng),
        {
          hpMul: cfg.bounty.encounter.hpMul,
          speedMul: cfg.bounty.encounter.speedMul,
          damageMul: cfg.bounty.encounter.damageMul,
          bountyEncounterId: encounter.id,
          bountyRewardType: encounter.rewardCardType,
        },
      );
      state.enemies.push(enemy);
      encounter.memberIds.push(enemy.id);
      encounter.pendingSpawnCount--;
      encounter.spawnTimer += interval;
      events.push({ type: 'bountyMemberSpawned', encounterId: encounter.id, enemyId: enemy.id });
    }
    if (encounter.pendingSpawnCount === 0) encounter.status = 'active';
  }
  return events;
}

/** Advance Offer expiry and run fixed-interval Director checks. */
export function tickBountySystem(state: GameState, _config: Config, rng: Rng, dt: number): GameEvent[] {
  const events = [...tickOffers(state, dt), ...tickEncounterSpawns(state, rng, dt)];
  state.bountyDirector.cooldownRemaining = Math.max(0, state.bountyDirector.cooldownRemaining - dt);
  if (state.mode !== 'playing' || state.between > 0) return events;

  state.bountyDirector.checkTimer -= dt;
  const interval = Math.max(Number.EPSILON, cfg.bounty.offer.checkIntervalSeconds);
  while (state.bountyDirector.checkTimer <= 0) {
    state.bountyDirector.checkTimer += interval;
    if (!canCreateOffer(state)) continue;
    const progress = state.waveSpawnQuota > 0 ? 1 - state.spawnLeft / state.waveSpawnQuota : 1;
    const guaranteed = state.bountyDirector.offersThisWave < cfg.bounty.offer.minOffersPerWave
      && progress >= cfg.bounty.offer.guaranteeAtWaveProgress;
    if (guaranteed || (state.bountyDirector.cooldownRemaining <= 0 && rng() < calculateOfferChance(state))) {
      events.push(createOffer(state, rng, guaranteed));
    }
  }
  return events;
}

/** Register one encounter member death/disappearance. Duplicate notifications are ignored. */
export function notifyBountyMemberKilled(state: GameState, enemy: Enemy, config?: Config, rng?: Rng): GameEvent[] {
  if (enemy.bountyEncounterId === undefined) return [];
  const encounter = state.bountyEncounters.find(item => item.id === enemy.bountyEncounterId);
  if (!encounter || (encounter.status !== 'spawning' && encounter.status !== 'active')) return [];
  const index = encounter.memberIds.indexOf(enemy.id);
  if (index < 0) return [];
  encounter.memberIds.splice(index, 1);
  encounter.lastKillX = enemy.x;
  encounter.lastKillY = enemy.y;
  if (encounter.memberIds.length > 0 || encounter.pendingSpawnCount > 0) return [];
  encounter.status = 'completed';
  state.bountyDirector.completedThisWave++;
  const events: GameEvent[] = [{
    type: 'bountyCompleted',
    encounterId: encounter.id,
    rewardCardType: encounter.rewardCardType,
    clearSeconds: Math.max(0, state.time - encounter.acceptedAt),
  }];
  const lifetime = cfg.bounty.reward.dropLifetimeSeconds;
  const rewardRng = rng ?? (() => 0.5);
  const rewardConfig = config ?? ({ dropLifetime: lifetime } as Config);
  const visualDropCount = encounter.rewardCardCount + (encounter.wildcardCount > 0 ? 1 : 0);
  let visualIndex = 0;
  const rewardPoint = (): { x: number; y: number } => {
    const t = visualDropCount <= 1 ? 0.5 : visualIndex / (visualDropCount - 1);
    visualIndex++;
    const angle = -Math.PI / 2 + (t - 0.5) * 1.25;
    return { x: encounter.lastKillX + Math.cos(angle) * 28, y: encounter.lastKillY + Math.sin(angle) * 28 };
  };
  for (let i = 0; i < encounter.rewardCardCount; i++) {
    const point = rewardPoint();
    spawnGroundDrop(state, rewardConfig, rewardRng, point.x, point.y, encounter.rewardCardType, encounter.rewardCardStar);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    drop.life = lifetime;
    drop.maxLife = lifetime;
    drop.bountyEncounterId = encounter.id;
  }
  if (encounter.wildcardCount > 0) {
    const point = rewardPoint();
    spawnWildcardDrop(state, point.x, point.y, encounter.wildcardStar, encounter.wildcardCount, lifetime);
    state.groundDrops[state.groundDrops.length - 1].bountyEncounterId = encounter.id;
  }
  events.push({ type: 'bountyRewardDropped', encounterId: encounter.id, rewardCardType: encounter.rewardCardType });
  return events;
}

/** Fail an encounter on the first breach and downgrade every surviving member to a normal enemy. */
export function notifyBountyMemberBreached(state: GameState, enemy: Enemy): GameEvent[] {
  if (enemy.bountyEncounterId === undefined) return [];
  const encounterId = enemy.bountyEncounterId;
  const encounter = state.bountyEncounters.find(item => item.id === encounterId);
  if (!encounter || (encounter.status !== 'spawning' && encounter.status !== 'active')) return [];
  encounter.status = 'failed';
  encounter.pendingSpawnCount = 0;
  encounter.memberIds.length = 0;
  enemy.bountyEncounterId = undefined;
  enemy.bountyRewardType = undefined;
  for (const member of state.enemies) {
    if (member.bountyEncounterId !== encounterId) continue;
    member.bountyEncounterId = undefined;
    member.bountyRewardType = undefined;
  }
  return [{ type: 'bountyFailed', encounterId }];
}

/** Accept the first Offer hit by the arena tap and freeze its promised encounter/reward data. */
export function acceptBountyOfferAt(state: GameState, x: number, y: number): GameEvent[] {
  const hitRadius = cfg.bounty.visual.offerRadius + 16;
  const index = state.bountyOffers.findIndex(offer => Math.hypot(offer.x - x, offer.y - y) <= hitRadius);
  if (index < 0) return [];
  const [offer] = state.bountyOffers.splice(index, 1);
  const encounterId = state.nextBountyEncounterId++;
  const encounterCount = Math.min(
    cfg.bounty.encounter.enemyCountMax,
    cfg.bounty.encounter.enemyCountBase + Math.floor((state.wave - 1) * cfg.bounty.encounter.enemyCountPerWave),
  );
  state.bountyEncounters.push({
    id: encounterId,
    offerId: offer.id,
    rewardCardType: offer.rewardCardType,
    rewardCardStar: offer.rewardCardStar,
    rewardCardCount: offer.rewardCardCount,
    wildcardStar: offer.wildcardStar,
    wildcardCount: offer.wildcardCount,
    side: offer.side,
    status: 'spawning',
    memberIds: [],
    pendingSpawnCount: encounterCount,
    spawnTimer: 0,
    guaranteed: offer.guaranteed,
    acceptedAt: state.time,
    hpAtAccept: state.hp,
    lastKillX: offer.x,
    lastKillY: offer.y,
  });
  state.bountyDirector.acceptedThisWave++;
  return [{
    type: 'bountyAccepted',
    offerId: offer.id,
    encounterId,
    rewardCardType: offer.rewardCardType,
    side: offer.side,
    decisionSeconds: Math.max(0, state.time - offer.createdAt),
    memberCount: encounterCount,
  }];
}
