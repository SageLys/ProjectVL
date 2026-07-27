// 皮肤层数据入口：仅剩题材文案（P0-5 题材解耦——texts 是可替换皮肤，不进 config 域）。
// 数值/规则配置已迁往 src/config/（六域 + variant 机制）。
import texts from './texts.json';

export { texts };

/**
 * 按 `textKey` 取文案节点。逐段下钻；每层额外允许「剩余整串」作为字面键命中，
 * 以支持 `tuner.params` 这类**以配置路径为键**的扁平表（键名本身含 '.'）。
 * 例：`relics.proj_damage.name` 走嵌套；`tuner.params.combat.defaults.damage` 走扁平。
 */
export function resolveTextNode(key: string): unknown {
  const segments = key.split('.');
  let node: unknown = texts;
  for (let i = 0; i < segments.length; i++) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    const record = node as Record<string, unknown>;
    const rest = segments.slice(i).join('.');
    if (rest in record) return record[rest];
    node = record[segments[i]];
  }
  return node;
}

/** 取字符串文案；缺失或类型不符返回 undefined（调用方决定回退）。 */
export function resolveText(key: string): string | undefined {
  const node = resolveTextNode(key);
  return typeof node === 'string' ? node : undefined;
}
