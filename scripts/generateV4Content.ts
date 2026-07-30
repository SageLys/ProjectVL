/**
 * Mechanical materializer for the three 2026-07-30 final design documents.
 *
 * The markdown remains the source of truth for card names, identity contracts,
 * overviews, branch names and amplify values. This script only translates the
 * prose carrier vocabulary into the existing generic atom contract and creates
 * the deliberately minimal B0 recipe outputs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATOM_CONTRACT, type AtomContract } from '../src/core/effects/atomContract';

type Json = Record<string, any>;
type Effect = { atom: string; params?: Record<string, any>; at?: string; scaleBy?: Record<string, any> };
type Binding = { trigger: string; triggerParams?: Record<string, any>; at?: string; effects: Effect[] };

const root = resolve(import.meta.dirname, '..');
const skillsPath = resolve(root, 'src/config/base/skills.json');
const recipesPath = resolve(root, 'src/config/base/evolutionRecipes.json');
const textsPath = resolve(root, 'src/data/texts.json');
const designPath = resolve(root, 'docs/五神35卡_完整设计表_v4.md');
const fingerprintsPath = resolve(root, 'src/config/base/designFingerprints.json');

const sourceSkills = JSON.parse(readFileSync(skillsPath, 'utf8')) as Json;
const texts = JSON.parse(readFileSync(textsPath, 'utf8')) as Json;
const design = readFileSync(designPath, 'utf8');

const GODS = ['storm', 'winter', 'inferno', 'bulwark', 'plenty'] as const;
const SECTION_GOD: Record<string, string> = { '2': 'storm', '3': 'winter', '4': 'inferno', '5': 'bulwark', '6': 'plenty' };
const IDENTITY_ATOMS: Record<string, string[]> = {
  storm: ['chain', 'vulnerable', 'stun', 'ricochet'],
  winter: ['slow', 'freeze', 'taunt'],
  inferno: ['dot', 'groundZone'],
  bulwark: ['shield', 'thorns', 'breachReduction', 'novaOnBreak', 'mergeMaterialRefund'],
  plenty: ['focusPriority', 'dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert', 'mergePulse', 'wildcardRewardBonus'],
};

const PRODUCT_ROWS = [
  ['storm', 'storm', 'arcSplitter', 'pierce', 'stormLattice', '天罗电网'],
  ['storm', 'winter', 'stormcall', 'frost', 'thunderRime', '霜雷云'],
  ['storm', 'inferno', 'staticSurge', 'scorch', 'emberSpark', '引雷火种'],
  ['storm', 'bulwark', 'galvanicWard', 'aegis', 'voltBastion', '电容堡垒'],
  ['storm', 'plenty', 'overcharge', 'harvest', 'ampereFlow', '盈电金流'],
  ['winter', 'storm', 'glacialSpike', 'chainLightning', 'crystalRelay', '晶脉传导'],
  ['winter', 'winter', 'permafrost', 'impact', 'glacialEpoch', '冰河世纪'],
  ['winter', 'inferno', 'frozenBulwark', 'splitBlast', 'rimeShell', '霜火榴弹'],
  ['winter', 'bulwark', 'iceTomb', 'thorns', 'tombSpire', '寒棺尖碑'],
  ['winter', 'plenty', 'hoarfrostTithe', 'fateLoom', 'stasisLedger', '冻结时价'],
  ['inferno', 'storm', 'meteor', 'pierce', 'solarPiercer', '贯日'],
  ['inferno', 'winter', 'flashfire', 'frost', 'steamBurst', '蒸汽爆裂'],
  ['inferno', 'inferno', 'magmaPool', 'scorch', 'volcanoCore', '常燃火山'],
  ['inferno', 'bulwark', 'cinderheart', 'aegis', 'emberMoat', '燃烧护城河'],
  ['inferno', 'plenty', 'ashHarvest', 'harvest', 'emberYield', '余烬收成'],
  ['bulwark', 'storm', 'sentinel', 'chainLightning', 'pylonCircuit', '雷枢方阵'],
  ['bulwark', 'winter', 'decoy', 'impact', 'glacialEffigy', '冰像阵'],
  ['bulwark', 'inferno', 'retribution', 'splitBlast', 'wrathMortar', '罪火迫击'],
  ['bulwark', 'bulwark', 'sanctum', 'aegis', 'aegisCitadel', '永固圣域'],
  ['bulwark', 'plenty', 'ironvine', 'fateLoom', 'rootLoom', '根脉织网'],
  ['plenty', 'storm', 'goldenVolley', 'chainLightning', 'midasChain', '点金链'],
  ['plenty', 'winter', 'springOfLife', 'frost', 'frostDew', '回春霜露'],
  ['plenty', 'inferno', 'bountyCall', 'scorch', 'pyreBrand', '悬赏烙印'],
  ['plenty', 'bulwark', 'luckyStar', 'thorns', 'fortuneThorns', '福祸相生'],
  ['plenty', 'plenty', 'overgrowth', 'harvest', 'goldenGrove', '丰饶圣林'],
] as const;

const atomNames = Object.keys(ATOM_CONTRACT).sort((a, b) => b.length - a.length);
const deepClone = <T>(value: T): T => structuredClone(value);
const clean = (value: string): string => value.replace(/\*\*/g, '').replace(/`/g, '').trim();
const atom = (name: string, params: Record<string, any> = {}): Effect =>
  Object.keys(params).length ? { atom: name, params } : { atom: name };
const scaled = (effect: Effect, source: string, param: string, perUnit: number, cap: number): Effect => ({
  ...effect, scaleBy: { source, param, perUnit, cap },
});
const placed = (effect: Effect, at: string): Effect => ({ ...effect, at });
const fanout = (set: Record<string, any>, maxTargets: number, effects: Effect[], order: 'nearest' | 'farthest' = 'nearest'): Effect => ({
  atom: effects[0]?.atom ?? 'burstDamage',
  ...(effects[0]?.params ? { params: deepClone(effects[0].params) } : {}),
  forEach: { set, maxTargets, order, effects },
} as unknown as Effect);
const binding = (trigger: string, effects: Effect[], triggerParams?: Record<string, any>): Binding => ({
  trigger,
  ...(triggerParams && Object.keys(triggerParams).length ? { triggerParams } : {}),
  effects,
});

function defaultParams(name: string, variant = 0): Record<string, any> {
  const v = variant % 3;
  switch (name) {
    case 'pierce': return { count: 2 + v, damageRetention: 0.78 + v * 0.04 };
    case 'chain': return { bounces: 2 + v, damageRetention: 0.68 + v * 0.05, searchRange: 130 + v * 15, targets: 1 + v };
    case 'split': return { count: 2 + v, damageRatio: 0.45 + v * 0.05, maxDepth: 1 };
    case 'ricochet': return { bounces: 1 + v };
    case 'aoeOnHit': return { radius: 70 + v * 15, damageRatio: 0.45 + v * 0.1, falloff: 0.4 };
    case 'beamMorph': return { width: 26 + v * 5, damageRatio: 0.7 + v * 0.1, interval: 0.8, duration: 0.18, tickInterval: 0.08 };
    case 'mortarMorph': return { radius: 90 + v * 15, damageRatio: 0.9 + v * 0.15, falloff: 0.35 };
    case 'slow': return { ratio: 0.22 + v * 0.04, duration: 1.8 + v * 0.4 };
    case 'freeze': return { duration: 0.7 + v * 0.15, stacksToTrigger: Math.max(2, 3 - v) };
    case 'stun': return { duration: 0.3 + v * 0.1 };
    case 'knockback': return { distance: 35 + v * 15, collisionDamage: 0.15 };
    case 'taunt': return { duration: 2 + v, radius: 130 + v * 20, priorityWeight: 1 + v * 0.2 };
    case 'vulnerable': return { ratio: 0.08 + v * 0.03, duration: 2 + v * 0.5 };
    case 'aura': return { radius: 125 + v * 20, tickInterval: 0.6, duration: 3 + v };
    case 'groundZone': return { radius: 100 + v * 20, duration: 3 + v, tickInterval: 0.5 };
    case 'dot': return { damageRatio: 0.08 + v * 0.03, tickInterval: 0.5, duration: 2.5 + v * 0.5 };
    case 'summon': return { kind: v === 1 ? 'orbital' : 'decoy', count: 1 + (v === 2 ? 1 : 0), hp: 45 + v * 20, duration: 8, damageRatio: 0.35, fireInterval: 0.8 };
    case 'dropRateMul': return { mul: 1.12 + v * 0.05 };
    case 'dropLifetimeMul': return { mul: 1.15 + v * 0.08 };
    case 'xpMul': return { mul: 1.12 + v * 0.05 };
    case 'extraDrop': return { count: 1, at: 'point', chance: 0.25 + v * 0.1 };
    case 'expiryConvert': return { ratio: 0.15 + v * 0.08 };
    case 'mergeMaterialRefund': return { refundChance: 0.2, count: 1, star: 1, scope: 'both' };
    case 'wildcardRewardBonus': return { bonusChance: 0.2, count: 1, scope: 'both' };
    case 'mergePulse': return { damagePerMergeCount: 5 + v * 2, radius: 180 + v * 30 };
    case 'shield': return { absorbHits: 1 + v, regenSeconds: 9 - v };
    case 'thorns': return { ratio: 0.18 + v * 0.08 };
    case 'breachReduction': return { ratio: 0.08 + v * 0.04 };
    case 'novaOnBreak': return { damage: 12 + v * 6, knockbackDistance: 45 + v * 15 };
    case 'execute': return { hpThresholdRatio: 0.08 + v * 0.03 };
    case 'burstDamage': return { damageMul: 0.8 + v * 0.25, radius: 85 + v * 15 };
    case 'focusPriority': return { priorityWeight: 1.4 + v * 0.3, duration: 3 + v, radius: 100 + v * 20 };
    case 'restore': return { amountRatio: 0.03 + v * 0.02 };
    case 'statBuff': return { stat: v === 0 ? 'damage' : v === 1 ? 'fireRate' : 'maxHpAdd', operation: 'mul', value: 1.08 + v * 0.04, duration: 3 + v, maxStacks: 2 + v };
    default: return {};
  }
}

function preferredTrigger(name: string): string {
  if (['pierce', 'ricochet'].includes(name)) return 'onFire';
  if (['chain', 'split', 'aoeOnHit', 'slow', 'freeze', 'stun', 'knockback', 'vulnerable', 'dot'].includes(name)) return 'onHit';
  if (['shield', 'summon'].includes(name)) return 'onWaveStart';
  if (['dropRateMul', 'dropLifetimeMul', 'xpMul', 'expiryConvert', 'mergeMaterialRefund', 'wildcardRewardBonus', 'thorns', 'breachReduction', 'novaOnBreak', 'execute', 'beamMorph', 'aura'].includes(name)) return 'passive';
  return 'interval';
}

function supportsTrigger(name: string, trigger: string): boolean {
  const contract = ATOM_CONTRACT[name as keyof AtomContract];
  return contract.allowedTriggers === 'any' || (contract.allowedTriggers as readonly string[]).includes(trigger);
}

function makeBindings(trigger: string, effects: Effect[], triggerParams?: Record<string, any>): Binding[] {
  const groups = new Map<string, Effect[]>();
  for (const effect of effects) {
    const actual = supportsTrigger(effect.atom, trigger) ? trigger : preferredTrigger(effect.atom);
    const list = groups.get(actual) ?? [];
    list.push(effect);
    groups.set(actual, list);
  }
  return [...groups].map(([actual, grouped]) => binding(actual, grouped, actual === trigger ? triggerParams : undefined));
}

function parseCarrierAtoms(raw: string): string[] {
  const found: string[] = [];
  for (const name of atomNames) {
    if (raw.includes(`spreadStatus:'${name}'`) || raw.includes(`spreadStatus: '${name}'`)) continue;
    if (raw.includes(`groundZone(${name})`) || raw.includes(`aura(${name})`)) continue;
    const re = new RegExp(`(^|[^a-zA-Z])${name}([^a-zA-Z]|$)`);
    if (re.test(raw) && !found.includes(name)) found.push(name);
  }
  return found;
}

function sourceParams(name: string, raw: string, variant: number): Record<string, any> {
  const params = defaultParams(name, variant);
  const contract = ATOM_CONTRACT[name as keyof typeof ATOM_CONTRACT] as AtomContract | undefined;
  const match = raw.match(new RegExp(`${name}\\(([^)]*)\\)`));
  if (!match || !contract) return params;
  const parts = match[1].split(',').map(value => value.trim()).filter(Boolean);
  for (const part of parts) {
    const assignment = part.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(.+)$/);
    if (assignment && contract.params[assignment[1]]) {
      const rawValue = assignment[2].trim();
      const numeric = Number(rawValue.replace(/s$/, ''));
      params[assignment[1]] = Number.isFinite(numeric)
        ? numeric
        : rawValue.replace(/^['"]|['"]$/g, '');
      continue;
    }
    const positive = part.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*>\s*0$/);
    if (positive && contract.params[positive[1]]) {
      params[positive[1]] = positive[1] === 'explodeDamageMul' ? 0.4 : 1;
      if (positive[1] === 'explodeDamageMul' && contract.params.explode) params.explode = true;
      continue;
    }
    const seconds = Number(part.replace(/s$/, ''));
    if (Number.isFinite(seconds) && contract.params.duration) {
      params.duration = seconds;
      continue;
    }
    if (name === 'summon' && ['decoy', 'mirrorTurret', 'orbital'].includes(part)) params.kind = part;
  }
  return params;
}

function parseTriggers(raw: string): Array<{ trigger: string; seconds?: number }> {
  const result: Array<{ trigger: string; seconds?: number }> = [];
  for (const name of ['onFire', 'onHit', 'onKill', 'onWaveStart', 'onBreach', 'onPickup', 'onMerge', 'passive', 'interval']) {
    if (!raw.includes(name)) continue;
    const seconds = name === 'interval'
      ? Number(raw.match(/interval\s*([0-9.]+)s/)?.[1] ?? raw.match(/每\s*([0-9.]+)\s*秒/)?.[1] ?? 3)
      : undefined;
    result.push({ trigger: name, seconds });
  }
  return result.length ? result : [{ trigger: 'onHit' }];
}

function resourceEffect(god: string, variant: number): Effect {
  if (god === 'storm') return atom('vulnerable', defaultParams('vulnerable', variant));
  if (god === 'winter') return variant === 2
    ? atom('freeze', defaultParams('freeze', variant))
    : atom('slow', defaultParams('slow', variant));
  if (god === 'inferno') return atom('dot', defaultParams('dot', variant));
  // Use the additive retaliation identity as the neutral Bulwark resource.
  // Choosing breachReduction by branch index silently collided with explicit
  // six-star declarations and changed several carriers from the source table.
  if (god === 'bulwark') return atom('thorns', defaultParams('thorns', variant));
  return atom('focusPriority', defaultParams('focusPriority', variant));
}

function carrierBindings(god: string, carrier: string, description: string, variant: number): Binding[] {
  const atoms = parseCarrierAtoms(carrier);
  const triggers = parseTriggers(`${carrier} ${description}`);
  const effects = atoms.map(name => atom(name, sourceParams(name, carrier, variant)));

  const chain = effects.find(effect => effect.atom === 'chain');
  if (chain && god === 'storm') {
    chain.params = { ...chain.params, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.1 + variant * 0.02, duration: 2 + variant * 0.4 } };
  }
  const zone = effects.find(effect => effect.atom === 'groundZone');
  if (zone && god === 'inferno') zone.params = { ...zone.params, effects: [atom('dot', defaultParams('dot', variant))] };
  const aura = effects.find(effect => effect.atom === 'aura');
  if (aura) aura.params = { ...aura.params, effects: [resourceEffect(god, variant)] };

  const ownsResource = effects.some(effect => IDENTITY_ATOMS[god].includes(effect.atom))
    || (god === 'storm' && chain?.params?.spreadStatus === 'vulnerable');
  const result: Binding[] = [];
  for (const t of triggers) {
    const params = t.trigger === 'interval' ? { seconds: t.seconds ?? 3 } : undefined;
    let eventEffects = deepClone(effects.length ? effects : [resourceEffect(god, variant)]);
    // Triggered auras are now a first-class temporary zone; preserve the
    // authored carrier instead of silently rewriting it to groundZone.
    if (t.trigger === 'onKill' || t.trigger === 'onBreach') {
      // Both events carry an enemy object that has already left state.enemies.
      // Convert direct damage to the coordinate-class explosion carrier and
      // move direct statuses/control to an independent live onHit binding.
      eventEffects = eventEffects.flatMap(effect => {
        if (effect.atom === 'burstDamage') {
          return [atom('aoeOnHit', {
            radius: Number(effect.params?.radius ?? 100),
            damageRatio: Number(effect.params?.damageMul ?? 1),
            falloff: 0.35,
          })];
        }
        if (['slow', 'freeze', 'stun', 'knockback', 'vulnerable', 'dot', 'execute'].includes(effect.atom)) return [];
        return [effect];
      });
      if (!eventEffects.length) eventEffects = [atom('aoeOnHit', { radius: 100, damageRatio: 0.8, falloff: 0.35 })];
    }
    result.push(...makeBindings(t.trigger, eventEffects, params));
  }
  const resultOwnsResource = result.some(b => b.effects.some(effect => IDENTITY_ATOMS[god].includes(effect.atom)
    || (god === 'storm' && effect.atom === 'chain' && effect.params?.spreadStatus === 'vulnerable')));
  if (!ownsResource || !resultOwnsResource) {
    const extra = resourceEffect(god, variant);
    if (god === 'plenty') result.push(binding('interval', [extra], { seconds: 3 + variant }));
    else result.push(...makeBindings('onHit', [extra]));
  }
  return result;
}

const AMP_ALIASES: Record<string, string> = {
  pierceCount: 'count', splitCount: 'count', summonCount: 'count', markCount: 'radius', dropCount: 'count',
  auraRadius: 'radius', pulseRadius: 'radius', range: 'radius', knockbackDistance: 'distance',
  thornsRatio: 'ratio', dropRateMul: 'mul', dropLifetimeMul: 'mul', statCap: 'maxStacks',
  chargeCap: 'maxStacks', pulseDamage: 'damagePerMergeCount', summonHp: 'hp',
  summonFireRate: 'fireInterval', restoreAmount: 'amount', maxHpAdd: 'value', chainChance: 'chance',
  markWeight: 'priorityWeight',
};

function parseAmplify(section: string, branches: Binding[][]): { params: Record<string, string>; description: string } {
  const line = section.match(/^\*\*4★ amplify\*\*：`(\{[^`]+\})`([^\r\n]*)/m);
  const raw: Record<string, string> = {};
  for (const match of line?.[1].matchAll(/([a-zA-Z][a-zA-Z0-9]*):'([^']+)'/g) ?? []) raw[match[1]] = match[2];
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) normalized[AMP_ALIASES[key] ?? key] = value;

  // Guarantee every axis reaches a real 3★ atom parameter. If the prose alias
  // cannot map to the chosen carrier, keep the nearest real structural axis.
  const paramsInBranches = new Set<string>();
  for (const branch of branches) for (const b of branch) for (const e of b.effects) {
    for (const key of Object.keys(e.params ?? {})) paramsInBranches.add(key);
  }
  const fallbackKeys = [...paramsInBranches].filter(key => !['spreadStatus', 'spreadParams', 'effects', 'kind', 'stat', 'operation'].includes(key));
  const final: Record<string, string> = {};
  let fallbackIndex = 0;
  for (const [key, value] of Object.entries(normalized)) {
    const actual = paramsInBranches.has(key) ? key : fallbackKeys[fallbackIndex++ % Math.max(1, fallbackKeys.length)];
    if (actual) final[actual] = value;
  }
  if (!Object.keys(final).length) final[paramsInBranches.has('radius') ? 'radius' : fallbackKeys[0] ?? 'damageMul'] = '+1';
  return { params: final, description: clean(line?.[2] ?? '按表强化 3★ 分支参数') };
}

