import type { AtomName, BindingDef, EffectDef, Trigger } from '../core/effects/defs';
import { texts } from '../data';

export interface EffectTextLine {
  text: string;
  keywords: string[];
  depth?: number;
}

export interface EffectTextBlock {
  trigger: string;
  lines: EffectTextLine[];
  keywords: string[];
}

const FALLBACK_TRIGGERS: Record<Trigger, string> = {
  onFire: '每次开火时',
  onHit: '命中敌人时',
  onKill: '击杀敌人时',
  onWaveStart: '每波开始时',
  onBreach: '敌人突破防线时',
  onPickup: '拾取掉落时',
  interval: '周期触发',
  onMerge: '完成合成时',
  passive: '持续生效',
};

export const ATOM_LABELS: Record<AtomName, string> = {
  pierce: '穿透',
  chain: '连锁',
  split: '分裂',
  ricochet: '弹射',
  aoeOnHit: '范围爆发',
  beamMorph: '光束',
  mortarMorph: '迫击炮',
  slow: '减速',
  freeze: '冻结',
  stun: '眩晕',
  knockback: '击退',
  taunt: '嘲讽',
  vulnerable: '易伤',
  aura: '光环',
  groundZone: '领域',
  dot: '持续伤害',
  summon: '召唤',
  dropRateMul: '掉率',
  dropLifetimeMul: '掉落时限',
  xpMul: '经验获取',
  extraDrop: '额外掉落',
  expiryConvert: '过期转化',
  mergeRule: '合成规则',
  mergePulse: '合成脉冲',
  shield: '护盾',
  thorns: '反伤',
  breachReduction: '突破减免',
  novaOnBreak: '破盾冲击',
  execute: '处决',
  burstDamage: '爆发伤害',
  focusPriority: '索敌优先',
  restore: '恢复',
  statBuff: '属性强化',
};

type Lexicon = {
  effectText?: {
    triggers?: Partial<Record<Trigger, string>>;
    atoms?: Partial<Record<AtomName, string>>;
    sources?: Record<string, string>;
    statuses?: Record<string, string>;
    stats?: Record<string, string>;
  };
};

const lexicon = (texts as unknown as Lexicon).effectText;
const atomLabel = (atom: AtomName): string => lexicon?.atoms?.[atom] ?? ATOM_LABELS[atom];
const n = (value: unknown, fallback = 0): number => typeof value === 'number' ? value : fallback;
const shown = (value: unknown): string => Number(n(value).toFixed(2)).toString();
const pct = (value: unknown): string => `${shown(n(value) * 100)}%`;
const plusPctFromMul = (value: unknown): string => {
  const number = n(value, 1);
  const delta = (number - 1) * 100;
  return `${delta >= 0 ? '+' : ''}${shown(delta)}%`;
};
const seconds = (value: unknown): string => `${shown(value)} 秒`;
const keywordLine = (atom: AtomName, text: string, depth = 0): EffectTextLine => ({
  text,
  keywords: [atomLabel(atom)],
  depth,
});
const sourceLabel = (value: string): string => lexicon?.sources?.[value] ?? ({
  chain: '连锁',
  dot: '持续伤害',
  summon: '召唤物',
  projectile: '弹道',
} as Record<string, string>)[value] ?? '指定效果';
const statusLabel = (value: string): string => lexicon?.statuses?.[value] ?? ({
  frozen: '冻结',
  dot: '持续伤害',
  controlled: '受控',
  brand: '标记',
  vulnerable: '易伤',
} as Record<string, string>)[value] ?? '指定状态';
const statLabel = (value: unknown): string => lexicon?.stats?.[String(value)] ?? ({
  damage: '伤害',
  fireRate: '攻速',
  range: '射程',
  multi: '多重射击',
  maxHp: '生命上限',
  speed: '移动速度',
} as Record<string, string>)[String(value)] ?? '指定属性';

export function formatTrigger(trigger: Trigger, params?: BindingDef['triggerParams']): string {
  let result = trigger === 'interval'
    ? `每 ${shown(params?.seconds)} 秒`
    : lexicon?.triggers?.[trigger] ?? FALLBACK_TRIGGERS[trigger];
  const conditions: string[] = [];
  if (params?.requiresSource) conditions.push(`由${sourceLabel(params.requiresSource)}造成`);
  if (params?.requiresStatus) conditions.push(`目标处于${statusLabel(params.requiresStatus)}状态`);
  if (conditions.length) result += `（${conditions.join('且')}）`;
  if (params?.cooldownSeconds != null) result += `（每 ${shown(params.cooldownSeconds)} 秒至多一次）`;
  return result;
}

