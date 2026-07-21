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
