# Codex 任务 固化2：配置清理 + 融合词条预留

> Stage 0 契约固化第二步。总纲见 `docs/接下来任务计划_v1.md`。与 固化1 文件基本不重叠，建议 固化1 落地后再做。
> 本阶段**零玩法变化**：三项清理 + 一项"只预留不实现"。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 一、目标

1. **统一调参元数据**：把散在 `tuner.json` / `tunerSchema.ts` / `tunerPanel.ts` 的调参定义收敛为单一来源。
2. **统一遗物文案**：`relics.json` 去掉内联 `title`/`desc`，改为 `nameKey`/`descriptionKey`，文本迁入 `texts.json`。
3. **预留融合词条结构位（D2）**：在卡牌/词条 schema 加可选字段，**类型 + 校验为可选 + 文档齐全，运行时零效果**。不实现任何融合逻辑。

## 二、硬性不变量

1. 三项均**零行为变化**：调参面板可调项与效果不变；遗物在 UI 上的显示文本逐字不变；融合字段缺省时游戏与今日完全一致。
2. `texts.json` 不得出现缺 key（新增占位检查，见 §五）。
3. schema 版本号自增，并在 `docs/` 留一行迁移说明。

## 三、现状（已核实）

| 位置 | 事实 |
|---|---|
| `src/config/base/tuner.json` | 提供各参数 min/max/step |
| `src/ui/tunerSchema.ts` | 提供 label/group/`waveDeferred` 等；`TunerParam` 定义在此 |
| `src/ui/tunerPanel.ts` | 特殊控件与行为；`localStorage` 预设 + `/__tuner/preset` 写回中间件 |
| `src/config/base/relics.json` | **同时**带 `textKey` **与**内联 `title`/`desc`（双份来源） |
| `src/data/texts.json` | 皮肤层文案，`textKey` 索引；已有 `relics.*` 命名空间入口 |
| `src/config/affixSinks.ts` | `AFFIX_SINKS` 与 `CardStatKind` 一一对应；融合预留字段应与之协调 |

## 四、三项改造

### 4.1 统一调参元数据
定义单一元数据结构（放 `src/config/tunerMeta.ts` 或并入 `tunerSchema.ts`）：
```ts
export interface TunerParamMeta {
  path: string; type: 'number' | 'boolean' | 'enum';
  labelKey: string; group: TunerGroup;
  min?: number; max?: number; step?: number;
  applyPolicy: 'immediate' | 'waveDeferred';
  unit?: string; options?: readonly string[];
}
```
- 把 `tuner.json` 的 min/max/step 与 `tunerSchema.ts` 的 label/group/deferred 合并到每个 `path` 一条记录。
- `label` 改为 `labelKey` 指向 `texts.json`（新增 `tuner.*` 命名空间）。
- `tunerPanel.ts` 从这份元数据渲染；特殊控件用 `type`/`options` 表达，减少面板内硬编码分支。
- 保留 `/__tuner/preset` 写回中间件不动（固化4 会推广它）。

### 4.2 统一遗物文案
- `relics.json`：删除 `title`/`desc`，改为 `nameKey`/`descriptionKey`（或复用现有 `textKey` 约定，派生 `${textKey}.name`/`.desc`）。
- 把原 `title`/`desc` 文本迁入 `texts.json` 的 `relics.<id>`。
- 更新遗物渲染处改读 key。核对每条遗物迁移前后显示文本**逐字一致**。

### 4.3 融合词条预留（只预留，不实现）
在卡牌 `CardDef`（`defs.ts`）或词条池定义加**可选**字段，`loader`/解释器一律忽略：
```ts
/** D2 预留：卡间融合数值词条。占位契约，运行时无效果，实现见 Stage 5。 */
fusionPolicy?: {
  affixTransferPolicy?: 'none' | 'strongest' | 'sum' | 'average';
  conflictResolution?: 'keepHigher' | 'keepNewer' | 'reject';
  sourceCardIds?: string[];
};
```
- 校验器：接受该字段为可选、类型合法即可；缺省合法。
- 明确注释"Stage 5 才实现"，并在 `docs/` 记一行。

## 五、验收

- `npm run test` 与 `npm run build` 全绿；新增 `tests/textsCompleteness.test.ts`：遍历所有 `*.json` 中引用的 key（含新 `tuner.*`/`relics.*`），断言 `texts.json` 全部命中，无缺失、无孤儿。
- 手工对照：调参面板可调项与遗物显示文本前后一致（可用现有 UI 测试或截图对照）。
- 输出 `docs/配置清理_落地记录.md`：三项各自的前后对照与 schema 版本变更。
