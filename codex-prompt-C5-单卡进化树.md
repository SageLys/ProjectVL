# Codex 任务 C5：单卡进化树（分叉—合并—分叉—合并）

> 前置：C0、C1 已合并（可与 C3/C4 并行）。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

在 6 星上限下实现每张卡的进化树：

```text
1★ 基础 → 2★ 数值成长 → 3★ 分叉(3 选 1) → 4★ 公共强化 → 5★ 分叉(3 选 1) → 6★ 公共终态
```

- "合并"= 所有路径共同获得公共节点，同时**保留**已选分支效果（叠加，不清除）。
- 5★ 分支与 3★ 分支独立组合（3×3 = 9 条路径）。
- 分支选择**按本局卡族锁定**：同一 cardType 本局第一次到关键星级时选一次，后续同类卡自动继承。
- 关键星合成中断自动连锁，经决策队列选择后再续。

## 二、硬性不变量

1. 效果解释器的触发器/原子语义不动；进化只改变"某星级解析出哪些绑定"。
2. 合成材料守恒：进化选择不复制、不丢卡；待决期间材料已消耗、结果未成形，占用产物槽位（provisional 卡占 1 槽）。
3. 消耗态锚点（1/3/6）解析暂不随分支变化（首版消耗态只随星级，C8 的设计表如有分支专属消耗态再扩展）。
4. `equipThreshold=3`、`maxStar=6`、二合升级不变。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/effects/interpreter.ts` `resolveEquipBindings(def, star)` | `star<3 → []`；`star===4 → 对 3★ amplify`；否则取 3/5/6 锚点 | 重写为 `resolveCardBindings(def, evolutionPath, star)`（§四） |
| `interpreter.ts` `equippedBindings` | 只传 `def, card.star` | 传入 `card.evolutionPath` |
| `src/core/systems/cardSystem.ts` `autoMergeCards` | 检测到足量同型同星即刻合成并连锁 | 关键星级插入待决流程（§五） |
| `src/core/types.ts` `Card` | C0 已加 `evolutionPath?: string[]` | 本阶段正式启用（默认 []） |
| C0 已建 | `EvolutionTreeDef`（checkpoints 3/5 各 3 option、sharedNodes 4/6）与校验 | 消费 |
| C1 已建 | 决策队列 `evolutionBranch` kind 占位 | 实装 apply |
| `src/ui/renderCards.ts` / `cardMeta.ts` / `renderMergeHints.ts` | 卡面/合成提示 | 显示已选路线徽记与待选状态 |

## 四、绑定解析改造（`src/core/effects/interpreter.ts`）

```ts
export function resolveCardBindings(def: CardDef, evolutionPath: string[], star: number): BindingDef[] {
  if (star < 3) return [];
  if (!def.evolutionTree) return legacyResolveEquipBindings(def, star); // 旧 3/5/6 锚点路径，兼容未迁移卡
  const bindings: BindingDef[] = [];
  const cp3 = optionBindings(def, 3, evolutionPath);           // 3★ 已选分支
  if (star >= 3) bindings.push(...(star === 4 ? applyAmplify(clone(cp3), sharedAmplify(def, 4)) : clone(cp3)));
  if (star >= 4) bindings.push(...sharedEquip(def, 4));        // 4★ 公共节点（5★+ 继续保留）
  if (star >= 5) bindings.push(...optionBindings(def, 5, evolutionPath));
  if (star >= 6) bindings.push(...sharedEquip(def, 6));        // 6★ 终态（transform 类绑定按设计表可替换低层弹道形态，用现有 beamMorph/mortarMorph 语义）
  return bindings;
}
```

- `evolutionPath` 形如 `['3:pierceA', '5:pierceB2']`（`checkpointStar:optionId`）；未选到的层不解析。
- 4★ 数值放大沿用 `applyAmplify` 机制，放大参数来自 `sharedNodes[star=4].amplify`（等价旧 `amplifyAxis.params` 的迁移位）。
- 保留 `legacyResolveEquipBindings`（原函数改名）供无 `evolutionTree` 的卡使用——C5 阶段旧 11 卡尚未迁移，行为不变；C8 全量迁移后删除。

## 五、待决合成（`src/core/systems/cardSystem.ts` + 新 `src/core/systems/evolutionTreeSystem.ts`）

状态：

```ts
// GameState 增加：
// runBuild: { evolutionChoices: Record<CardType, Record<number /*checkpointStar*/, string /*optionId*/>> };
// Card 增加：provisional?: boolean;   // 待选择分支的半成品卡
```

`autoMergeCards` 改造：

```text
发现可合成(type, star→resultStar)
  → resultStar 不是该卡 checkpoint 星级，或该卡族该 checkpoint 已有选择：
       直接完成（已有选择则把 optionId 写入 evolutionPath）→ 继续连锁
  → 是 checkpoint 且未选择：
       消耗材料，生成 provisional 卡（占原槽，provisional=true，装备/消耗/继续合成均禁止）
       enqueueDecision({ kind:'evolutionBranch', cardType, checkpointStar, options, provisionalCardId })
       本轮连锁在该卡族上暂停（其他卡族可继续）
选择完成（decisionQueue apply）：
       provisional=false；写 runBuild.evolutionChoices 与 card.evolutionPath
       重新调用 autoMergeCards 续连锁
```

- 一次拾取触发多个 checkpoint 时依决策队列顺序逐个处理（C1 已保证不覆盖）。
- 万能卡合成（`wildcardSystem`）升到 checkpoint 星级时走同一待决路径。
- 已锁路线的卡族，后续副本升星自动继承（不再弹选择）。

## 六、UI

- 进化选择弹窗（通用决策弹窗的 evolutionBranch 渲染）：显示 3 个分支的名称与效果摘要（文案 `texts.json` 增 `evolution.*`，每 option 一键）；显示"本局该卡族将锁定此路线"。
- 卡面：3★+ 显示路线徽记；provisional 卡显示待选状态；合成提示注明"下一星将触发路线选择"。

## 七、临时迁移（仅为本阶段可测）

给 `pierce` 一张卡在 `skills.json` 补 `evolutionTree`（内容按 `docs/五神卡牌设计表_v1.md` §storm/pierce 条目），作为首个全树卡验证端到端；其余 10 卡维持 legacy 路径。C8 再全量迁移。

## 八、测试与验收

新增 `tests/evolutionTree.test.ts`；改 `tests/cardSystem.test.ts`：

1. pierce 2★+2★ 合成 → 出现 provisional 卡 + evolutionBranch 决策；选择后卡成形、材料计数正确（不复制不丢失）。
2. 同卡族第二次升 3★ 自动继承路线，不再弹选择。
3. 3★ 选 A、5★ 选 B2 后：`resolveCardBindings` 同时含 A 效果 + 4★ 公共 + B2 效果；6★ 再叠终态。
4. 4★ 对 3★ 分支效果做同构放大（等价旧 amplify 语义）。
5. provisional 卡不可装备/消耗/参与合成；选择后可继续自动连锁（预置 4 张 2★ 一次拾取的连锁用例）。
6. 无 evolutionTree 的卡行为与改动前完全一致（固定 seed 回归）。
7. `jumpToWave` 不清除 runBuild.evolutionChoices（局内持久）。
8. 遥测：`evolution_branch_offered/evolution_branch_selected`；runSummary 增加各卡最高星与路径。
