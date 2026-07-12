// @ts-nocheck -- 由 vite-node 直接执行；项目主 tsconfig 刻意不引入 Node 类型。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  runHeadlessBatch,
  type AttentionProfileName,
} from '../src/sim/headlessSimulator';

const PROFILE_NAMES: AttentionProfileName[] = ['fast', 'target', 'stressed'];
const DIFFICULTIES = {
  easy: ['difficulty-easy'],
  base: [],
  hard: ['difficulty-hard'],
} as const;

function usage(): string {
  return `ProjectVL P4.1 attention pressure sweep

Usage:
  npm run sim:attention -- [options]

Options:
  --runs <n>                 每个格子的局数（默认 2000）
  --seed <uint32>            批次种子（默认 20260712）
  --profiles <a,b>           fast,target,stressed 子集
  --difficulties <a,b>       easy,base,hard 子集
  --json <path>              紧凑 summary JSON
  --csv <path>               紧凑 scenario CSV
  --quiet                    不显示格子进度
  --help                     显示帮助
`;
}

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数`);
  return value;
}

function finiteNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} 必须是有限数，收到 ${raw}`);
  return value;
}

function parseList<T extends string>(raw: string, allowed: readonly T[], flag: string): T[] {
  const values = raw.split(',').map(value => value.trim()).filter(Boolean) as T[];
  for (const value of values) {
    if (!allowed.includes(value)) throw new Error(`${flag} 不支持 ${value}`);
  }
  return [...new Set(values)];
}

function parseArgs(argv: string[]) {
  let runs = 2000;
  let seed = 20260712;
  let profiles = [...PROFILE_NAMES];
  let difficulties = Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[];
  let jsonPath: string | null = null;
  let csvPath: string | null = null;
  let quiet = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--quiet') { quiet = true; continue; }
    const raw = valueAfter(argv, index, arg);
    index++;
    if (arg === '--runs') runs = Math.max(1, Math.floor(finiteNumber(raw, arg)));
    else if (arg === '--seed') seed = finiteNumber(raw, arg) >>> 0;
    else if (arg === '--profiles') profiles = parseList(raw, PROFILE_NAMES, arg);
    else if (arg === '--difficulties') {
      difficulties = parseList(raw, Object.keys(DIFFICULTIES), arg) as (keyof typeof DIFFICULTIES)[];
    } else if (arg === '--json') jsonPath = raw;
    else if (arg === '--csv') csvPath = raw;
    else throw new Error(`未知参数：${arg}`);
  }
  return { help: false, runs, seed, profiles, difficulties, jsonPath, csvPath, quiet };
}

function compactScenario(difficulty: string, result: ReturnType<typeof runHeadlessBatch>) {
  const a = result.summary.attention;
  return {
    difficulty,
    profile: result.options.attentionProfile,
    runs: result.summary.runs,
    resolvedBot: result.options.bot,
    winRate: result.summary.winRate,
    wallDurationSecondsP50: result.summary.metrics.estimatedWallDurationSeconds.p50,
    winningBossFightSecondsP50: result.summary.winningBossFightDurationSeconds.p50,
    winningBossShareP50: result.summary.winningBossShare.p50,
    dropsGeneratedP50: result.summary.metrics.dropsGenerated.p50,
    effectivePickupsP50: result.summary.metrics.collected.p50,
    mergesPerRegularWave: result.summary.mergesPerRegularWave,
    formed3StarAtBossEntryP50: result.summary.metrics.bossEntryFormed3Star.p50,
    breatherShare: result.summary.breatherShare,
    expiredRate: result.summary.expiredRate,
    collectedRate: result.summary.collectedRate,
    actionsPerMinuteP50: a.actionsPerMinute.p50,
    actionsPerMinuteP95: a.actionsPerMinute.p95,
    rolling3sCountP50: a.rolling3sP50.p50,
    rolling3sCountP95: a.rolling3sP95.p50,
    rolling10sCountP50: a.rolling10sP50.p50,
    rolling10sCountP95: a.rolling10sP95.p50,
    queueDelayP50Seconds: a.queueDelayP50Seconds.p50,
    queueDelayP95Seconds: a.queueDelayP95Seconds.p50,
    overlappingWindowShareP50: a.overlappingWindowShare.p50,
    attentionExtraExpiredP50: a.attentionExtraExpired.p50,
    consumeActionsPerMinuteP50: a.consumeActionsPerMinute.p50,
    errorRateP50: a.errorRate.p50,
    positionSwitchesP50: a.positionSwitches.p50,
    bountyOffered: a.bountyOffered,
    bountyAccepted: a.bountyAccepted,
    bountyCompleted: a.bountyCompleted,
    bountyFailed: a.bountyFailed,
    bountyRewardDrops: a.bountyRewardDrops,
    bountyRewardCollected: a.bountyRewardCollected,
    bountyAcceptanceRate: a.bountyAcceptanceRate,
    bountyCompletionRate: a.bountyCompletionRate,
    bountyRewardCollectionRate: a.bountyRewardCollectionRate,
    bountyAcceptedBreaches: result.summary.metrics.bountyAcceptedBreaches.mean,
    bountyAcceptedRunDeaths: result.summary.metrics.bountyAcceptedRunDeaths.mean,
  };
}

function scenariosToCsv(scenarios: Record<string, unknown>[]): string {
  if (scenarios.length === 0) return '';
  const columns = Object.keys(scenarios[0]).filter(key => key !== 'resolvedBot');
  const lines = [columns.join(',')];
  for (const scenario of scenarios) lines.push(columns.map(key => String(scenario[key])).join(','));
  return `${lines.join('\n')}\n`;
}

async function writeText(path: string, content: string): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
  return absolute;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  const scenarios = [];
  const total = parsed.profiles.length * parsed.difficulties.length;
  let completed = 0;
  for (const difficulty of parsed.difficulties) {
    for (const profile of parsed.profiles) {
      if (!parsed.quiet) process.stderr.write(`模拟 ${difficulty}/${profile} (${completed + 1}/${total})\n`);
      const result = runHeadlessBatch({
        runs: parsed.runs,
        seed: parsed.seed,
        variantNames: [...DIFFICULTIES[difficulty]],
        attentionProfile: profile,
      });
      scenarios.push(compactScenario(difficulty, result));
      completed++;
    }
  }
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: parsed.seed,
    runsPerScenario: parsed.runs,
    totalRuns: parsed.runs * scenarios.length,
    scenarios,
  };
  if (parsed.jsonPath) {
    const path = await writeText(parsed.jsonPath, `${JSON.stringify(output, null, 2)}\n`);
    process.stderr.write(`JSON: ${path}\n`);
  }
  if (parsed.csvPath) {
    const path = await writeText(parsed.csvPath, scenariosToCsv(scenarios));
    process.stderr.write(`CSV: ${path}\n`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
