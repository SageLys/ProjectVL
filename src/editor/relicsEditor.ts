import type { BuildScalingAxis, RelicDef, RelicsConfig } from '../config/types';
import { button, el, labeled, numberControl, selectControl } from './dom';
import { entityTextTitle, renderEntityTextSection } from './entityTextEditor';
import { describeLabel, labelWithKey } from './labels';
import type { ReferenceCatalog } from './references';

interface RelicsEditorOptions {
  texts: Record<string, unknown>;
  references: ReferenceCatalog;
  onRelicsChange: () => void;
  onTextsChange: () => void;
}

const RARITIES = ['common', 'rare', 'epic'] as const;

const enumOption = (group: string) => (value: string): string => labelWithKey('enumValue', `${group}.${value}`, value);
const fieldLabel = (field: string): string => labelWithKey('domainField', `relics.${field}`, field);

function relicTitle(texts: Record<string, unknown>, relic: RelicDef): string {
  return entityTextTitle(texts, relic.textKey, relic.id);
}

function tagChoices(tags: readonly string[], current: string[], onChange: (tags: string[]) => void): HTMLElement {
  const row = el('div', 'choice-row');
  for (const tag of tags) {
    const label = el('label', 'choice-chip');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = current.includes(tag);
    check.addEventListener('change', () => {
      const next = check.checked ? [...new Set([...current, tag])] : current.filter(item => item !== tag);
      current.splice(0, current.length, ...next);
      onChange(current);
    });
    label.append(check, document.createTextNode(tag));
    row.append(label);
  }
  return row;
}

function renderRelic(
  container: HTMLElement,
  relic: RelicDef,
  index: number,
  config: RelicsConfig,
  options: RelicsEditorOptions,
  rerenderList: () => void,
): void {
  container.replaceChildren();
  const path = `$.relics.relics[${index}]`;
  container.dataset.configPath = path;
  const heading = el('div', 'detail-heading');
  heading.append(
    el('div', '', relicTitle(options.texts, relic)),
    el('span', 'status-badge', describeLabel('enumValue', `rarity.${relic.rarity}`).label),
  );
  const remove = button('删除遗物', 'button button--danger');
  remove.addEventListener('click', () => {
    config.relics.splice(index, 1);
    options.onRelicsChange();
    rerenderList();
  });
  heading.append(remove);
  container.append(heading);

  const grid = el('div', 'field-grid');
  const id = el('input');
  id.value = relic.id;
  id.addEventListener('input', () => { relic.id = id.value; options.onRelicsChange(); });
  grid.append(labeled(fieldLabel('id'), id, `${path}.id`));
  const god = selectControl(options.references.gods, relic.god, true, enumOption('god'));
  god.addEventListener('change', () => { if (god.value) relic.god = god.value; else delete relic.god; options.onRelicsChange(); });
  grid.append(labeled(fieldLabel('god'), god, `${path}.god`));
  const rarity = selectControl(RARITIES, relic.rarity, false, enumOption('rarity'));
  rarity.addEventListener('change', () => { relic.rarity = rarity.value as RelicDef['rarity']; options.onRelicsChange(); });
  grid.append(labeled(fieldLabel('rarity'), rarity, `${path}.rarity`));
  const textKey = selectControl([...new Set(config.relics.map(item => item.textKey))], relic.textKey);
  textKey.addEventListener('change', () => { relic.textKey = textKey.value; options.onRelicsChange(); renderRelic(container, relic, index, config, options, rerenderList); });
  grid.append(labeled(fieldLabel('textKey'), textKey, `${path}.textKey`));
  const stacks = numberControl(relic.maxStacks, 1, undefined, 1);
  stacks.addEventListener('input', () => { relic.maxStacks = stacks.valueAsNumber; options.onRelicsChange(); });
  grid.append(labeled(fieldLabel('maxStacks'), stacks, `${path}.maxStacks`));
  container.append(grid);

  renderEntityTextSection(container, {
    texts: options.texts,
    textKey: relic.textKey,
    onChange: options.onTextsChange,
  });

  const target = el('section', 'form-section');
  target.append(el('h3', '', '目标标签'));
  target.append(tagChoices(options.references.tags, relic.targetTags, () => options.onRelicsChange()));
  target.dataset.configPath = `${path}.targetTags`;
  container.append(target);

  const axes = [...new Set(config.relics.flatMap(item => item.effects.map(effect => effect.axis)))];
  const effects = el('section', 'form-section');
  effects.append(el('h3', '', '构筑效果'));
  const renderEffects = (): void => {
    effects.querySelector('.relic-effects')?.remove();
    const list = el('div', 'relic-effects');
    relic.effects.forEach((effect, effectIndex) => {
      const effectPath = `${path}.effects[${effectIndex}]`;
      const row = el('article', 'relic-effect');
      row.dataset.configPath = effectPath;
      row.append(el('strong', '', `buildScaling ${effectIndex + 1}`));
      const axis = selectControl(axes, effect.axis, false, enumOption('stat'));
      axis.addEventListener('change', () => { effect.axis = axis.value as BuildScalingAxis; options.onRelicsChange(); });
      row.append(labeled(fieldLabel('axis'), axis, `${effectPath}.axis`));
      const axisHelp = describeLabel('enumValue', `stat.${effect.axis}`).help;
      if (axisHelp) row.append(el('small', 'param-note', axisHelp));
      const value = numberControl(effect.value);
      value.addEventListener('input', () => { effect.value = value.valueAsNumber; options.onRelicsChange(); });
      row.append(labeled(fieldLabel('value'), value, `${effectPath}.value`));
      row.append(labeled(fieldLabel('targetTags'), tagChoices(options.references.tags, effect.targetTags, () => options.onRelicsChange()), `${effectPath}.targetTags`));
      const del = button('删除效果', 'button button--danger button--small');
      del.addEventListener('click', () => { relic.effects.splice(effectIndex, 1); renderEffects(); options.onRelicsChange(); });
      row.append(del);
      list.append(row);
    });
    const add = button('＋ 添加构筑效果', 'button button--add');
    add.addEventListener('click', () => {
      relic.effects.push({ kind: 'buildScaling', targetTags: [], axis: axes[0] ?? 'effectDamageMul', value: 0 });
      renderEffects();
      options.onRelicsChange();
    });
    list.append(add);
    effects.append(list);
  };
  renderEffects();
  container.append(effects);

  const pool = el('section', 'form-section');
  pool.append(el('h3', '', '池影响'));
  if (!relic.poolInfluence) {
    const add = button('添加 poolInfluence', 'button button--quiet');
    add.addEventListener('click', () => { relic.poolInfluence = { godWeightAdd: 0 }; options.onRelicsChange(); renderRelic(container, relic, index, config, options, rerenderList); });
    pool.append(add);
  } else {
    for (const key of ['godWeightAdd', 'pityDrops'] as const) {
      const value = numberControl(relic.poolInfluence[key] ?? 0, undefined, undefined, 1);
      value.placeholder = key === 'pityDrops' ? '未设置' : '';
      if (key === 'pityDrops' && relic.poolInfluence[key] === undefined) value.value = '';
      value.addEventListener('input', () => {
        if (key === 'pityDrops' && value.value === '') delete relic.poolInfluence?.pityDrops;
        else if (relic.poolInfluence) relic.poolInfluence[key] = value.valueAsNumber;
        options.onRelicsChange();
      });
      pool.append(labeled(fieldLabel(key), value, `${path}.poolInfluence.${key}`));
    }
    const clear = button('删除 poolInfluence', 'button button--danger button--small');
    clear.addEventListener('click', () => { delete relic.poolInfluence; options.onRelicsChange(); renderRelic(container, relic, index, config, options, rerenderList); });
    pool.append(clear);
  }
  container.append(pool);
}