function nestedEffects(effect: EffectDef, depth: number): EffectTextLine[] {
  const nested = effect.params?.effects;
  if (!Array.isArray(nested)) return [];
  return nested.flatMap(item =>
    item && typeof item === 'object' && 'atom' in item
      ? formatEffect(item as EffectDef, depth + 1)
      : []);
}

/** 把一个配置原子翻译成玩家可读机制句；所有数值都来自传入配置。 */
export function formatEffect(effect: EffectDef, depth = 0): EffectTextLine[] {
  const p = effect.params ?? {};
  let text: string;
  switch (effect.atom) {
    case 'pierce':
      text = p.count != null ? `弹道穿透 ${shown(p.count)} 个目标` : '释放穿透弹道';
      if (p.damageRetention != null) text += `，每次保留 ${pct(p.damageRetention)} 伤害`;
      if (p.damageMul != null) text += `，造成 ${pct(p.damageMul)} 基础伤害`;
      if (p.rampPerPierce != null) text += `，每次穿透后伤害提高 ${pct(p.rampPerPierce)}`;
      if (p.width != null) text += `，宽度 ${shown(p.width)}`;
      break;
    case 'chain':
      text = `命中后向附近敌人弹跳 ${shown(p.bounces)} 次`;
      if (p.targets != null) text += `，每次最多连接 ${shown(p.targets)} 个目标`;
      if (p.damageRetention != null) text += `，每次保留 ${pct(p.damageRetention)} 伤害`;
      if (p.searchRange != null) text += `，搜索半径 ${shown(p.searchRange)}`;
      break;
    case 'split':
      text = `分裂出 ${shown(p.count)} 枚弹道，造成 ${pct(p.damageRatio)} 伤害`;
      if (p.maxDepth != null) text += `，最多递归 ${shown(p.maxDepth)} 层`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'ricochet':
      text = `弹道额外弹射 ${shown(p.bounces)} 次`;
      break;
    case 'aoeOnHit':
      text = `命中处引发范围爆发，半径 ${shown(p.radius)}，中心造成 ${pct(p.damageRatio)} 伤害`;
      if (p.falloff != null) text += `，边缘衰减至 ${pct(p.falloff)}`;
      break;
    case 'beamMorph':
      text = '主炮变为光束';
      if (p.interval != null) text += `，每 ${seconds(p.interval)}发射`;
      text += `，宽度 ${shown(p.width)}，每次造成 ${pct(p.damageRatio)} 伤害`;
      break;
    case 'mortarMorph':
      text = `主炮获得迫击炮形态，爆炸半径 ${shown(p.radius)}，中心造成 ${pct(p.damageRatio)} 伤害`;
      if (p.falloff != null) text += `，边缘衰减至 ${pct(p.falloff)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'slow':
      text = `使目标减速 ${pct(p.ratio)}，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'freeze':
      text = `冻结目标 ${seconds(p.duration)}`;
      if (p.stacksToTrigger != null) text += `，累计 ${shown(p.stacksToTrigger)} 层触发`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'stun':
      text = `眩晕目标 ${seconds(p.duration)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'knockback':
      text = `击退目标 ${shown(p.distance)} 距离`;
      if (p.collisionDamage != null) text += `，碰撞造成 ${pct(p.collisionDamage)} 伤害`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'taunt':
      text = `嘲讽半径 ${shown(p.radius)} 内敌人，持续 ${seconds(p.duration)}`;
      if (p.priorityWeight != null) text += `，索敌权重 ${shown(p.priorityWeight)}`;
      break;
    case 'vulnerable':
      text = `使目标受到的伤害提高 ${pct(p.ratio)}，持续 ${seconds(p.duration)}`;
      if (p.maxStacks != null) text += `，最多 ${shown(p.maxStacks)} 层`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'aura':
      text = p.radiusRatioOfRange != null
        ? `生成光环，半径为射程的 ${pct(p.radiusRatioOfRange)}`
        : `生成半径 ${shown(p.radius)} 的光环`;
      if (p.tickInterval != null) text += `，每 ${seconds(p.tickInterval)} 结算`;
      break;
    case 'groundZone':
      text = `生成半径 ${shown(p.radius)} 的${p.shape === 'ring' ? '环形' : ''}领域，持续 ${seconds(p.duration)}`;
      if (p.tickInterval != null) text += `，每 ${seconds(p.tickInterval)} 结算`;
      break;
    case 'dot':
      text = p.tickInterval != null
        ? `使目标持续掉血，每 ${seconds(p.tickInterval)}造成 ${pct(p.damageRatio)} 伤害`
        : `每次结算造成 ${pct(p.damageRatio)} 持续伤害`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'summon':
      text = `召唤 ${shown(p.count ?? 1)} 个${p.kind === 'decoy' ? '诱饵' : '单位'}，生命 ${shown(p.hp)}`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.damageRatio != null) text += `，攻击造成 ${pct(p.damageRatio)} 伤害`;
      if (p.fireInterval != null) text += `，攻击间隔 ${seconds(p.fireInterval)}`;
      if (p.tauntRadius != null) text += `，嘲讽半径 ${shown(p.tauntRadius)}`;
      if (p.explode) text += `，消失时爆炸并造成 ${shown(p.explodeDamageMul)} 倍伤害`;
      if (p.knockbackDistance != null) text += `、击退 ${shown(p.knockbackDistance)}`;
      if (p.respawnOnce) text += '，可重生一次';
      if (p.replacesEarlier) text += '，替换本卡先前的召唤物';
      break;
    case 'dropRateMul':
      text = `掉落概率 ${plusPctFromMul(p.mul)}`;
      break;
    case 'dropLifetimeMul':
      text = `掉落物存在时间 ${plusPctFromMul(p.mul)}`;
      break;
    case 'xpMul':
      text = `经验获取 ${plusPctFromMul(p.mul)}`;
      break;
    case 'extraDrop':
      text = p.chance != null
        ? `${pct(p.chance)} 概率额外生成 ${shown(p.count)} 个${p.at === 'pickup' ? '拾取物' : '掉落物'}`
        : `额外生成 ${shown(p.count)} 个${p.at === 'pickup' ? '拾取物' : '掉落物'}`;
      if (p.starWeights && typeof p.starWeights === 'object') text += '，星级按配置权重抽取';
      break;
    case 'expiryConvert':
      text = `掉落物过期时，将其中 ${pct(p.ratio)} 转化为收益`;
      break;
    case 'mergeRule':
      text = '调整同类同星卡牌的合成规则';
      break;
    case 'mergePulse':
      text = `合成时释放半径 ${shown(p.radius)} 的脉冲，每次累计合成造成 ${shown(p.damagePerMergeCount)} 点伤害`;
      break;
    case 'shield':
      text = `获得可抵挡 ${shown(p.absorbHits)} 次伤害的护盾`;
      if (p.regenSeconds != null) text += `，每 ${seconds(p.regenSeconds)} 恢复`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'thorns':
      text = `受到伤害时反弹 ${pct(p.ratio)} 伤害`;
      break;
    case 'breachReduction':
      text = `敌人突破造成的伤害降低 ${pct(p.ratio)}`;
      break;
    case 'novaOnBreak':
      text = `护盾破裂时造成 ${shown(p.damage)} 点范围伤害并击退 ${shown(p.knockbackDistance)} 距离`;
      break;
    case 'execute':
      text = `处决生命低于 ${pct(p.hpThresholdRatio)} 的目标`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'burstDamage':
      text = `造成 ${shown(p.damageMul)} 倍爆发伤害`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'focusPriority':
      text = `优先锁定指定目标，索敌权重 ${shown(p.priorityWeight)}`;
      if (p.hpThresholdRatio != null) text += `，目标生命阈值 ${pct(p.hpThresholdRatio)}`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'restore':
      text = p.amountRatio != null
        ? `恢复最大生命的 ${pct(p.amountRatio)}`
        : `恢复 ${shown(p.amount)} 点生命`;
      break;
    case 'statBuff':
      text = `${statLabel(p.stat)}${p.operation === 'mul' ? `提高 ${pct(p.value)}` : `增加 ${shown(p.value)}`}，持续 ${seconds(p.duration)}`;
      if (p.maxStacks != null) text += `，最多 ${shown(p.maxStacks)} 层`;
      break;
    default:
      text = `产生${atomLabel(effect.atom)}效果`;
  }
  return [keywordLine(effect.atom, text, depth), ...nestedEffects(effect, depth)];
}

export function formatBinding(binding: BindingDef): EffectTextBlock {
  const lines = binding.effects.flatMap(effect => formatEffect(effect));
  return {
    trigger: formatTrigger(binding.trigger, binding.triggerParams),
    lines,
    keywords: [...new Set(lines.flatMap(line => line.keywords))],
  };
}
