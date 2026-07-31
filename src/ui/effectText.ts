import type { AtomName, BindingDef, EffectDef, Trigger } from '../core/effects/defs';
import { effectParams, nestedEffectsOf } from '../core/effects/atomContract';
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
  onHit: '命中追求者时',
  onKill: '击杀追求者时',
  onWaveStart: '每波开始时',
  onBreach: '追求者突破防线时',
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
  vulnerable: '感电',
  aura: '光环',
  groundZone: '领域',
  dot: '灼烧',
  summon: '召唤',
  dropRateMul: '掉率',
  dropLifetimeMul: '掉落时限',
  xpMul: '奖励积分获取',
  extraDrop: '额外掉落',
  expiryConvert: '过期转化',
  mergeMaterialRefund: '合成素材返还',
  wildcardRewardBonus: '万能卡奖励加成',
  mergePulse: '合成脉冲',
  shield: '壁垒',
  thorns: '反伤',
  breachReduction: '突破减免',
  novaOnBreak: '破壁反击',
  execute: '处决',
  burstDamage: '爆发伤害',
  focusPriority: '索敌优先',
  restore: '恢复',
  statBuff: '属性强化',
  charge: '计量释放',
  summonBuff: '召唤强化',
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
  dot: '灼烧',
  summon: '召唤物',
  projectile: '弹道',
} as Record<string, string>)[value] ?? '指定效果';
const statusLabel = (value: string): string => lexicon?.statuses?.[value] ?? ({
  frozen: '冰封',
  dot: '灼烧',
  controlled: '受控',
  brand: '赏印',
  vulnerable: '感电',
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
  const statuses = Array.isArray(params?.requiresStatus)
    ? params.requiresStatus
    : params?.requiresStatus ? [params.requiresStatus] : [];
  if (statuses.length) conditions.push(`目标同时处于${statuses.map(statusLabel).join('与')}状态`);
  if (conditions.length) result += `（${conditions.join('且')}）`;
  if (params?.cooldownSeconds != null) result += `（每 ${shown(params.cooldownSeconds)} 秒至多一次）`;
  return result;
}

function nestedEffects(effect: EffectDef, depth: number): EffectTextLine[] {
  return nestedEffectsOf(effect).flatMap(item =>
    item && typeof item === 'object' && 'atom' in item
      ? formatEffect(item as EffectDef, depth + 1)
      : []);
}

/** 把一个配置原子翻译成玩家可读机制句；所有数值都来自传入配置。 */
export function formatEffect(effect: EffectDef, depth = 0): EffectTextLine[] {
  // 文案层对全部原子做同构取值，走契约的松散视图而非逐原子窄化。
  const p = effectParams(effect);
  const atom: AtomName = effect.atom;
  let text: string;
  switch (effect.atom) {
    case 'pierce':
      text = p.count != null ? `一路穿过 ${shown(p.count)} 个目标` : '子弹会穿透过去';
      if (p.damageRetention != null) text += `，每次保留 ${pct(p.damageRetention)} 伤害`;
      if (p.damageMul != null) text += `，造成 ${pct(p.damageMul)} 基础伤害`;
      if (p.rampPerPierce != null) text += `，每穿一个伤害再提高 ${pct(p.rampPerPierce)}`;
      if (p.width != null) text += `，宽度 ${shown(p.width)}`;
      break;
    case 'chain':
      text = `命中后电流接着往附近追求者跳 ${shown(p.bounces)} 次`;
      if (p.targets != null) text += `，每次最多连上 ${shown(p.targets)} 个目标`;
      if (p.damageRetention != null) text += `，每次保留 ${pct(p.damageRetention)} 伤害`;
      if (p.searchRange != null) text += `，搜索半径 ${shown(p.searchRange)}`;
      break;
    case 'split':
      text = `一分为 ${shown(p.count)}，每枚子弹道造成 ${pct(p.damageRatio)} 伤害`;
      if (p.maxDepth != null) text += `，最多能再分裂 ${shown(p.maxDepth)} 层`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'ricochet':
      text = `弹道会额外弹开 ${shown(p.bounces)} 次`;
      break;
    case 'aoeOnHit':
      text = `命中的地方炸开一圈，半径 ${shown(p.radius)}，正中心造成 ${pct(p.damageRatio)} 伤害`;
      if (p.falloff != null) text += `，越往边上衰减到 ${pct(p.falloff)}`;
      break;
    case 'beamMorph':
      text = '主炮换成持续输出的光束';
      if (p.interval != null) text += `，每 ${seconds(p.interval)}打一轮`;
      text += `，宽度 ${shown(p.width)}，每次造成 ${pct(p.damageRatio)} 伤害`;
      break;
    case 'mortarMorph':
      text = `主炮换成迫击炮，落点爆炸半径 ${shown(p.radius)}，正中心造成 ${pct(p.damageRatio)} 伤害`;
      if (p.falloff != null) text += `，越往边上衰减到 ${pct(p.falloff)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'slow':
      text = `让目标腿变慢 ${pct(p.ratio)}，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'freeze':
      text = `把目标冻住 ${seconds(p.duration)}`;
      if (p.stacksToTrigger != null) text += `，叠够 ${shown(p.stacksToTrigger)} 层才触发`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'stun':
      text = `让目标当场断片 ${seconds(p.duration)}`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'knockback':
      text = `一巴掌把目标推开 ${shown(p.distance)} 距离`;
      if (p.collisionDamage != null) text += `，撞上去还会造成 ${pct(p.collisionDamage)} 伤害`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'taunt':
      text = `拉走半径 ${shown(p.radius)} 内追求者的仇恨，持续 ${seconds(p.duration)}`;
      if (p.priorityWeight != null) text += `，索敌权重 ${shown(p.priorityWeight)}`;
      break;
    case 'vulnerable':
      text = `让目标感电，受到的伤害提高 ${pct(p.ratio)}，持续 ${seconds(p.duration)}`;
      if (p.maxStacks != null) text += `，最多叠 ${shown(p.maxStacks)} 层`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'aura':
      text = p.radiusRatioOfRange != null
        ? `身边展开一圈光环，半径是射程的 ${pct(p.radiusRatioOfRange)}`
        : `身边展开一圈半径 ${shown(p.radius)} 的光环`;
      if (p.tickInterval != null) text += `，每 ${seconds(p.tickInterval)} 结算一次`;
      break;
    case 'groundZone':
      if (p.shape === 'line') {
        text = typeof p.radius === 'number'
          ? `朝敌方向拉出一条长 ${shown(p.radius * 2)} 宽 ${shown(p.radius)} 的领域，持续 ${seconds(p.duration)}`
          : `朝敌方向拉出一条领域，持续 ${seconds(p.duration)}`;
      } else {
        text = `落地生成一块半径 ${shown(p.radius)} 的${p.shape === 'ring' ? '环形' : ''}领域，持续 ${seconds(p.duration)}`;
      }
      if (p.tickInterval != null) text += `，每 ${seconds(p.tickInterval)} 结算一次`;
      break;
    case 'dot':
      text = p.tickInterval != null
        ? `点着目标持续掉血，每 ${seconds(p.tickInterval)}烧掉 ${pct(p.damageRatio)} 伤害`
        : `每次结算烧掉 ${pct(p.damageRatio)} 的持续伤害`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'summon':
      text = `召来 ${shown(p.count ?? 1)} 个${p.kind === 'decoy' ? '诱饵' : '打手'}，生命 ${shown(p.hp)}`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.damageRatio != null) text += `，攻击造成 ${pct(p.damageRatio)} 伤害`;
      if (p.fireInterval != null) text += `，攻击间隔 ${seconds(p.fireInterval)}`;
      if (p.tauntRadius != null) text += `，嘲讽半径 ${shown(p.tauntRadius)}`;
      if (p.explode) text += `，消失时会爆炸，造成 ${shown(p.explodeDamageMul)} 倍伤害`;
      if (p.knockbackDistance != null) text += `、顺带击退 ${shown(p.knockbackDistance)}`;
      if (p.respawnOnce) text += '，能重生一次';
      if (p.replacesEarlier) text += '，替换掉这张卡之前召唤的单位';
      break;
    case 'dropRateMul':
      text = `心意掉落概率 ${plusPctFromMul(p.mul)}`;
      break;
    case 'dropLifetimeMul':
      text = `心意在地上能留 ${plusPctFromMul(p.mul)}`;
      break;
    case 'xpMul':
      text = `奖励积分获取 ${plusPctFromMul(p.mul)}`;
      break;
    case 'extraDrop':
      text = p.chance != null
        ? `${pct(p.chance)} 概率多掉 ${shown(p.count)} 份${p.at === 'pickup' ? '拾取物' : '心意'}`
        : `直接多掉 ${shown(p.count)} 份${p.at === 'pickup' ? '拾取物' : '心意'}`;
      if (p.starWeights && typeof p.starWeights === 'object') text += '，星级按权重抽';
      break;
    case 'expiryConvert':
      text = `心意过期消失前，会把其中 ${pct(p.ratio)} 换成收益`;
      break;
    case 'mergeMaterialRefund': {
      const scope = p.scope === 'feed' ? '装备喂养' : p.scope === 'both' ? '普通合并或装备喂养' : '普通同型合并';
      text = `${scope}时，有 ${pct(p.refundChance)} 概率退回 ${shown(p.count)} 张 ${shown(p.star)}★ 同型素材卡`;
      break;
    }
    case 'wildcardRewardBonus': {
      const scope = p.scope === 'bounty' ? 'Bounty' : p.scope === 'boss' ? '波末 Boss' : 'Bounty 或波末 Boss';
      text = `${scope}发放万能卡奖励时，有 ${pct(p.bonusChance)} 概率再多给 ${shown(p.count)} 张`;
      break;
    }
    case 'mergePulse':
      text = `合成成功那一下，会以半径 ${shown(p.radius)} 放一次脉冲，按累计合成次数造成 ${shown(p.damagePerMergeCount)} 点伤害`;
      break;
    case 'shield':
      text = `获得能挡 ${shown(p.absorbHits)} 次伤害的壁垒`;
      if (p.regenSeconds != null) text += `，每 ${seconds(p.regenSeconds)} 自动补上`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      break;
    case 'thorns':
      text = `挨打时把 ${pct(p.ratio)} 的伤害弹回去`;
      break;
    case 'breachReduction':
      text = `追求者突破时造成的伤害降低 ${pct(p.ratio)}`;
      break;
    case 'novaOnBreak':
      text = `壁垒被打空的瞬间，炸出 ${shown(p.damage)} 点范围伤害，还把人推开 ${shown(p.knockbackDistance)} 距离`;
      break;
    case 'execute':
      text = `血量低于 ${pct(p.hpThresholdRatio)} 的目标直接送走`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'burstDamage':
      text = `原地炸一下，造成 ${shown(p.damageMul)} 倍爆发伤害`;
      if (p.chance != null) text += `，触发概率 ${pct(p.chance)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'focusPriority':
      text = `标记指定目标优先照顾，索敌权重 ${shown(p.priorityWeight)}`;
      if (p.hpThresholdRatio != null) text += `，目标生命阈值 ${pct(p.hpThresholdRatio)}`;
      if (p.duration != null) text += `，持续 ${seconds(p.duration)}`;
      if (p.radius != null) text += `，作用半径 ${shown(p.radius)}`;
      break;
    case 'restore':
      text = p.amountRatio != null
        ? `回一口血，按生命上限的 ${pct(p.amountRatio)} 算`
        : `直接回 ${shown(p.amount)} 点生命`;
      break;
    case 'statBuff':
      text = `${statLabel(p.stat)}${p.operation === 'mul' ? `提高 ${pct(p.value)}` : `增加 ${shown(p.value)}`}，持续 ${seconds(p.duration)}`;
      if (p.maxStacks != null) text += `，最多叠 ${shown(p.maxStacks)} 层`;
      break;
    default:
      text = `触发一次${atomLabel(atom)}`;
  }
  return [keywordLine(atom, text, depth), ...nestedEffects(effect, depth)];
}

export function formatBinding(binding: BindingDef): EffectTextBlock {
  const lines = binding.effects.flatMap(effect => formatEffect(effect));
  return {
    trigger: formatTrigger(binding.trigger, binding.triggerParams),
    lines,
    keywords: [...new Set(lines.flatMap(line => line.keywords))],
  };
}
