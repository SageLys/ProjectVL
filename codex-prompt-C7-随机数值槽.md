# Codex 任务 C7：技能效果槽与随机数值槽分离

> 前置：C5 已合并（可与 C6 并行）。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 每张卡分离**技能效果槽**（预设固定，现有效果体系）与**数值加成槽**（从卡型专属词条池随机）。
2. **本局词条模板**：同一卡型每局第一次出现时随机一次词条组合与数值，本局所有同类卡共享（防自动合成吞掉优质词条；每实例独立词条延后）。
3. 装备时词条**持续生效**；消耗释放时同一词条转为**限时 Buff**。
4. 把只支持 `fireRateMul/damageMul` 的 `Buff` 扩展为通用限时修饰器 `RuntimeStatModifier`。

## 二、硬性不变量

1. 词条只做数值加成，不引入新效果原子、不改变技能行为。
2. 词条模板必须由注入 rng 生成且只生成一次；固定 seed 可重现。
3. 卸下装备或消耗结束后，对应词条效果立即消失（装备词条不落库到状态数组，由聚合器实时读取）。
4. 镶嵌/转移/升星扩槽全部不做（延后）。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/types.ts` `Buff` | `{ kind: 'fireRateMul' | 'damageMul'; mul; remaining }`，`stats.ts buffMul` 消费 | 扩展为 RuntimeStatModifier（§四），旧两种 kind 迁移为 `stat: 'damage'/'fireRate', operation: 'mul'` |
| C0 已建 | `CardAffixPoolDef/CardAffixCandidateDef/CardStatKind` 类型、`CardDef.affixPool` 可选字段、`Card.affixes` 可选字段 | 消费 |
| C2 已建 | `RunBaseStats` 与 `stats.ts` 的 Add 通道 | 装备词条的 add 类聚合走同通道旁路（equipmentAffixAdd） |
| `src/core/effects/interpreter.ts` `getModifiers` / `buildModifierSystem` | 机制标签缩放聚合 | 词条中 BuildScalingAxis 类 stat 并入同一聚合（来源标记 affix） |
| `src/core/effects/interpreter.ts` `releaseConsumable` | 消耗释放入口 | 释放时注入限时词条修饰器 |
| `src/ui/cardMeta.ts` / `renderCards.ts` | 卡面 | 分区显示技能效果与词条 |

## 四、通用限时修饰器（`src/core/types.ts` + `src/core/stats.ts`）

```ts
export interface RuntimeStatModifier {
  sourceId: string;               // 'affix:<cardType>' / 'skill:<cardId>:<bindingIndex>' 等
  stat: CardStatKind | 'damage' | 'fireRate';
  operation: 'add' | 'mul';
  value: number;
  remaining?: number;             // undefined = 持续（仅内部使用；消耗词条一律有时限）
}
// GameState.buffs: Buff[] → statModifiers: RuntimeStatModifier[]
```

- `stats.ts`：`buffMul` 泛化为 `modifierTotal(state, stat)`（mul 连乘、add 累加）；`totalDamage/totalFireRate/totalRange/totalMulti` 改读它；技能原子里读旧 `Buff` 的位置（如射速 buff 类效果）迁移。
- 到期清理在 `effects/runtime.ts` 的统一 tick 中进行。

## 五、词条系统（新增 `src/core/systems/cardAffixSystem.ts`）

```ts
export interface CardAffixRoll { stat: CardStatKind; value: number; consumableDuration: number; }
// GameState.runBuild 增加：cardAffixRolls: Record<CardType, CardAffixRoll[]>;

export function ensureAffixTemplate(state: GameState, rng: Rng, type: CardType): CardAffixRoll[];
// 首次调用时按 def.affixPool 加权抽 count 条候选（去重），数值在 [min,max] 内按 step 取整；写模板并返回
```

- 卡实例创建点（掉落拾取 `collectDrop`、合成 `autoMergeCards`、配方产物、调试生成）统一经 `ensureAffixTemplate` 把模板副本写入 `card.affixes`（显示用；规则以模板为准）。
- **装备聚合**：`getModifiers`/stats 聚合遍历 `effectiveEquipment(state)`，对每张装备卡读其卡型模板，按 stat 分派：RunBaseStat 类 → add 通道；BuildScalingAxis 类 → 该卡自身的缩放叠加（仅作用于本卡的绑定，语义与 buildScaling 对单卡生效一致）。
- **消耗释放**：`releaseConsumable` 时对每条词条压入 `RuntimeStatModifier{ sourceId:'affix:'+type, remaining: consumableDuration }`（全局生效，add/mul 按 stat 类型）。
- 星级不改变词条数量与数值（升星扩槽延后）。

## 六、临时配置（仅为本阶段可测）

给 `pierce` 与 `frost` 两卡补 `affixPool`（内容按 `docs/五神卡牌设计表_v1.md` 对应条目，如 pierce：damageAdd 1–3 / fireRateAdd 0.1–0.25 / effectDamageMul 0.05–0.15，count=2）。其余卡 C8 全量补齐；无 affixPool 的卡零词条、行为不变。

## 七、UI

卡面下半区新增词条区（图标 + 数值文本，文案键 `texts.json` 增 `affixes.*`）；装备槽卡与手牌卡同样显示；消耗释放的限时词条在 HUD buff 区显示剩余时间（复用现有 buff 展示位置）。

## 八、测试与验收

新增 `tests/cardAffixSystem.test.ts`、改 `tests/combatSystem.test.ts`（stats 断言）：

1. 同一局同一卡型的所有副本词条一致；不同 seed 模板不同；同 seed 可重现。
2. 词条 stat ∈ 该卡 affixPool 候选、数值在 [min,max] 且对齐 step。
3. 装备后 `totalDamage` 等立即反映 add 词条；卸下立即消失。
4. 消耗释放后词条限时生效，`remaining` 归零即失效；期间叠加装备词条不冲突。
5. 自动合成（2★+2★→3★）后词条不变（模板级，不存在吞词条）。
6. 旧 Buff 语义（damageMul/fireRateMul 技能 buff）迁移后行为不变（固定 seed 回归）。
7. 遥测：`affix_rolled`（卡型、词条、数值）。
