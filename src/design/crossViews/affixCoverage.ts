import type { CardDef } from '../../core/effects/defs';
import { AFFIX_SINKS } from '../../config/affixSinks';
import type { CardStatKind, RelicDef } from '../../config/types';
import { describeLabel } from '../../editor/labels';
import { el } from '../../editor/dom';

export interface AffixCoverageRow {
  axis: CardStatKind;
  label: string;
  relicCount: number;
  affixCount: number;
  unsupported: boolean;
}

export function analyzeAffixCoverage(cards: CardDef[], relics: RelicDef[]): AffixCoverageRow[] {
  return (Object.keys(AFFIX_SINKS) as CardStatKind[]).map(axis => ({
    axis,
    label: describeLabel('enumValue', `stat.${axis}`).label,
    relicCount: relics.reduce((sum, relic) => sum + relic.effects.filter(effect => effect.axis === axis).length, 0),
    affixCount: cards.reduce((sum, card) => sum + (card.affixPool?.candidates.filter(candidate => candidate.stat === axis).length ?? 0), 0),
    unsupported: AFFIX_SINKS[axis].equipment === 'unsupported',
  })).sort((a, b) => Number(b.unsupported) - Number(a.unsupported) || a.relicCount + a.affixCount - b.relicCount - b.affixCount);
}

export function renderAffixCoverageView(container: HTMLElement, cards: CardDef[], relics: RelicDef[]): void {
  container.replaceChildren();
  const rows = analyzeAffixCoverage(cards, relics);
  container.append(el('h1', '', '词条轴覆盖'));
  container.append(el('p', 'lede', `${rows.length} 个 CardStatKind；“装备不支持”来自 AFFIX_SINKS 的唯一权威契约。`));
  const table = el('table', 'data-table');
  const header = el('tr');
  header.append(el('th', '', '词条轴'), el('th', '', '遗物效果数'), el('th', '', '卡牌词条池数'), el('th', '', '装备落点'));
  const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr', row.unsupported ? 'is-warning' : '');
    tr.append(
      el('th', '', `${row.label}（${row.axis}）`),
      el('td', '', String(row.relicCount)),
      el('td', '', String(row.affixCount)),
      el('td', row.unsupported ? 'warning-text' : '', row.unsupported ? '警示：unsupported' : AFFIX_SINKS[row.axis].equipment),
    );
    body.append(tr);
  }
  table.append(body);
  container.append(table);
}
