// 配置校验的统一入口：三层（schema / 跨引用 / 语义）汇总成一份结构化报告。
// **纯函数、无 node 依赖**——CLI（`npm run validate`）、dev 写回端点与测试共用同一份规则。
//
// 与各 *Validator.ts 的分工：那些是 fail-fast 的结构校验（加载时必须立刻炸），
// 这里在其之上补「跨域引用」与「语义可达性」，并且把错误收集成清单而不是第一条就停。
import { AFFIX_SINKS } from './affixSinks';
import { ATOM_CONTRACT, atomContract } from '../core/effects/atomContract';
import { validateDifficultyConfig } from './difficultyValidator';
import { validateGodConfig } from './godValidator';
import { validateRewardMeterConfig } from './rewardMeterValidator';
import { validateSettlementConfig } from './settlementValidator';
import { validateSkillsConfig } from './skillValidator';
import { validateIntermissionConfig, validateStagePlanConfig } from './stagePlanValidator';
import { validateTunerConfig } from './tunerMeta';
import type { CardAffixStatKind, GameConfig } from './types';

export type ValidationLayer = 'schema' | 'reference' | 'semantic';
export type ValidationDomain =
  | 'skills' | 'gods' | 'rewardMeter' | 'evolutionRecipes' | 'waveRewards'
  | 'waves' | 'combat' | 'enemies' | 'difficulty' | 'settlement' | 'economy'
  | 'bounty' | 'input' | 'tuner' | 'texts';

export interface ValidationIssue {
  level: 'error' | 'warning';
  layer: ValidationLayer;
  domain: ValidationDomain;
  /** 配置内的定位路径，如 `$.gods.gods[2].anchorCardIds`。 */
  path: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  /** 已执行的检查名，便于报告里说明覆盖面。 */
  checks: string[];
}

/** 文案表的最小形状；只取本校验用得到的部分。 */
export interface TextsLike {
  rewards?: Record<string, { name?: string; desc?: string }>;
  tuner?: { groups?: Record<string, { title?: string }>; params?: Record<string, string> };
  [key: string]: unknown;
}

class IssueCollector {
  readonly issues: ValidationIssue[] = [];
  readonly checks: string[] = [];

  error(layer: ValidationLayer, domain: ValidationDomain, path: string, message: string): void {
    this.issues.push({ level: 'error', layer, domain, path, message });
  }

  warn(layer: ValidationLayer, domain: ValidationDomain, path: string, message: string): void {
    this.issues.push({ level: 'warning', layer, domain, path, message });
  }

  /** 跑一条 fail-fast 校验器并把抛错折算成一条 error，保证后续检查继续执行。 */
  run(name: string, domain: ValidationDomain, check: () => void): void {
    this.checks.push(name);
    try {
      check();
    } catch (error) {
      this.error('schema', domain, `$.${domain}`, error instanceof Error ? error.message : String(error));
    }
  }
}

/** 逐段下钻取文案节点；与 data/index.ts 的 resolveTextNode 同语义（允许含 '.' 的字面键）。 */
function textNode(texts: TextsLike, key: string): unknown {
  const segments = key.split('.');
  let node: unknown = texts;
  for (let i = 0; i < segments.length; i++) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    const record = node as Record<string, unknown>;
    const rest = segments.slice(i).join('.');
    if (rest in record) return record[rest];
    node = record[segments[i]];
  }
  return node;
}

function textString(texts: TextsLike, key: string): string | undefined {
  const node = textNode(texts, key);
  return typeof node === 'string' && node ? node : undefined;
}

