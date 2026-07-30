import { AFFIX_SINKS } from '../config/affixSinks';
import type { CardStatKind, EvolutionRecipeDef } from '../config/types';
import type { BindingDef, CardDef, Category, Trigger } from '../core/effects/defs';
import { button, el, labeled, numberControl, selectControl } from '../editor/dom';
import { allowedTriggersForEffects, renderEffectsEditor } from '../editor/effectEditor';
import { cardLabel, labelWithKey } from '../editor/labels';
import { referenceOptions, type ReferenceCatalog } from '../editor/references';

export type EditableContentDomain = 'skills' | 'evolutionRecipes';

export interface MechanismEditingOptions {
  editingPath?: string;
  references: ReferenceCatalog;
  onToggle: (path?: string) => void;
  onChange: (domain: EditableContentDomain) => void;
}

type EditorFactory = (container: HTMLElement) => void;

export function editableMechanismBlock(
  readContent: HTMLElement,
  path: string,
  options: MechanismEditingOptions | undefined,
  renderEditor: EditorFactory,
  className = '',
  buttonLabel = '编辑机制',
): HTMLElement {
  if (!options) return readContent;
  const active = options.editingPath === path;
  const wrap = el('div', `editable-mechanism${active ? ' is-editing' : ''}${className ? ` ${className}` : ''}`);
  wrap.dataset.configPath = path;
  const toolbar = el('div', 'editable-mechanism__toolbar');
  const toggle = button(active ? '完成' : buttonLabel, 'button button--small mechanism-edit-button');
  toggle.addEventListener('click', () => options.onToggle(active ? undefined : path));
  toolbar.append(toggle);
  const read = el('div', 'editable-mechanism__read'); read.append(readContent);
  wrap.append(toolbar, read);
  if (active) {
    const editor = el('div', 'mechanism-editor');
    renderEditor(editor);
    wrap.append(editor);
  }
  return wrap;
}

function fieldLabel(key: string): string { return labelWithKey('domainField', key, key.split('.').pop() ?? key); }
function cardOptionLabel(id: string): string {
  const name = cardLabel(id).label;
  return name === id ? id : `${name}（${id}）`;
}

function renderOptionalNumber(
  container: HTMLElement,
  value: number | undefined,
  label: string,
  path: string,
  onValue: (value: number | undefined) => void,
  onChange: () => void,
): void {
  const input = el('input'); input.type = 'number'; input.step = 'any'; if (value !== undefined) input.value = String(value);
  input.placeholder = '未设置';
  input.addEventListener('input', () => { onValue(input.value === '' ? undefined : input.valueAsNumber); onChange(); });
  container.append(labeled(label, input, path));
}

function renderTriggerParams(container: HTMLElement, binding: BindingDef, path: string, onChange: () => void): void {
  const details = el('details', 'trigger-params-editor');
  details.open = Boolean(binding.triggerParams);
  details.append(el('summary', '', '触发条件 / 冷却'));
  const body = el('div', 'field-grid');
  const ensure = (): NonNullable<BindingDef['triggerParams']> => binding.triggerParams ?? (binding.triggerParams = {});
  renderOptionalNumber(body, binding.triggerParams?.seconds, '间隔秒数', `${path}.triggerParams.seconds`, value => {
    const params = ensure(); if (value === undefined) delete params.seconds; else params.seconds = value;
  }, onChange);
  renderOptionalNumber(body, binding.triggerParams?.cooldownSeconds, '冷却秒数', `${path}.triggerParams.cooldownSeconds`, value => {
    const params = ensure(); if (value === undefined) delete params.cooldownSeconds; else params.cooldownSeconds = value;
  }, onChange);
  for (const key of ['requiresSource', 'requiresStatus'] as const) {
    const input = el('input'); input.type = 'text';
    const current = binding.triggerParams?.[key];
    input.value = Array.isArray(current) ? current.join(',') : current ?? '';
    input.placeholder = '未设置';
    input.addEventListener('input', () => { const params = ensure(); if (!input.value) delete params[key]; else params[key] = input.value; onChange(); });
    body.append(labeled(fieldLabel(key), input, `${path}.triggerParams.${key}`));
  }
  const clear = button('清空触发条件', 'button button--quiet button--small');
  clear.addEventListener('click', () => { delete binding.triggerParams; onChange(); renderTriggerParams(container, binding, path, onChange); details.remove(); });
  body.append(clear); details.append(body); container.append(details);
}