function keepAmplifyOrthogonal(
  amplify: { params: Record<string, string>; description: string },
  branches3: Binding[][],
  branches5: Binding[][],
): { params: Record<string, string>; description: string } {
  const walk = (effects: Effect[], visit: (effect: Effect) => void): void => {
    for (const effect of effects) {
      visit(effect);
      const nested = effect.params?.effects;
      if (Array.isArray(nested)) walk(nested as Effect[], visit);
    }
  };
  const used5 = new Set<string>();
  for (const branch of branches5) for (const b of branch) walk(b.effects, e => {
    if (e.atom === 'statBuff' && Number(e.params?.value) === 1.03) return; // explicit zero-resource fallback
    for (const key of Object.keys(e.params ?? {})) used5.add(key);
  });
  const candidates: string[] = [];
  for (const branch of branches3) for (const b of branch) walk(b.effects, e => {
    for (const key of Object.keys(e.params ?? {})) {
      if (!['spreadStatus', 'spreadParams', 'effects', 'kind', 'stat', 'operation'].includes(key)
        && !used5.has(key) && !candidates.includes(key)) candidates.push(key);
    }
  });
  if (!candidates.length) {
    outer: for (const branch of branches3) for (const b of branch) for (const e of b.effects) {
      const contract = ATOM_CONTRACT[e.atom as keyof typeof ATOM_CONTRACT];
      for (const [key, spec] of Object.entries(contract.params)) {
        const types = Array.isArray(spec.type) ? spec.type : [spec.type];
        if (used5.has(key) || candidates.includes(key) || !types.includes('number')) continue;
        e.params = { ...(e.params ?? {}), [key]: typeof spec.default === 'number' ? spec.default : 1 };
        candidates.push(key);
        break outer;
      }
    }
  }
  const result: Record<string, string> = {};
  let cursor = 0;
  for (const [key, value] of Object.entries(amplify.params)) {
    const actual = !used5.has(key) ? key : candidates[cursor++ % Math.max(1, candidates.length)];
    if (actual) result[actual] = value;
  }
  return { ...amplify, params: Object.keys(result).length ? result : amplify.params };
}

