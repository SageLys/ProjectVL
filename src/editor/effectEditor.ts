import {
  ATOM_CONTRACT, ATOM_NAMES, RUNTIME_STAT_KINDS, TRIGGER_NAMES,
  type AtomContract, type AtomParamSpec,
} from '../core/effects/atomContract';
import type { AtomName, EffectDef, Trigger } from '../core/effects/defs';
import { button, el, formatValue, selectControl } from './dom';
import { describeLabel, labelWithKey } from './labels';
import { renderTreeEditor } from './treeEditor';
import type { ReferenceCatalog } from './references';

export type EffectMode = 'equip' | 'consume';

export interface EffectEditorOptions {
  path: string;
  mode: EffectMode;
  trigger?: Trigger;
  references: ReferenceCatalog;
  onChange: () => void;
  onStructureChange?: () => void;
}

type MutableEffect = { atom: AtomName; params?: Record<string, unknown> };

function defaultFor(spec: AtomParamSpec, mode: EffectMode, trigger?: Trigger): unknown {
  if (mode === 'consume' && spec.consumeDefault !== undefined) return spec.consumeDefault;
  if (trigger === 'passive' && spec.passiveDefault !== undefined) return spec.passiveDefault;
  return spec.default;
}

function atomChoices(mode: EffectMode): AtomName[] {
  return ATOM_NAMES.filter(atom => ATOM_CONTRACT[atom].supports[mode]);
}

function createOptionalNumber(
  current: unknown,
  spec: AtomParamSpec,
  integer: boolean,
  placeholder: string,
  setValue: (value: unknown) => void,
  onChange: () => void,
): HTMLInputElement {
  const input = el('input');
  input.type = 'number';
  input.placeholder = placeholder;
  if (typeof current === 'number') input.value = String(current);
  if (spec.min !== undefined) input.min = String(spec.min);
  if (spec.max !== undefined) input.max = String(spec.max);
  input.step = integer ? '1' : 'any';
  input.addEventListener('input', () => {
    setValue(input.value === '' ? undefined : input.valueAsNumber);
    onChange();
  });
  return input;
}

function renderParamControl(
  spec: AtomParamSpec,
  current: unknown,
  mode: EffectMode,
  trigger: Trigger | undefined,
  setValue: (value: unknown) => void,
  rerender: () => void,
  options: EffectEditorOptions,
  path: string,
): HTMLElement {
  const fallback = defaultFor(spec, mode, trigger);
  const placeholder = fallback === undefined ? '留空=未设置' : `留空=默认 ${formatValue(fallback)}`;
  // 枚举取值的中文来自参数名所属的枚举组（shape / kind / stat / …），故从 path 末段取组名。
  const enumGroup = path.split('.').pop() ?? '';
  const types = Array.isArray(spec.type) ? spec.type : [spec.type];
  const selectedType = typeof current === 'number' ? (Number.isInteger(current) && types.includes('integer') ? 'integer' : 'number')
    : typeof current === 'string' && types.includes('enum') ? 'enum' : types[0];

  if (types.length > 1) {
    const wrap = el('div', 'union-control');
    const type = selectControl(types, selectedType, false, value => describeLabel('enumValue', `paramType.${value}`).label);
    type.setAttribute('aria-label', '参数类型');
    type.addEventListener('change', () => {
      setValue(type.value === 'enum' ? spec.enum?.[0] : undefined);
      rerender();
      options.onChange();
    });
    const nestedSpec = { ...spec, type: type.value as AtomParamSpec['type'] };
    wrap.append(type, renderParamControl(nestedSpec, current, mode, trigger, setValue, rerender, options, path));
    return wrap;
  }

  switch (selectedType) {
    case 'number':
    case 'integer':
      return createOptionalNumber(current, spec, selectedType === 'integer', placeholder, setValue, options.onChange);
    case 'boolean': {
      const select = selectControl(['true', 'false'], typeof current === 'boolean' ? String(current) : undefined, true);
      select.options[0].text = placeholder;
      select.addEventListener('change', () => { setValue(select.value === '' ? undefined : select.value === 'true'); options.onChange(); });
      return select;
    }
    case 'enum': {
      const values = spec.enum ?? (path.endsWith('.stat') ? RUNTIME_STAT_KINDS : []);
      const select = selectControl(
        values,
        typeof current === 'string' ? current : undefined,
        !spec.required,
        value => labelWithKey('enumValue', `${enumGroup}.${value}`, value),
      );
      if (select.options.length && select.options[0].value === '') select.options[0].text = placeholder;
      select.addEventListener('change', () => { setValue(select.value || undefined); options.onChange(); });
      return select;
    }
    case 'string': {
      const input = el('input');
      input.type = 'text';
      input.value = typeof current === 'string' ? current : '';
      input.placeholder = placeholder;
      input.addEventListener('input', () => { setValue(input.value || undefined); options.onChange(); });
      return input;
    }
    case 'record': {
      const wrap = el('div', 'param-record');
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        const add = button('设置记录', 'button button--quiet button--small');
        add.addEventListener('click', () => { setValue({}); rerender(); options.onChange(); });
        wrap.append(add);
      } else {
        renderTreeEditor(wrap, current, { path, references: options.references, onChange: options.onChange });
        const clear = button('恢复默认', 'button button--quiet button--small');
        clear.addEventListener('click', () => { setValue(undefined); rerender(); options.onChange(); });
        wrap.prepend(clear);
      }
      return wrap;
    }
    case 'effects': {
      const wrap = el('div', 'nested-effects');
      if (!Array.isArray(current)) {
        const add = button('添加嵌套效果', 'button button--quiet button--small');
        add.addEventListener('click', () => { setValue([]); rerender(); options.onChange(); });
        wrap.append(add);
      } else {
        renderEffectsEditor(wrap, current as EffectDef[], { ...options, path });
      }
      return wrap;
    }
  }
  throw new Error(`不支持的原子参数类型: ${String(selectedType)}`);
}

