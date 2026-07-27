// 配置文件的统一序列化格式。人工编辑、`npm run format:config` 与 /__config/write 共用同一份，
// 保证「工具写回」与「手工编辑」产生同样的字节，diff 永远只反映真实改动。
//
// 关于「稳定 key 顺序」：默认**保留源文件的键序**（JSON.parse 保序，JSON.stringify 亦保序），
// 因此读入→写回是零 diff 的恒等操作。按字母排序会把 id/god/rarity 这类有意义的排布打散，
// 只在显式要求时才做（sortKeys: true）。

export interface StableJsonOptions {
  /** 缩进空格数，默认 2。 */
  indent?: number;
  /** 递归按字母序重排对象键；默认 false（保留源序）。 */
  sortKeys?: boolean;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, item]) => [key, sortDeep(item)]));
}

/** Git 友好的规范 JSON：指定缩进、LF、结尾换行。 */
export function stableJson(value: unknown, options: StableJsonOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  return `${JSON.stringify(prepared, null, options.indent ?? 2).replace(/\r\n/g, '\n')}\n`;
}

/** 内容是否已是规范格式（供 `--check` 与写回前的幂等判断）。 */
export function isStableJson(text: string, options: StableJsonOptions = {}): boolean {
  try {
    return text === stableJson(JSON.parse(text), options);
  } catch {
    return false;
  }
}