// —— schema 层：复用既有 fail-fast 校验器，逐域独立 try/catch ——
function schemaLayer(config: GameConfig, out: IssueCollector): void {
  out.run('schema:skills', 'skills', () => validateSkillsConfig(config.skills));
  out.run('schema:rewardMeter', 'rewardMeter', () => validateRewardMeterConfig(config.rewardMeter));
  out.run('schema:settlement', 'settlement', () => validateSettlementConfig(config.settlement));
  out.run('schema:difficulty', 'difficulty', () => validateDifficultyConfig(config.difficulty));
  out.run('schema:intermission', 'waves', () => validateIntermissionConfig(config.waves.intermission));
  out.run('schema:stagePlan', 'waves', () => validateStagePlanConfig(
    config.waves.stagePlan, config.waves.totalWaves, config.economy.maxStar, config.waves.waveBoss.reward,
  ));
  out.run('schema:crossDomain(gods/recipes/waveRewards)', 'gods', () => validateGodConfig(config));
  out.run('schema:tuner', 'tuner', () => validateTunerConfig(config));
}

// —— 跨引用层：全局 id 唯一 + 文案键命中 + 文案无孤儿 ——
function referenceLayer(config: GameConfig, texts: TextsLike, out: IssueCollector): void {
  // id 唯一性：命名空间**内**重复是错误；跨命名空间同名只是提醒（各命名空间由不同查找表消费）。
  // 例外：配方以其产物命名（recipe.id === outputCardId）是既定约定，不报。
  out.checks.push('reference:idUniqueness');
  const namespaces: Array<{ domain: ValidationDomain; name: string; entries: Array<{ id: string; path: string }> }> = [
    {
      domain: 'skills', name: 'skills.cards',
      entries: config.skills.cards.map((card, index) => ({ id: card.id, path: `$.skills.cards[${index}].id` })),
    },
    {
      domain: 'gods', name: 'gods.gods',
      entries: config.gods.gods.map((god, index) => ({ id: god.id, path: `$.gods.gods[${index}].id` })),
    },
    {
      domain: 'rewardMeter', name: 'rewardMeter.rewards',
      entries: config.rewardMeter.rewards.map((reward, index) => ({ id: reward.id, path: `$.rewardMeter.rewards[${index}].id` })),
    },
    {
      domain: 'evolutionRecipes', name: 'evolutionRecipes.recipes',
      entries: config.evolutionRecipes.recipes.map((recipe, index) => ({ id: recipe.id, path: `$.evolutionRecipes.recipes[${index}].id` })),
    },
    {
      domain: 'waveRewards', name: 'waveRewards',
      entries: [
        ...config.waveRewards.floor.map((reward, index) => ({ id: reward.id, path: `$.waveRewards.floor[${index}].id` })),
        ...config.waveRewards.choice.map((reward, index) => ({ id: reward.id, path: `$.waveRewards.choice[${index}].id` })),
      ],
    },
  ];
  const recipeNamedAfterOutput = new Set(
    config.evolutionRecipes.recipes.filter(recipe => recipe.id === recipe.outputCardId).map(recipe => recipe.id),
  );
  const owners = new Map<string, string>();
  for (const space of namespaces) {
    const seen = new Set<string>();
    for (const entry of space.entries) {
      if (seen.has(entry.id)) out.error('reference', space.domain, entry.path, `${space.name} 内 id 重复: ${entry.id}`);
      seen.add(entry.id);
      const owner = owners.get(entry.id);
      if (owner === undefined) {
        owners.set(entry.id, space.name);
      } else if (!(recipeNamedAfterOutput.has(entry.id) && (owner === 'skills.cards' || space.name === 'skills.cards'))) {
        out.warn('reference', space.domain, entry.path, `id "${entry.id}" 与 ${owner} 同名；不同命名空间不冲突，但易读错`);
      }
    }
  }

  out.checks.push('reference:textKeys');
  config.skills.cards.forEach((card, index) => {
    const path = `$.skills.cards[${index}]`;
    if (textNode(texts, card.textKey) === undefined) {
      out.error('reference', 'texts', `${path}.textKey`, `文案键未命中 texts.json: ${card.textKey}`);
    }
    for (const [checkpointIndex, checkpoint] of (card.evolutionTree?.checkpoints ?? []).entries()) {
      for (const [optionIndex, option] of checkpoint.options.entries()) {
        if (textNode(texts, option.textKey) === undefined) {
          out.error(
            'reference', 'texts',
            `${path}.evolutionTree.checkpoints[${checkpointIndex}].options[${optionIndex}].textKey`,
            `文案键未命中 texts.json: ${option.textKey}`,
          );
        }
      }
    }
  });
  config.gods.gods.forEach((god, index) => {
    if (textNode(texts, god.textKey) === undefined) {
      out.error('reference', 'texts', `$.gods.gods[${index}].textKey`, `文案键未命中 texts.json: ${god.textKey}`);
    }
  });
  config.rewardMeter.rewards.forEach((reward, index) => {
    const path = `$.rewardMeter.rewards[${index}]`;
    if (reward.textKey !== `rewards.${reward.id}`) out.error('reference', 'rewardMeter', `${path}.textKey`, `必须等于 rewards.${reward.id}`);
    for (const leaf of ['name', 'desc'] as const) if (!textString(texts, `${reward.textKey}.${leaf}`)) {
      out.error('reference', 'texts', `${path}.textKey`, `文案缺失或为空: ${reward.textKey}.${leaf}`);
    }
  });
  config.tuner.params.forEach((param, index) => {
    if (!textString(texts, param.labelKey)) {
      out.error('reference', 'texts', `$.tuner.params[${index}].labelKey`, `文案缺失或为空: ${param.labelKey}`);
    }
  });
  for (const group of new Set(config.tuner.params.map(param => param.group))) {
    if (!textString(texts, `tuner.groups.${group}.title`)) {
      out.error('reference', 'texts', `$.tuner.groups.${group}`, `分组标题缺失: tuner.groups.${group}.title`);
    }
  }

  out.checks.push('reference:textOrphans');
  const rewardIds = new Set(config.rewardMeter.rewards.map(reward => reward.id));
  for (const id of Object.keys(texts.rewards ?? {})) if (!rewardIds.has(id)) {
    out.warn('reference', 'texts', `texts.rewards.${id}`, '孤儿文案：没有任何奖励引用它');
  }
  const tunerPaths = new Set(config.tuner.params.map(param => param.path));
  for (const path of Object.keys(texts.tuner?.params ?? {})) {
    if (!tunerPaths.has(path)) out.warn('reference', 'texts', `texts.tuner.params.${path}`, '孤儿文案：没有任何调参项引用它');
  }
}

