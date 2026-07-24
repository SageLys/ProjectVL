# Codex 任务 C4：经验升级改造为遗物系统

> 前置：C2、C3 已合并。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 经验升级奖励**专供遗物**：删除全部基础 stat perk（伤害/射速/回血/血上限/射程/经验增益），这些已由 C2 波末奖励承接。
2. 遗物候选只来自**已选三神对应遗物 + 中立遗物**；选择遗物会影响该神后续供给（导流）。
3. 用**显式 XP 阈值表 + 品质节奏**替代 `xpNeed *= xpGrowth` 指数曲线；目标普通完整局 5–8 个遗物，前密后疏、前低后高。
4. 掉落导流的 affinity/pity 语义从 BuildTag 改为**按神**；遗物的数值缩放继续按机制标签（BuildTag）走 `buildModifierSystem`。
5. 遗物三选一收编进 C1 决策队列（`kind: 'relic'`），删除 `pendingLevelUps/offeredPerks` 专用通道。

## 二、硬性不变量

1. `buildModifierSystem` 的 `BuildScalingAxis` 白名单缩放机制不动（effectDamageMul/quantityAdd/controlPotencyMul/controlledDamageTakenMul/areaScaleMul/dotDamageMul/defenseDurabilityMul/retaliationMul 等轴全部保留，成为遗物效果底座）。
2. 遗物不得只作用于单一卡：校验器强制 `targetTags` 非空且首版每条遗物至少命中已选池中 2 张卡的机制标签（校验在配置期做静态近似：全局按标签覆盖卡数 ≥3）。
3. 结算分（`cfg.progression.settlement`）逻辑不动。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/systems/progressionSystem.ts` `levelUp/addXp` | `xpNeed = round(xpNeed * cfg.progression.xpGrowth)`（xpGrowth=2）；`pendingLevelUps++`、`paused=true`、`offeredPerks=rollPerkChoices()` | 改为阈值表推进 + `enqueueDecision({kind:'relic', ...})` |
| `progressionSystem.ts` `applyStatEffect` | damagePct/fireRatePct/heal/maxHp/rangePct/xpGainPct | **整体删除**（stat 类 PerkEffect 从遗物 schema 中禁用；xpGainPct 若保留则做成中立遗物的 buildScaling 型近似或专用轴） |
| `progressionSystem.ts` `applyPerk` | `affinity[perk.lane] += affinityGain`；清 roleBag/rewardBag；设 BuildTag pity | 改为 `godAffinity[relic.god] += 1`（中立遗物不加）；pity 改为神级（`poolInfluence.pityDrops` 次内必出该神卡） |
| `progressionSystem.ts` `rollPerkChoices` | 主推/桥接/转型三槽角色逻辑 | 简化重写：槽 1 = 当前重点神遗物；槽 2 = 另一已选神遗物；槽 3 = 中立或第三神（各槽按 rarity 权重抽） |
| `src/config/base/progression.json` | 13 个 perk 混合 stat 与 buildScaling | 拆分：buildScaling 类迁入 `relics.json` 并补 god 归属；stat 类删除 |
| `src/core/types.ts` `BuildState.affinity` | `Record<BuildTag, number>` | 增加 `godAffinity: Record<GodId, number>`；BuildTag affinity 保留只读兼容一版，掉落导流改读 godAffinity |
| `dropTypePolicy.ts` `calculateAffinityScore` | 按 synergyTags 读 BuildTag affinity | 改为：卡的 god 的 godAffinity × 系数（cap 沿用 `affinity.scoreCap` 结构，配置键迁移） |
| `src/ui/modals.ts` 升级弹窗 + `upgradeFeedback.ts` | 三选一 perk UI | 复用为 relic 决策渲染（走通用决策弹窗） |

## 四、配置（`src/config/base/relics.json` + `progression.json` 改造）

`progression.json` 改为：

```json
{
  "killXpMul": 1,
  "relicChoices": 3,
  "targetRelics": { "min": 5, "max": 8 },
  "xpThresholds": [10, 22, 38, 62, 95, 140, 200, 280],
  "rarityByRelicIndex": [
    { "common": 1.0 },
    { "common": 0.9, "rare": 0.1 },
    { "common": 0.75, "rare": 0.25 },
    { "common": 0.55, "rare": 0.4, "epic": 0.05 },
    { "common": 0.3, "rare": 0.55, "epic": 0.15 }
  ],
  "settlement": { ...原样保留... }
}
```

- 阈值表用尽后不再升级（自然封顶 8 个）；`rarityByRelicIndex` 超界取最后一档。数值占位、C9 用 10 波整局仿真标定（目标：非硬保证的 5–8 个）。
- `relics.json`：迁移现有 8 条 buildScaling perk（proj_damage/proj_quantity/ctrl_potency/ctrl_bridge/domain_area/domain_dot/def_durability/def_bridge）→ 按 `docs/五神卡牌设计表_v1.md` §6 的神归属与扩展清单补齐（每神 3–4 条 + 中立 3–4 条，首版共约 20 条）。

## 五、测试与验收

改写 `tests/progressionSystem.test.ts` → `tests/relicSystem.test.ts`（文件名可保留）：

1. 固定 seed 的 10 波 headless 整局：遗物数落在 5–8；第 1–2 个必为 common；后段 epic 概率生效。
2. 遗物候选的 god ∈ {已选三神, 中立}；未入场神的遗物永不出现。
3. 不再存在 heal/maxHp/rangePct/damagePct 类升级项（对配置断言）。
4. 选择某神遗物后：该神 godAffinity+1、roleBag/rewardBag 重建、pityDrops 内必出该神卡。
5. 多次升级排队经决策队列逐个处理，选项不覆盖（复用 C1 规则测试）。
6. 每条遗物 `targetTags` 命中 ≥3 张全局卡。
7. 遥测：`relic_offered/relic_selected`；结算 runSummary 增加遗物数量与品质分布。
