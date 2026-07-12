// @ts-nocheck -- 由 vite-node 直接执行；项目主 tsconfig 刻意不引入 Node 类型。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  headlessBatchToCsv,
  runHeadlessBatch,
} from '../src/sim/headlessSimulator';

function usage(): string {
  return `ProjectVL P4 headless balance simulator

Usage:
  npm run sim:balance -- [options]

Options:
  --runs <n>                 局数（默认 1000）
  --seed <uint32>            批次种子（默认 20260712）
  --variant <a,b>            variant，可重复传入
  --meta <n>                 metaPowerMultiplier（默认 1）
  --profile <name>           注意力参数组：fast|target|stressed（默认 target）
  --miss <0..1>              覆盖参数组的永久漏点概率
  --reaction <seconds>       覆盖基础反应延迟
  --reaction-jitter <sec>    覆盖反应延迟抖动
  --pickup-interval <sec>    覆盖一次点击拾取耗时（兼容旧参数名）
  --equip-interval <sec>     覆盖装备/喂养检查间隔（兼容旧参数名）
  --perk-decision <sec>      覆盖 perk 选择耗时（兼容旧参数名）
  --equipment-action <sec>   覆盖一次锁定/喂养动作耗时
  --consume-action <sec>     覆盖一次拖卡释放动作耗时
  --bounty-action <sec>      覆盖一次 Bounty 接单动作耗时
  --switch-cost <sec>        覆盖动词切换成本
  --travel-per-100 <sec>     覆盖视线/指针跨越 100px 的时间成本
  --error <0..1>             覆盖误点概率
  --bounty-accept <0..1>     覆盖主动接单倾向
  --rescue-distance <px>     覆盖触发拖卡解围的敌人距离
  --max-active <seconds>     单局 active time 超时（默认 1200）
  --json <path>              导出完整 JSON（summary + runs）
  --csv <path>               导出逐局 CSV
  --quiet                    不显示进度
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

function parseArgs(argv: string[]) {
  const options: Record<string, unknown> = {};
  const bot: Record<string, number> = {};
  const variants: string[] = [];
  let jsonPath: string | null = null;
  let csvPath: string | null = null;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--quiet') { quiet = true; continue; }
    const raw = valueAfter(argv, i, arg);
    i++;
    if (arg === '--runs') options.runs = Math.floor(finiteNumber(raw, arg));
    else if (arg === '--seed') options.seed = finiteNumber(raw, arg) >>> 0;
    else if (arg === '--variant') variants.push(...raw.split(',').map(v => v.trim()).filter(Boolean));
    else if (arg === '--meta') options.metaPowerMultiplier = finiteNumber(raw, arg);
    else if (arg === '--profile') options.attentionProfile = raw;
    else if (arg === '--miss') bot.permanentMissChance = finiteNumber(raw, arg);
    else if (arg === '--reaction') bot.pickupReactionSeconds = finiteNumber(raw, arg);
    else if (arg === '--reaction-jitter') bot.pickupReactionJitterSeconds = finiteNumber(raw, arg);
    else if (arg === '--pickup-interval') bot.pickupActionIntervalSeconds = finiteNumber(raw, arg);
    else if (arg === '--equip-interval') bot.equipmentDecisionIntervalSeconds = finiteNumber(raw, arg);
    else if (arg === '--perk-decision') bot.perkDecisionSeconds = finiteNumber(raw, arg);
    else if (arg === '--equipment-action') bot.equipmentActionSeconds = finiteNumber(raw, arg);
    else if (arg === '--consume-action') bot.consumeActionSeconds = finiteNumber(raw, arg);
    else if (arg === '--bounty-action') bot.bountyActionSeconds = finiteNumber(raw, arg);
    else if (arg === '--switch-cost') bot.verbSwitchSeconds = finiteNumber(raw, arg);
    else if (arg === '--travel-per-100') bot.spatialTravelSecondsPer100Px = finiteNumber(raw, arg);
    else if (arg === '--error') bot.actionErrorChance = finiteNumber(raw, arg);
    else if (arg === '--bounty-accept') bot.bountyAcceptChance = finiteNumber(raw, arg);
    else if (arg === '--rescue-distance') bot.rescueDistance = finiteNumber(raw, arg);
    else if (arg === '--max-active') options.maxActiveSeconds = finiteNumber(raw, arg);
    else if (arg === '--json') jsonPath = raw;
    else if (arg === '--csv') csvPath = raw;
    else throw new Error(`未知参数：${arg}`);
  }
  if (variants.length > 0) options.variantNames = variants;
  if (Object.keys(bot).length > 0) options.bot = bot;
  return { help: false, options, jsonPath, csvPath, quiet };
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

  let lastPercent = -1;
  const result = runHeadlessBatch(parsed.options, parsed.quiet ? undefined : (completed, total) => {
    const percent = Math.floor((completed / total) * 100);
    if (percent >= lastPercent + 10 || completed === total) {
      lastPercent = percent;
      process.stderr.write(`\r模拟进度 ${completed}/${total} (${percent}%)`);
      if (completed === total) process.stderr.write('\n');
    }
  });

  if (parsed.jsonPath) {
    const path = await writeText(parsed.jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`JSON: ${path}\n`);
  }
  if (parsed.csvPath) {
    const path = await writeText(parsed.csvPath, headlessBatchToCsv(result));
    process.stderr.write(`CSV: ${path}\n`);
  }

  process.stdout.write(`${JSON.stringify({
    options: result.options,
    simulation: result.simulation,
    config: result.config,
    summary: result.summary,
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
