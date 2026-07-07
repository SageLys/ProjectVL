/** 把 "{token}" 替换为 vars[token]（缺失则空串）。表现层文案格式化用。 */
export function fmt(tpl: string, vars: Record<string, string | number> = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}
