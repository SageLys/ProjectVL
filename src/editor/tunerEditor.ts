import {
  TUNER_GROUP_ORDER, exposedParams, getNumberAt, paramsInGroup, setNumberAt,
} from '../config/tunerMeta';
import type { TunerConfig, TunerGroup, TunerParamMeta } from '../config/types';
import { el, getAtPath, labeled, numberControl, selectControl, setAtPath } from './dom';
import { isEditorDomain, type EditorDomain } from './contracts';

interface TunerEditorOptions {
  configRoot: Record<EditorDomain, unknown>;
  texts: unknown;
  onChange: (domain: EditorDomain) => void;
}

function textNode(root: unknown, key: string): unknown {
  const segments = key.split('.');
  let node = root;
  for (let index = 0; index < segments.length; index++) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    const record = node as Record<string, unknown>;
    const rest = segments.slice(index).join('.');
    if (rest in record) return record[rest];
    node = record[segments[index]];
  }
  return node;
}

function targetDomain(param: TunerParamMeta): EditorDomain | undefined {
  const first = param.path.split('.')[0];
  return isEditorDomain(first) ? first : undefined;
}

function readValue(root: Record<EditorDomain, unknown>, param: TunerParamMeta): unknown {
  return param.type === 'number' ? getNumberAt(root, param.path) : getAtPath(root, param.path);
}

function writeValue(root: Record<EditorDomain, unknown>, param: TunerParamMeta, value: unknown): void {
  if (param.type === 'number') setNumberAt(root, param.path, value as number);
  else setAtPath(root, param.path, value);
}

function snap(value: number, param: TunerParamMeta): number {
  const min = param.min ?? -Infinity;
  const max = param.max ?? Infinity;
  const clamped = Math.min(max, Math.max(min, value));
  const step = param.step ?? 1;
  if (!Number.isFinite(min)) return clamped;
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return Number((Math.round((clamped - min) / step) * step + min).toFixed(decimals));
}

function renderNumber(
  value: number,
  param: TunerParamMeta,
  commit: (value: number) => void,
): HTMLElement {
  const wrap = el('div', 'slider-control');
  const range = el('input');
  range.type = 'range';
  range.min = String(param.min);
  range.max = String(param.max);
  range.step = String(param.step);
  range.value = String(value);
  const input = numberControl(value, param.min, param.max, param.step);
  const update = (next: number): void => {
    const final = snap(next, param);
    range.value = String(final);
    input.value = String(final);
    commit(final);
  };
  range.addEventListener('input', () => update(range.valueAsNumber));
  input.addEventListener('input', () => { if (input.value !== '' && Number.isFinite(input.valueAsNumber)) update(input.valueAsNumber); });
  wrap.append(range, input);
  return wrap;
}

function parseTextControl(value: unknown, raw: string): unknown {
  if (Array.isArray(value)) {
    const parts = raw.split(',').map(item => item.trim()).filter(Boolean);
    return value.every(item => typeof item === 'number') ? parts.map(Number) : parts;
  }
  return raw;
}

function renderParam(param: TunerParamMeta, options: TunerEditorOptions): HTMLElement {
  const domain = targetDomain(param);
  const row = el('article', 'tuner-param');
  row.dataset.configPath = `$.tuner.params.${param.path}`;
  const header = el('div', 'tuner-param__heading');
  const label = textNode(options.texts, param.labelKey);
  header.append(el('div', '', typeof label === 'string' ? label : param.labelKey));
  const meta = el('div', 'tuner-param__meta');
  meta.append(el('code', '', param.path));
  meta.append(el('span', '', param.applyPolicy === 'waveDeferred' ? '下波生效' : '立即生效'));
  if (domain) meta.append(el('span', '', `写入 ${domain}`));
  header.append(meta);
  row.append(header);

  if (!domain) {
    row.append(el('p', 'callout callout--error', '调参路径不属于可写域。'));
    return row;
  }
  let value: unknown;
  try {
    value = readValue(options.configRoot, param);
  } catch (error) {
    row.append(el('p', 'callout callout--error', error instanceof Error ? error.message : String(error)));
    return row;
  }
  const commit = (next: unknown): void => {
    writeValue(options.configRoot, param, next);
    options.onChange(domain);
  };
  if (param.type === 'number') {
    row.append(renderNumber(value as number, param, commit));
  } else if (param.type === 'boolean') {
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.role = 'switch';
    toggle.checked = Boolean(value);
    toggle.addEventListener('change', () => commit(toggle.checked));
    row.append(labeled('启用', toggle));
  } else if (param.type === 'enum') {
    const select = selectControl(param.options ?? [], String(value));
    select.addEventListener('change', () => commit(select.value));
    row.append(select);
  } else {
    const input = el('input');
    input.type = 'text';
    input.value = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    input.addEventListener('change', () => commit(parseTextControl(value, input.value)));
    row.append(input);
  }
  return row;
}

export function renderTunerEditor(container: HTMLElement, tuner: TunerConfig, options: TunerEditorOptions): void {
  container.replaceChildren();
  container.append(el('p', 'callout', '控件形态、范围、分组和生效策略来自 tuner.json；保存时 tuner 域与 path 指向的真实数值域会分别经过配置端点。'));
  const exposed = exposedParams(tuner);
  const groups: readonly TunerGroup[] = [...TUNER_GROUP_ORDER, 'p2'];
  for (const group of groups) {
    const params = exposed.filter(param => param.group === group);
    if (!params.length) continue;
    // 调用共享 helper 固化数值滑杆分组语义；其余控件按同组追加。
    const numericPaths = new Set(paramsInGroup(tuner, group).map(param => param.path));
    params.sort((a, b) => Number(!numericPaths.has(a.path)) - Number(!numericPaths.has(b.path)));
    const section = el('details', 'tuner-group');
    section.open = group !== 'p2';
    const groupText = textNode(options.texts, `tuner.groups.${group}.title`);
    section.append(el('summary', '', typeof groupText === 'string' ? groupText : group));
    const body = el('div', 'tuner-group__body');
    params.forEach(param => body.append(renderParam(param, options)));
    section.append(body);
    container.append(section);
  }
}
