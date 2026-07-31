// 导出「文案工单」：把 60 张卡的全部文案槽位 + 每条绑定的精确机制句，
// 汇成一份自包含 Markdown，供文案改写（人或 AI）离线使用，无需读 skills.json。
// 运行：npx vite-node scripts/exportCopyWorkOrder.ts > docs/文案工单_全量.md
import { cfg } from '../src/config/index.ts';
import { texts } from '../src/data/index.ts';
import { formatBinding } from '../src/ui/effectText.ts';
import { resolveConsumableTier } from '../src/core/effects/interpreter.ts';
import type { CardDef } from '../src/core/effects/defs.ts';

type Any = Record<string, any>;
const T = texts as unknown as Any;

const GOD_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(T.gods ?? {}).map(([id, node]: [string, any]) => [id, node?.name ?? id]),
);
const CATEGORY: Record<string, string> = {
  projectile: '弹道', control: '控制', domain: '领域', economy: '经济', defense: '防御',
};

function blockText(binding: any): string {
  const block = formatBinding(binding);
  return `${block.trigger} → ${block.lines.map((line: any) => `${'　'.repeat(line.depth ?? 0)}${line.text}`).join('；')}`;
}

function consumable(def: CardDef, star: 1 | 3 | 6): string {
  try {
    const tier = resolveConsumableTier(def, star);
    const parts: string[] = [];
    if (tier.radius != null) parts.push(`半径 ${tier.radius}`);
    if (tier.duration != null) parts.push(`持续 ${tier.duration}s`);
    const lines = tier.effects.flatMap((effect: any) => {
      const block = formatBinding({ trigger: 'passive', effects: [effect] } as any);
      return block.lines.map((line: any) => line.text);
    });
    return [...parts, ...lines].join('；') || '（无）';
  } catch {
    return '（该档未定义）';
  }
}

const out: string[] = [];
out.push('# ProjectVL 文案工单（全量自包含）');
out.push('');
out.push(`> 由 \`scripts/exportCopyWorkOrder.ts\` 从当前代码库生成，机制句与游戏内「精确效果」显示完全一致。`);
out.push('> 每个「当前文案」块下的 JSON 路径即 `src/data/texts.json` 内的写入位置。');
out.push('');
out.push('## 神祇');
out.push('');
out.push('| id | 当前名 | 当前主题描述 | JSON 路径 |');
out.push('|---|---|---|---|');
for (const god of cfg.gods.gods) {
  const node = T.gods?.[god.id] ?? {};
  out.push(`| ${god.id} | ${node.name ?? ''} | ${node.theme ?? ''} | \`gods.${god.id}\` |`);
}
out.push('');

const cards = [...cfg.skills.cards].sort((a, b) => {
  const ra = a.recipeOnly ? 1 : 0;
  const rb = b.recipeOnly ? 1 : 0;
  if (ra !== rb) return ra - rb;
  return String(a.god).localeCompare(String(b.god));
});

for (const def of cards) {
  const copy = T.cards?.[def.id] ?? {};
  out.push('---');
  out.push('');
  out.push(`## ${def.recipeOnly ? '[配方产物] ' : ''}\`${def.id}\` — 当前名「${copy.name ?? ''}」`);
  out.push('');
  out.push(`- 神：${GOD_NAME[String(def.god)] ?? def.god ?? '中立'}（\`${def.god ?? '-'}\`）　类别：${CATEGORY[def.category] ?? def.category}　标签：${(def.synergyTags ?? []).join(', ')}`);
  if ((def as Any).identityContract) out.push(`- 身份契约：${(def as Any).identityContract}`);
  out.push(`- 当前 overview：${copy.overview ?? '（缺失）'}`);
  out.push('');

  out.push('### 当前文案槽位');
  out.push('');
  out.push('| JSON 路径 | 当前值 |');
  out.push('|---|---|');
  out.push(`| \`cards.${def.id}.name\` | ${copy.name ?? ''} |`);
  out.push(`| \`cards.${def.id}.overview\` | ${copy.overview ?? ''} |`);
  for (const ctx of ['hand', 'equip'] as const) {
    for (const [tier, value] of Object.entries(copy[ctx]?.shortByTier ?? {})) {
      out.push(`| \`cards.${def.id}.${ctx}.shortByTier.${tier}\` | ${value} |`);
    }
    for (const [tier, value] of Object.entries<Any>(copy[ctx]?.milestones ?? {})) {
      out.push(`| \`cards.${def.id}.${ctx}.milestones.${tier}\` | **${value.title}** / ${value.detail} （fx: ${value.fx}） |`);
    }
  }
  out.push('');

  out.push('### 消耗态精确效果（拖到战场释放）');
  out.push('');
  for (const star of [1, 3, 6] as const) out.push(`- **${star}★**：${consumable(def, star)}`);
  out.push('');

  if (def.recipeOnly) {
    const bindings = (def as Any).stars?.['6']?.equip ?? (def as Any).equip ?? [];
    out.push('### 装备态精确效果（终极形态）');
    out.push('');
    for (const binding of bindings) out.push(`- ${blockText(binding)}`);
    out.push('');
    continue;
  }

  for (const checkpoint of def.evolutionTree?.checkpoints ?? []) {
    out.push(`### ${checkpoint.star}★ 分支（三选一）`);
    out.push('');
    for (const option of checkpoint.options) {
      const branch = T.evolution?.[def.id]?.[option.id] ?? {};
      out.push(`#### \`${option.id}\` — 当前分支名「${branch.name ?? ''}」${(option as Any).interfaceRole ? `　接口角色：${(option as Any).interfaceRole}` : ''}`);
      out.push('');
      out.push('精确效果：');
      for (const binding of option.equip ?? []) out.push(`- ${blockText(binding)}`);
      out.push('');
      out.push('当前文案（问题样本）：');
      out.push('');
      out.push(`| 路径 | 当前值 |`);
      out.push(`|---|---|`);
      for (const field of ['name', 'summary', 'intent', 'keywords', 'buildFit']) {
        const value = Array.isArray(branch[field]) ? branch[field].join('、') : branch[field];
        if (value != null) out.push(`| \`evolution.${def.id}.${option.id}.${field}\` | ${String(value).replace(/\|/g, '\\|')} |`);
      }
      out.push('');
    }
  }

  for (const shared of def.evolutionTree?.sharedNodes ?? []) {
    out.push(`### ${shared.star}★ 公共节点`);
    out.push('');
    if ((shared as Any).amplify) out.push(`- 数值放大：${JSON.stringify((shared as Any).amplify)}`);
    for (const binding of (shared as Any).equip ?? []) out.push(`- ${blockText(binding)}`);
    out.push('');
  }
}

out.push('---');
out.push('');
out.push('## 其它文案域（全部需要改写）');
out.push('');
for (const domain of ['center', 'buttons', 'lanes', 'affixes', 'decisions', 'intermission', 'toast', 'wildcard', 'result', 'rewards', 'rewardReceipt', 'glossary', 'affixHelp', 'effectText', 'waveRewardStats'] as const) {
  out.push(`### \`${domain}\``);
  out.push('');
  out.push('```json');
  out.push(JSON.stringify(T[domain], null, 2));
  out.push('```');
  out.push('');
}
out.push('### `evolution` 顶层提示串');
out.push('');
out.push('```json');
out.push(JSON.stringify(Object.fromEntries(
  ['lockNotice', 'pending', 'nextCheckpoint', 'recipeCombatHint', 'recipeAsIngredient'].map(key => [key, T.evolution?.[key]]),
), null, 2));
out.push('```');

console.log(out.join('\n'));
