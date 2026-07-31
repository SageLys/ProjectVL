import type { SettlementConfig } from './types';

export function validateSettlementConfig(value: unknown): asserts value is SettlementConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('[settlement-config] $: 必须是对象');
  const root = value as Record<string, unknown>;
  for (const key of ['winBonus', 'perWaveCleared', 'perKill', 'hpRatioBonusMax', 'perEquippedStarSquared']) {
    if (typeof root[key] !== 'number' || !Number.isFinite(root[key]) || Number(root[key]) < 0) throw new Error(`[settlement-config] $.${key}: 必须是非负数`);
  }
  const values = root.wildcardStarValue as Record<string, unknown>;
  for (let star = 1; star <= 5; star++) if (typeof values?.[star] !== 'number' || Number(values[star]) < 0) throw new Error(`[settlement-config] $.wildcardStarValue.${star}: 必须是非负数`);
}
