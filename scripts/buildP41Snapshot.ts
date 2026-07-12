// @ts-nocheck -- 由 vite-node 直接执行；项目主 tsconfig 刻意不引入 Node 类型。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildConfig } from '../src/config/loader';

const ROOT = resolve(import.meta.dirname, '..');
const FORMAL_PATH = resolve(ROOT, 'outputs/p4_1_20260712/P4.1_attention_formal_18000.json');
const OUTPUT_PATH = resolve(ROOT, 'docs/P4.1_数值配置_v3.json');

function selectedResult(scenario: Record<string, unknown>) {
  const {
    difficulty, profile, runs, winRate, wallDurationSecondsP50,
    winningBossFightSecondsP50, winningBossShareP50, expiredRate,
    dropsGeneratedP50, effectivePickupsP50, mergesPerRegularWave,
    formed3StarAtBossEntryP50, breatherShare,
    actionsPerMinuteP50, rolling3sCountP95, rolling10sCountP95,
    queueDelayP95Seconds, overlappingWindowShareP50,
    attentionExtraExpiredP50, consumeActionsPerMinuteP50,
    errorRateP50, bountyAcceptanceRate, bountyCompletionRate,
    bountyRewardCollectionRate, bountyAcceptedBreaches,
  } = scenario;
  return {
    difficulty, profile, runs, winRate, wallDurationSecondsP50,
    winningBossFightSecondsP50, winningBossShareP50, expiredRate,
    dropsGeneratedP50, effectivePickupsP50, mergesPerRegularWave,
    formed3StarAtBossEntryP50, breatherShare,
    actionsPerMinuteP50, rolling3sCountP95, rolling10sCountP95,
    queueDelayP95Seconds, overlappingWindowShareP50,
    attentionExtraExpiredP50, consumeActionsPerMinuteP50,
    errorRateP50, bountyAcceptanceRate, bountyCompletionRate,
    bountyRewardCollectionRate, bountyAcceptedBreaches,
  };
}

async function main(): Promise<void> {
  const formal = JSON.parse(await readFile(FORMAL_PATH, 'utf8'));
  const base = buildConfig();
  const easy = buildConfig(['difficulty-easy']);
  const hard = buildConfig(['difficulty-hard']);
  const output = {
    $comment: 'P4.1 点击注意力压力标定快照。运行时真值仍位于 src/config；本文件用于审阅、移交与复现。P4 v2 的解析/经济模型继续有效。',
    schemaVersion: 3,
    id: 'projectvl-p4.1-attention-balance-v3',
    calibratedAt: '2026-07-12',
    status: 'attention-calibrated-performance-and-human-factors-provisional',
    supersedes: 'docs/P4_数值配置_v2.json（仅覆盖发生变化的点击压力/Bounty/Boss截止线；其余P4模型沿用）',
    calibration: {
      seed: formal.seed,
      runsPerScenario: formal.runsPerScenario,
      scenarioCount: formal.scenarios.length,
      totalRuns: formal.totalRuns,
      fixedStepHz: 30,
      vfxEnabled: false,
      primaryScenario: 'base/target',
      profiles: formal.scenarios.filter(s => s.difficulty === 'base').map(s => ({ name: s.profile, bot: s.resolvedBot })),
      kpiEvaluation: formal.kpiEvaluation,
      metricSemantics: {
        rollingBurst: 'rolling Ns Count P95 = 单局滚动窗口P95，再取跨局中位；不是最大值。',
        queueDelay: '共享动作队列中从意图出现到动作执行的延迟；拾取/接赏金/装备/消耗/perk竞争同一资源。',
        attentionExtraExpired: '因动作尚未轮到执行而额外过期的掉落；不含永久漏点和纯反应慢导致的过期。',
      },
      performanceAssumption: {
        status: 'T1_PHYSICAL_DEVICE_MISSING',
        targetDisplayFps: 60,
        simulationFloorHz: 30,
        browserDtCapSeconds: base.combat.dtCap,
        warning: '尚无真实T1手机型号、帧时间分位、拇指触达和误触数据；headless关闭VFX，因此不能作为物理设备或真人体验证据。',
      },
    },
    decisions: {
      interaction: 'lock-is-equip',
      input: base.input,
      actionQueue: ['pickup', 'bountyAccept', 'equipment', 'consume', 'perk'],
      bounty: base.skills.mechanisms.bounty,
      bountyIntent: '可不接；接单后集火并狂暴，成功掉2张肥而急奖励。标准目标画像接受率30–70%、完成率75–95%，确保既非伪选择也非免费奖励。',
      tuning: {
        boss: { hpBase: base.enemies.types.boss.hpBase, speedBase: base.enemies.types.boss.speedBase },
        reason: '速度作为截止线旋钮，同时约束通关率与胜利Boss时长；不改前8波注意力节奏。',
      },
    },
    runtimeSnapshot: {
      base: {
        input: base.input,
        combat: base.combat,
        waves: base.waves,
        enemies: base.enemies,
        progression: base.progression,
        economy: base.economy,
        bounty: base.skills.mechanisms.bounty,
      },
      variants: {
        easy: {
          runtimeId: 'difficulty-easy',
          boss: easy.enemies.types.boss,
          bounty: easy.skills.mechanisms.bounty,
        },
        hard: {
          runtimeId: 'difficulty-hard',
          boss: hard.enemies.types.boss,
          bounty: hard.skills.mechanisms.bounty,
        },
      },
    },
    results: formal.scenarios.map(selectedResult),
    evidence: {
      workbook: 'outputs/p4_1_20260712/ProjectVL_P4.1_注意力压力工作簿_v3.xlsx',
      formalSummary: 'outputs/p4_1_20260712/P4.1_attention_formal_18000.json',
      formalCsv: 'outputs/p4_1_20260712/P4.1_attention_formal_18000.csv',
      priorP4Workbook: 'outputs/p4_20260712/ProjectVL_P4_数值设计工作簿_v2.xlsx',
    },
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${OUTPUT_PATH}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
