export const MAX_FRAME_CATCH_UP_SECONDS = 0.5;

/**
 * Split elapsed wall-clock time into stable simulation steps.
 * This preserves real-time speed at low render FPS without passing an unsafe
 * oversized dt into combat systems. Very long background-tab gaps are capped.
 */
export function simulationSteps(
  elapsedSeconds: number,
  maxStepSeconds: number,
  maxCatchUpSeconds = MAX_FRAME_CATCH_UP_SECONDS,
): number[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return [];
  const maxStep = Math.max(0.001, maxStepSeconds);
  let remaining = Math.min(elapsedSeconds, Math.max(maxStep, maxCatchUpSeconds));
  const steps: number[] = [];
  while (remaining > 0.000001) {
    const step = Math.min(maxStep, remaining);
    steps.push(step);
    remaining -= step;
  }
  return steps;
}
