import type { CardDef, EffectDef } from '../../core/effects/defs';
import type { DescribeContext } from '../describe';
import { describeCard, describeEffect } from '../describe';
import { el } from '../../editor/dom';

export interface PowerCell { star: 3 | 5 | 6; atoms: string[]; keyValues: string[] }
export interface PowerRow { cardId: string; cardName: string; cells: PowerCell[] }

function collectEffects(effects: EffectDef[]): EffectDef[] {
  return effects.flatMap(effect => {
    const nested = (effect.params as { effects?: EffectDef[] } | undefined)?.effects ?? [];
    return [effect, ...collectEffects(nested)];
  });
}

export function buildGodPowerGrid(cards: CardDef[], godId: string, ctx: DescribeContext): PowerRow[] {
  return cards.filter(card => card.god === godId).map(card => {
    const view = describeCard(card, ctx);
    const cells = ([3, 5, 6] as const).map(star => {
      const tier = card.stars[String(star) as '3' | '5' | '6'];
      const effects = tier ? tier.equip.flatMap(binding => collectEffects(binding.effects)) : [];
      const atoms = [...new Set(effects.map(effect => describeEffect(effect).label))];
      const keyValues = effects.flatMap(effect => describeEffect(effect).params
        .filter(param => typeof (effect.params as Record<string, unknown> | undefined)?.[param.key] === 'number')
        .slice(0, 3)
        .map(param => `${param.label}=${param.value}`));
      return { star, atoms, keyValues };
    });
    return { cardId: card.id, cardName: view.name, cells };
  });
}

export function renderPowerGridView(container: HTMLElement, cards: CardDef[], ctx: DescribeContext, initialGodId: string, openCard: (id: string) => void): void {
  container.replaceChildren();
  container.append(el('h1', '', '星级功率对照'));
  const select = el('select');
  for (const god of ctx.gods.gods) {
    const option = el('option', '', `${describeCardNameForGod(god.id, ctx)}（${god.id}）`);
    option.value = god.id;
    option.selected = god.id === initialGodId;
    select.append(option);
  }
  const grid = el('div');
  const render = (): void => {
    grid.replaceChildren();
    const table = el('table', 'data-table power-table');
    const header = el('tr');
    header.append(el('th', '', '卡牌'), ...([3, 5, 6] as const).map(star => el('th', '', `${star}★`)));
    const thead = el('thead'); thead.append(header); table.append(thead);
    const body = el('tbody');
    for (const row of buildGodPowerGrid(cards, select.value, ctx)) {
      const tr = el('tr');
      const link = el('button', 'table-link', `${row.cardName}（${row.cardId}）`);
      link.type = 'button';
      link.addEventListener('click', () => openCard(row.cardId));
      const title = el('td'); title.append(link); tr.append(title);
      for (const cell of row.cells) {
        const td = el('td');
        td.append(el('strong', '', cell.atoms.join('、') || '—'));
        td.append(el('small', '', cell.keyValues.join('；') || '无数值参数'));
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    grid.append(table);
  };
  select.addEventListener('change', render);
  container.append(el('label', 'inline-select', '选择神：'), select, grid);
  render();
}

function describeCardNameForGod(godId: string, ctx: DescribeContext): string {
  const node = (ctx.texts.gods as Record<string, { name?: string }> | undefined)?.[godId];
  return node?.name || godId;
}