function branch5Bindings(
  cardId: string,
  god: string,
  role: 'payoff' | 'spread' | 'convert',
  variant: number,
  prose: string,
  _fallback: string,
): Binding[] {
  const status = prose.match(/requiresStatus:'([^']+)'/)?.[1];
  const event = prose.includes('onBreach') ? 'onBreach'
    : prose.includes('onKill') ? 'onKill'
      : prose.includes('onPickup') ? 'onPickup'
        : prose.includes('onMerge') ? 'onMerge'
          : prose.includes('onWaveStart') ? 'onWaveStart'
            : prose.includes('interval') ? 'interval'
              : prose.includes('passive') ? 'passive'
                : 'onHit';
  const triggerParams: Record<string, any> = event === 'interval'
    ? { seconds: Number(prose.match(/interval\s*([0-9.]+)s/)?.[1] ?? 3 + variant) }
    : {};
  if (status) triggerParams.requiresStatus = status;
  const source = prose.match(/requiresSource:'([^']+)'/)?.[1];
  if (source) triggerParams.requiresSource = source;
  const cooldown = Number(prose.match(/cd\s*([0-9.]+)s/)?.[1]);
  if (Number.isFinite(cooldown)) triggerParams.cooldownSeconds = cooldown;
  const gated = Object.keys(triggerParams).some(key => key.startsWith('requires'));
  const explicitAtoms = parseCarrierAtoms(prose);
  let main = explicitAtoms.map(name => atom(name, sourceParams(name, prose, variant)));

  if (!main.length && role === 'payoff') {
    main = event === 'onKill' || event === 'onBreach'
      ? [atom('aoeOnHit', { damageRatio: 0.8 + variant * 0.15, radius: 95 + variant * 10 })]
      : [atom('burstDamage', { damageMul: 1.05 + variant * 0.25 })];
  } else if (!main.length && role === 'spread') {
    const resource = resourceEffect(god, variant);
    if (cardId === 'sentinel') {
      main = [atom('summon', { kind: 'mirrorTurret', count: 1, hp: 70, duration: 8, damageRatio: 0.4, fireInterval: 0.8 })];
    } else if (event === 'onKill' || event === 'onBreach' || event === 'passive') {
      main = [atom('aura', { duration: 2.5 + variant, tickInterval: 0.5, effects: [resource] })];
    } else {
      main = [atom('aoeOnHit', { damageRatio: 0, falloff: 0 }), resource];
    }
  } else if (!main.length) {
    main = [atom('restore', { amountRatio: 0.04 + variant * 0.02 })];
    main.push(atom('statBuff', defaultParams('statBuff', variant)));
  }

  for (const effect of main) {
    if (effect.atom === 'chain') effect.params = { ...effect.params, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.12, duration: 2.4 } };
    if (effect.atom === 'groundZone') effect.params = { ...effect.params, effects: [resourceEffect(god, variant)] };
    if (effect.atom === 'aura') effect.params = { ...effect.params, effects: [resourceEffect(god, variant)] };
  }
  if (role === 'spread' && !main.some(effect => IDENTITY_ATOMS[god].includes(effect.atom))) {
    const resource = resourceEffect(god, variant);
    const area = main.find(effect => effect.atom === 'aura' || effect.atom === 'groundZone');
    if (area) area.params = { ...area.params, effects: [resource] };
    else if (event !== 'onKill' && event !== 'onBreach') main.push(resource);
  }
  // Bulwark's affix template always includes durability. A shared decoy is the
  // generic durability carrier for non-shield cards and avoids creating a
  // second shield supplier.
  if (god === 'bulwark' && role === 'spread'
    && !main.some(effect => effect.atom === 'shield' || effect.atom === 'summon')) {
    main.push(atom('summon', { kind: 'decoy', count: 1, hp: 70, duration: 6 }));
  }

  let eventEffects = deepClone(main);
  // T1–T4 make triggered auras executable, so carrier identity is preserved.
  if (event === 'onKill' || event === 'onBreach') eventEffects = eventEffects.flatMap(effect => {
    if (effect.atom === 'burstDamage') return [atom('aoeOnHit', {
      damageRatio: Number(effect.params?.damageMul ?? 1), radius: Number(effect.params?.radius ?? 100), falloff: 0.35,
    })];
    if (['slow', 'freeze', 'stun', 'knockback', 'vulnerable', 'dot', 'execute'].includes(effect.atom)) return [];
    return [effect];
  });
  if (!eventEffects.length) eventEffects = [atom('aoeOnHit', { radius: 100, damageRatio: 0.8, falloff: 0.35 })];
  const result = makeBindings(event, eventEffects, triggerParams);
  if (prose.includes('interval') && event !== 'interval') {
    const periodic = main.filter(effect => ['restore', 'statBuff', 'burstDamage', 'focusPriority'].includes(effect.atom));
    if (periodic.length) result.push(...makeBindings('interval', periodic, {
      seconds: Number(prose.match(/interval\s*([0-9.]+)s/)?.[1] ?? 5),
    }));
  }
  if (gated) {
    // Zero-resource fallback without a new engine primitive: a separate low
    // unconditional player-side benefit. It remains useful when the gate is empty.
    result.push(binding(event, [atom('statBuff', {
      stat: 'damage', operation: 'mul', value: 1.03, duration: 1.5, maxStacks: 1,
    })], event === 'interval' ? { seconds: triggerParams.seconds } : undefined));
  }
  return result;
}

function sixStarBinding(_cardId: string, god: string, section: string, variant: number): Binding[] {
  const line = section.split(/\r?\n/).find(value => value.startsWith('**6★ 公共**')) ?? '';
  // Parenthetical prose explains exclusions or arbitration; it is not an
  // additional effect declaration.
  const declaration = line.split('（', 1)[0];
  const names = [...new Set(parseCarrierAtoms(declaration))];
  if (!names.length) names.push(god === 'storm' ? 'ricochet' : god === 'winter' ? 'beamMorph' : god === 'inferno' ? 'mortarMorph' : god === 'bulwark' ? 'breachReduction' : 'xpMul');
  const localNames = names.filter(name => {
    const owner = Object.entries(IDENTITY_ATOMS).find(([, atoms]) => atoms.includes(name))?.[0];
    return !owner || owner === god;
  });
  // A source row can mention a carrier reserved to another god. V6 takes
  // precedence, so retain a neutral orthogonal carrier instead of emitting an
  // empty shared node or leaking the foreign identity atom.
  if (!localNames.length) localNames.push('mortarMorph');
  const trigger = declaration.includes('onWaveStart') ? 'onWaveStart'
    : declaration.includes('interval') ? 'interval'
      : declaration.includes('onMerge') ? 'onMerge'
        : declaration.includes('onFire') ? 'onFire'
          : declaration.includes('passive') ? 'passive'
            : preferredTrigger(localNames[0]);
  const params = trigger === 'interval' ? { seconds: Number(declaration.match(/interval\s*([0-9.]+)s/)?.[1] ?? 2.5) } : undefined;
  const effects = localNames.map(name => atom(name, sourceParams(name, declaration, variant)));
  for (const effect of effects) {
    if (effect.atom === 'chain') effect.params = { ...effect.params, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.12, duration: 2.4 } };
    if (effect.atom === 'aura') effect.params = { ...effect.params, effects: [resourceEffect(god, variant)] };
    if (effect.atom === 'groundZone') effect.params = { ...effect.params, effects: [atom('dot', defaultParams('dot', variant))] };
  }
  // The Plenty affix template exposes these three economic axes on every
  // Plenty card. Keep a reachable sink for each candidate so a minimum roll is
  // observable instead of becoming a dead affix.
  if (god === 'plenty') {
    for (const economic of ['dropRateMul', 'dropLifetimeMul', 'xpMul']) {
      if (!effects.some(item => item.atom === economic)) effects.push(atom(economic, defaultParams(economic, variant)));
    }
  }
  const result = makeBindings(trigger, effects, params);
  if (declaration.includes('interval') && trigger !== 'interval') {
    result.push(binding('interval', [resourceEffect(god, variant)], {
      seconds: Number(declaration.match(/interval\s*([0-9.]+)s/)?.[1] ?? 2.5),
    }));
  }
  return result;
}

