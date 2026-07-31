import { button, el, labeled } from '../editor/dom';
import { labelWithKey } from '../editor/labels';

export interface TextFieldSpec {
  path: string;
  label?: string;
  kind?: 'string' | 'stringArray';
  multiline?: boolean;
}

export interface TextEditingOptions {
  texts: Record<string, unknown>;
  editingPath?: string;
  onToggle: (path?: string) => void;
  onChange: () => void;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : undefined;
}

function parts(path: string): string[] {
  return path.replace(/^\$\.texts\./, '').split('.').filter(Boolean);
}

function getValue(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const key of parts(path)) {
    const node = record(current);
    if (!node) return undefined;
    current = node[key];
  }
  return current;
}

function setValue(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = parts(path);
  let current: UnknownRecord = root;
  keys.slice(0, -1).forEach(key => {
    const child = record(current[key]);
    current = child ?? (current[key] = {}) as UnknownRecord;
  });
  const last = keys[keys.length - 1];
  if (last) current[last] = value;
}

function defaultLabel(path: string): string {
  const pathParts = parts(path);
  const key = pathParts[pathParts.length - 1] ?? path;
  return /^\d+$/.test(key) ? `${key}★` : labelWithKey('domainField', `texts.${key}`, key);
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isActive(fields: TextFieldSpec[], editingPath: string | undefined): boolean {
  if (!editingPath) return false;
  return fields.some(field => field.path === editingPath || field.path.startsWith(`${editingPath}.`) || editingPath.startsWith(`${field.path}.`));
}

function renderControl(field: TextFieldSpec, options: TextEditingOptions): HTMLElement {
  const raw = getValue(options.texts, field.path);
  const kind = field.kind ?? 'string';
  const textValue = kind === 'stringArray' ? arrayValue(raw).join('\n') : typeof raw === 'string' ? raw : '';
  const fieldParts = parts(field.path);
  const tail = fieldParts[fieldParts.length - 1] ?? '';
  const multiline = field.multiline ?? (kind === 'stringArray' || ['overview', 'theme', 'desc', 'detail', 'summary', 'intent'].includes(tail));
  const control = multiline ? el('textarea') : el('input');
  if (control instanceof HTMLTextAreaElement) control.rows = kind === 'stringArray' ? 3 : 4;
  else control.type = 'text';
  control.value = textValue;
  control.dataset.textPath = field.path;
  control.placeholder = kind === 'stringArray' ? '每行一个关键词' : '留空会被完整性看板标为缺失';
  control.addEventListener('input', () => {
    const next = kind === 'stringArray'
      ? control.value.split(/[\n、,，]+/).map(item => item.trim()).filter(Boolean)
      : control.value;
    setValue(options.texts, field.path, next);
    options.onChange();
  });
  return labeled(field.label ?? defaultLabel(field.path), control, field.path);
}

/** 阅读内容始终保留在 DOM；屏幕编辑时收起，打印时仍复用同一阅读内容。 */
export function editableTextBlock(readContent: HTMLElement, fields: TextFieldSpec[], options: TextEditingOptions | undefined, className = ''): HTMLElement {
  if (!options) return readContent;
  const active = isActive(fields, options.editingPath);
  const wrap = el('div', `editable-copy${active ? ' is-editing' : ''}${className ? ` ${className}` : ''}`);
  wrap.dataset.configPath = fields[0]?.path;
  const toolbar = el('div', 'editable-copy__toolbar');
  const toggle = button(active ? '完成' : '编辑', 'button button--small copy-edit-button');
  toggle.addEventListener('click', () => options.onToggle(active ? undefined : fields[0]?.path));
  toolbar.append(toggle);
  const read = el('div', 'editable-copy__read'); read.append(readContent);
  wrap.append(toolbar, read);
  if (active) {
    const editor = el('div', 'copy-editor');
    fields.forEach(field => editor.append(renderControl(field, options)));
    wrap.append(editor);
    requestAnimationFrame(() => {
      const requestedPath = fields.find(field => field.path === options.editingPath || field.path.startsWith(`${options.editingPath}.`))?.path;
      const requested = requestedPath ? editor.querySelector<HTMLElement>(`[data-text-path="${CSS.escape(requestedPath)}"]`) : undefined;
      (requested ?? editor.querySelector<HTMLElement>('input, textarea'))?.focus();
    });
  }
  return wrap;
}
