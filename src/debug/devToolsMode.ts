/**
 * The playable prototype keeps its tuning and telemetry panels in built previews.
 * Append `?devtools=0` (or `false`) when a clean player-facing view is needed.
 */
export function devToolsEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get('devtools')?.toLowerCase();
  return value !== '0' && value !== 'false';
}

export const DEV_TOOLS_ENABLED = devToolsEnabled(
  typeof location === 'undefined' ? '' : location.search,
);

/** Compact, player-readable weapon form label shared by DEV counters. */
export function combatFormLabel(form: { delivery: 'projectile' | 'line' | 'lob'; impacts: readonly unknown[] }): string {
  if (form.delivery === 'line' && form.impacts.length) return '融合:光束+榴弹';
  if (form.delivery === 'line') return '光束';
  if (form.delivery === 'lob') return '榴弹';
  return '普通弹';
}
