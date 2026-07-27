import type { GodDef, GodsConfig } from '../config/types';
import { button, el, labeled, numberControl, selectControl } from './dom';
import {
  entityTextTitle, renderEntityTextSection,
  type EntityTextChangeHandlers,
} from './entityTextEditor';
import { cardLabel, labelWithKey } from './labels';
import type { ReferenceCatalog } from './references';

interface GodsEditorOptions extends EntityTextChangeHandlers {
  texts: Record<string, unknown>;
  references: ReferenceCatalog;
}

const fieldLabel = (field: string): string => labelWithKey('domainField', `gods.${field}`, field);

function cardChoices(
  cards: readonly string[],
  current: string[],
  onChange: () => void,
): HTMLElement {
  const row = el('div', 'choice-row');
  for (const cardId of cards) {
    const label = el('label', 'choice-chip');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = current.includes(cardId);
    check.addEventListener('change', () => {
      if (check.checked && !current.includes(cardId)) current.push(cardId);
      if (!check.checked) current.splice(0, current.length, ...current.filter(value => value !== cardId));
      onChange();
    });
    const cardName = cardLabel(cardId).label;
    label.append(check, document.createTextNode(cardName === cardId ? cardId : `${cardName}（${cardId}）`));
    row.append(label);
  }
  return row;
}

function renderGod(
  container: HTMLElement,
  god: GodDef,
  index: number,
  config: GodsConfig,
  options: GodsEditorOptions,
): void {
  container.replaceChildren();
  const path = `$.gods.gods[${index}]`;
  container.dataset.configPath = path;
  container.append(el('div', 'detail-heading', entityTextTitle(options.texts, god.textKey, god.id)));

  const basics = el('section', 'form-section');
  basics.append(el('h3', '', '神祇基础'));
  const grid = el('div', 'field-grid');
  const id = el('input');
  id.value = god.id;
  id.addEventListener('input', () => { god.id = id.value; options.onEntityChange(); });
  grid.append(labeled(fieldLabel('id'), id, `${path}.id`));
  const textKey = selectControl([...new Set(config.gods.map(item => item.textKey))], god.textKey);
  textKey.addEventListener('change', () => {
    god.textKey = textKey.value;
    options.onEntityChange();
    renderGod(container, god, index, config, options);
  });
  grid.append(labeled(fieldLabel('textKey'), textKey, `${path}.textKey`));
  for (const key of ['mainRosterSize', 'subRosterSize'] as const) {
    const size = numberControl(god[key], 0, undefined, 1);
    size.addEventListener('input', () => { god[key] = size.valueAsNumber; options.onEntityChange(); });
    grid.append(labeled(fieldLabel(key), size, `${path}.${key}`));
  }
  basics.append(grid);
  container.append(basics);

  renderEntityTextSection(container, {
    texts: options.texts,
    textKey: god.textKey,
    onChange: options.onTextsChange,
  });

  for (const key of ['anchorCardIds', 'variableCardIds'] as const) {
    const section = el('section', 'form-section');
    section.dataset.configPath = `${path}.${key}`;
    section.append(el('h3', '', fieldLabel(key)));
    section.append(cardChoices(options.references.cards, god[key], options.onEntityChange));
    container.append(section);
  }
}

export function renderGodsEditor(container: HTMLElement, config: GodsConfig, options: GodsEditorOptions): void {
  container.replaceChildren();
  const layout = el('div', 'skills-layout');
  const sidebar = el('aside', 'card-browser');
  const query = el('input');
  query.type = 'search';
  query.placeholder = '搜索神祇 中文名 / id / 卡 id';
  const list = el('div', 'card-list');
  sidebar.append(query, list);
  const detail = el('div', 'card-detail');
  layout.append(sidebar, detail);
  container.append(layout);
  let selected = 0;

  const renderList = (): void => {
    list.replaceChildren();
    const needle = query.value.trim().toLowerCase();
    config.gods.forEach((god, index) => {
      const title = entityTextTitle(options.texts, god.textKey, god.id);
      const haystack = [title, god.id, ...god.anchorCardIds, ...god.variableCardIds].join(' ').toLowerCase();
      if (needle && !haystack.includes(needle)) return;
      const item = button('', `card-list__item${selected === index ? ' is-selected' : ''}`);
      item.append(
        el('strong', '', title),
        el('code', 'card-list__id', god.id),
        el('small', '', `${god.anchorCardIds.length} 锚点 · ${god.variableCardIds.length} 可变卡`),
      );
      item.addEventListener('click', () => {
        selected = index;
        renderList();
        renderGod(detail, god, index, config, options);
      });
      list.append(item);
    });
  };
  query.addEventListener('input', renderList);
  renderList();
  if (config.gods[0]) renderGod(detail, config.gods[0], 0, config, options);
}