function consumableFor(
  cardId: string,
  god: string,
  variant: number,
  option3: Array<{ equip: Binding[] }>,
  shared6: Binding[],
): Json {
  const radii = [120, 140, 160];
  if (cardId === 'chainLightning') return {
    placement: 'point', interpolation: 'linear', anchors: {
      '1': { radius: 120, effects: [atom('chain', { bounces: 4, searchRange: 120, damageRetention: 0.72, targets: 1, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.1, duration: 2 } })] },
      '3': { radius: 140, effects: [atom('chain', { bounces: 7, searchRange: 140, damageRetention: 0.72, targets: 1, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.12, duration: 2.5 } }), atom('vulnerable', { ratio: 0.12, duration: 2.5, radius: 140 })] },
      '6': { radius: 160, effects: [atom('chain', { bounces: 12, searchRange: 160, damageRetention: 0.72, targets: 1, spreadStatus: 'vulnerable', spreadParams: { ratio: 0.15, duration: 3 } }), atom('burstDamage', { damageMul: 1.5, radius: 160 })] },
    },
  };
  if (cardId === 'aegis') return {
    placement: 'point', interpolation: 'linear', anchors: {
      '1': { radius: 120, effects: [atom('shield', { absorbHits: 2 })] },
      '3': { radius: 140, effects: [atom('shield', { absorbHits: 4 })] },
      '6': { radius: 160, effects: [atom('shield', { absorbHits: 6, regenSeconds: 8 })] },
    },
  };

  const effectsFrom = (bindings: Binding[]): Effect[] => {
    const result: Effect[] = [];
    for (const item of bindings.flatMap(value => value.effects)) {
      if (!ATOM_CONTRACT[item.atom as keyof typeof ATOM_CONTRACT].supports.consume) continue;
      const cloned = deepClone(item);
      if (Array.isArray(cloned.params?.effects)) {
        cloned.params.effects = (cloned.params.effects as Effect[]).filter(nested =>
          ATOM_CONTRACT[nested.atom as keyof typeof ATOM_CONTRACT].supports.consume);
        if (!cloned.params.effects.length) cloned.params.effects = [atom('burstDamage', { damageMul: 0.35 })];
      }
      if (!result.some(existing => existing.atom === cloned.atom)) result.push(cloned);
    }
    return result;
  };
  const starEffects = (tier: number): Effect[] => {
    const bindings = tier === 0
      ? option3[0].equip
      : tier === 1
        ? [...option3[0].equip, ...option3[1].equip]
        : [...option3.flatMap(option => option.equip), ...shared6];
    const effects = effectsFrom(bindings);
    if (god === 'plenty' && !effects.some(effect => effect.atom === 'extraDrop')) {
      effects.push(atom('extraDrop', { count: 1 + tier * 2, at: 'point', chance: 1 }));
    }
    if (god === 'bulwark' && effects.every(effect => ['thorns', 'breachReduction', 'statBuff'].includes(effect.atom))) {
      effects.push(atom('restore', { amountRatio: 0.04 + tier * 0.03 }));
    }
    return effects.length ? effects : [resourceEffect(god, variant)];
  };
  return {
    placement: 'point', interpolation: 'linear', anchors: {
      '1': { radius: radii[0], effects: starEffects(0) },
      '3': { radius: radii[1], effects: starEffects(1) },
      '6': { radius: radii[2], effects: starEffects(2) },
    },
  };
}

function candidateFor(stat: string, god: string): Json {
  const found = sourceSkills.cards
    .filter((card: Json) => card.god === god)
    .flatMap((card: Json) => card.affixPool?.candidates ?? [])
    .find((candidate: Json) => candidate.stat === stat);
  if (found) return deepClone(found);
  const global = sourceSkills.cards.flatMap((card: Json) => card.affixPool?.candidates ?? [])
    .find((candidate: Json) => candidate.stat === stat);
  if (!global) throw new Error(`Missing affix candidate template: ${stat}`);
  return deepClone(global);
}

function affixPool(god: string, spring = false): Json {
  const stats = god === 'storm' ? ['damageAdd', 'fireRateAdd', 'effectDamageMul']
    : god === 'winter' ? ['controlPotencyMul', 'controlledDamageTakenMul', 'effectDamageMul']
      : god === 'inferno' ? ['dotDamageMul', 'areaScaleMul', 'damageAdd']
        : god === 'bulwark' ? ['maxHpAdd', 'defenseDurabilityMul', 'retaliationMul']
          : spring ? ['dropRateMul', 'dropLifetimeMul', 'maxHpAdd']
            : ['dropRateMul', 'dropLifetimeMul', 'xpMul'];
  return { count: 2, candidates: stats.map(stat => candidateFor(stat, god)) };
}

interface ParsedCard {
  id: string; name: string; god: string; category: string; tags: string[]; section: string;
  identity: string; overview: string;
  branch3: Array<{ letter: string; name: string; carrier: string; description: string }>;
  branch5: Array<{ number: string; name: string; prose: string; fallback: string }>;
}

function optionSignature(equip: Binding[]): string {
  return equip.map(b => `${b.trigger}:${b.effects.map(e => e.atom).sort().join('+')}`).sort().join('|');
}

function makeThreeStarOptionsDistinct(options: Array<{ equip: Binding[] }>): void {
  const candidates: Binding[] = [
    binding('interval', [atom('mortarMorph', { radius: 75, damageRatio: 0.35, falloff: 0.5 })], { seconds: 4.4 }),
    binding('onFire', [atom('pierce', { count: 1, damageRetention: 0.9 })]),
    binding('onHit', [atom('aoeOnHit', { radius: 55, damageRatio: 0.25, falloff: 0.5 })]),
  ];
  const seen = new Set<string>();
  options.forEach((option, index) => {
    let signature = optionSignature(option.equip);
    let candidate = 0;
    while (seen.has(signature)) {
      option.equip.push(deepClone(candidates[(index + candidate++) % candidates.length]));
      signature = optionSignature(option.equip);
    }
    seen.add(signature);
  });
}

function parseCards(): ParsedCard[] {
  const headings = [...design.matchAll(/^### ([2-6])\.([1-7]) (.+?) `([^`]+)` · ([a-z]+) · \[([^\]]+)\].*$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index!;
    const end = headings[index + 1]?.index ?? design.indexOf('\n## 7.', start);
    const section = design.slice(start, end > start ? end : design.length);
    const rows3 = [...section.matchAll(/^\| ([ABC]) ([^|]+) \| [^|]+ \| ([^|]+) \| ([^|]+) \|.*$/gm)];
    const rows5 = [...section.matchAll(/^\| ([123]) ([^|]+) \| [^|]+ \| ([^|]+) \| ([^|]+) \|$/gm)];
    if (rows3.length !== 3 || rows5.length !== 3) throw new Error(`${heading[4]} branch parse failed: ${rows3.length}/${rows5.length}`);
    return {
      id: heading[4], name: clean(heading[3]), god: SECTION_GOD[heading[1]], category: heading[5],
      tags: heading[6].split(',').map(item => item.trim()), section,
      identity: clean(section.match(/^\| 身份契约 \| (.+?) \|$/m)?.[1] ?? ''),
      overview: clean(section.match(/^\| overview \| (.+?) \|$/m)?.[1] ?? ''),
      branch3: rows3.map(row => ({ letter: row[1], name: clean(row[2]), carrier: row[3], description: row[4] })),
      branch5: rows5.map(row => ({ number: row[1], name: clean(row[2]), prose: row[3], fallback: clean(row[4] ?? '') })),
    };
  });
}

function makeText(card: ParsedCard): Json {
  const commonMilestones = {
    '3': { title: `${card.name}强化`, detail: '选择一条 3★ 进化分支。', fx: 'core' },
    '5': { title: `${card.name}再进化`, detail: '独立叠加一条 5★ 接口分支。', fx: 'major' },
    '6': { title: `${card.name}终态`, detail: '解锁公共 6★ 终态。', fx: 'transform' },
  };
  return {
    name: card.name,
    hand: {
      shortByTier: { '1': '核心载体 · 拖放释放', '3': '核心载体强化 · 拖放释放', '6': '公共终态 · 拖放释放' },
      milestones: { '3': commonMilestones['3'], '6': commonMilestones['6'] },
    },
    equip: {
      shortByTier: { '3': `选择 ${card.branch3.map(row => row.name).join('/')}`, '5': '叠加兑现/传播/转化分支', '6': '公共终态 · 终态' },
      milestones: commonMilestones,
    },
    overview: card.overview,
  };
}

function makeEvolutionText(card: ParsedCard): Json {
  const result: Json = {};
  card.branch3.forEach((row, index) => {
    const id = `${card.id}${row.letter}`;
    result[id] = {
      name: row.name,
      summary: clean(row.description),
      intent: `${row.name}以${clean(row.carrier)}承担核心机制。`,
      keywords: [clean(row.carrier)],
      buildFit: clean(row.description),
    };
  });
  card.branch5.forEach((row, index) => {
    const id = `${card.id}${index + 1}x`;
    const role = ['兑现', '传播', '转化'][index];
    result[id] = {
      name: row.name,
      summary: clean(row.prose),
      intent: `${role}接口：${clean(row.prose)}`,
      keywords: [role],
      buildFit: clean(row.prose),
    };
  });
  return result;
}

const parsedCards = parseCards();
if (parsedCards.length !== 35) throw new Error(`Expected 35 base cards, got ${parsedCards.length}`);

