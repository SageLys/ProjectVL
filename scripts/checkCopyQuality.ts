import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Obj = Record<string, unknown>;
type CardCopy = {
  name: string;
  hand: { shortByTier: Record<string, string>; milestones: Record<string, { title: string; detail: string; fx: string }> };
  equip: { shortByTier: Record<string, string>; milestones: Record<string, { title: string; detail: string; fx: string }> };
};
type BranchCopy = { name: string; summary: string; intent: string };

const root = path.resolve(import.meta.dirname, '..');
const current = JSON.parse(fs.readFileSync(path.join(root, 'src/data/texts.json'), 'utf8')) as Obj;
const previous = JSON.parse(execFileSync('git', ['show', 'HEAD:src/data/texts.json'], { cwd: root, encoding: 'utf8' })) as Obj;
const cards = current.cards as Record<string, CardCopy>;
const oldCards = previous.cards as Record<string, CardCopy>;
const evolution = current.evolution as Record<string, Record<string, BranchCopy> | string>;

const failures: string[][] = Array.from({ length: 12 }, () => []);
const fail = (item: number, message: string) => failures[item - 1].push(message);

const mechanismKeywords = [
  '电', '冻', '冰', '烧', '火', '推', '挡', '壁垒', '反弹', '反伤', '掉落', '掉', '穿透', '穿',
  '连锁', '链', '减速', '慢', '感电', '护盾', '召唤', '爆', '炸', '赏印', '标记', '恢复', '回血',
  '心防', '射速', '攻速', '射程', '伤害', '光束', '迫击炮', '弹', '光环', '领域', '嘲讽', '仇恨',
  '眩晕', '断片', '击退', '处决', '送走', '灼烧', '点火', '火场', '心意', '积分', '合成', '脉冲',
  '重生', '圣墙', '塔', '树', '霜露', '泉', '风暴', '满充', '掉血', '吸收', '减免', '收割',
];

