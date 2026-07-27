import { TRIGGER_NAMES } from '../core/effects/atomContract';
import type { BindingDef, CardDef, StarTierDef, Trigger } from '../core/effects/defs';
import type { SkillsConfig } from '../config/types';
import { button, el, labeled, selectControl } from './dom';
import { entityTextTitle, renderEntityTextSection } from './entityTextEditor';
import { allowedTriggersForEffects, renderEffectsEditor } from './effectEditor';
import { describeLabel, labelWithKey } from './labels';
import type { ReferenceCatalog } from './references';
import { renderTreeEditor } from './treeEditor';

interface SkillsEditorOptions {
  texts: Record<string, unknown>;
  references: ReferenceCatalog;
  onChange: () => void;
  onTextsChange: () => void;
}

const CATEGORIES = ['projectile', 'control', 'domain', 'economy', 'defense'] as const;
const TIERS: Array<keyof CardDef['stars']> = ['3', '5', '6'];

const enumOption = (group: string) => (value: string): string => labelWithKey('enumValue', `${group}.${value}`, value);
const fieldLabel = (field: string): string => labelWithKey('domainField', `skills.${field}`, field);
/** 卡片显示名：有中文文案就用「中文（id）」，否则退回 id。 */
function cardTitle(texts: Record<string, unknown>, card: CardDef): string {
  return entityTextTitle(texts, card.textKey, card.id);
}

function inputField(
  labelText: string,
  value: string,
  path: string,
  onInput: (value: string) => void,
): HTMLElement {
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return labeled(labelText, input, path);
}

function renderBindings(
  container: HTMLElement,
  bindings: BindingDef[],
  path: string,
  options: SkillsEditorOptions,
): void {
  const render = (): void => {
    container.replaceChildren();
    bindings.forEach((binding, bindingIndex) => {
      const bindingPath = `${path}[${bindingIndex}]`;
      const card = el('article', 'binding-card');
      card.dataset.configPath = bindingPath;
      const heading = el('div', 'binding-card__heading');
      heading.append(el('h4', '', `绑定 ${bindingIndex + 1}`));
      const remove = button('删除绑定', 'button button--danger button--small');
      remove.addEventListener('click', () => { bindings.splice(bindingIndex, 1); render(); options.onChange(); });
      heading.append(remove);
      card.append(heading);

      const allowed = allowedTriggersForEffects(binding.effects);
      const trigger = selectControl(allowed, binding.trigger, false, enumOption('trigger'));
      trigger.disabled = allowed.length === 0;
      trigger.addEventListener('change', () => { binding.trigger = trigger.value as Trigger; render(); options.onChange(); });
      card.append(labeled(`${fieldLabel('trigger')} · 原子允许范围的交集`, trigger, `${bindingPath}.trigger`));
      if (!allowed.length) card.append(el('p', 'callout callout--error', '当前效果原子没有共同触发器，请拆成多个绑定。'));
      else if (!allowed.includes(binding.trigger)) card.append(el('p', 'callout callout--error', `当前 ${binding.trigger} 不在交集中，请改为 ${allowed.join(' / ')}。`));

      const triggerParams = el('details', 'subtree');
      triggerParams.open = Boolean(binding.triggerParams);
      triggerParams.append(el('summary', '', fieldLabel('triggerParams')));
      const paramsBody = el('div', 'subtree__body');
      if (!binding.triggerParams) {
        const addParams = button('添加 triggerParams', 'button button--quiet button--small');
        addParams.addEventListener('click', () => { binding.triggerParams = {}; render(); options.onChange(); });
        paramsBody.append(addParams);
      } else {
        renderTreeEditor(paramsBody, binding.triggerParams, {
          path: `${bindingPath}.triggerParams`, references: options.references, onChange: options.onChange,
        });
        const clear = button('删除 triggerParams', 'button button--danger button--small');
        clear.addEventListener('click', () => { delete binding.triggerParams; render(); options.onChange(); });
        paramsBody.prepend(clear);
      }
      triggerParams.append(paramsBody);
      card.append(triggerParams);

      const effects = el('div', 'effects-list');
      renderEffectsEditor(effects, binding.effects, {
        path: `${bindingPath}.effects`,
        mode: 'equip',
        trigger: binding.trigger,
        references: options.references,
        onChange: options.onChange,
        onStructureChange: render,
      });
      card.append(effects);
      container.append(card);
    });
    const add = button('＋ 添加绑定', 'button button--add');
    add.addEventListener('click', () => {
      bindings.push({ trigger: TRIGGER_NAMES[0], effects: [] });
      render();
      options.onChange();
    });
    container.append(add);
  };
  render();
}

function newTier(key: keyof CardDef['stars']): StarTierDef {
  return { tier: key === '3' ? 'core' : key === '5' ? 'dual' : 'transform', equip: [] };
}

