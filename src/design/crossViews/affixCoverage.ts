import type { CardDef } from '../../core/effects/defs';
import { AFFIX_SINKS } from '../../config/affixSinks';
import type { CardAffixStatKind } from '../../config/types';
import { describeLabel } from '../../editor/labels';
import { el } from '../../editor/dom';

export interface AffixCoverageRow {
  axis: CardAffixStatKind;
  label: string;
  affixCount: number;
  source: string;
}

export function analyzeAffixCoverage(cards: CardDef[]): AffixCoverageRow[] {
  return (Object.keys(AFFIX_SINKS) as CardAffixStatKind[]).map(axis => ({
    axis,
    label: describeLabel('enumValue', `stat.${axis}`).label,
    affixCount: cards.reduce((sum, card) => sum + (card.affixPool?.candidates.filter(candidate => candidate.stat === axis).length ?? 0), 0),
    source: AFFIX_SINKS[axis].equipment === 'global'
      ? '装备全局 · 消耗限时'
      : '装备本卡 · 消耗限时',
  })).sort((a, b) => a.affixCount - b.affixCount);
}

export function renderAffixCoverageView(container: HTMLElement, cards: CardDef[]): void {
  container.replaceChildren();
  const rows = analyzeAffixCoverage(cards);
  container.append(el('h1', '', '词条轴覆盖'));
  container.append(el('p', 'lede', `${rows.length} 个 CardAffixStatKind；装备与限时来源均由 AFFIX_SINKS 统一声明。`));
  const table = el('table', 'data-table');
  const header = el('tr');
  header.append(el('th', '', '词条轴'), el('th', '', '卡牌词条池数'), el('th', '', '结算来源'));
  const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    tr.append(
      el('th', '', `${row.label}（${row.axis}）`),
      el('td', '', String(row.affixCount)),
      el('td', '', row.source),
    );
    body.append(tr);
  }
  table.append(body);
  container.append(table);
}