export function renderBindingsForm(
  container: HTMLElement,
  bindings: BindingDef[],
  path: string,
  references: ReferenceCatalog,
  onChange: () => void,
): void {
  const render = (): void => {
    container.replaceChildren();
    bindings.forEach((binding, index) => {
      const bindingPath = `${path}[${index}]`;
      const card = el('article', 'binding-editor-card'); card.dataset.configPath = bindingPath;
      const header = el('div', 'binding-editor-card__header');
      const allowed = allowedTriggersForEffects(binding.effects);
      const choices = [...new Set<Trigger>([binding.trigger, ...allowed])];
      const trigger = selectControl(choices, binding.trigger, false, value => labelWithKey('enumValue', `trigger.${value}`, value));
      trigger.addEventListener('change', () => { binding.trigger = trigger.value as Trigger; onChange(); render(); });
      const remove = button('删除绑定', 'button button--danger button--small');
      remove.addEventListener('click', () => { bindings.splice(index, 1); onChange(); render(); });
      header.append(labeled('触发器', trigger, `${bindingPath}.trigger`), remove); card.append(header);
      renderTriggerParams(card, binding, bindingPath, onChange);
      const effects = el('div', 'effects-editor');
      renderEffectsEditor(effects, binding.effects, {
        path: `${bindingPath}.effects`, mode: 'equip', trigger: binding.trigger, references,
        onChange,
        onStructureChange: () => {
          const nextAllowed = allowedTriggersForEffects(binding.effects);
          if (nextAllowed.length && !nextAllowed.includes(binding.trigger)) binding.trigger = nextAllowed[0];
          render();
        },
      });
      card.append(effects); container.append(card);
    });
    const add = button('＋ 添加绑定', 'button button--add');
    add.addEventListener('click', () => { bindings.push({ trigger: 'onFire', effects: [] }); onChange(); render(); });
    container.append(add);
  };
  render();
}

export function renderConsumableEffectsForm(
  container: HTMLElement,
  anchor: CardDef['consumable']['anchors']['1'],
  path: string,
  references: ReferenceCatalog,
  onChange: () => void,
): void {
  const landing = el('div', 'field-grid');
  renderOptionalNumber(landing, anchor.radius, '落点半径', `${path}.radius`, value => { if (value === undefined) delete anchor.radius; else anchor.radius = value; }, onChange);
  renderOptionalNumber(landing, anchor.duration, '持续秒数', `${path}.duration`, value => { if (value === undefined) delete anchor.duration; else anchor.duration = value; }, onChange);
  container.append(landing);
  const effects = el('div', 'effects-editor');
  renderEffectsEditor(effects, anchor.effects, { path: `${path}.effects`, mode: 'consume', references, onChange });
  container.append(effects);
}

function renderReferenceList(
  container: HTMLElement,
  values: string[],
  key: 'synergyTags' | 'targetTags',
  path: string,
  references: ReferenceCatalog,
  onChange: () => void,
): void {
  const choices = [...(referenceOptions(key, references) ?? [])];
  const render = (): void => {
    container.replaceChildren();
    values.forEach((value, index) => {
      const row = el('div', 'reference-list__row');
      const select = selectControl(choices, value, false, option => labelWithKey('enumValue', `tag.${option}`, option));
      select.addEventListener('change', () => {
        if (!values.includes(select.value) || values[index] === select.value) values[index] = select.value;
        onChange(); render();
      });
      const remove = button('删除', 'button button--danger button--small'); remove.addEventListener('click', () => { values.splice(index, 1); onChange(); render(); });
      row.append(labeled(`${index + 1}`, select, `${path}[${index}]`), remove); container.append(row);
    });
    const available = choices.find(choice => !values.includes(choice));
    const add = button('＋ 添加标签', 'button button--add button--small'); add.disabled = available === undefined;
    add.addEventListener('click', () => { if (available) values.push(available); onChange(); render(); });
    container.append(add);
  };
  render();
}

export function renderCardMetaForm(container: HTMLElement, card: CardDef, path: string, options: MechanismEditingOptions): void {
  const onChange = (): void => options.onChange('skills');
  const grid = el('div', 'field-grid');
  const categories: Category[] = ['projectile', 'control', 'domain', 'economy', 'defense'];
  const category = selectControl(categories, card.category, false, value => labelWithKey('enumValue', `category.${value}`, value));
  category.addEventListener('change', () => { card.category = category.value as Category; onChange(); });
  grid.append(labeled('类别', category, `${path}.category`));
  const teaching = el('input'); teaching.type = 'checkbox'; teaching.checked = card.teaching;
  teaching.addEventListener('change', () => { card.teaching = teaching.checked; onChange(); });
  grid.append(labeled('教学卡', teaching, `${path}.teaching`));
  container.append(grid, el('h4', '', '协同标签'));
  const tags = el('div', 'reference-list'); renderReferenceList(tags, card.synergyTags, 'synergyTags', `${path}.synergyTags`, options.references, onChange); container.append(tags);
}

