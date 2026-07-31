# Codex 任务 固化1：效果原子参数契约 + 单一来源

> Stage 0 契约固化第一步。总纲见 `docs/接下来任务计划_v1.md`，为什么见 `docs/移植准入与配置契约固化_决策结论_v1.md`。
> 本阶段**只做数据契约强化，零玩法变化**：所有卡照常战斗，所有默认值与今日逐一相等，全部旧测试保持通过。
> 行号仅供导航，以符号名为准。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 一、目标

1. 建立**唯一权威的"效果原子参数契约"**（新文件 `src/core/effects/atomContract.ts`），逐原子声明：合法参数、类型、必填/可选、**默认值**、数值范围（可选）、允许的触发器、装备态/消耗态是否支持、是否产生事件、是否允许嵌套 `effects`。
2. 把 `EffectDef` 从 `{ atom; params?: Record<string,unknown> }` 升级为**按 atom 判别的联合类型**（discriminated union），参数强类型。
3. `skillValidator.ts` 里手抄的 `ATOMS` 集合、以及各原子的散装校验，改为**从 `atomContract` 派生**，删除重复来源。
4. `registry.ts` 里的内联默认值（`num(p,'radius',120)` 等）改为**引用 `atomContract` 的默认值**，保证"契约默认值 = 运行时默认值"单一来源。

## 二、硬性不变量

1. **零行为变化**：所有原子的默认值必须与当前 `registry.ts` 内联值**逐一相等**（提交前用快照测试固化，见 §五.3）。
2. `skills.json` 的卡牌数据**内容不改**（仅当某卡显式参数恰好等于默认值时可选择性省略，但本任务**不做**这类清理，避免混入行为风险）。
3. `AtomName`、`Trigger` 枚举**不改名不增删**。
4. `NOOP_MODIFIER_ATOMS` / passive 聚合语义不变。

## 三、现状（已核实）

| 位置 | 事实 |
|---|---|
| `src/core/effects/defs.ts` | `EffectDef = { atom: AtomName; params?: Record<string, unknown> }`——参数松散 |
| `src/core/effects/registry.ts` | 33 原子实现；默认值以 `num(p,'k',d)`/`str(p,'k',d)` **内联散落** |
| `src/config/skillValidator.ts` | 手写 `const ATOMS = new Set([...33 个...])`，与 `defs.ts` 的 `AtomName` 重复；仅对 `restore`/`statBuff` 等少数原子校验参数 |
| `docs/skills-schema.json` | 已有 `atomCatalog` 参数目录雏形，可作为契约初值来源 |
| `src/config/affixSinks.ts` | `AFFIX_SINKS` 是"单一权威契约"的现成样板，请对齐其风格 |

## 四、契约数据结构（`src/core/effects/atomContract.ts`）

```ts
import type { AtomName, Trigger } from './defs';

export interface AtomParamSpec {
  type: 'number' | 'integer' | 'string' | 'boolean' | 'enum' | 'effects' | 'record';
  required?: boolean;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  enum?: readonly string[];
  note?: string;
}

export interface AtomContract {
  category: 'projectile' | 'control' | 'domain' | 'economy' | 'defense' | 'shared';
  params: Record<string, AtomParamSpec>;
  allowedTriggers: readonly Trigger[] | 'any';
  supports: { equip: boolean; consume: boolean };
  emitsEvents: boolean;
  allowsNestedEffects?: boolean;   // groundZone/aura 的 effects 参数
  modifierOnly?: boolean;          // NOOP_MODIFIER_ATOMS：触发时 no-op，getModifiers 聚合
}

/** 唯一权威：33 原子的参数契约。改原子先改这里。 */
export const ATOM_CONTRACT: Record<AtomName, AtomContract> = { /* 从 registry 默认值 + docs/skills-schema.json 逐条填 */ };
```

`EffectDef` 判别联合可手写，或用 `atom` 到参数形状的映射类型生成；关键是**每个 atom 的 params 形状与 `ATOM_CONTRACT` 一致**（加一个类型级或测试级的双向一致性检查）。

## 五、实施步骤

1. 新建 `atomContract.ts`，逐原子把 `registry.ts` 的内联默认值与 `docs/skills-schema.json` 的 `atomCatalog` 迁入。**默认值以 `registry.ts` 现值为准**（代码是事实，文档可能滞后）。
2. `registry.ts` 的 `num/str` 兜底改为读 `ATOM_CONTRACT[atom].params[key].default`（保留 `num/str` 辅助函数签名，仅默认值来源改变）。
3. **快照测试**：新增 `tests/atomContract.test.ts`，断言：①`ATOM_CONTRACT` 的键集合 == `AtomName` 全集（双向，无遗漏无多余）；②每个 `modifierOnly` 原子出现在 `NOOP_MODIFIER_ATOMS`，反之亦然；③对每个原子跑一遍现有行为快照，确认默认值迁移前后结果一致。
4. `skillValidator.ts` 的 `ATOMS` 改为 `new Set(Object.keys(ATOM_CONTRACT))`；参数校验改为遍历契约（必填缺失报错、类型不符报错、超范围报错、非法触发器报错）。
5. `EffectDef` 升级为判别联合；修复因收紧类型而暴露的调用点（`skills.json` 反序列化处允许保留 `unknown` 边界再 narrow）。

## 六、验收

- `npm run test`（含新 `atomContract.test.ts`）与 `npm run build` 全绿。
- `grep` 确认 `registry.ts` 不再有"魔法默认值"字面量（除极少数非契约常量并加注释）。
- `skillValidator.ts` 不再手抄原子清单。
- 输出一份简短 `docs/效果原子参数契约_落地记录.md`：列出 33 原子的默认值来源核对结果与任何前后差异（应为 0）。
