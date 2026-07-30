import type { CardDef } from '../core/effects/defs';
import { ATOM_NAMES } from '../core/effects/atomContract';
import type { GodsConfig } from '../config/types';
import { button, el } from '../editor/dom';
import { describeLabel } from '../editor/labels';
import type { DescribeContext } from './describe';
import { describeCard } from './describe';
import { cardEffectLocations } from './crossViews/atomUsage';
import { cardHasCopyDebt } from './crossViews/copyCompleteness';

export type CrossViewId = 'homogeneity' | 'copy' | 'power' | 'atoms' | 'affixes';
export type DesignSelection =
  | { kind: 'god'; id: string }
  | { kind: 'card'; id: string };

export interface NavFilters {
  query: string;
  tag: string;
  category: string;
  atom: string;
  copyDebt: boolean;
  designNotes: boolean;
}

export interface NavTreeOptions {
  cards: CardDef[];
  gods: GodsConfig;
  ctx: DescribeContext;
  filters: NavFilters;
  selection: DesignSelection;
  crossView?: CrossViewId;
  onSelect: (selection: DesignSelection) => void;
  onCrossView: (view: CrossViewId) => void;
}

function allAtoms(card: CardDef): Set<string> {
  const output = new Set<string>();
  const visit = (effect: { atom: string; params?: unknown }): void => {
    output.add(effect.atom);
    const nested = (effect.params as { effects?: Array<{ atom: string; params?: unknown }> } | undefined)?.effects ?? [];
    nested.forEach(visit);
  };
  cardEffectLocations(card).forEach(location => location.effects.forEach(visit));
  return output;
}

