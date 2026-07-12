import type { PointerTelemetryEvent } from '../input/pointerRouter';

const STORAGE_KEY = 'projectvl.attention.v1';
const MAX_EVENTS = 5000;
const PERSIST_DEBOUNCE_MS = 500;
const SESSION_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type AttentionTelemetryKind =
  | 'pointer'
  | 'semantic-action'
  | 'game-state';

export interface AttentionTelemetryEvent {
  sequence: number;
  sessionId: string;
  recordedAtMs: number;
  /** 当前页面生命周期内的单调时间；跨 reload 比较请使用 recordedAtMs + sessionId。 */
  wallTimeMs: number;
  gameTime: number;
  wave: number;
  kind: AttentionTelemetryKind;
  action: string;
  outcome?: string;
  targetKind?: string;
  targetId?: number | string;
  x?: number;
  y?: number;
  durationMs?: number;
  distancePx?: number;
  cancelled?: boolean;
  cancelReason?: string;
  pointerType?: string;
  interactionId?: string;
  startClientX?: number;
  startClientY?: number;
  endClientX?: number;
  endClientY?: number;
  detail?: Record<string, string | number | boolean | null>;
}

export interface AttentionTelemetrySnapshot {
  schemaVersion: 2;
  sessionId: string;
  capturedAt: string;
  events: AttentionTelemetryEvent[];
}

let events: AttentionTelemetryEvent[] = loadStoredEvents();
let sequence = events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' || !('localStorage' in window) ? null : window.localStorage;
  } catch {
    return null;
  }
}

function loadStoredEvents(): AttentionTelemetryEvent[] {
  const target = storage();
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_EVENTS)
      .filter((entry): entry is AttentionTelemetryEvent =>
        !!entry && typeof entry === 'object' && typeof (entry as AttentionTelemetryEvent).action === 'string')
      .map(entry => ({
        ...entry,
        sessionId: entry.sessionId ?? 'legacy',
        recordedAtMs: entry.recordedAtMs ?? 0,
      }));
  } catch {
    return [];
  }
}

export function flushAttentionTelemetry(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 遥测不得影响玩法；配额不足或隐私模式下静默退化为内存记录。
  }
}

function schedulePersist(): void {
  if (!storage() || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushAttentionTelemetry();
  }, PERSIST_DEBOUNCE_MS);
}

export function recordAttentionEvent(
  event: Omit<AttentionTelemetryEvent, 'sequence' | 'sessionId' | 'recordedAtMs' | 'wallTimeMs'>,
): AttentionTelemetryEvent {
  const recorded: AttentionTelemetryEvent = {
    ...event,
    sequence: sequence++,
    sessionId: SESSION_ID,
    recordedAtMs: Date.now(),
    wallTimeMs: typeof performance === 'undefined' ? Date.now() : performance.now(),
  };
  events.push(recorded);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  schedulePersist();
  return recorded;
}

export function recordPointerTelemetry(
  event: PointerTelemetryEvent,
  gameTime: number,
  wave: number,
): AttentionTelemetryEvent {
  return recordAttentionEvent({
    gameTime,
    wave,
    kind: 'pointer',
    action: event.resolvedAction ?? event.action,
    outcome: event.cancelled ? 'cancelled' : 'completed',
    targetKind: event.targetKind,
    targetId: event.targetId,
    x: event.canvasPoint?.x,
    y: event.canvasPoint?.y,
    durationMs: event.durationMs,
    distancePx: event.distancePx,
    cancelled: event.cancelled,
    cancelReason: event.cancelReason,
    pointerType: event.pointerType,
    interactionId: `pointer:${event.pointerId}`,
    startClientX: event.startClient.x,
    startClientY: event.startClient.y,
    endClientX: event.endClient.x,
    endClientY: event.endClient.y,
  });
}

export function getAttentionTelemetry(): AttentionTelemetrySnapshot {
  return {
    schemaVersion: 2,
    sessionId: SESSION_ID,
    capturedAt: new Date().toISOString(),
    events: events.map(event => ({ ...event, ...(event.detail ? { detail: { ...event.detail } } : {}) })),
  };
}

export function clearAttentionTelemetry(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  events = [];
  sequence = 1;
  storage()?.removeItem(STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAttentionTelemetry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAttentionTelemetry();
  });
}
