import type { DifficultyConfig, DifficultyCurve, DifficultyId, DifficultyProfile } from './types';

const IDS: DifficultyId[] = ['relaxed', 'standard', 'hard', 'hell'];
const PROFILE_KEYS = new Set(['label', 'description', 'enemy', 'boss']);
const STAT_KEYS = ['hp', 'damage', 'speed'] as const;

function fail(message: string): never { throw new Error(`[difficulty-config] ${message}`); }

function validateCurve(curve: DifficultyCurve | undefined, path: string): void {
  if (!curve || typeof curve !== 'object') fail(`${path} must be a curve`);
  const { start, end, power } = curve;
  if (![start, end, power].every(Number.isFinite)) fail(`${path} values must be finite`);
  if (start <= 0 || end <= 0 || power <= 0) fail(`${path} values must be > 0`);
  if (start > end) fail(`${path}.start must be <= end`);
}

function validateProfile(profile: DifficultyProfile | undefined, id: DifficultyId): void {
  if (!profile || typeof profile !== 'object') fail(`profiles.${id} is required`);
  for (const key of Object.keys(profile)) if (!PROFILE_KEYS.has(key)) fail(`profiles.${id}.${key} is not allowed`);
  if (typeof profile.label !== 'string' || typeof profile.description !== 'string') fail(`profiles.${id} label/description must be strings`);
  for (const stat of STAT_KEYS) validateCurve(profile.enemy?.[stat], `profiles.${id}.enemy.${stat}`);
  if (profile.boss) for (const stat of STAT_KEYS) {
    const curve = profile.boss[stat];
    if (curve) validateCurve(curve, `profiles.${id}.boss.${stat}`);
  }
}

function isIdentity(curve: DifficultyCurve): boolean {
  return curve.start === 1 && curve.end === 1 && curve.power === 1;
}

export function validateDifficultyConfig(config: DifficultyConfig): void {
  if (!config || typeof config !== 'object') fail('config must be an object');
  for (const id of IDS) validateProfile(config.profiles?.[id], id);
  if (!Object.prototype.hasOwnProperty.call(config.profiles, config.defaultDifficulty)) fail('defaultDifficulty must be a profiles key');
  const hell = config.profiles.hell;
  for (const stat of STAT_KEYS) if (!isIdentity(hell.enemy[stat])) fail(`hell.enemy.${stat} must be identity`);
  if (hell.boss) for (const stat of STAT_KEYS) {
    const curve = hell.boss[stat];
    if (curve && !isIdentity(curve)) fail(`hell.boss.${stat} must be identity`);
  }
}
