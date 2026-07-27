export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, className = 'button'): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

export function labeled(label: string, control: HTMLElement, path?: string): HTMLLabelElement {
  const wrap = el('label', 'field');
  if (path) wrap.dataset.configPath = path;
  wrap.append(el('span', 'field__label', label), control);
  return wrap;
}

/** `labelOf` 让选项显示中文（值不变）；缺省时沿用英文取值本身。 */
export function selectControl(
  values: readonly string[],
  current: string | undefined,
  includeEmpty = false,
  labelOf?: (value: string) => string,
): HTMLSelectElement {
  const select = el('select');
  if (includeEmpty) select.append(new Option('— 未设置 —', ''));
  if (current && !values.includes(current)) select.append(new Option(`⚠ ${current}`, current));
  for (const value of values) select.append(new Option(labelOf ? labelOf(value) : value, value));
  select.value = current ?? '';
  return select;
}

export function numberControl(value: number, min?: number, max?: number, step?: number): HTMLInputElement {
  const input = el('input');
  input.type = 'number';
  input.value = String(value);
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.step = String(step ?? 'any');
  return input;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function setAtPath(root: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let target = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts[parts.length - 1]] = value;
}

export function getAtPath(root: unknown, path: string): unknown {
  let target = root;
  for (const part of path.split('.')) target = (target as Record<string, unknown>)[part];
  return target;
}
