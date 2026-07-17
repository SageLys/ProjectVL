export type TelemetryEventType =
  | 'spawn'
  | 'kill'
  | 'dropLanded'
  | 'pickup'
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
  | 'bountyRewardPickup';

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
}

export interface TelemetrySession {
  meta: SessionMeta;
  events: TelemetryEvent[];
  samples: TelemetrySample[];
  inputs: TelemetryInput[];
}