export function renderAmplifyForm(container: HTMLElement, card: CardDef, path: string, options: MechanismEditingOptions): void {
  const onChange = (): void => options.onChange('skills');
  const description = el('textarea'); description.rows = 3; description.value = card.amplifyAxis.description ?? '';
  description.addEventListener('input', () => { if (description.value) card.amplifyAxis.description = description.value; else delete card.amplifyAxis.description; onChange(); });
  container.append(labeled('强化说明', description, `${path}.amplifyAxis.description`), el('h4', '', 'amplifyAxis 参数'));
  const params = el('div', 'field-grid');
  Object.entries(card.amplifyAxis.params).forEach(([key, value]) => {
    const input = el('input'); input.type = 'text'; input.value = value;
    input.addEventListener('input', () => { card.amplifyAxis.params[key] = input.value; onChange(); });
    params.append(labeled(fieldLabel(key), input, `${path}.amplifyAxis.params.${key}`));
  });
  container.append(params);
  const shared = card.evolutionTree?.sharedNodes.find(node => node.star === 4)?.amplify;
  if (shared) {
    container.append(el('h4', '', 'evolutionTree 4★ sharedNode 参数'));
    const sharedGrid = el('div', 'field-grid');
    Object.entries(shared).forEach(([key, value]) => {
      const input = el('input'); input.type = 'text'; input.value = value;
      input.addEventListener('input', () => { shared[key] = input.value; onChange(); });
      sharedGrid.append(labeled(fieldLabel(key), input, `${path}.evolutionTree.sharedNodes.amplify.${key}`));
    });
    container.append(sharedGrid);
  }
}

export function renderDesignNotesForm(container: HTMLElement, card: CardDef, path: string, options: MechanismEditingOptions): void {
  const notes = el('textarea'); notes.rows = 5; notes.value = card.designNotes ?? '';
  notes.addEventListener('input', () => { if (notes.value) card.designNotes = notes.value; else delete card.designNotes; options.onChange('skills'); });
  container.append(labeled('设计备注', notes, `${path}.designNotes`));
}

export function renderAffixPoolForm(container: HTMLElement, card: CardDef, path: string, options: MechanismEditingOptions): void {
  const onChange = (): void => options.onChange('skills');
  if (!card.affixPool) {
    const addPool = button('添加词条池', 'button button--add');
    addPool.addEventListener('click', () => {
      card.affixPool = { count: 1, candidates: [] };
      onChange();
      container.replaceChildren();
      renderAffixPoolForm(container, card, path, options);
    });
    container.append(addPool); return;
  }
  const pool = card.affixPool;
  const count = numberControl(pool.count, 0, undefined, 1); count.addEventListener('input', () => { pool.count = count.valueAsNumber; onChange(); });
  container.append(labeled('每次抽取条数', count, `${path}.affixPool.count`));
  const list = el('div', 'affix-editor-list');
  const axes = Object.keys(AFFIX_SINKS) as CardStatKind[];
  const render = (): void => {
    list.replaceChildren();
    pool.candidates.forEach((candidate, index) => {
      const candidatePath = `${path}.affixPool.candidates[${index}]`;
      const article = el('article', 'affix-editor-card');
      const stat = selectControl(axes, candidate.stat, false, value => labelWithKey('enumValue', `stat.${value}`, value));
      stat.addEventListener('change', () => { candidate.stat = stat.value as CardStatKind; onChange(); });
      article.append(labeled('词条轴', stat, `${candidatePath}.stat`));
      for (const key of ['weight', 'min', 'max', 'step', 'consumableDuration'] as const) {
        const input = numberControl(candidate[key]); input.addEventListener('input', () => { candidate[key] = input.valueAsNumber; onChange(); });
        article.append(labeled(fieldLabel(key), input, `${candidatePath}.${key}`));
      }
      const remove = button('删除候选', 'button button--danger button--small'); remove.addEventListener('click', () => { pool.candidates.splice(index, 1); onChange(); render(); }); article.append(remove); list.append(article);
    });
    const add = button('＋ 添加词条候选', 'button button--add'); add.addEventListener('click', () => { pool.candidates.push({ stat: axes[0], weight: 1, min: 0, max: 1, step: 1, consumableDuration: 5 }); onChange(); render(); }); list.append(add);
  };
  render(); container.append(list);
}

export function renderRecipeForm(container: HTMLElement, recipe: EvolutionRecipeDef, path: string, options: MechanismEditingOptions): void {
  const onChange = (): void => options.onChange('evolutionRecipes');
  const cards = [...(referenceOptions('cardId', options.references) ?? [])];
  const grid = el('div', 'field-grid');
  for (const [key, requirement] of [['ingredientVariable', recipe.ingredientVariable], ['ingredientAnchor', recipe.ingredientAnchor]] as const) {
    const card = selectControl(cards, requirement.cardId, false, cardOptionLabel); card.addEventListener('change', () => { requirement.cardId = card.value; onChange(); });
    const minStar = numberControl(requirement.minStar, 1, 6, 1); minStar.addEventListener('input', () => { requirement.minStar = minStar.valueAsNumber; onChange(); });
    grid.append(labeled(`${key} 卡牌`, card, `${path}.${key}.cardId`), labeled(`${key} 最低星级`, minStar, `${path}.${key}.minStar`));
  }
  const output = selectControl(cards, recipe.outputCardId, false, cardOptionLabel); output.addEventListener('change', () => { recipe.outputCardId = output.value; onChange(); });
  const outputStar = numberControl(recipe.outputStar, 6, 6, 1);
  grid.append(labeled('产出卡', output, `${path}.outputCardId`), labeled('产出星级', outputStar, `${path}.outputStar`));
  container.append(grid);
}