function selectFilter(label: string, values: string[], current: string, format: (value: string) => string, onChange: (value: string) => void): HTMLElement {
  const wrap = el('label', 'nav-filter');
  wrap.append(el('span', '', label));
  const select = el('select');
  const all = el('option', '', '全部'); all.value = ''; select.append(all);
  values.forEach(value => {
    const option = el('option', '', format(value));
    option.value = value;
    option.selected = value === current;
    select.append(option);
  });
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function navItem(text: string, selected: boolean, onClick: () => void, meta?: string): HTMLButtonElement {
  const item = button('', `design-nav__item${selected ? ' is-selected' : ''}`);
  item.append(el('strong', '', text));
  if (meta) item.append(el('small', '', meta));
  item.addEventListener('click', onClick);
  return item;
}

export function renderNavTree(container: HTMLElement, options: NavTreeOptions): void {
  container.replaceChildren();
  const cross = el('nav', 'cross-nav');
  const crossViews: Array<[CrossViewId, string]> = [
    ['homogeneity', '分支同质化'], ['copy', '文案完整性'], ['power', '星级功率'], ['atoms', '原子分布'], ['affixes', '词条覆盖'],
  ];
  crossViews.forEach(([id, label]) => {
    const control = button(label, `cross-nav__item${options.crossView === id ? ' is-selected' : ''}`);
    control.addEventListener('click', () => options.onCrossView(id));
    cross.append(control);
  });
  container.append(el('h2', 'nav-title', '横切视图'), cross, el('h2', 'nav-title', '内容树'));

  const filters = el('div', 'nav-filters');
  const search = el('input');
  search.type = 'search';
  search.placeholder = '搜索中文名 / id';
  search.value = options.filters.query;
  const rerender = (): void => renderNavTree(container, options);
  search.addEventListener('input', () => {
    options.filters.query = search.value;
    rerender();
    const next = container.querySelector<HTMLInputElement>('input[type="search"]');
    next?.focus();
    next?.setSelectionRange(next.value.length, next.value.length);
  });
  const tags = [...new Set(options.cards.flatMap(card => card.synergyTags))].sort();
  const categories = [...new Set(options.cards.map(card => card.category))].sort();
  filters.append(
    search,
    selectFilter('协同标签', tags, options.filters.tag, value => describeLabel('enumValue', `tag.${value}`).label, value => { options.filters.tag = value; rerender(); }),
    selectFilter('类别', categories, options.filters.category, value => describeLabel('enumValue', `category.${value}`).label, value => { options.filters.category = value; rerender(); }),
    selectFilter('效果原子', ATOM_NAMES, options.filters.atom, value => describeLabel('atom', value).label, value => { options.filters.atom = value; rerender(); }),
  );
  for (const [key, label] of [['copyDebt', '文案缺失 / 占位'], ['designNotes', '有 designNotes']] as const) {
    const row = el('label', 'check-filter');
    const input = el('input'); input.type = 'checkbox'; input.checked = options.filters[key];
    input.addEventListener('change', () => { options.filters[key] = input.checked; rerender(); });
    row.append(input, el('span', '', label)); filters.append(row);
  }
  container.append(filters);

  const needle = options.filters.query.trim().toLocaleLowerCase('zh-CN');
  const cards = options.cards.filter(card => {
    const view = describeCard(card, options.ctx);
    if (needle && !`${view.name} ${view.id}`.toLocaleLowerCase('zh-CN').includes(needle)) return false;
    if (options.filters.tag && !card.synergyTags.includes(options.filters.tag as CardDef['synergyTags'][number])) return false;
    if (options.filters.category && card.category !== options.filters.category) return false;
    if (options.filters.atom && !allAtoms(card).has(options.filters.atom)) return false;
    if (options.filters.copyDebt && !cardHasCopyDebt(card, options.ctx.texts)) return false;
    if (options.filters.designNotes && !card.designNotes?.trim()) return false;
    return true;
  });

  const tree = el('div', 'design-nav__tree');
  const unfiltered = !needle && !options.filters.tag && !options.filters.category && !options.filters.atom && !options.filters.copyDebt && !options.filters.designNotes;
  for (const god of options.gods.gods) {
    const section = el('section', 'nav-group');
    const godName = (options.ctx.texts.gods as Record<string, { name?: string }> | undefined)?.[god.id]?.name || god.id;
    if (unfiltered) section.append(navItem(`${godName}（${god.id}）`, options.selection.kind === 'god' && options.selection.id === god.id, () => options.onSelect({ kind: 'god', id: god.id }), '设计主题与名册'));
    const anchors = cards.filter(card => god.anchorCardIds.includes(card.id));
    const variables = cards.filter(card => god.variableCardIds.includes(card.id));
    const appendSubgroup = (label: string, items: HTMLElement[]): void => {
      if (!items.length) return;
      section.append(el('h3', 'nav-subtitle', label), ...items);
    };
    appendSubgroup('锚点卡', anchors.map(card => {
      const view = describeCard(card, options.ctx);
      return navItem(view.name || card.id, options.selection.kind === 'card' && options.selection.id === card.id, () => options.onSelect({ kind: 'card', id: card.id }), card.id);
    }));
    appendSubgroup('可变卡', variables.map(card => {
      const view = describeCard(card, options.ctx);
      return navItem(view.name || card.id, options.selection.kind === 'card' && options.selection.id === card.id, () => options.onSelect({ kind: 'card', id: card.id }), card.id);
    }));
    if (section.childElementCount) tree.append(section);
  }
  const fusion = cards.filter(card => card.recipeOnly);
  if (fusion.length) {
    const section = el('section', 'nav-group'); section.append(el('h3', 'nav-group__title', '融合卡'));
    fusion.forEach(card => { const view = describeCard(card, options.ctx); section.append(navItem(view.name || card.id, options.selection.kind === 'card' && options.selection.id === card.id, () => options.onSelect({ kind: 'card', id: card.id }), view.recipe ? `${view.recipe.a.name} + ${view.recipe.b.name}` : card.id)); });
    tree.append(section);
  }
  if (!tree.childElementCount) tree.append(el('p', 'empty-state', '没有符合筛选条件的内容。'));
  container.append(tree);
}
