// 配置管线 v1：把「装配 → 校验 → 规范序列化」串成一条通道。
// 编辑器 v1 与 dev 写回端点只认这里的 API：**先校验、后写盘**，坏配置绝不落地。
import { texts } from '../data';
import { buildConfig, deepMerge, VARIANTS } from './loader';
import { stableJson } from './format';
import { validateGameConfig, type TextsLike, type ValidationDomain, type ValidationReport } from './validateAll';

/** 可经写回端点落盘的域 → 目标文件（相对仓库根）。 */
export const WRITABLE_DOMAINS = {
  combat: 'src/config/base/combat.json',
  waves: 'src/config/base/waves.json',
  enemies: 'src/config/base/enemies.json',
  difficulty: 'src/config/base/difficulty.json',
  skills: 'src/config/base/skills.json',
  gods: 'src/config/base/gods.json',
  relics: 'src/config/base/relics.json',
  evolutionRecipes: 'src/config/base/evolutionRecipes.json',
  waveRewards: 'src/config/base/waveRewards.json',
  progression: 'src/config/base/progression.json',
  economy: 'src/config/base/economy.json',
  bounty: 'src/config/base/bounty.json',
  input: 'src/config/base/input.json',
  tuner: 'src/config/base/tuner.json',
  texts: 'src/data/texts.json',
} as const satisfies Partial<Record<ValidationDomain, string>>;

export type WritableDomain = keyof typeof WRITABLE_DOMAINS;

export function isWritableDomain(value: unknown): value is WritableDomain {
  return typeof value === 'string' && value in WRITABLE_DOMAINS;
}

export interface CandidateReport extends ValidationReport {
  /** 逐个 variant 的校验结果：base 之外，已注册的覆盖组合也必须仍然合法。 */
  variants: Array<{ variant: string; report: ValidationReport }>;
}

function mergeReports(base: ValidationReport, variants: CandidateReport['variants']): CandidateReport {
  return {
    ok: base.ok && variants.every(entry => entry.report.ok),
    issues: base.issues,
    checks: base.checks,
    variants,
  };
}

/** 装配期的 fail-fast 报错形如 `[god-config v0.1.0] $.gods.gods[0]: …`，从中还原真正出问题的域。 */
function domainFromMessage(message: string, fallback: ValidationDomain): ValidationDomain {
  const matched = /\$\.([a-zA-Z]+)/.exec(message)?.[1];
  return matched && matched in WRITABLE_DOMAINS ? matched as ValidationDomain : fallback;
}

function assembleFailure(variant: string[], fallbackDomain: ValidationDomain, error: unknown): ValidationReport {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    checks: ['assemble'],
    issues: [{
      level: 'error',
      layer: 'schema',
      domain: domainFromMessage(message, fallbackDomain),
      path: variant.length ? `$[variant=${variant.join(',')}]` : '$',
      message: `配置装配失败：${message}`,
    }],
  };
}

/**
 * 校验某个 variant 组合下「把 domain 换成 data 之后」的整套配置。
 * `buildConfig` 自带 fail-fast 校验，坏数据会在装配阶段就抛——这里把抛错折算成一条 error，
 * 保证写回端点永远拿到报告而不是异常。
 */
/**
 * 候选数据写的是 `base/<domain>.json`，所以在某个 variant 下生效的是
 * 「候选 深合并 该 variant 对本域的覆盖」——必须按 loader 的语义重放一遍，
 * 否则会把 variant 的覆盖丢掉、校验到一份实际不存在的配置。
 */
function mergedCandidate(variant: string[], domain: WritableDomain, data: unknown): unknown {
  return variant.reduce((merged, name) => {
    const patch = (VARIANTS[name] as Record<string, unknown> | undefined)?.[domain];
    return patch === undefined ? merged : deepMerge(merged, patch as never);
  }, data);
}

function validateWith(variant: string[], domain: WritableDomain | null, data: unknown): ValidationReport {
  try {
    const config = buildConfig(variant);
    if (domain === null) return validateGameConfig(config, texts as TextsLike);
    const merged = mergedCandidate(variant, domain, data);
    if (domain === 'texts') return validateGameConfig(config, merged as TextsLike);
    (config as unknown as Record<string, unknown>)[domain] = merged;
    return validateGameConfig(config, texts as TextsLike);
  } catch (error) {
    return assembleFailure(variant, domain ?? 'skills', error);
  }
}

/**
 * 校验「把 domain 换成 data 之后」的整套配置。
 * 覆盖 base 与每个已注册 variant——避免只在 base 下合法、切到 dev-short 就炸。
 */
export function validateCandidate(domain: WritableDomain, data: unknown): CandidateReport {
  return mergeReports(
    validateWith([], domain, data),
    Object.keys(VARIANTS).map(variant => ({ variant, report: validateWith([variant], domain, data) })),
  );
}

/** 校验当前磁盘上的配置（不做任何替换）；`npm run validate` 的主入口。 */
export function validateCurrentConfig(): CandidateReport {
  return mergeReports(
    validateWith([], null, undefined),
    Object.keys(VARIANTS).map(variant => ({ variant, report: validateWith([variant], null, undefined) })),
  );
}

/** 规范序列化：编辑器写盘与 `npm run format:config` 共用。 */
export function serializeDomain(data: unknown): string {
  return stableJson(data);
}

export interface WriteRequest {
  domain: WritableDomain;
  data: unknown;
}

export interface WriteDecision {
  ok: boolean;
  path: string;
  content?: string;
  report: CandidateReport;
}

/**
 * 写回决策：校验通过才返回待写内容。**本函数不碰磁盘**，
 * 由调用方（dev 中间件）负责落盘，从而保持 config 层零 node 依赖。
 */
export function prepareWrite(request: WriteRequest): WriteDecision {
  const report = validateCandidate(request.domain, request.data);
  const path = WRITABLE_DOMAINS[request.domain];
  return report.ok
    ? { ok: true, path, content: serializeDomain(request.data), report }
    : { ok: false, path, report };
}
