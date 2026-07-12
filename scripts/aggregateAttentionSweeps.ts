// @ts-nocheck -- 由 vite-node 直接执行；项目主 tsconfig 刻意不引入 Node 类型。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'outputs/p4_1_20260712');
const INPUTS = [
  resolve(OUTPUT_DIR, 'P4.1_attention_easy_2000.json'),
  resolve(OUTPUT_DIR, 'P4.1_attention_base_2000.json'),
  resolve(OUTPUT_DIR, 'P4.1_attention_hard_2000.json'),
];
const JSON_PATH = resolve(OUTPUT_DIR, 'P4.1_attention_formal_18000.json');
const CSV_PATH = resolve(OUTPUT_DIR, 'P4.1_attention_formal_18000.csv');

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function scenarioCsv(scenarios: Record<string, unknown>[]): string {
  const columns = Object.keys(scenarios[0]).filter(key => key !== 'resolvedBot');
  const rows = [columns.join(',')];
  for (const scenario of scenarios) rows.push(columns.map(key => String(scenario[key])).join(','));
  return `${rows.join('\n')}\n`;
}

async function main(): Promise<void> {
  const batches = await Promise.all(INPUTS.map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const seeds = new Set(batches.map(batch => batch.seed));
  const runs = new Set(batches.map(batch => batch.runsPerScenario));
  if (seeds.size !== 1 || runs.size !== 1) throw new Error('输入批次的 seed/runsPerScenario 不一致');

  const order = new Map(['easy/fast', 'easy/target', 'easy/stressed', 'base/fast', 'base/target', 'base/stressed', 'hard/fast', 'hard/target', 'hard/stressed'].map((key, index) => [key, index]));
  const scenarios = batches.flatMap(batch => batch.scenarios)
    .sort((a, b) => order.get(`${a.difficulty}/${a.profile}`) - order.get(`${b.difficulty}/${b.profile}`));
  if (scenarios.length !== 9 || new Set(scenarios.map(s => `${s.difficulty}/${s.profile}`)).size !== 9) {
    throw new Error('必须恰好包含 3 难度 × 3 画像九个唯一格子');
  }

  const target = scenarios.find(s => s.difficulty === 'base' && s.profile === 'target');
  const stressed = scenarios.find(s => s.difficulty === 'base' && s.profile === 'stressed');
  const easyTarget = scenarios.find(s => s.difficulty === 'easy' && s.profile === 'target');
  const hardTarget = scenarios.find(s => s.difficulty === 'hard' && s.profile === 'target');
  if (!target || !stressed || !easyTarget || !hardTarget) throw new Error('缺少目标画像难度格或 base/stressed');
  const checks = {
    firstRunWinRate: { value: target.winRate, min: 0.15, max: 0.25, pass: inRange(target.winRate, 0.15, 0.25) },
    wallMinutesP50: { value: target.wallDurationSecondsP50 / 60, min: 10, max: 14, pass: inRange(target.wallDurationSecondsP50 / 60, 10, 14) },
    winningBossSecondsP50: { value: target.winningBossFightSecondsP50, min: 100, max: 120, pass: inRange(target.winningBossFightSecondsP50, 100, 120) },
    winningBossShareP50: { value: target.winningBossShareP50, min: 0.12, max: 0.18, pass: inRange(target.winningBossShareP50, 0.12, 0.18) },
    effectivePickupsP50: { value: target.effectivePickupsP50, min: 38, max: 45, pass: inRange(target.effectivePickupsP50, 38, 45) },
    mergesPerRegularWave: { value: target.mergesPerRegularWave, min: 2, pass: target.mergesPerRegularWave >= 2 },
    breatherShare: { value: target.breatherShare, min: 0.2, max: 0.3, pass: inRange(target.breatherShare, 0.2, 0.3) },
    expiredRate: { value: target.expiredRate, max: 0.2, pass: target.expiredRate <= 0.2 },
    consumeActionsPerMinuteP50: { value: target.consumeActionsPerMinuteP50, min: 1, max: 2, pass: inRange(target.consumeActionsPerMinuteP50, 1, 2) },
    rolling3sCountP95: { value: target.rolling3sCountP95, max: 3, pass: target.rolling3sCountP95 <= 3 },
    rolling10sCountP95: { value: target.rolling10sCountP95, max: 7, pass: target.rolling10sCountP95 <= 7 },
    queueDelayP95Seconds: { value: target.queueDelayP95Seconds, max: 1.5, pass: target.queueDelayP95Seconds <= 1.5 },
    overlappingWindowShareP50: { value: target.overlappingWindowShareP50, min: 0.2, max: 0.4, pass: inRange(target.overlappingWindowShareP50, 0.2, 0.4) },
    attentionExtraExpiredP50: { value: target.attentionExtraExpiredP50, max: 0, pass: target.attentionExtraExpiredP50 === 0 },
    bountyAcceptanceRate: { value: target.bountyAcceptanceRate, min: 0.3, max: 0.7, pass: inRange(target.bountyAcceptanceRate, 0.3, 0.7) },
    bountyCompletionRate: { value: target.bountyCompletionRate, min: 0.75, max: 0.95, pass: inRange(target.bountyCompletionRate, 0.75, 0.95) },
    bountyHasRealFailure: { value: target.bountyFailed, min: 1, pass: target.bountyFailed > 0 },
    easyBountyCompletionRate: { value: easyTarget.bountyCompletionRate, min: 0.85, max: 0.98, pass: inRange(easyTarget.bountyCompletionRate, 0.85, 0.98) },
    difficultyWinOrder: { value: easyTarget.winRate - hardTarget.winRate, min: 0, pass: easyTarget.winRate > target.winRate && target.winRate > hardTarget.winRate },
    stressedExpiredRate: { value: stressed.expiredRate, max: 0.2, pass: stressed.expiredRate <= 0.2 },
    stressedSensitivityDetected: { value: stressed.attentionExtraExpiredP50, min: 1, pass: stressed.attentionExtraExpiredP50 >= 1 },
  };
  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    seed: [...seeds][0],
    runsPerScenario: [...runs][0],
    totalRuns: scenarios.reduce((sum, scenario) => sum + scenario.runs, 0),
    design: {
      primaryScenario: 'base/target',
      sensitivityProfiles: ['fast', 'target', 'stressed'],
      difficultyVariants: ['easy', 'base', 'hard'],
      simulatorHz: 30,
      note: 'rolling Ns P95 是每局滚动窗口 P95 的跨局中位；不等同于极端单局最大值。fast/target/stressed 是设计包络，不是真人分群。',
    },
    kpiEvaluation: {
      allPass: Object.values(checks).every(check => check.pass),
      scope: 'P1/P4 战斗经济回归 + P4.1 注意力工程门槛；不包含真机性能或真人可读性。',
      checks,
      physicalDeviceStatus: 'pending',
      physicalDeviceNote: '尚无 T1 真机帧率、触达与误触数据；30Hz、反应时与误触率为 provisional 建模假设。',
    },
    scenarios,
  };
  await mkdir(dirname(JSON_PATH), { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(CSV_PATH, scenarioCsv(scenarios), 'utf8');
  process.stdout.write(`${JSON_PATH}\n${CSV_PATH}\nallPass=${output.kpiEvaluation.allPass}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