function renderStars(container: HTMLElement, card: CardDef, cardPath: string, options: SkillsEditorOptions): void {
  for (const key of TIERS) {
    const section = el('section', 'form-section');
    const heading = el('div', 'form-section__heading');
    heading.append(el('h3', '', `${key}★ 装备态`));
    const tier = card.stars[key];
    if (!tier) {
      const add = button(`添加 ${key}★`, 'button button--quiet');
      add.addEventListener('click', () => {
        card.stars[key] = newTier(key) as never;
        container.replaceChildren();
        renderStars(container, card, cardPath, options);
        options.onChange();
      });
      heading.append(add);
      section.append(heading);
      container.append(section);
      continue;
    }
    if (key !== '6') {
      const remove = button(`删除 ${key}★`, 'button button--danger button--small');
      remove.addEventListener('click', () => {
        delete card.stars[key];
        container.replaceChildren();
        renderStars(container, card, cardPath, options);
        options.onChange();
      });
      heading.append(remove);
    }
    section.append(heading);
    const tierSelect = selectControl(['core', 'dual', 'transform'], tier.tier, false, enumOption('tier'));
    tierSelect.addEventListener('change', () => { tier.tier = tierSelect.value as StarTierDef['tier']; options.onChange(); });
    section.append(labeled(fieldLabel('tier'), tierSelect, `${cardPath}.stars.${key}.tier`));
    const bindings = el('div', 'bindings-list');
    renderBindings(bindings, tier.equip, `${cardPath}.stars.${key}.equip`, options);
    section.append(bindings);
    container.append(section);
  }
}

function renderConsumable(container: HTMLElement, card: CardDef, cardPath: string, options: SkillsEditorOptions): void {
  const anchors = card.consumable.anchors;
  for (const key of ['1', '3', '6'] as const) {
    const anchor = anchors[key];
    const section = el('section', 'form-section form-section--compact');
    section.append(el('h4', '', `${key}★ 消耗态`));
    const metrics = el('div', 'inline-fields');
    for (const name of ['radius', 'duration'] as const) {
      const input = el('input');
      input.type = 'number';
      input.step = 'any';
      input.placeholder = '未设置';
      if (anchor[name] !== undefined) input.value = String(anchor[name]);
      input.addEventListener('input', () => {
        if (input.value === '') delete anchor[name]; else anchor[name] = input.valueAsNumber;
        options.onChange();
      });
      metrics.append(labeled(fieldLabel(name), input, `${cardPath}.consumable.anchors.${key}.${name}`));
    }
    section.append(metrics);
    const effects = el('div', 'effects-list');
    renderEffectsEditor(effects, anchor.effects, {
      path: `${cardPath}.consumable.anchors.${key}.effects`,
      mode: 'consume',
      references: options.references,
      onChange: options.onChange,
    });
    section.append(effects);
    container.append(section);
  }
}

