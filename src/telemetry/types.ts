export type TelemetryEventType =
  | 'spawn'
  | 'kill'
  | 'dropLanded'
  | 'pickup'
  | 'dangerEnter'
  | 'waveStart'
  | 'waveCleared'
  | 'perkPopup'
  | 'mergeOpportunity';

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
}

export interface TelemetrySample {
  at: number;
  wave: number;
  enemies: number;
}

export type TelemetryInputType = 'pickupClick' | 'consumeRelease' | 'dragDrop' | 'lockToggle' | 'perkSelect';

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
  gitCommit: string;
}

export interface TelemetrySession {
  meta: SessionMeta;
  events: TelemetryEvent[];
  samples: TelemetrySample[];
  inputs: TelemetryInput[];
}
