import { cfg } from '../../config';
import { getSkillDef } from '../effects/interpreter';
import type { BuildTag } from '../effects/defs';
import type { CardDropSource, CardType, CardTypeRunStats, GameState, NormalDropRole, Rng } from '../types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);

function emptyTypeStats(): CardTypeRunStats {
  return {
    ordinaryShown: 0,
    totalShown: 0,
    collected: 0,
    mergeOps: 0,
    highestStarReached: 0,
    lastOrdinaryShownAt: 0,
  };
}

/** Lazily initialize stats so runtime card-pool switches do not require a state reset. */
export function getOrCreateCardTypeRunStats(state: GameState, type: CardType): CardTypeRunStats {
  return state.normalDropDirector.typeStats[type]
    ?? (state.normalDropDirector.typeStats[type] = emptyTypeStats());
}

/** Return the currently active skill card pool without caching variant-dependent config. */
export function getCardPool(): CardType[] {
  return cfg.skills.cards.map(card => card.id);
}

/** Select uniformly from the active card pool using only the injected RNG. */
export function selectUniformCardType(rng: Rng): CardType {
  const cardPool = getCardPool();
  return cardPool[Math.min(cardPool.length - 1, Math.floor(rng() * cardPool.length))];
}

function randomChoice<T>(values: readonly T[], rng: Rng): T {
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
}

function weightedChoice(values: readonly CardType[], weights: readonly number[], rng: Rng): CardType {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return randomChoice(values, rng);
  let roll = rng() * total;
  for (let index = 0; index < values.length; index++) {
    roll -= Math.max(0, weights[index]);
    if (roll < 0) return values[index];
  }
  return values[values.length - 1];
}

function withoutTypeIfPossible(values: CardType[], excludedType?: CardType): CardType[] {
  if (excludedType === undefined) return values;
  const filtered = values.filter(type => type !== excludedType);
  return filtered.length ? filtered : values;
}

export function calculateBuildMaturity(state: GameState): number {
  const maturity = cfg.economy.normalDropTypePolicy.maturity;
  const highestStarReached = Object.values(state.normalDropDirector.typeStats)
    .reduce((highest, stats) => Math.max(highest, stats.highestStarReached), 0);
  const equippedTypes = state.equipment.filter(card => card !== null).length;
  return clamp01(
    maturity.mergeWeight * clamp01(state.merges / Math.max(Number.EPSILON, maturity.fullMergeOps))
      + maturity.starWeight * clamp01(
        (highestStarReached - 1) / Math.max(Number.EPSILON, maturity.fullHighestStar - 1),
      )
      + maturity.equipWeight * clamp01(
        equippedTypes / Math.max(Number.EPSILON, maturity.fullEquippedTypes),
      ),
  );
}

export function calculateCommitmentScore(state: GameState, type: CardType): number {
  const policy = cfg.economy.normalDropTypePolicy.build;
  let score = 0;
  for (const card of [...state.cards, ...state.equipment]) {
    if (card?.type === type) score += 2 ** Math.max(0, card.star - 1);
  }
  const stats = getOrCreateCardTypeRunStats(state, type);
  score += policy.historicalMergeWeight * Math.min(stats.mergeOps, policy.historicalMergeCap);
  const equipped = state.equipment.find(card => card?.type === type);
  if (equipped) {
    score += policy.equippedBaseBonus
      + policy.equippedStarBonus * (equipped.star - cfg.economy.equipThreshold);
  }
  return Math.max(0, score);
}

/** 流派倾向只叠加到 build 位；utility 不参与卡型导流。 */
export function calculateAffinityScore(state: GameState, type: CardType): number {
  const def = getSkillDef(type);
  if (!def) return 0;
  const affinity = cfg.economy.normalDropTypePolicy.affinity;
  const raw = def.synergyTags
    .filter(tag => tag !== 'utility')
    .reduce((sum, tag) => sum + state.buildState.affinity[tag], 0);
  return Math.min(affinity.scoreCap, raw * affinity.scorePerStack);
}