export function renderRelicsEditor(container: HTMLElement, config: RelicsConfig, options: RelicsEditorOptions): void {
  container.replaceChildren();
  const layout = el('div', 'skills-layout');
  const sidebar = el('aside', 'card-browser');
  const query = el('input');
  query.type = 'search';
  query.placeholder = '搜索遗物 中文名 / id / god / rarity / tag';
  const list = el('div', 'card-list');
  sidebar.append(query, list);
  const detail = el('div', 'card-detail');
  layout.append(sidebar, detail);
  container.append(layout);
  let selected = 0;
  const renderList = (): void => {
    list.replaceChildren();
    const needle = query.value.toLowerCase();
    config.relics.forEach((relic, index) => {
      const title = relicTitle(options.texts, relic);
      if (needle && ![title, relic.id, relic.god, relic.rarity, ...relic.targetTags].join(' ').toLowerCase().includes(needle)) return;
      const item = button('', `card-list__item${selected === index ? ' is-selected' : ''}`);
      const godName = relic.god ? describeLabel('enumValue', `god.${relic.god}`).label : '中立';
      item.append(
        el('strong', '', title),
        el('span', '', `${godName} · ${describeLabel('enumValue', `rarity.${relic.rarity}`).label}`),
      );
      item.addEventListener('click', () => { selected = index; renderList(); renderRelic(detail, relic, index, config, options, renderList); });
      list.append(item);
    });
  };
  query.addEventListener('input', renderList);
  renderList();
  if (config.relics[0]) renderRelic(detail, config.relics[0], 0, config, options, renderList);
}
