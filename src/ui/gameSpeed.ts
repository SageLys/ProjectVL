export const PLAY_SPEEDS = [1, 1.5, 2, 3] as const;

export function nextPlaySpeed(current: number): number {
  const index = PLAY_SPEEDS.indexOf(current as (typeof PLAY_SPEEDS)[number]);
  return PLAY_SPEEDS[(index + 1) % PLAY_SPEEDS.length];
}

export function formatPlaySpeed(speed: number): string {
  return `${speed}×`;
}