// —— 语义层：可达性与"有没有消费者" ——
function semanticLayer(config: GameConfig, out: IssueCollector): void {
  out.checks.push('semantic:affixSinkConsumers');
  for (const [stat, contract] of Object.entries(AFFIX_SINKS) as [CardAffixStatKind, typeof AFFIX_SINKS[CardAffixStatKind]][]) {
    const hasConsumer = !!contract.globalConsumer || !!contract.scalingTargets?.length;
    if (!hasConsumer) {
      out.error('semantic', 'skills', `AFFIX_SINKS.${stat}`,
        '词条既无 globalConsumer 也无 scalingTargets：掷点后无人消费（最大生命词条那类 bug 的复发形态）');
    }
    for (const target of contract.scalingTargets ?? []) {
      if (!ATOM_CONTRACT[target.atom]) {
        out.error('semantic', 'skills', `AFFIX_SINKS.${stat}.scalingTargets`, `引用了不存在的原子: ${target.atom}`);
        continue;
      }
      if (!atomContract(target.atom).params[target.param]) {
        out.error('semantic', 'skills', `AFFIX_SINKS.${stat}.scalingTargets`,
          `原子 ${target.atom} 的契约未声明参数 ${target.param}`);
      }
    }
  }

  out.checks.push('semantic:bossWavesReachable');
  config.waves.bossWaves.forEach((wave, index) => {
    if (!Number.isInteger(wave) || wave < 1 || wave > config.waves.totalWaves) {
      out.error('semantic', 'waves', `$.waves.bossWaves[${index}]`,
        `波次 ${wave} 不可达（totalWaves=${config.waves.totalWaves}）；加载时会被静默丢弃`);
    }
  });
  if (new Set(config.waves.bossWaves).size !== config.waves.bossWaves.length) {
    out.error('semantic', 'waves', '$.waves.bossWaves', 'Boss 波次不得重复');
  }

  out.checks.push('semantic:validationRewardKinds');
  const rewardKinds = new Set(['wildcard', 'card']);
  const typePolicies = new Set(['build', 'pivot', 'uniform', 'focusGod']);
  const checkReward = (reward: unknown, path: string): void => {
    const spec = reward as { kind?: unknown; star?: unknown; count?: unknown; typePolicy?: unknown } | null;
    if (!spec || typeof spec !== 'object') return out.error('semantic', 'waves', path, '必须是对象');
    if (spec.kind === undefined) {
      return out.warn('semantic', 'waves', path, 'kind 缺失：加载时会被静默补成 wildcard，建议显式声明');
    }
    if (!rewardKinds.has(String(spec.kind))) return out.error('semantic', 'waves', `${path}.kind`, `非法奖励类型: ${String(spec.kind)}`);
    if (!Number.isInteger(spec.star) || Number(spec.star) < 1 || Number(spec.star) > config.economy.maxStar) {
      out.error('semantic', 'waves', `${path}.star`, `星级必须是 1..${config.economy.maxStar} 的整数`);
    }
    if (!Number.isInteger(spec.count) || Number(spec.count) < 1) {
      out.error('semantic', 'waves', `${path}.count`, 'count 必须是正整数');
    }
    if (spec.kind === 'card' && !typePolicies.has(String(spec.typePolicy))) {
      out.error('semantic', 'waves', `${path}.typePolicy`, `非法定向策略: ${String(spec.typePolicy)}`);
    }
  };
  config.waves.stagePlan.validation.forEach((wave, waveIndex) => {
    const path = `$.waves.stagePlan.validation[${waveIndex}]`;
    wave.enemies.forEach((enemy, index) => checkReward(enemy.reward, `${path}.enemies[${index}].reward`));
    checkReward(wave.bossReward, `${path}.bossReward`);
  });

  out.checks.push('semantic:economyInvariants');
  const economy = config.economy;
  if (economy.equipThreshold > economy.maxStar) {
    out.error('semantic', 'economy', '$.economy.equipThreshold', `入装门槛 ${economy.equipThreshold} 高于最高星级 ${economy.maxStar}：永远无法装备`);
  }
  if (economy.handSlots < 1) out.error('semantic', 'economy', '$.economy.handSlots', '手牌格必须 ≥ 1');
  if (economy.equipSlots < 1) out.error('semantic', 'economy', '$.economy.equipSlots', '装备格必须 ≥ 1');

  out.checks.push('semantic:activePoolFeasibility');
  const roster = new Set(config.gods.gods.flatMap(god => [...god.anchorCardIds, ...god.variableCardIds]));
  const orphanCards = config.skills.cards.filter(card => !card.recipeOnly && !roster.has(card.id));
  if (config.gods.gods.length && orphanCards.length) {
    out.warn('semantic', 'gods', '$.gods.gods',
      `${orphanCards.length} 张正式卡不属于任何神的卡池，本局永远抽不到: ${orphanCards.map(card => card.id).join(', ')}`);
  }
}

/**
 * 跑完三层校验并返回报告。**不抛错**——调用方决定是终止进程还是拒绝写盘。
 * schema 层任一域失败时，仍会继续跑其余层（跨引用层依赖已装配的 config，故传入的必须是能装配出来的配置）。
 */
export function validateGameConfig(config: GameConfig, texts: TextsLike): ValidationReport {
  const out = new IssueCollector();
  schemaLayer(config, out);
  referenceLayer(config, texts, out);
  semanticLayer(config, out);
  return {
    ok: !out.issues.some(issue => issue.level === 'error'),
    issues: out.issues,
    checks: out.checks,
  };
}