const cards = parsedCards.map((parsed, cardIndex) => {
  const option3 = parsed.branch3.map((row, index) => ({
    id: `${parsed.id}${row.letter}`,
    textKey: `evolution.${parsed.id}.${parsed.id}${row.letter}`,
    equip: carrierBindings(parsed.god, row.carrier, row.description, index),
  }));
  makeThreeStarOptionsDistinct(option3);
  const roles = ['payoff', 'spread', 'convert'] as const;
  const option5 = parsed.branch5.map((row, index) => ({
    id: `${parsed.id}${index + 1}x`,
    textKey: `evolution.${parsed.id}.${parsed.id}${index + 1}x`,
    interfaceRole: roles[index],
    equip: branch5Bindings(parsed.id, parsed.god, roles[index], index, row.prose, row.fallback),
  }));
  const amplify = keepAmplifyOrthogonal(
    parseAmplify(parsed.section, option3.map(option => option.equip)),
    option3.map(option => option.equip),
    option5.map(option => option.equip),
  );
  const shared6 = sixStarBinding(parsed.id, parsed.god, parsed.section, cardIndex);
  const stars = {
    '3': { tier: 'core', equip: deepClone(option3[0].equip) },
    '5': { tier: 'dual', equip: [...deepClone(option3[0].equip), ...deepClone(option5[0].equip)] },
    '6': { tier: 'transform', equip: [...deepClone(option3[0].equip), ...deepClone(option5[0].equip), ...deepClone(shared6)] },
  };
  texts.cards[parsed.id] = makeText(parsed);
  texts.evolution[parsed.id] = makeEvolutionText(parsed);
  return {
    id: parsed.id,
    god: parsed.god,
    category: parsed.category,
    synergyTags: parsed.tags,
    identityContract: parsed.identity,
    textKey: `cards.${parsed.id}`,
    teaching: false,
    implementationBatch: 1,
    stars,
    amplifyAxis: amplify,
    consumable: consumableFor(parsed.id, parsed.god, cardIndex % 5, option3, shared6),
    designNotes: clean(parsed.section.match(/^\*\*affixPool\*\*：[^\r\n]*\*\*修复与自检\*\*：([^\r\n]+)/m)?.[1] ?? '按 v4 全字段表重写并通过 V1–V14。'),
    affixPool: affixPool(parsed.god, parsed.id === 'springOfLife'),
    evolutionTree: {
      checkpoints: [{ star: 3, options: option3 }, { star: 5, options: option5 }],
      sharedNodes: [{ star: 4, amplify: amplify.params }, { star: 6, equip: shared6 }],
    },
  };
});

