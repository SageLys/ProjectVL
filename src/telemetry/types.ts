import type { RunBaseStatKind, RunStage, WaveChoiceStatKind } from '../config/types';
import type { CardDropSource } from '../core/types';

export type TelemetryEventType =
  | 'spawn'
  | 'kill'
  | 'dropLanded'
  | 'pickup'
  | 'dropExpired'
  | 'dropRejectedFullHand'
  | 'validationRewardLanded'
  | 'validationRewardPickup'
  | 'dangerEnter'
  | 'waveStart'
  | 'waveCleared'
  | 'waveBossSpawned'
  | 'waveBossKilled'
  | 'bossRewardGranted'
  | 'perkPopup'
  | 'mergeOpportunity'
  | 'bountyOffer'
  | 'bountyOfferExpired'
  | 'bountyAccepted'
  | 'bountyMemberSpawned'
  | 'bountyCompleted'
  | 'bountyFailed'
  | 'bountyRewardLanded'
  | 'bountyRewardPickup'
  | 'decision_offered'
  | 'decision_resolved'
  | 'intermission_ready'
  | 'wave_rewards_granted'
  | 'wave_base_reward_offered'
  | 'wave_base_reward_resolved'
  | 'god_offer'
  | 'god_selected'
  | 'run_roster_created'
  | 'active_pool_created'
  | 'card_shown_by_god'
  | 'card_collected_by_god'
  | 'reward_triggered'
  | 'reward_confirmed'
  | 'evolution_branch_offered'
  | 'evolution_branch_selected'
  | 'recipe_available'
  | 'recipe_completed'
  | 'validation_reward_granted'
  | 'validation_reward_settle_started'
  | 'affix_rolled';

export interface TelemetryEvent {
  type: TelemetryEventType;
  at: number;
  wave: number;
  enemyId?: number;
  dropId?: number;
  x?: number;
  y?: number;
  distance?: number;
  range?: number;
  visibleSeconds?: number;
  cardType?: string;
  offerId?: number;
  encounterId?: number;
  rewardCardType?: string;
  rewardCardStar?: number;
  wildcardStar?: number;
  wildcardCount?: number;
  guaranteed?: boolean;
  memberCount?: number;
  decisionSeconds?: number;
  clearSeconds?: number;
  hpAtAccept?: number;
  hpAtComplete?: number;
  lane?: string;
  laneMatch?: boolean;
  difficultyHpMultiplier?: number;
  difficultyDamageMultiplier?: number;
  source?: CardDropSource;
  stage?: RunStage;
  star?: number;
  secure?: boolean;
  rewardKind?: 'card' | 'wildcard';
  typePolicy?: 'build' | 'pivot' | 'uniform' | 'focusGod';
  firstOperation?: 'merge' | 'equip' | 'consume' | 'unused';
  firstOperationSeconds?: number;
  reached5BeforeFinalBoss?: boolean;
  reached6BeforeFinalBoss?: boolean;
  activeRegularSeconds?: number;
  ordinaryDropsShown?: number;
  eligibleKills?: number;
  maturity?: number;
  highestStar?: number;
  equippedCount?: number;
  decisionKind?: string;
  choice?: string;
  automatic?: boolean;
  waveRewards?: Array<{ id: string; stat: RunBaseStatKind; add: number }>;
  waveRewardStat?: WaveChoiceStatKind;
  waveRewardAdd?: number;
  godId?: string;
  focusGod?: string;
  godRole?: 'main' | 'sub' | 'focus';
  candidates?: string[];
  cardTypes?: string[];
  rewardId?: string;
  activationIndex?: number;
  rewardResult?: Record<string, unknown>;
  checkpointStar?: number;
  optionId?: string;
  provisionalCardId?: number;
  recipeId?: string;
  recipeIds?: string[];
  outputStar?: number;
  outputCardId?: number;
  targetSlotKind?: 'cards' | 'equipment';
  targetSlotIndex?: number;
  materialCardIds?: [number, number];
  delivery?: 'hand' | 'drop';
  assistBudgetUsed?: number;
  settleSeconds?: number;
  affixStat?: string;
  affixValue?: number;
  consumableDuration?: number;
}

export interface TelemetrySample {
  at: number;
  wave: number;
  enemies: number;
}

export type TelemetryInputType = 'pickupClick' | 'consumeRelease' | 'dragDrop' | 'lockToggle' | 'perkSelect' | 'bountyAccept';

export interface TelemetryInput {
  type: TelemetryInputType;
  at: number;
  wave: number;
  detail?: string;
}

export interface SessionMeta {
  startedAt: string;
  exportedAt: string;
  config: Record<string, unknown>;
  presetName: string;
  seed: number;
  difficulty?: { id: string; hpMultiplierAtWave1: number; damageMultiplierAtWave1: number };
  gitCommit: string;
  rulesVersion?: string;
  scenarioVersion?: string;
  configFingerprint?: string;
}

export interface TelemetrySession {
  meta: SessionMeta;
  events: TelemetryEvent[];
  samples: TelemetrySample[];
  inputs: TelemetryInput[];
}