for (const [cardId, card] of Object.entries(cards)) {
  const branchNames = Object.values(evolution[cardId] ?? {}).filter((value): value is BranchCopy => typeof value === 'object').map(branch => branch.name);
  const equipValues = Object.values(card.equip.shortByTier);
  const handValues = Object.values(card.hand.shortByTier);
  for (const [tier, copy] of Object.entries(card.equip.shortByTier)) {
    for (const branchName of branchNames) if (branchName && copy.includes(branchName)) fail(1, `${cardId}.${tier} 包含分支名「${branchName}」`);
    for (const term of ['已选分支', '叠加接口', '公共终态', '终极形态：', '选择', '分支', '接口']) {
      if (copy.includes(term)) fail(2, `${cardId}.${tier} 包含结构词「${term}」`);
    }
    if ((copy.match(/\//g)?.length ?? 0) >= 2 || (copy.match(/、/g)?.length ?? 0) >= 2) fail(3, `${cardId}.${tier} 存在三项并列：${copy}`);
    if (!mechanismKeywords.some(keyword => copy.includes(keyword))) fail(4, `${cardId}.${tier} 未命中机制关键词：${copy}`);
  }
  if (new Set(equipValues).size !== equipValues.length) fail(5, `${cardId} 的装备三档并非互不相同：${equipValues.join(' | ')}`);
  for (const copy of equipValues) if (handValues.includes(copy)) fail(5, `${cardId} 的装备短句与手牌短句相同：${copy}`);
}

const cardIds = Object.keys(cards);
if (JSON.stringify(cardIds.sort()) !== JSON.stringify(Object.keys(oldCards).sort())) fail(6, 'cards 键集合与 HEAD 不同');
for (const id of cardIds) if (cards[id].name === oldCards[id].name) fail(6, `${id} 卡名未改变：${cards[id].name}`);

const gods = current.gods as Record<string, { name: string }>;
const oldGods = previous.gods as Record<string, { name: string }>;
if (Object.keys(gods).length !== 5) fail(7, `神祇数量为 ${Object.keys(gods).length}，预期 5`);
for (const id of Object.keys(gods)) if (gods[id].name === oldGods[id].name) fail(7, `${id} 神名未改变：${gods[id].name}`);

const milestoneDetails: string[] = [];
for (const card of Object.values(cards)) for (const mode of [card.hand, card.equip]) {
  milestoneDetails.push(...Object.values(mode.milestones).map(milestone => milestone.detail));
}
const detailCounts = new Map<string, number>();
for (const detail of milestoneDetails) detailCounts.set(detail, (detailCounts.get(detail) ?? 0) + 1);
const uniqueRatio = detailCounts.size / milestoneDetails.length;
if (uniqueRatio < 0.9) fail(8, `去重比 ${detailCounts.size}/${milestoneDetails.length}=${uniqueRatio.toFixed(3)} < 0.9`);
for (const [detail, count] of detailCounts) if (count > 3) fail(8, `复用 ${count} 次：${detail}`);

function leaves(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value as Obj).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}
const playerLeaves = leaves(current).filter(([jsonPath]) => !jsonPath.startsWith('tuner.'));
const configLeak = /@|→|requiresStatus|spreadStatus|groundZone|burstDamage|aoeOnHit|mergeMaterialRefund|wildcardRewardBonus|breachReduction|focusPriority|dropRateMul|dropLifetimeMul|xpMul|novaOnBreak/;
for (const [jsonPath, value] of playerLeaves) if (typeof value === 'string' && configLeak.test(value)) fail(9, `${jsonPath}: ${value}`);

const internalNote = /敌人|（现存[^）]*同构）|改造理由|设计意图[:：]|内部笔记/;
for (const [jsonPath, value] of playerLeaves) if (typeof value === 'string' && internalNote.test(value)) fail(10, `${jsonPath}: ${value}`);

for (const [cardId, branchesValue] of Object.entries(evolution)) {
  if (!branchesValue || typeof branchesValue !== 'object') continue;
  const branches = Object.entries(branchesValue as Record<string, BranchCopy>);
  const abc = branches.filter(([id]) => /[ABC]$/.test(id));
  if (abc.length) {
    const summaries = abc.map(([, branch]) => branch.summary);
    if (new Set(summaries).size !== summaries.length) fail(11, `${cardId} 的 A/B/C summary 有重复`);
  }
  for (const [id, branch] of branches) if (branch.summary === branch.intent) fail(11, `${cardId}.${id} summary === intent`);
}

const oldLeaves = new Map(leaves(previous));
const placeholders = (value: unknown) => typeof value === 'string' ? [...value.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort() : [];
for (const [jsonPath, value] of leaves(current)) {
  if (!oldLeaves.has(jsonPath)) {
    fail(12, `新增键：${jsonPath}`);
    continue;
  }
  const oldTokens = placeholders(oldLeaves.get(jsonPath));
  const newTokens = placeholders(value);
  if (JSON.stringify(oldTokens) !== JSON.stringify(newTokens)) fail(12, `${jsonPath}: ${oldTokens.join(',')} -> ${newTokens.join(',')}`);
}
for (const jsonPath of oldLeaves.keys()) if (!leaves(current).some(([key]) => key === jsonPath)) fail(12, `删除键：${jsonPath}`);

const labels = [
  '装备短句不含本卡分支名', '装备短句不含结构词', '装备短句无三项并列', '装备短句命中机制关键词',
  '装备三档互异且不同于手牌', '全部卡名相对 HEAD 已改变', '五神名称相对 HEAD 已改变',
  '里程碑正文复用率达标', '玩家文案无配置写法泄漏', '玩家文案无“敌人”或内部笔记',
  'A/B/C summary 互异且 summary≠intent', '占位符集合与 HEAD 一致',
];

let failed = false;
for (let i = 0; i < labels.length; i++) {
  const issues = failures[i];
  if (issues.length) {
    failed = true;
    console.log(`[FAIL ${i + 1}] ${labels[i]}（${issues.length} 项）`);
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    const extra = i === 5 ? `（${cardIds.length} 张；仓库实际数量）` : i === 7 ? `（${detailCounts.size}/${milestoneDetails.length}=${uniqueRatio.toFixed(3)}）` : '';
    console.log(`[PASS ${i + 1}] ${labels[i]}${extra}`);
  }
}

if (failed) process.exitCode = 1;
