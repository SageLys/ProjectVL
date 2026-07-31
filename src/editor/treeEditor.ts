import { button, el, labeled, numberControl, selectControl } from './dom';
import { cardLabel, describeLabel, labelWithKey } from './labels';
import { referenceKind, referenceOptions, type ReferenceCatalog } from './references';

export interface TreeEditorOptions {
  path: string;
  references: ReferenceCatalog;
  onChange: () => void;
  keyHint?: string;
}

const NEW_VALUES: Record<string, unknown> = {
  string: '', number: 0, boolean: false, object: {}, array: [], null: null,
};

const valueTypeLabel = (value: string): string => describeLabel('enumValue', `valueType.${value}`).label;

function pathForKey(parent: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

/** 结构树里的字段标签按「所在可写域 + 字段名」查；域名从节点路径 `$.<domain>…` 还原。 */
function fieldLabelKey(path: string, key: string): string {
  const domain = /^\$\.([A-Za-z]+)/.exec(path)?.[1];
  return domain ? `${domain}.${key}` : key;
}

/** 引用字段的下拉项显示：神祇与卡片显示中文名，其余（文案键/标签）保持原样。 */
function referenceOptionLabel(keyHint: string): ((value: string) => string) | undefined {
  const kind = referenceKind(keyHint);
  if (kind === 'god') return value => labelWithKey('enumValue', `god.${value}`, value);
  if (kind === 'card') {
    return value => {
      const { label } = cardLabel(value);
      return label === value ? value : `${label}（${value}）`;
    };
  }
  return undefined;
}

function renderScalar(
  value: unknown,
  keyHint: string,
  path: string,
  setValue: (value: unknown) => void,
  options: TreeEditorOptions,
): HTMLElement {
  const choices = referenceOptions(keyHint, options.references);
  if (typeof value === 'string' && choices) {
    const select = selectControl(choices, value, keyHint === 'god', referenceOptionLabel(keyHint));
    select.addEventListener('change', () => { setValue(select.value || undefined); options.onChange(); });
    return select;
  }
  if (typeof value === 'string') {
    const input = el('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('input', () => { setValue(input.value); options.onChange(); });
    return input;
  }
  if (typeof value === 'number') {
    const input = numberControl(value);
    input.addEventListener('input', () => {
      if (input.value !== '') { setValue(input.valueAsNumber); options.onChange(); }
    });
    return input;
  }
  if (typeof value === 'boolean') {
    const input = el('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => { setValue(input.checked); options.onChange(); });
    return input;
  }
  const select = selectControl(['null', 'string', 'number', 'boolean', 'object', 'array'], 'null', false, valueTypeLabel);
  select.addEventListener('change', () => { setValue(NEW_VALUES[select.value]); options.onChange(); });
  select.dataset.configPath = path;
  return select;
}

function addRow(
  parent: Record<string, unknown> | unknown[],
  keyHint: string,
  rerender: () => void,
  options: TreeEditorOptions,
): HTMLElement {
  const row = el('div', 'tree-add');
  const key = el('input');
  key.type = 'text';
  key.placeholder = '字段名';
  if (Array.isArray(parent)) key.hidden = true;
  const type = selectControl(Object.keys(NEW_VALUES), 'string', false, valueTypeLabel);
  const add = button(Array.isArray(parent) ? '添加元素' : '添加字段', 'button button--quiet');
  add.addEventListener('click', () => {
    const fieldKey = Array.isArray(parent) ? keyHint : key.value.trim();
    const reference = type.value === 'string' ? referenceOptions(fieldKey, options.references)?.[0] : undefined;
    const next = reference ?? structuredClone(NEW_VALUES[type.value]);
    if (Array.isArray(parent)) parent.push(next);
    else if (fieldKey && !(fieldKey in parent)) parent[fieldKey] = next;
    else return;
    rerender();
    options.onChange();
  });
  row.append(key, type, add);
  return row;
}

function renderNode(
  value: unknown,
  path: string,
  keyHint: string,
  setValue: (value: unknown) => void,
  remove: (() => void) | undefined,
  options: TreeEditorOptions,
  referenceKey = keyHint,
): HTMLElement {
  const row = el('div', 'tree-node');
  row.dataset.configPath = path;
  const header = el('div', 'tree-node__header');
  // 查不到中文就只显示英文 key——回退，不阻断。
  const field = describeLabel('domainField', fieldLabelKey(path, keyHint));
  if (field.label !== keyHint) header.append(el('span', 'tree-node__label', field.label));
  header.append(el('code', 'tree-node__key', keyHint));
  const kind = Array.isArray(value) ? `数组 · ${value.length}` : value === null ? 'null' : typeof value === 'object' ? `对象 · ${Object.keys(value as object).length}` : typeof value;
  header.append(el('span', 'tree-node__type', kind));
  if (remove) {
    const removeButton = button('删除', 'button button--danger button--small');
    removeButton.addEventListener('click', () => { remove(); options.onChange(); });
    header.append(removeButton);
  }
  row.append(header);

  if (value === null || typeof value !== 'object') {
    row.append(labeled('值', renderScalar(value, referenceKey, path, setValue, options), path));
    return row;
  }

  const body = el('div', 'tree-node__body');
  const rerender = (): void => {
    const replacement = renderNode(value, path, keyHint, setValue, remove, options, referenceKey);
    row.replaceWith(replacement);
  };
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      body.append(renderNode(
        child,
        `${path}[${index}]`,
        `${index}`,
        next => { value[index] = next; },
        () => { value.splice(index, 1); rerender(); },
        { ...options, keyHint },
        keyHint,
      ));
    });
  } else {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      body.append(renderNode(
        child,
        pathForKey(path, key),
        key,
        next => { if (next === undefined) delete record[key]; else record[key] = next; },
        () => { delete record[key]; rerender(); },
        options,
      ));
    }
  }
    body.append(addRow(value as Record<string, unknown> | unknown[], keyHint, rerender, options));
  row.append(body);
  return row;
}

export function renderTreeEditor(container: HTMLElement, value: unknown, options: TreeEditorOptions): void {
  container.replaceChildren(renderNode(value, options.path, options.keyHint ?? '$', () => undefined, undefined, options));
}