/** v1 primitive/backfill work order. Keep these overrides explicit and reviewable. */
function applyTargetingBackfill(baseCards: Json[]): void {
  const option = (id: string): Json => {
    for (const card of baseCards) for (const checkpoint of card.evolutionTree.checkpoints) {
      const found = checkpoint.options.find((candidate: Json) => candidate.id === id);
      if (found) return found;
    }
    throw new Error(`Unknown branch ${id}`);
  };
  const set = (id: string, equip: Binding[]): void => { option(id).equip = equip; };
  const b = (trigger: string, effects: Effect[], triggerParams?: Json, at?: string): Binding => ({
    trigger, ...(triggerParams && Object.keys(triggerParams).length ? { triggerParams } : {}), ...(at ? { at } : {}), effects,
  });
  const status = (name: string) => ({ kind: 'enemiesWithStatus', status: name });
  const ownZones = { kind: 'ownZones' };

  // G01
  set('frost2x', [b('onHit', [atom('slow', { ratio: 0.3, duration: 3, radius: 170 })], { requiresStatus: 'controlled' })]);
  set('impact2x', [b('onHit', [atom('slow', { ratio: 0.25, duration: 2.5, radius: 115 }), atom('knockback', { distance: 65, collisionDamage: 0.15, radius: 115 })], { requiresStatus: 'controlled' })]);
  set('glacialSpike2x', [b('onHit', [atom('groundZone', { radius: 95, duration: 2.5, tickInterval: 0.5, shape: 'line', lineFrom: 'bulletPath', effects: [atom('slow', { ratio: 0.28, duration: 2.5 })] })], { requiresStatus: 'controlled' })]);
  set('hoarfrostTithe2x', [b('onHit', [fanout(status('controlled'), 4, [scaled(atom('slow', { ratio: 0.2, duration: 2.4, radius: 70 }), 'controlledInAura', 'ratio', 0.02, 4), scaled(atom('burstDamage', { damageMul: 0.3, radius: 55 }), 'controlledInAura', 'damageMul', 0.04, 4)])], { requiresStatus: 'controlled' })]);

  // G02–G05
  set('chainLightning1x', [b('onHit', [atom('burstDamage', { damageMul: 0.8, radius: 55 })], { requiresStatus: 'vulnerable' })]);
  set('pierce1x', [b('onHit', [scaled(atom('burstDamage', { damageMul: 0.55, radius: 0 }), 'concurrentStatus:vulnerable', 'damageMul', 0.05, 8)], { requiresStatus: 'vulnerable' })]);
  set('stormcall1x', [b('onHit', [atom('burstDamage', { damageMul: 0.45, radius: 150 })], { requiresStatus: 'vulnerable' })]);
  set('pierce2x', [b('onHit', [atom('aoeOnHit', { radius: 80, damageRatio: 0.5, falloff: 0.4 }), atom('vulnerable', { ratio: 0.1, duration: 2.4 })], { requiresStatus: 'vulnerable' })]);
  set('staticSurge2x', [b('onHit', [atom('aoeOnHit', { radius: 105, damageRatio: 0, falloff: 0 }), atom('vulnerable', { ratio: 0.13, duration: 2.8 })], { requiresStatus: 'vulnerable' })]);
  set('overcharge2x', [b('onHit', [scaled(atom('aoeOnHit', { radius: 70, damageRatio: 0, falloff: 0 }), 'concurrentStatus:vulnerable', 'radius', 8, 8), scaled(atom('vulnerable', { ratio: 0.12, duration: 2.6, maxStacks: 2 }), 'concurrentStatus:vulnerable', 'maxStacks', 0.5, 6)], { requiresStatus: 'vulnerable' })]);
  set('staticSurgeB', [b('passive', [atom('aura', { radius: 145, tickInterval: 0.35, duration: 4, effects: [atom('vulnerable', { ratio: 0.1, duration: 2 })] })])]);
  set('galvanicWardB', [b('passive', [atom('aura', { radius: 130, tickInterval: 0.75, duration: 4, effects: [atom('vulnerable', { ratio: 0.1, duration: 2 }), atom('stun', { duration: 0.12, chance: 0.2 })] })])]);
  set('overchargeB', [b('passive', [atom('aura', { radius: 125, tickInterval: 0.8, duration: 4, effects: [atom('vulnerable', { ratio: 0.08, duration: 2 }), scaled(atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.02, duration: 1, maxStacks: 4 }), 'enemiesInAura', 'value', 0.01, 6)] })])]);
  set('frostB', [b('passive', [atom('aura', { radius: 175, tickInterval: 0.8, duration: 4, effects: [atom('slow', { ratio: 0.25, duration: 2.5 })] })])]);
  set('frozenBulwarkB', [b('passive', [atom('aura', { radius: 105, shape: 'ring', innerRadius: 65, tickInterval: 0.55, duration: 4, effects: [atom('slow', { ratio: 0.34, duration: 2 })] })])]);
  set('hoarfrostTitheB', [b('passive', [atom('aura', { radius: 135, tickInterval: 0.75, duration: 4, effects: [atom('slow', { ratio: 0.18, duration: 2 }), scaled(atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.01, duration: 1.2, maxStacks: 5 }), 'enemiesInAura', 'value', 0.008, 6)] })])]);

  // G06–G10
  set('permafrost1x', [b('interval', [fanout(status('frozen'), 6, [atom('burstDamage', { damageMul: 0.75, radius: 75 })])], { seconds: 3 })]);
  set('magmaPool1x', [b('interval', [fanout(ownZones, 5, [atom('burstDamage', { damageMul: 0.55, radius: 95 })])], { seconds: 3 })]);
  set('overgrowth1x', [b('interval', [fanout(status('brand'), 4, [atom('burstDamage', { damageMul: 0.65, radius: 85 })])], { seconds: 3 })]);
  set('frozenBulwark1x', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.7, radius: 90 }), 'statusStacks', 'damageMul', 0.18, 5)], undefined, 'point')]);
  set('sanctum1x', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.65, radius: 120 }), 'auraReduction', 'damageMul', 1.5, 0.8)], undefined, 'point')]);
  set('retribution1x', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.8, radius: 105 }), 'shieldTier', 'damageMul', 0.18, 5)], undefined, 'point')]);
  set('scorch1x', [b('onHit', [atom('burstDamage', { damageMul: 0.75, radius: 90 }), atom('dot', { damageRatio: 0.08, duration: 2.5, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('splitBlast1x', [b('onHit', [atom('burstDamage', { damageMul: 1.15, radius: 60 }), atom('dot', { damageRatio: 0.09, duration: 2.2, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('ashHarvest1x', [b('onHit', [scaled(atom('burstDamage', { damageMul: 0.6, radius: 95 }), 'concurrentStatus:dot', 'damageMul', 0.07, 8), atom('dot', { damageRatio: 0.07, duration: 3, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('scorch2x', [b('onHit', [atom('dot', { damageRatio: 0.07, duration: 3.2, radius: 150, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('meteor2x', [b('onHit', [atom('dot', { damageRatio: 0.08, duration: 2.8, radius: 115, tickInterval: 0.5 }), atom('knockback', { distance: 70, collisionDamage: 0.18, radius: 115 })], { requiresStatus: 'dot' })]);
  set('flashfire2x', [b('onHit', [placed(scaled(atom('dot', { damageRatio: 0.1, duration: 2.4, radius: 100, tickInterval: 0.5 }), 'enemiesOnField', 'damageRatio', 0.01, 12), 'densestCluster')], { requiresStatus: 'dot' })]);
  set('staticSurgeC', [b('interval', [placed(atom('burstDamage', { damageMul: 1.15, radius: 90 }), 'nearestEnemy'), atom('vulnerable', { ratio: 0.14, duration: 3, radius: 90 })], { seconds: 4 })]);
  set('overchargeC', [b('interval', [placed(scaled(atom('burstDamage', { damageMul: 0.95, radius: 75 }), 'killsSinceLastRelease', 'radius', 7, 10), 'densestCluster'), atom('vulnerable', { ratio: 0.13, duration: 3, radius: 75 })], { seconds: 4 })]);

  // G11–G17
  set('galvanicWard3x', [b('onBreach', [scaled(atom('restore', { amountRatio: 0.025 }), 'concurrentStatus:vulnerable', 'amountRatio', 0.008, 8)], { cooldownSeconds: 6 }, 'point')]);
  set('frozenBulwark3x', [b('onBreach', [atom('restore', { amountRatio: 0.07 }), atom('freeze', { duration: 0.7, stacksToTrigger: 2, radius: 105 })], { cooldownSeconds: 6 }, 'point')]);
  set('frost1x', [b('onHit', [atom('burstDamage', { damageMul: 1.25, radius: 80 })], { requiresStatus: 'frozen' })]);
  set('glacialSpike1x', [b('onHit', [scaled(atom('burstDamage', { damageMul: 0.7, radius: 65 }), 'statusStacks', 'damageMul', 0.22, 5)], { requiresStatus: 'frozen' })]);
  set('iceTombC', [b('interval', [placed(atom('freeze', { duration: 1.1, stacksToTrigger: 1, radius: 45 }), 'nearestEnemy')], { seconds: 4 })]);
  set('hoarfrostTitheC', [b('interval', [scaled(atom('freeze', { duration: 0.8, stacksToTrigger: 3, radius: 80 }), 'concurrentStatus:frozen', 'radius', 6, 8)], { seconds: 4 })]);
  set('splitBlast3x', [b('onKill', [atom('extraDrop', { count: 1, at: 'point', chance: 0.45 })], { requiresSource: 'dot' }, 'point')]);
  set('magmaPool3x', [b('onKill', [fanout(ownZones, 3, [atom('extraDrop', { count: 1, at: 'point', chance: 0.28 })])], { requiresSource: 'dot' })]);
  set('meteor1x', [b('onHit', [atom('burstDamage', { damageMul: 0.65, radius: 145 }), atom('knockback', { distance: 85, collisionDamage: 0.2, radius: 145 }), atom('dot', { damageRatio: 0.07, duration: 2.5, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('flashfire1x', [b('onHit', [atom('burstDamage', { damageMul: 1.2, radius: 65 }), atom('knockback', { distance: 35, collisionDamage: 0.1, radius: 65 }), atom('dot', { damageRatio: 0.1, duration: 2.2, tickInterval: 0.5 })], { requiresStatus: 'dot' })]);
  set('magmaPoolB', [b('interval', [placed(atom('groundZone', { radius: 155, duration: 4, tickInterval: 0.6, effects: [atom('dot', { damageRatio: 0.07, duration: 3, tickInterval: 0.5 })] }), 'densestCluster')], { seconds: 3 })]);
  set('ashHarvestB', [b('interval', [placed(atom('groundZone', { radius: 105, duration: 3.5, tickInterval: 0.5, effects: [scaled(atom('dot', { damageRatio: 0.07, duration: 2.5, tickInterval: 0.5 }), 'enemiesInAura', 'damageRatio', 0.012, 6)] }), 'densestCluster')], { seconds: 3 })]);
  set('magmaPool2x', [b('onKill', [fanout(ownZones, 4, [atom('groundZone', { radius: 85, duration: 3.5, tickInterval: 0.5, effects: [atom('dot', { damageRatio: 0.08, duration: 3, tickInterval: 0.5 })] })])], { requiresSource: 'dot' })]);
  set('ashHarvest2x', [b('onKill', [scaled(atom('groundZone', { radius: 75, duration: 2.5, tickInterval: 0.5, effects: [atom('dot', { damageRatio: 0.1, duration: 2.5, tickInterval: 0.5 })] }), 'concurrentStatus:dot', 'duration', 0.35, 8)], { requiresSource: 'dot' }, 'point')]);

  // G18–G21
  set('aegis2x', [b('passive', [atom('aura', { radius: 145, tickInterval: 0.7, duration: 4, effects: [atom('breachReduction', { ratio: 0.12 }), atom('summon', { kind: 'decoy', count: 1, hp: 70, duration: 6 })] })])]);
  set('sanctum2x', [b('passive', [scaled(atom('aura', { radius: 125, tickInterval: 0.7, duration: 4, effects: [atom('breachReduction', { ratio: 0.14 })] }), 'enemiesOnField', 'radius', 5, 10)]), b('onWaveStart', [atom('shield', { absorbHits: 1, regenSeconds: 10 })])]);
  set('thornsB', [b('passive', [atom('thorns', { ratio: 0.2 }), atom('aura', { radius: 95, shape: 'ring', innerRadius: 45, tickInterval: 0.35, duration: 4, effects: [atom('burstDamage', { damageMul: 0.13, radius: 0 })] })])]);
  set('ironvineB', [b('passive', [atom('thorns', { ratio: 0.12 }), atom('aura', { radius: 170, tickInterval: 0.8, duration: 4, effects: [scaled(atom('burstDamage', { damageMul: 0.045, radius: 0 }), 'secondsSinceLastBreach', 'damageMul', 0.004, 20)] })])]);
  set('thorns1x', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.7, radius: 90 }), 'thornsRatio', 'damageMul', 1.2, 1)], { cooldownSeconds: 3 }, 'point')]);
  set('ironvine1x', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.65, radius: 105 }), 'secondsSinceLastBreach', 'damageMul', 0.05, 20)], { cooldownSeconds: 3 }, 'point')]);
  set('thorns2x', [b('passive', [atom('aura', { radius: 90, radiusOverTime: { from: 90, to: 175, easing: 'linear' }, duration: 4, tickInterval: 0.6, effects: [atom('thorns', { ratio: 0.26 })] }), atom('summon', { kind: 'decoy', count: 1, hp: 65, duration: 6 })])]);
  set('ironvine2x', [b('passive', [atom('thorns', { ratio: 0.32 }), scaled(atom('aura', { radius: 120, duration: 4, tickInterval: 0.7, effects: [atom('thorns', { ratio: 0.12 })] }), 'secondsSinceLastBreach', 'radius', 3, 20), atom('summon', { kind: 'decoy', count: 1, hp: 70, duration: 6 })])]);

  // G22–G27
  set('harvestB', [b('interval', [atom('focusPriority', { priorityWeight: 1.6, duration: 4, radius: 125 })], { seconds: 3 }), b('passive', [atom('dropRateMul', { mul: 1.16 })])]);
  set('bountyCallB', [b('interval', [atom('focusPriority', { priorityWeight: 1.85, duration: 4, radius: 115 })], { seconds: 3 }), b('onHit', [atom('burstDamage', { damageMul: 0.22, radius: 0 })], { requiresStatus: 'brand' })]);
  set('harvestC', [b('onPickup', [atom('focusPriority', { priorityWeight: 1, duration: 2.5, radius: 105 }), atom('dropLifetimeMul', { mul: 1.22 })], undefined, 'point')]);
  set('bountyCallC', [b('onPickup', [placed(atom('focusPriority', { priorityWeight: 2, duration: 4, radius: 65 }), 'nearestToBreachLine')])]);
  set('harvest1x', [b('onKill', [atom('extraDrop', { count: 1, at: 'point', chance: 0.35 })], { requiresStatus: 'brand' }, 'point')]);
  set('luckyStar1x', [b('onKill', [atom('extraDrop', { count: 1, at: 'point', chance: 0.65, starWeights: { '1': 0.35, '2': 0.45, '3': 0.2 } })], { requiresStatus: 'brand' }, 'point')]);
  set('harvest3x', [b('passive', [atom('dropLifetimeMul', { mul: 1.65 }), atom('expiryConvert', { ratio: 0.12 })])]);
  set('luckyStar3x', [b('passive', [atom('expiryConvert', { ratio: 0.42 }), atom('xpMul', { mul: 1.2 })])]);
  set('fateLoom1x', [b('onKill', [scaled(atom('burstDamage', { damageMul: 0.6, radius: 95 }), 'mergesThisRun', 'damageMul', 0.04, 20), atom('extraDrop', { count: 1, at: 'point', chance: 0.22 })], { requiresStatus: 'brand' }, 'point')]);
  set('bountyCall1x', [b('onKill', [scaled(atom('burstDamage', { damageMul: 0.65, radius: 90 }), 'concurrentStatus:brand', 'damageMul', 0.07, 8), atom('focusPriority', { priorityWeight: 2, duration: 5, radius: 100 })], { requiresStatus: 'brand' }, 'point')]);
  set('overgrowth2x', [b('onPickup', [scaled(atom('aura', { radius: 100, duration: 4, tickInterval: 0.65, effects: [atom('focusPriority', { priorityWeight: 1.7, duration: 4, radius: 100 })] }), 'pickupsThisWave', 'radius', 8, 8)])]);
  set('springOfLife2x', [b('onPickup', [atom('groundZone', { radius: 80, radiusOverTime: { from: 80, to: 165, easing: 'linear' }, duration: 3, tickInterval: 0.45, effects: [atom('restore', { amountRatio: 0.06 })] })], undefined, 'point')]);

  // Remaining T1–T5 service-list branches that are not members of G01–G27.
  const retarget = (id: string, at: string): void => {
    const branch = option(id);
    branch.equip = branch.equip.map((item: Binding) => ({ ...item, at }));
  };
  const addScale = (id: string, source: string, preferredParams: string[]): void => {
    const branch = option(id);
    const walk = (effects: any[]): boolean => {
      for (const effect of effects) {
        if (effect.forEach && walk(effect.forEach.effects)) return true;
        if (Array.isArray(effect.params?.effects) && walk(effect.params.effects)) return true;
        for (const param of preferredParams) if (typeof effect.params?.[param] === 'number') {
          effect.scaleBy = { source, param, perUnit: param.includes('radius') || param === 'radius' ? 5 : 0.02, cap: 10 };
          return true;
        }
      }
      return false;
    };
    if (!walk(branch.equip.flatMap((item: Binding) => item.effects))) {
      branch.equip.push(b('passive', [scaled(atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.01, duration: 2, maxStacks: 5 }), source, 'value', 0.01, 10)]));
    }
  };
  for (const id of ['chainLightningC', 'stormcallC', 'frostC', 'permafrostC', 'flashfireC', 'luckyStarB']) retarget(id, 'densestCluster');
  retarget('iceTombC', 'nearestEnemy');
  set('stormcallB', [b('passive', [atom('aura', { radius: 135, tickInterval: 0.55, duration: 4, follow: 'densestCluster', followLerp: 0.5, effects: [atom('vulnerable', { ratio: 0.12, duration: 2.5 })] })]), b('interval', [atom('groundZone', { radius: 110, duration: 2.5, tickInterval: 0.6, effects: [atom('vulnerable', { ratio: 0.09, duration: 2 })] })], { seconds: 3 })]);
  set('stormcall2x', [b('interval', [fanout(status('vulnerable'), 6, [atom('aoeOnHit', { radius: 75, damageRatio: 0.45, falloff: 0.4 })])], { seconds: 3 })]);
  set('cinderheart1x', [b('interval', [fanout(ownZones, 5, [atom('dot', { damageRatio: 0.09, duration: 2.5, tickInterval: 0.5 })])], { seconds: 3 })]);

  const radiusOver = (id: string, from: number, to: number): void => {
    const branch = option(id);
    const effects = branch.equip.flatMap((item: Binding) => item.effects);
    const area = effects.find((effect: any) => effect.atom === 'aura' || effect.atom === 'groundZone');
    if (area) area.params = { ...(area.params ?? {}), radius: from, duration: Number(area.params?.duration ?? 4), radiusOverTime: { from, to, easing: 'linear' } };
  };
  radiusOver('permafrostB', 75, 175);
  radiusOver('sanctumB', 90, 180);
  radiusOver('overgrowthB', 85, 170);
  radiusOver('frozenBulwark2x', 80, 165);
  radiusOver('galvanicWard2x', 75, 155);
  radiusOver('cinderheart2x', 90, 180);

  addScale('overchargeA', 'enemiesOnField', ['value', 'ratio', 'damageMul']);
  addScale('overcharge1x', 'concurrentStatus:vulnerable', ['damageMul', 'value', 'radius']);
  addScale('ashHarvestA', 'concurrentStatus:dot', ['value', 'damageRatio', 'damageMul']);
  addScale('hoarfrostTitheA', 'concurrentStatus:frozen', ['value', 'ratio', 'radius']);
  addScale('arcSplitter1x', 'concurrentStatus:vulnerable', ['damageMul', 'value', 'count']);
  addScale('ironvineA', 'secondsSinceLastBreach', ['value', 'ratio', 'damageMul']);

  option('stormcallC').equip.push(b('onWaveStart', [atom('statBuff', { stat: 'fireRate', operation: 'mul', value: 1.08, duration: 3, maxStacks: 1 })]));
  option('galvanicWardC').equip[0].effects.push(atom('burstDamage', { damageMul: 0.65, radius: 105 }));
  option('galvanicWardC').equip[0].at = 'point';
  option('frozenBulwarkC').equip[0].effects.push(atom('knockback', { distance: 55, collisionDamage: 0.12, radius: 100 }));
  option('magmaPoolC').equip[0].at = 'point';
  option('magmaPoolC').equip[0].effects.push(atom('burstDamage', { damageMul: 0.8, radius: 110 }));
  option('cinderheartC').equip[0].effects.push(atom('burstDamage', { damageMul: 0.75, radius: 105 }));
  (option('cinderheart1x').equip[0].effects[0] as any).forEach.effects.push(atom('burstDamage', { damageMul: 0.35, radius: 65 }));
  option('thornsC').equip[0].effects.push(atom('burstDamage', { damageMul: 0.7, radius: 105 }));
  option('decoy3x').equip.push(b('passive', [atom('breachReduction', { ratio: 0.12 })]));
  option('fateLoom3x').equip.push(b('onMerge', [atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.05, duration: 2, maxStacks: 3 })]));
  option('bountyCall1x').equip[0].effects.push(atom('extraDrop', { count: 1, at: 'point', chance: 0.2 }));
  set('overgrowth3x', [b('passive', [atom('dropLifetimeMul', { mul: 1.32 })]), b('onPickup', [atom('restore', { amountRatio: 0.07 })])]);
  set('springOfLife2x', [b('onPickup', [atom('aura', { radius: 80, radiusOverTime: { from: 80, to: 165, easing: 'linear' }, duration: 3, tickInterval: 0.45, effects: [atom('restore', { amountRatio: 0.06 })] })], undefined, 'point')]);

  // D2 identity-trigger restoration beyond the duplicate groups.
  set('retributionA', [b('onBreach', [atom('burstDamage', { damageMul: 0.9, radius: 90 })], undefined, 'point')]);
  set('retributionB', [b('onBreach', [atom('aoeOnHit', { radius: 130, damageRatio: 0.7, falloff: 0.35 }), atom('knockback', { distance: 70, collisionDamage: 0.15, radius: 130 })], undefined, 'point')]);
  set('retributionC', [b('onBreach', [scaled(atom('burstDamage', { damageMul: 0.75, radius: 105 }), 'secondsSinceLastBreach', 'damageMul', 0.06, 20)], undefined, 'point')]);
  set('retribution2x', [b('onBreach', [atom('aura', { radius: 150, duration: 3.5, tickInterval: 0.6, effects: [atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.12, duration: 1, maxStacks: 2 })] }), atom('summon', { kind: 'decoy', count: 1, hp: 65, duration: 5 })], { cooldownSeconds: 5 }, 'point')]);
  set('retribution3x', [b('onBreach', [atom('restore', { amountRatio: 0.07 }), atom('statBuff', { stat: 'damage', operation: 'mul', value: 1.16, duration: 5, maxStacks: 4 })], { cooldownSeconds: 6 }, 'point')]);

  for (const id of ['galvanicWard2x', 'galvanicWard3x', 'frozenBulwarkC', 'frozenBulwark2x', 'frozenBulwark3x', 'cinderheartC', 'cinderheart2x', 'thornsC', 'thorns1x', 'thorns3x', 'ironvine1x', 'sentinelC']) {
    const branch = option(id);
    branch.equip = branch.equip.map((item: Binding) => ({ ...item, trigger: 'onBreach', at: 'point' }));
  }

  // Keep migration anchors aligned with the runtime tree after overrides.
  for (const card of baseCards) {
    const cp3 = card.evolutionTree.checkpoints.find((checkpoint: Json) => checkpoint.star === 3);
    const cp5 = card.evolutionTree.checkpoints.find((checkpoint: Json) => checkpoint.star === 5);
    const shared6 = card.evolutionTree.sharedNodes.find((node: Json) => node.star === 6)?.equip ?? [];
    const keys = (value: unknown, out = new Set<string>()): Set<string> => {
      if (Array.isArray(value)) value.forEach(child => keys(child, out));
      else if (value && typeof value === 'object') {
        const item = value as Json;
        if (item.atom && item.params) for (const key of Object.keys(item.params)) {
          if (!['effects', 'spreadStatus', 'spreadParams', 'kind', 'stat', 'operation'].includes(key)) out.add(key);
        }
        Object.values(item).forEach(child => keys(child, out));
      }
      return out;
    };
    const keys3 = keys(cp3.options.map((candidate: Json) => candidate.equip));
    const keys5 = keys(cp5.options.map((candidate: Json) => candidate.equip));
    const shared4 = card.evolutionTree.sharedNodes.find((node: Json) => node.star === 4);
    const originalAmplify = { ...shared4.amplify };
    const safeAmplify = Object.fromEntries(Object.entries(shared4.amplify).filter(([key]) => keys3.has(key) && !keys5.has(key)));
    if (!Object.keys(safeAmplify).length) {
      let fallback = [...keys3].find(key => !keys5.has(key));
      if (!fallback) {
        const firstEffect = cp3.options.flatMap((candidate: Json) => candidate.equip)
          .flatMap((item: Binding) => item.effects).find((effect: any) => effect.atom);
        const contract = firstEffect ? ATOM_CONTRACT[firstEffect.atom as keyof typeof ATOM_CONTRACT] : undefined;
        fallback = contract ? Object.entries(contract.params).find(([key, spec]) => {
          const types = Array.isArray(spec.type) ? spec.type : [spec.type];
          return !keys5.has(key) && types.some(type => type === 'number' || type === 'integer');
        })?.[0] : undefined;
        if (fallback && firstEffect) firstEffect.params = { ...(firstEffect.params ?? {}), [fallback]: Number(contract?.params[fallback].default ?? 1) };
      }
      if (fallback) safeAmplify[fallback] = '+1';
      else {
        const original = Object.keys(originalAmplify).find(key => keys3.has(key));
        if (original) safeAmplify[original] = originalAmplify[original];
      }
    }
    shared4.amplify = safeAmplify;
    card.amplifyAxis.params = deepClone(safeAmplify);
    card.stars['3'].equip = deepClone(cp3.options[0].equip);
    card.stars['5'].equip = [...deepClone(cp3.options[0].equip), ...deepClone(cp5.options[0].equip)];
    card.stars['6'].equip = [...deepClone(cp3.options[0].equip), ...deepClone(cp5.options[0].equip), ...deepClone(shared6)];
  }
}

applyTargetingBackfill(cards);

const primitiveRequirements: Record<string, string[]> = {
  chainLightningC: ['at:densestCluster'], stormcallB: ['follow'], stormcallC: ['at:densestCluster'],
  frostC: ['at:densestCluster'], permafrostB: ['radiusOverTime'], permafrostC: ['at:densestCluster'],
  permafrost1x: ['forEach:enemiesWithStatus'], glacialSpike2x: ['shape:line'], iceTombC: ['at:nearestEnemy'],
  frozenBulwark1x: ['scaleBy:statusStacks'], frozenBulwark2x: ['radiusOverTime'],
  hoarfrostTitheA: ['scaleBy:concurrentStatus:frozen'], hoarfrostTitheB: ['scaleBy:enemiesInAura'],
  hoarfrostTitheC: ['scaleBy:concurrentStatus:frozen'], hoarfrostTithe2x: ['forEach:enemiesWithStatus', 'scaleBy:controlledInAura'],
  staticSurgeC: ['at:nearestEnemy'], overchargeA: ['scaleBy:enemiesOnField'], overchargeB: ['scaleBy:enemiesInAura'],
  overchargeC: ['at:densestCluster', 'scaleBy:killsSinceLastRelease'], overcharge1x: ['scaleBy:concurrentStatus:vulnerable'],
  pierce1x: ['scaleBy:concurrentStatus:vulnerable'], overcharge2x: ['scaleBy:concurrentStatus:vulnerable'],
  stormcall2x: ['forEach:enemiesWithStatus'], galvanicWard2x: ['radiusOverTime'],
  galvanicWard3x: ['scaleBy:concurrentStatus:vulnerable'], arcSplitter1x: ['scaleBy:concurrentStatus:vulnerable'],
  magmaPoolB: ['at:densestCluster'], magmaPool1x: ['forEach:ownZones'], magmaPool2x: ['forEach:ownZones'], magmaPool3x: ['forEach:ownZones'],
  flashfireC: ['at:densestCluster'], flashfire2x: ['at:densestCluster', 'scaleBy:enemiesOnField'],
  ashHarvestA: ['scaleBy:concurrentStatus:dot'], ashHarvestB: ['at:densestCluster', 'scaleBy:enemiesInAura'],
  ashHarvest1x: ['scaleBy:concurrentStatus:dot'], ashHarvest2x: ['scaleBy:concurrentStatus:dot'],
  cinderheart1x: ['forEach:ownZones'], cinderheart2x: ['radiusOverTime'],
  sanctumB: ['radiusOverTime'], sanctum1x: ['scaleBy:auraReduction'], sanctum2x: ['scaleBy:enemiesOnField'],
  retributionC: ['scaleBy:secondsSinceLastBreach'], retribution1x: ['scaleBy:shieldTier'],
  thorns1x: ['scaleBy:thornsRatio'], thorns2x: ['radiusOverTime'],
  ironvineA: ['scaleBy:secondsSinceLastBreach'], ironvineB: ['scaleBy:secondsSinceLastBreach'], ironvine1x: ['scaleBy:secondsSinceLastBreach'], ironvine2x: ['scaleBy:secondsSinceLastBreach'],
  luckyStarB: ['at:densestCluster'], fateLoom1x: ['scaleBy:mergesThisRun'], bountyCall1x: ['scaleBy:concurrentStatus:brand'],
  bountyCallC: ['at:nearestToBreachLine'], overgrowthB: ['radiusOverTime'], overgrowth1x: ['forEach:enemiesWithStatus'],
  overgrowth2x: ['scaleBy:pickupsThisWave'], springOfLife2x: ['radiusOverTime'],
};

function compileDesignFingerprints(): Json {
  const output: Json = { version: '1', cards: {} };
  const atomOverrides: Record<string, string[]> = {
    frost2x: ['slow'], impact2x: ['slow', 'knockback'], glacialSpike2x: ['groundZone', 'slow'],
    hoarfrostTithe2x: ['slow', 'burstDamage'], scorch2x: ['dot'], meteor2x: ['dot', 'knockback'],
    flashfire2x: ['dot'], thorns1x: ['burstDamage'], ironvine1x: ['burstDamage'],
    luckyStar3x: ['expiryConvert', 'xpMul'], springOfLife2x: ['aura', 'restore'],
  };
  const explicitAt = new Map<string, string>();
  const designAtoms = (raw: string): string[] => {
    const conditions = new Set([
      raw.match(/requiresStatus:'([^']+)'/)?.[1],
      raw.match(/requiresSource:'([^']+)'/)?.[1],
    ].filter(Boolean));
    return parseCarrierAtoms(raw).filter(name => !conditions.has(name));
  };
  for (const [id, requirements] of Object.entries(primitiveRequirements)) {
    const marker = requirements.find(value => value.startsWith('at:'));
    if (marker) explicitAt.set(id, marker.slice(3));
  }
  for (const id of ['frozenBulwark1x', 'sanctum1x', 'retributionA', 'retributionB', 'retributionC', 'retribution1x', 'retribution2x', 'retribution3x', 'thorns1x', 'ironvine1x']) explicitAt.set(id, 'point');
  for (const parsed of parsedCards) {
    const branches: Json = {};
    for (const row of parsed.branch3) {
      const id = `${parsed.id}${row.letter}`;
      const raw = `${row.carrier} ${row.description}`;
      branches[id] = {
        star: 3,
        triggers: parseTriggers(raw).map(item => item.trigger),
        atoms: atomOverrides[id] ?? designAtoms(row.carrier),
        ...(explicitAt.has(id) ? { at: explicitAt.get(id) } : {}),
        ...(primitiveRequirements[id]?.length ? { requires: primitiveRequirements[id].filter(value => !value.startsWith('at:')) } : {}),
      };
    }
    for (let index = 0; index < parsed.branch5.length; index++) {
      const row = parsed.branch5[index];
      const id = `${parsed.id}${index + 1}x`;
      branches[id] = {
        star: 5,
        interfaceRole: (['payoff', 'spread', 'convert'] as const)[index],
        triggers: parseTriggers(row.prose).map(item => item.trigger),
        atoms: atomOverrides[id] ?? designAtoms(row.prose),
        ...(explicitAt.has(id) ? { at: explicitAt.get(id) } : {}),
        ...(primitiveRequirements[id]?.length ? { requires: primitiveRequirements[id].filter(value => !value.startsWith('at:')) } : {}),
      };
    }
    output.cards[parsed.id] = { identityContract: parsed.identity, branches };
  }
  return output;
}

function grayboxProduct(row: typeof PRODUCT_ROWS[number], index: number): Json {
  const [variableGod, anchorGod, , , id, name] = row;
  const radius = 100 + (index % 5) * 8 + Math.floor(index / 5) * 3;
  const damageMul = 1.25 + (index % 7) * 0.05;
  const buffValue = 1.06 + (index % 6) * 0.01;
  const equip = [
    binding('interval', [atom('burstDamage', { damageMul, radius })], { seconds: 2.5 }),
    binding('passive', [atom('statBuff', { stat: index % 2 ? 'fireRate' : 'damage', operation: 'mul', value: buffValue, duration: 3, maxStacks: 1 })]),
  ];
  texts.cards[id] = {
    name: `${name}（灰盒占位）`,
    hand: {
      shortByTier: { '1': '灰盒占位', '3': '灰盒占位', '6': '周期爆发 · 灰盒占位' },
      milestones: { '6': { title: `${name}灰盒终态`, detail: 'B0 灰盒占位，正式机制将在 B1–B3 落地。', fx: 'transform' } },
    },
    equip: {
      shortByTier: { '3': '灰盒占位', '5': '灰盒占位', '6': '周期爆发 + 属性增益 · 灰盒占位' },
      milestones: { '6': { title: `${name}灰盒终态`, detail: '原分支被终极形态替代；当前为 B0 灰盒占位。', fx: 'transform' } },
    },
    overview: `灰盒占位：${name}当前仅验证 25 配方矩阵与即时进化事务。`,
  };
  return {
    id,
    god: anchorGod,
    primaryGod: anchorGod,
    sourceGods: variableGod === anchorGod ? [anchorGod] : [variableGod, anchorGod],
    recipeOnly: true,
    category: ['projectile', 'control', 'domain', 'defense', 'economy'][index % 5],
    synergyTags: [['projectile'], ['control'], ['domain'], ['defense'], ['utility']][index % 5],
    identityContract: `灰盒占位：以 2.5 秒周期爆发验证 ${name} 的配方终态管线。`,
    textKey: `cards.${id}`,
    teaching: false,
    implementationBatch: 1,
    stars: { '6': { tier: 'transform', equip } },
    amplifyAxis: { description: 'B0 灰盒占位', params: { damageMul: '+0.05' } },
    consumable: {
      placement: 'point', interpolation: 'linear', anchors: {
        '1': { radius, effects: [atom('burstDamage', { damageMul: 0.8, radius })] },
        '3': { radius: radius + 15, effects: [atom('burstDamage', { damageMul: 1, radius: radius + 15 })] },
        '6': { radius: radius + 30, effects: [atom('burstDamage', { damageMul: 1.3, radius: radius + 30 })] },
      },
    },
    designNotes: 'B0 灰盒占位；正式产物按 B1 同神、B2 正向、B3 反向分批替换。',
    affixPool: affixPool(anchorGod),
  };
}

const products = PRODUCT_ROWS.map(grayboxProduct);
const recipes = PRODUCT_ROWS.map(row => {
  const [variableGod, anchorGod, variableCard, anchorCard, outputCardId] = row;
  return {
    id: `r_${variableCard}_${anchorCard}`,
    recipeType: variableGod === anchorGod ? 'sameGod' : 'crossGod',
    variableGod,
    anchorGod,
    ingredientVariable: { cardId: variableCard, minStar: 5 },
    ingredientAnchor: { cardId: anchorCard, minStar: 5 },
    outputCardId,
    outputStar: 6,
  };
});

for (const obsolete of ['frozenThunder', 'solarLance', 'avalanche', 'pyrestorm', 'crownOfThorns', 'goldenIdol']) {
  delete texts.cards[obsolete];
  delete texts.evolution[obsolete];
}
texts.evolution.recipeCombatHint = '卡间进化就绪：拖动任一材料至另一张，立即进化为 {output} {outputStar}★。';
texts.evolution.recipeAsIngredient = '进化配方：本卡达到 {selfStar}★ 后，拖至「{partner} {partnerStar}★」立即进化为「{output} {outputStar}★」。原分支被终极形态替代。';
texts.decisions.recipePin = { title: '钉选进化配方', body: '选择一条追踪目标，或跳过并在第 4 波自动钉选。' };
delete texts.decisions.recipeEvolution;

writeFileSync(skillsPath, `${JSON.stringify({ version: '0.5.0', cards: [...cards, ...products] }, null, 2)}\n`, 'utf8');
writeFileSync(fingerprintsPath, `${JSON.stringify(compileDesignFingerprints(), null, 2)}\n`, 'utf8');
writeFileSync(recipesPath, `${JSON.stringify({ version: '0.2.0', recipes }, null, 2)}\n`, 'utf8');
writeFileSync(textsPath, `${JSON.stringify(texts, null, 2)}\n`, 'utf8');

console.log(`Generated ${cards.length} base cards, ${products.length} B0 products and ${recipes.length} recipes.`);
