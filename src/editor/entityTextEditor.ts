import type { EditorDomain } from './contracts';
import { el, labeled } from './dom';
import { labelWithKey } from './labels';

export type EntityTextDomain = Extract<EditorDomain, 'skills' | 'gods' | 'relics'>;

export interface EntityTextChangeHandlers {
  onEntityChange: () => void;
  onTextsChange: () => void;
}

export interface EntityTextSectionOptions {
  texts: Record<string, unknown>;
  textKey: string;
  onChange: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 由实体的 textKey 只读定位现有文案节点；缺失节点交给配置管线报错，不在 UI 中臆造结构。 */
export function entityTextNode(texts: Record<string, unknown>, textKey: string): Record<string, unknown> | undefined {
  let current: unknown = texts;
  for (const part of textKey.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

/** 标题始终取编辑器内的未保存 texts 候选，保证列表与内联表单同源。 */
export function entityTextTitle(texts: Record<string, unknown>, textKey: string, fallback: string): string {
  const name = entityTextNode(texts, textKey)?.name;
  return typeof name === 'string' && name ? `${name}（${fallback}）` : fallback;
}

/**
 * 卡 / 神 / 遗物共用的脏域绑定：任一侧改动都把实体域与 texts 组成同一保存批次。
 * 保存批次随后由 ConfigSaveFlow.saveEntityWithTexts 统一预检和写回。
 */
export function entityTextChangeHandlers(
  domain: EntityTextDomain,
  markChanged: (domain: EditorDomain) => void,
): EntityTextChangeHandlers {
  const markPair = (): void => {
    markChanged(domain);
    markChanged('texts');
  };
  return { onEntityChange: markPair, onTextsChange: markPair };
}

function fieldLabel(key: string): string {
  if (/^\d+$/.test(key)) return `${key}★`;
  return labelWithKey('domainField', `texts.${key}`, key);
}

function textControl(key: string, value: string, path: string, setValue: (value: string) => void): HTMLElement {
  const multiline = ['desc', 'detail', 'overview', 'theme'].includes(key) || value.length > 42;
  const control = multiline ? el('textarea') : el('input');
  if (control instanceof HTMLTextAreaElement) control.rows = 3;
  else control.type = 'text';
  control.value = value;
  control.addEventListener('input', () => setValue(control.value));
  return labeled(fieldLabel(key), control, path);
}

function renderTextRecord(
  container: HTMLElement,
  node: Record<string, unknown>,
  path: string,
  onChange: () => void,
  depth = 0,
): void {
  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    if (typeof value === 'string') {
      container.append(textControl(key, value, childPath, next => { node[key] = next; onChange(); }));
      continue;
    }
    if (!isRecord(value)) continue;
    const group = el('details', 'entity-copy-group');
    group.open = depth < 1;
    group.dataset.configPath = childPath;
    group.append(el('summary', '', fieldLabel(key)));
    const body = el('div', 'entity-copy-group__body');
    renderTextRecord(body, value, childPath, onChange, depth + 1);
    group.append(body);
    container.append(group);
  }
}

/** 根据当前真实节点递归渲染所有字符串字段，卡牌分星文案无需另维护一份字段清单。 */
export function renderEntityTextSection(container: HTMLElement, options: EntityTextSectionOptions): void {
  const section = el('section', 'form-section entity-copy');
  section.dataset.configPath = `$.texts.${options.textKey}`;
  section.append(el('h3', '', '名称与文案 · 写入 texts 域'));
  const node = entityTextNode(options.texts, options.textKey);
  if (!node) {
    section.append(el('p', 'callout callout--error', `未找到 ${options.textKey}；请先修正文案键，具体路径以配置管线报告为准。`));
  } else {
    const fields = el('div', 'entity-copy__fields');
    renderTextRecord(fields, node, `$.texts.${options.textKey}`, options.onChange);
    section.append(fields);
  }
  container.append(section);
}
