import type { AtomName, BindingDef, CardDef, EffectDef } from '../../core/effects/defs';
import { ATOM_NAMES } from '../../core/effects/atomContract';
import { describeEffect } from '../describe';
import { el } from '../../editor/dom';

export interface EffectLocation { cardId: string; branch: string; path: string; effects: EffectDef[] }
export interface AtomUsageRow {
  atom: AtomName;
  label: string;
  cardCount: number;
  branchCount: number;
  instanceCount: number;
  locations: string[];
}

function bindingEffects(bindings: BindingDef[]): EffectDef[] { return bindings.flatMap(binding => binding.effects); }

export function cardEffectLocations(card: CardDef): EffectLocation[] {
  const locations: EffectLocation[] = [];
  for (const star of ['3', '5', '6'] as const) {
    const tier = card.stars[star];
    if (tier) locations.push({ cardId: card.id, branch: `stars.${star}`, path: `$.skills.cards.${card.id}.stars.${star}`, effects: bindingEffects(tier.equip) });
  }
  for (const [checkpointIndex, checkpoint] of (card.evolutionTree?.checkpoints ?? []).entries()) {
    for (const [optionIndex, option] of checkpoint.options.entries()) locations.push({
      cardId: card.id,
      branch: `${checkpoint.star}★ ${option.id}`,
      path: `$.skills.cards.${card.id}.evolutionTree.checkpoints[${checkpointIndex}].options[${optionIndex}]`,
      effects: bindingEffects(option.equip),
    });
  }
  for (const [nodeIndex, node] of (card.evolutionTree?.sharedNodes ?? []).entries()) if (node.equip) locations.push({
    cardId: card.id,
    branch: `${node.star}★ 公共`,
    path: `$.skills.cards.${card.id}.evolutionTree.sharedNodes[${nodeIndex}]`,
    effects: bindingEffects(node.equip),
  });
  for (const star of ['1', '3', '6'] as const) locations.push({
    cardId: card.id,
    branch: `消耗态 ${star}★`,
    path: `$.skills.cards.${card.id}.consumable.anchors.${star}`,
    effects: card.consumable.anchors[star].effects,
  });
  return locations;
}

function flattenEffects(effects: EffectDef[]): EffectDef[] {
  return effects.flatMap(effect => {
    const nested = (effect.params as { effects?: EffectDef[] } | undefined)?.effects ?? [];
    return [effect, ...flattenEffects(nested)];
  });
}

export function countAllEffectInstances(cards: CardDef[]): number {
  return cards.flatMap(cardEffectLocations).reduce((sum, location) => sum + flattenEffects(location.effects).length, 0);
}

export function analyzeAtomUsage(cards: CardDef[]): AtomUsageRow[] {
  const locations = cards.flatMap(cardEffectLocations);
  return ATOM_NAMES.map(atom => {
    const matching = locations.flatMap(location => {
      const count = flattenEffects(location.effects).filter(effect => effect.atom === atom).length;
      return count ? [{ location, count }] : [];
    });
    return {
      atom,
      label: describeEffect({ atom } as EffectDef).label,
      cardCount: new Set(matching.map(item => item.location.cardId)).size,
      branchCount: matching.length,
      instanceCount: matching.reduce((sum, item) => sum + item.count, 0),
      locations: matching.map(item => `${item.location.cardId} · ${item.location.branch}${item.count > 1 ? ` ×${item.count}` : ''}`),
    };
  }).sort((a, b) => a.cardCount - b.cardCount || a.label.localeCompare(b.label, 'zh-CN'));
}

export function renderAtomUsageView(container: HTMLElement, cards: CardDef[], openCard: (id: string) => void): void {
  container.replaceChildren();
  const rows = analyzeAtomUsage(cards);
  container.append(el('h1', '', '原子使用分布'));
  container.append(el('p', 'lede', `${ATOM_NAMES.length} 个效果原子；共 ${rows.reduce((sum, row) => sum + row.instanceCount, 0)} 个配置实例（含嵌套原子）。`));
  const table = el('table', 'data-table');
  const header = el('tr');
  header.append(el('th', '', '原子'), el('th', '', '卡数'), el('th', '', '分支/落点数'), el('th', '', '实例数'), el('th', '', '使用位置'));
  const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr', row.instanceCount ? '' : 'is-zero');
    tr.append(el('th', '', `${row.label}（${row.atom}）`), el('td', '', String(row.cardCount)), el('td', '', String(row.branchCount)), el('td', '', String(row.instanceCount)));
    const locations = el('td');
    if (!row.locations.length) locations.textContent = '零使用';
    else {
      const details = el('details');
      details.append(el('summary', '', `展开 ${row.locations.length} 个位置`));
      for (const location of row.locations) {
        const cardId = location.split(' · ')[0];
        const link = el('button', 'location-link', location);
        link.type = 'button';
        link.addEventListener('click', () => openCard(cardId));
        details.append(link);
      }
      locations.append(details);
    }
    tr.append(locations);
    body.append(tr);
  }
  table.append(body);
  container.append(table);
}
