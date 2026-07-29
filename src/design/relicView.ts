import type { RelicDef } from '../config/types';
import { el } from '../editor/dom';
import type { DescribeContext } from './describe';
import { describeRelic } from './describe';
import { editableTextBlock, type TextEditingOptions } from './textEditing';

export function renderRelicView(container: HTMLElement, relic: RelicDef, ctx: DescribeContext, relicIndex?: number, editing?: TextEditingOptions): void {
  container.replaceChildren();
  const view = describeRelic(relic, ctx);
  const article = el('article', 'entity-sheet relic-sheet card-block');
  article.dataset.entityKind = 'relic'; article.dataset.entityId = relic.id;
  article.dataset.configPath = relicIndex === undefined ? '$.relics.relics' : `$.relics.relics[${relicIndex}]`;
  const heading = el('h1', '', view.name || '缺失名称'); heading.append(el('code', '', view.id));
  const badges = el('div', 'badge-row'); badges.append(el('span', 'badge badge--rarity', view.rarityLabel), ...view.tagLabels.map(label => el('span', 'badge badge--tag', label)), el('span', 'badge', view.godId ? `专属：${view.godId}` : '通用遗物'));
  article.append(
    editableTextBlock(heading, [{ path: `$.texts.relics.${view.id}.name`, label: '遗物名称' }], editing, 'title-copy-editor'),
    badges,
    editableTextBlock(el('p', view.desc ? 'overview' : 'overview missing-copy', view.desc || '缺失：desc'), [{ path: `$.texts.relics.${view.id}.desc`, label: '遗物描述', multiline: true }], editing, 'overview-copy-editor'),
  );
  const table = el('table', 'data-table'); const header = el('tr'); header.append(el('th', '', '作用轴'), el('th', '', '数值'), el('th', '', '目标标签')); const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody'); view.effects.forEach(effect => { const tr = el('tr'); tr.append(el('th', '', `${effect.axisLabel}（${effect.axis}）`), el('td', '', String(effect.value)), el('td', '', view.tagLabels.join('、') || '无')); body.append(tr); }); table.append(body);
  article.append(el('h2', '', '构筑效果'), table, el('p', '', `最大叠加：${view.maxStacks} 层`));
  const pool = el('section', 'card-block'); pool.append(el('h2', '', '池影响'));
  if (!view.poolInfluence) pool.append(el('p', 'empty-state', '无 poolInfluence'));
  else Object.entries(view.poolInfluence).forEach(([key, value]) => pool.append(el('p', '', `${key}：${value}`)));
  article.append(pool); container.append(article);
}
