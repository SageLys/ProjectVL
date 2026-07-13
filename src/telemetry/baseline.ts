export interface RatingPerWave { busy: number; watch: number; tension: number }
export interface BaselineSession {
  id: string;
  seed: number;
  ratingPerWave: RatingPerWave[];
  overall: number;
  telemetryFile: string;
}

export interface BaselinePayload {
  meta: Record<string, unknown>;
  config: Record<string, unknown>;
  session: BaselineSession;
}

export interface BaselineDocument {
  meta: Record<string, unknown>;
  config: Record<string, unknown>;
  sessions: BaselineSession[];
}

/** 同一会话重复评分时原位覆盖；不同会话按导出顺序累加。 */
export function mergeBaselineDocument(previous: unknown, payload: BaselinePayload): BaselineDocument {
  const oldSessions = typeof previous === 'object' && previous !== null && Array.isArray((previous as { sessions?: unknown }).sessions)
    ? (previous as { sessions: BaselineSession[] }).sessions
    : [];
  const sessions = structuredClone(oldSessions);
  const existing = sessions.findIndex(item => item.id === payload.session.id);
  if (existing >= 0) sessions[existing] = structuredClone(payload.session);
  else sessions.push(structuredClone(payload.session));
  return { meta: structuredClone(payload.meta), config: structuredClone(payload.config), sessions };
}
