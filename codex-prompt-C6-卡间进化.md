# Codex 任务 C6：VS 式卡间进化（固定配方，非融合）

> 前置：C3、C5 已合并。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

实现固定配方的卡间进化：满足配方的两张指定卡（各 ≥ 指定星级），在**波间阶段**由玩家手动确认，消耗两张材料，生成一张预设的强力新卡（占 1 槽）。

与延后"融合"的边界（命名与类型都必须分开）：

```text
卡间进化（本阶段）：固定配方 → 两张指定卡 → 一张预设新卡（EvolutionRecipeDef）
融合（延后）    ：任意/半任意组合 → 动态继承拼接效果（不实现、不留 UI）
```

## 二、硬性不变量

1. 战斗中不弹窗、不增加拖拽目标：战斗内只在合成提示区显示"存在可进化配方"的静默提示。
2. 材料精确消耗：恰好两张、各自满足 `minStar`；优先消耗星级恰好等于 `minStar` 的副本（保护更高星）；手牌与装备槽中的卡都可作为材料，装备卡作为材料需玩家在确认界面显式勾选。
3. 产物卡是普通 `Card`：可装备、可消耗、可继续升星（若其自身有进化树）、参与 build 投入分；但**不进入任何掉落池**（`recipeOnly: true`）。
4. 产物默认放入空手牌槽；无空槽则放入材料 A 原位置。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| C0 已建 | `evolutionRecipes.json` 空骨架、`EvolutionRecipeDef` 类型与校验 | 填充与消费 |
| C1 已建 | 波间 `decide/free` 步、决策队列 `recipeEvolution` kind 占位 | free 步展示可用配方并确认 |
| C3 已建 | 掉落入口全部收口 | 校验产物卡 `recipeOnly` 不入 runRoster/activePool/bounty 袋 |
| `src/ui/renderMergeHints.ts` | 合成提示 | 增加配方可用静默提示 |
| `src/core/systems/cardSystem.ts` `commitMerge` | 合成统计与 onMerge 触发 | 配方完成同样走 `commitMerge`（计一次 merge、触发 onMerge、更新 typeStats） |

## 四、系统（新增 `src/core/systems/recipeEvolutionSystem.ts`）

```ts
export function availableRecipes(state: GameState): Array<{ recipeId: string; a: CardRef; b: CardRef }>;
// CardRef = { slotKind: 'cards' | 'equipment'; index: number; cardId: number }

export function confirmRecipe(state: GameState, config: Config, rng: Rng,
  recipeId: string, aCardId: number, bCardId: number): GameEvent[];
```

- `availableRecipes`：扫描手牌+装备，按配方枚举可行组合（每配方给默认材料选择 = 最低星副本）。
- `confirmRecipe`：校验 → 移除两张材料 → 生成 `outputCardId @ outputStar`（evolutionPath 为空；若产物有进化树且 outputStar ≥ checkpoint，视为未选择，后续升星才触发）→ `commitMerge` → 尝试 `autoMergeCards` 连锁 → 事件。
- `allowedPhase: 'intermission'`：非波间调用直接拒绝（返回空事件 + `recipeRejected` 事件）。

`GameEvent` 增加：

```ts
| { type: 'recipeAvailable'; recipeIds: string[] }        // 波间 decide 步汇总时发
| { type: 'recipeCompleted'; recipeId: string; outputCardType: CardType; outputStar: number }
| { type: 'recipeRejected'; recipeId: string; reason: 'phase' | 'materials' | 'slots' }
```

## 五、首批配方与产物卡

配方定义与 6 张产物卡（frozenThunder/solarLance/crownOfThorns/goldenIdol/avalanche/pyrestorm）的完整效果见 `docs/五神卡牌设计表_v1.md` §5。本阶段先实装其中 **frozenThunder**（chainLightning 5★ + frost 5★ → 6★）一条做端到端验证，其余 5 条随 C8 一并落地：

```json
{
  "id": "frozenThunder",
  "ingredientA": { "cardId": "chainLightning", "minStar": 5 },
  "ingredientB": { "cardId": "frost", "minStar": 5 },
  "outputCardId": "frozenThunder",
  "outputStar": 6,
  "allowedPhase": "intermission"
}
```

产物卡在 `skills.json` 中是一张完整 CardDef（`recipeOnly: true`，god 归属见设计表），效果用现有原子表达。

## 六、UI

- 波间 free 步：配方面板列出可用配方（材料卡面 + 产物预览 + 确认按钮）；确认二次弹窗提示"将消耗这两张卡"。
- 战斗中：合成提示区一行静默文字提示，不可交互。

## 七、测试与验收

新增 `tests/recipeEvolution.test.ts`：

1. 材料不足 / 星级不够 / 非波间阶段时不可进化（rejected 事件与原因正确）。
2. 确认后恰好消耗两张指定卡，产物占 1 槽；无空槽时落在材料 A 原位。
3. 优先消耗最低星副本；装备卡未勾选时不被当材料。
4. 产物可装备、可释放消耗态、可继续升星；`recipeOnly` 卡不出现在 runRoster/activePool/bounty 袋/validation 奖励（对 C3 入口的回归断言）。
5. 配方完成计入 merges 并触发 onMerge。
6. 不存在任意组合融合入口（类型层面：不存在接受非配方卡对的 API）。
7. 遥测：`recipe_available/recipe_completed`；runSummary 增加完成的配方列表。