function renderCard(container: HTMLElement, card: CardDef, cardIndex: number, options: SkillsEditorOptions): void {
  container.replaceChildren();
  const path = `$.skills.cards[${cardIndex}]`;
  const header = el('div', 'detail-heading');
  const godName = card.god ? describeLabel('enumValue', `god.${card.god}`).label : '无神';
  header.append(
    el('div', '', cardTitle(options.texts, card)),
    el('span', 'status-badge', `${describeLabel('enumValue', `category.${card.category}`).label} · ${godName}`),
  );
  container.append(header);

  const basics = el('section', 'form-section');
  basics.append(el('h3', '', '卡片基础'));
  const grid = el('div', 'field-grid');
  grid.append(inputField(fieldLabel('id'), card.id, `${path}.id`, value => { card.id = value; options.onChange(); }));
  const god = selectControl(options.references.gods, card.god, true, enumOption('god'));
  god.addEventListener('change', () => { if (god.value) card.god = god.value; else delete card.god; options.onChange(); });
  grid.append(labeled(fieldLabel('god'), god, `${path}.god`));
  const category = selectControl(CATEGORIES, card.category, false, enumOption('category'));
  category.addEventListener('change', () => { card.category = category.value as CardDef['category']; options.onChange(); });
  grid.append(labeled(fieldLabel('category'), category, `${path}.category`));
  const textKey = selectControl(options.references.textKeys, card.textKey);
  textKey.addEventListener('change', () => { card.textKey = textKey.value; options.onChange(); });
  grid.append(labeled(fieldLabel('textKey'), textKey, `${path}.textKey`));
  const teaching = el('input');
  teaching.type = 'checkbox';
  teaching.checked = card.teaching;
  teaching.addEventListener('change', () => { card.teaching = teaching.checked; options.onChange(); });
  grid.append(labeled(fieldLabel('teaching'), teaching, `${path}.teaching`));
  basics.append(grid);

  const tags = el('div', 'choice-row');
  for (const tag of options.references.tags) {
    const label = el('label', 'choice-chip');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = card.synergyTags.includes(tag as never);
    check.addEventListener('change', () => {
      if (check.checked && !card.synergyTags.includes(tag as never)) card.synergyTags.push(tag as never);
      if (!check.checked) card.synergyTags = card.synergyTags.filter(item => item !== tag);
      options.onChange();
    });
    label.append(check, document.createTextNode(tag));
    tags.append(label);
  }
  const tagField = labeled(fieldLabel('synergyTags'), tags, `${path}.synergyTags`);
  basics.append(tagField);
  container.append(basics);

  renderEntityTextSection(container, {
    texts: options.texts,
    textKey: card.textKey,
    onChange: options.onTextsChange,
  });

  const stars = el('div');
  renderStars(stars, card, path, options);
  container.append(stars);

  const consume = el('details', 'major-section');
  consume.append(el('summary', '', '消耗态 anchors（1★ / 3★ / 6★）'));
  const consumeBody = el('div', 'major-section__body');
  renderConsumable(consumeBody, card, path, options);
  consume.append(consumeBody);
  container.append(consume);

  const advanced = el('details', 'major-section');
  advanced.append(el('summary', '', '高级结构：amplify / evolution / affix / fusion'));
  const advancedBody = el('div', 'major-section__body');
  advancedBody.append(el('p', 'callout callout--warning', 'fusionPolicy 未实现，暂不建议填写；现有值仅作结构预留。'));
  const advancedTree = el('div');
  const advancedValue: Record<string, unknown> = {
    amplifyAxis: card.amplifyAxis,
    ...(card.evolutionTree ? { evolutionTree: card.evolutionTree } : {}),
    ...(card.affixPool ? { affixPool: card.affixPool } : {}),
    ...(card.fusionPolicy ? { fusionPolicy: card.fusionPolicy } : {}),
  };
  renderTreeEditor(advancedTree, advancedValue, {
    path,
    references: options.references,
    onChange: () => {
      card.amplifyAxis = advancedValue.amplifyAxis as CardDef['amplifyAxis'];
      if ('evolutionTree' in advancedValue) card.evolutionTree = advancedValue.evolutionTree as CardDef['evolutionTree']; else delete card.evolutionTree;
      if ('affixPool' in advancedValue) card.affixPool = advancedValue.affixPool as CardDef['affixPool']; else delete card.affixPool;
      if ('fusionPolicy' in advancedValue) card.fusionPolicy = advancedValue.fusionPolicy as CardDef['fusionPolicy']; else delete card.fusionPolicy;
      options.onChange();
    },
  });
  advancedBody.append(advancedTree);
  advanced.append(advancedBody);
  container.append(advanced);
}

export function renderSkillsEditor(container: HTMLElement, config: SkillsConfig, options: SkillsEditorOptions): void {
  container.replaceChildren();
  const layout = el('div', 'skills-layout');
  const sidebar = el('aside', 'card-browser');
  const filters = el('div', 'card-filters');
  const query = el('input');
  query.type = 'search';
  query.placeholder = '搜索 中文名 / id / god / category / tag';
  const god = selectControl(options.references.gods, undefined, true, enumOption('god'));
  god.options[0].text = '全部神';
  const category = selectControl(CATEGORIES, undefined, true, enumOption('category'));
  category.options[0].text = '全部类别';
  filters.append(query, god, category);
  const list = el('div', 'card-list');
  sidebar.append(filters, list);
  const detail = el('div', 'card-detail');
  layout.append(sidebar, detail);
  container.append(layout);

  let selected = 0;
  const renderList = (): void => {
    list.replaceChildren();
    const needle = query.value.trim().toLowerCase();
    config.cards.forEach((card, index) => {
      const name = cardTitle(options.texts, card);
      const haystack = [name, card.id, card.god, card.category, ...card.synergyTags].join(' ').toLowerCase();
      if (needle && !haystack.includes(needle)) return;
      if (god.value && card.god !== god.value) return;
      if (category.value && card.category !== category.value) return;
      const item = button('', `card-list__item${selected === index ? ' is-selected' : ''}`);
      const godName = card.god ? describeLabel('enumValue', `god.${card.god}`).label : '无神';
      item.append(
        el('strong', '', name),
        el('code', 'card-list__id', card.id),
        el('span', '', `${godName} · ${describeLabel('enumValue', `category.${card.category}`).label}`),
        el('small', '', card.synergyTags.join(' / ')),
      );
      item.addEventListener('click', () => { selected = index; renderList(); renderCard(detail, card, index, options); });
      list.append(item);
    });
  };
  query.addEventListener('input', renderList);
  god.addEventListener('change', renderList);
  category.addEventListener('change', renderList);
  renderList();
  if (config.cards[0]) renderCard(detail, config.cards[0], 0, options);
}