function renderEffect(
  effect: MutableEffect,
  index: number,
  effects: MutableEffect[],
  options: EffectEditorOptions,
  rerenderAll: () => void,
): HTMLElement {
  const path = `${options.path}[${index}]`;
  const contract: AtomContract = ATOM_CONTRACT[effect.atom];
  const card = el('article', 'effect-card');
  card.dataset.configPath = path;
  const header = el('div', 'effect-card__header');
  const atom = selectControl(atomChoices(options.mode), effect.atom, false, name => labelWithKey('atom', name));
  atom.setAttribute('aria-label', '效果原子');
  atom.addEventListener('change', () => {
    effect.atom = atom.value as AtomName;
    effect.params = {};
    if (options.onStructureChange) options.onStructureChange(); else rerenderAll();
    options.onChange();
  });
  header.append(el('span', 'effect-card__index', `效果 ${index + 1}`), atom);
  const atomHelp = describeLabel('atom', effect.atom).help;
  const remove = button('删除效果', 'button button--danger button--small');
  remove.addEventListener('click', () => {
    effects.splice(index, 1);
    if (options.onStructureChange) options.onStructureChange(); else rerenderAll();
    options.onChange();
  });
  header.append(remove);
  card.append(header);
  if (atomHelp) card.append(el('p', 'effect-card__glossary', atomHelp));
  if (contract.modifierOnly) card.append(el('p', 'callout callout--warning', '仅 passive 聚合生效；请确认绑定触发器为 passive。'));
  if (contract.allowsNestedEffects) card.append(el('p', 'callout', '该原子允许递归编辑 params.effects。'));

  const params = effect.params ?? (effect.params = {});
  const grid = el('div', 'param-grid');
  const rerender = (): void => rerenderAll();
  for (const [name, spec] of Object.entries(contract.params)) {
    const paramPath = `${path}.params.${name}`;
    const field = el('div', 'param-field');
    field.dataset.configPath = paramPath;
    const info = describeLabel('atomParam', `${effect.atom}.${name}`);
    const label = el('div', 'param-field__label');
    label.append(el('span', '', `${labelWithKey('atomParam', `${effect.atom}.${name}`, name)}${spec.required ? ' *' : ''}`));
    const badges = el('span', 'param-field__badges');
    if (spec.min !== undefined || spec.max !== undefined) badges.textContent = `${spec.min ?? '−∞'}…${spec.max ?? '+∞'}`;
    label.append(badges);
    field.append(label);
    field.append(renderParamControl(
      spec,
      params[name],
      options.mode,
      options.trigger,
      value => { if (value === undefined) delete params[name]; else params[name] = value; },
      rerender,
      options,
      paramPath,
    ));
    if (spec.variantDefaults) {
      const on = labelWithKey('atomParam', `${effect.atom}.${spec.variantDefaults.on}`, spec.variantDefaults.on);
      field.append(el('small', 'param-note', `默认值随 ${on} 变化`));
    }
    // info.help 已是「契约 note 优先、标签层兜底」的结果，故这里不再单独渲染 spec.note。
    if (info.help) field.append(el('small', 'param-note', info.help));
    grid.append(field);
  }
  card.append(grid);
  return card;
}

export function renderEffectsEditor(container: HTMLElement, source: EffectDef[], options: EffectEditorOptions): void {
  const effects = source as MutableEffect[];
  const render = (): void => {
    container.replaceChildren();
    effects.forEach((effect, index) => container.append(renderEffect(effect, index, effects, options, render)));
    const add = button('＋ 添加效果', 'button button--add');
    add.addEventListener('click', () => {
      const first = atomChoices(options.mode)[0];
      effects.push({ atom: first, params: {} });
      if (options.onStructureChange) options.onStructureChange(); else render();
      options.onChange();
    });
    container.append(add);
  };
  render();
}

export function allowedTriggersForEffects(effects: EffectDef[]): Trigger[] {
  const all = new Set<Trigger>(TRIGGER_NAMES);
  for (const effect of effects) {
    const allowed = ATOM_CONTRACT[effect.atom].allowedTriggers;
    if (allowed === 'any') continue;
    const triggerList = allowed as readonly Trigger[];
    for (const trigger of [...all]) if (!triggerList.includes(trigger)) all.delete(trigger);
  }
  return [...all];
}