function shuffleInPlace<T>(values: T[], rng: Rng): void {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.min(index, Math.floor(rng() * (index + 1)));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function reduceRoles(counts: { discovery: number; build: number; pivot: number }, amount: number): void {
  const fromBuild = Math.min(counts.build, amount);
  counts.build -= fromBuild;
  amount -= fromBuild;
  const fromPivot = Math.min(counts.pivot, amount);
  counts.pivot -= fromPivot;
}

export function refillNormalDropRoleBag(state: GameState, rng: Rng): void {
  const policy = cfg.economy.normalDropTypePolicy;
  const bagSize = Math.max(1, Math.round(policy.roleBagSize));
  const maturity = calculateBuildMaturity(state);
  const counts = {
    discovery: 0,
    build: Math.max(0, Math.round(
      policy.earlyMix.build + (policy.lateMix.build - policy.earlyMix.build) * maturity,
    )),
    pivot: Math.max(0, Math.round(
      policy.earlyMix.pivot + (policy.lateMix.pivot - policy.earlyMix.pivot) * maturity,
    )),
  };
  reduceRoles(counts, Math.max(0, counts.build + counts.pivot - bagSize));
  counts.discovery = bagSize - counts.build - counts.pivot;

  const hasUnseenType = getCardPool().some(
    type => getOrCreateCardTypeRunStats(state, type).ordinaryShown === 0,
  );
  if (hasUnseenType) {
    const protectedDiscovery = Math.min(
      bagSize,
      Math.max(counts.discovery, Math.max(0, Math.round(policy.bootstrapMinDiscovery))),
    );
    reduceRoles(counts, protectedDiscovery - counts.discovery);
    counts.discovery = bagSize - counts.build - counts.pivot;
  }

  const firstHalfSize = Math.ceil(bagSize / 2);
  const secondHalfSize = bagSize - firstHalfSize;
  const firstHalf: NormalDropRole[] = [];
  const secondHalf: NormalDropRole[] = [];
  for (let index = 0; index < counts.pivot; index++) {
    const preferred = index % 2 === 0 ? firstHalf : secondHalf;
    const fallback = preferred === firstHalf ? secondHalf : firstHalf;
    const preferredCapacity = preferred === firstHalf ? firstHalfSize : secondHalfSize;
    const fallbackCapacity = fallback === firstHalf ? firstHalfSize : secondHalfSize;
    if (preferred.length < preferredCapacity) preferred.push('pivot');
    else if (fallback.length < fallbackCapacity) fallback.push('pivot');
  }

  const otherRoles: NormalDropRole[] = [
    ...Array<NormalDropRole>(counts.discovery).fill('discovery'),
    ...Array<NormalDropRole>(counts.build).fill('build'),
  ];
  shuffleInPlace(otherRoles, rng);
  while (firstHalf.length < firstHalfSize) firstHalf.push(otherRoles.pop() ?? 'discovery');
  while (secondHalf.length < secondHalfSize) secondHalf.push(otherRoles.pop() ?? 'discovery');
  shuffleInPlace(firstHalf, rng);
  shuffleInPlace(secondHalf, rng);
  state.normalDropDirector.roleBag = [...firstHalf, ...secondHalf];
}

export function selectDiscoveryType(state: GameState, rng: Rng, excludedType?: CardType): CardType {
  const cardPool = getCardPool();
  const minimumShown = Math.min(
    ...cardPool.map(type => getOrCreateCardTypeRunStats(state, type).ordinaryShown),
  );
  let candidates = cardPool.filter(
    type => getOrCreateCardTypeRunStats(state, type).ordinaryShown === minimumShown,
  );
  const previousType = state.normalDropDirector.recentTypes[
    state.normalDropDirector.recentTypes.length - 1
  ];
  if (previousType !== undefined && candidates.length > 1) {
    candidates = candidates.filter(type => type !== previousType);
  }
  return randomChoice(withoutTypeIfPossible(candidates, excludedType), rng);
}

function buildCandidatesByCommitment(state: GameState): Array<{ type: CardType; score: number }> {
  return getCardPool()
    .map(type => ({ type, score: calculateCommitmentScore(state, type) }))
    .sort((left, right) => right.score - left.score);
}

function buildCandidatesForBuildRole(state: GameState): Array<{ type: CardType; score: number }> {
  return getCardPool()
    .map(type => ({ type, score: calculateCommitmentScore(state, type) + calculateAffinityScore(state, type) }))
    .sort((left, right) => right.score - left.score);
}

function weightedBuildChoice(
  state: GameState,
  candidates: Array<{ type: CardType; score: number }>,
  rng: Rng,
): CardType {
  const policy = cfg.economy.normalDropTypePolicy.build;
  const rawWeights = candidates.map(entry => (entry.score + 0.5) ** policy.scorePower);
  const minimumWeight = Math.min(...rawWeights);
  const cappedWeights = rawWeights.map(weight => Math.min(
    weight,
    minimumWeight * Math.max(1, policy.maxWeightRatio),
  ));
  const weights = cappedWeights.map((weight, index) => (
    state.cards.some(card => card?.type === candidates[index].type && card.star === 1)
      ? weight * policy.mergeReadyMultiplier
      : weight
  ));
  return weightedChoice(candidates.map(entry => entry.type), weights, rng);
}

function selectBuildTypeBase(state: GameState, rng: Rng, excludedType?: CardType): CardType {
  const scored = buildCandidatesForBuildRole(state);
  const hasCommittedInvestment = state.equipment.some(card => card !== null)
    || state.cards.some(card => card !== null && card.star > 1)
    || Object.values(state.normalDropDirector.typeStats).some(stats => stats.mergeOps > 0);
  const hasAffinity = scored.some(entry => calculateAffinityScore(state, entry.type) > 0);
  if ((!hasCommittedInvestment && !hasAffinity) || scored.every(entry => entry.score === 0)) {
    const mergeReadyTypes = [...new Set(
      state.cards.filter(card => card?.star === 1).map(card => card!.type),
    )];
    if (mergeReadyTypes.length) {
      return randomChoice(withoutTypeIfPossible(mergeReadyTypes, excludedType), rng);
    }
    return selectDiscoveryType(state, rng, excludedType);
  }

  const policy = cfg.economy.normalDropTypePolicy.build;
  let candidates = scored.slice(0, Math.max(1, Math.round(policy.topK)));
  const allowedTypes = new Set(withoutTypeIfPossible(candidates.map(entry => entry.type), excludedType));
  candidates = candidates.filter(entry => allowedTypes.has(entry.type));
  return weightedBuildChoice(state, candidates, rng);
}

function hasSynergyTag(type: CardType, lane: BuildTag): boolean {
  return getSkillDef(type)?.synergyTags.includes(lane) ?? false;
}

function applyBuildPity(
  state: GameState,
  selectedType: CardType,
  rng: Rng,
  streakExcludedType?: CardType,
): CardType {
  const pity = state.buildState.dropPity;
  if (!pity) return selectedType;
  if (hasSynergyTag(selectedType, pity.lane)) {
    state.buildState.dropPity = undefined;
    return selectedType;
  }
  pity.remaining--;
  if (pity.remaining > 0) return selectedType;

  const matching = buildCandidatesForBuildRole(state).filter(entry => hasSynergyTag(entry.type, pity.lane));
  if (!matching.length) {
    state.buildState.dropPity = undefined;
    return selectedType;
  }
  const allowed = new Set(withoutTypeIfPossible(matching.map(entry => entry.type), streakExcludedType));
  const candidates = matching.filter(entry => allowed.has(entry.type));
  // 若该流派只有一个合法卡型，withoutTypeIfPossible 会允许它突破连发保护，保证 pity 可兑现。
  const forced = weightedBuildChoice(state, candidates, rng);
  state.buildState.dropPity = undefined;
  return forced;
}

export function selectBuildType(state: GameState, rng: Rng, excludedType?: CardType): CardType {
  return applyBuildPity(state, selectBuildTypeBase(state, rng, excludedType), rng, excludedType);
}

export function selectPivotType(state: GameState, rng: Rng, excludedType?: CardType): CardType {
  const policy = cfg.economy.normalDropTypePolicy.pivot;
  const scored = buildCandidatesByCommitment(state);
  const excludedTopCount = clamp(Math.round(policy.excludeTopK), 0, scored.length);
  const excludedTop = new Set(scored.slice(0, excludedTopCount).map(entry => entry.type));
  const remaining = scored
    .filter(entry => !excludedTop.has(entry.type))
    .sort((left, right) => left.score - right.score
      || getOrCreateCardTypeRunStats(state, left.type).lastOrdinaryShownAt
        - getOrCreateCardTypeRunStats(state, right.type).lastOrdinaryShownAt);
  if (!remaining.length) return selectDiscoveryType(state, rng, excludedType);
  const candidateCount = Math.max(1, Math.ceil(remaining.length * clamp01(policy.candidateFraction)));
  let candidates = remaining.slice(0, candidateCount);
  const allowedTypes = new Set(withoutTypeIfPossible(candidates.map(entry => entry.type), excludedType));
  candidates = candidates.filter(entry => allowedTypes.has(entry.type));
  return weightedChoice(
    candidates.map(entry => entry.type),
    candidates.map(entry => 1 / (1 + entry.score)),
    rng,
  );
}

export function recordCardDropShown(state: GameState, type: CardType, source: CardDropSource): void {
  const stats = getOrCreateCardTypeRunStats(state, type);
  stats.totalShown++;
  if (source !== 'normalKill') return;
  stats.ordinaryShown++;
  stats.lastOrdinaryShownAt = state.normalDropDirector.ordinaryDropCount + 1;
  const recentLimit = Math.max(1, Math.round(cfg.economy.normalDropTypePolicy.maxSameTypeStreak));
  state.normalDropDirector.recentTypes.push(type);
  state.normalDropDirector.recentTypes = state.normalDropDirector.recentTypes.slice(-recentLimit);
}

export function selectNormalEnemyDropType(state: GameState, rng: Rng): CardType {
  const policy = cfg.economy.normalDropTypePolicy;
  if (!policy.enabled) return selectUniformCardType(rng);
  if (!state.normalDropDirector.roleBag.length) refillNormalDropRoleBag(state, rng);
  const role = state.normalDropDirector.roleBag.pop() ?? 'discovery';
  const selectForRole = (excludedType?: CardType): CardType => {
    if (role === 'build') return selectBuildTypeBase(state, rng, excludedType);
    if (role === 'pivot') return selectPivotType(state, rng, excludedType);
    return selectDiscoveryType(state, rng, excludedType);
  };
  let type = selectForRole();
  const streakLimit = Math.max(1, Math.round(policy.maxSameTypeStreak));
  const recent = state.normalDropDirector.recentTypes;
  if (recent.length >= streakLimit
    && recent.slice(-streakLimit).every(recentType => recentType === type)) {
    type = selectForRole(type);
  }
  if (role === 'build') {
    const streakExcludedType = recent.length >= streakLimit
      && recent.slice(-streakLimit).every(recentType => recentType === recent[recent.length - 1])
      ? recent[recent.length - 1]
      : undefined;
    type = applyBuildPity(state, type, rng, streakExcludedType);
  }
  recordCardDropShown(state, type, 'normalKill');
  state.normalDropDirector.ordinaryDropCount++;
  return type;
}
