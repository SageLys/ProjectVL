# Codex 任务 C8：五神 35 张正式卡 + 遗物 + 配方全量落地

> 前置：C0–C7 **全部**已合并（开工前自查：决策队列、活跃池、进化树、配方、词条系统均可用；否则停止并报告）。
> 内容唯一依据：`docs/五神卡牌设计表_v1.md`（结构定稿，数值占位）。Codex 照表实施，不得自行增删分支、改原子选型或发明新卡。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. `skills.json`：11 张旧卡按设计表 §3 补全进化树（旧 3★core→3★A、旧 5★dual→5★A、旧 6★→终态、amplifyAxis→4★公共放大）与词条池；新增 24 张新卡 + 6 张配方产物卡（`recipeOnly: true`）的完整 CardDef。
2. `gods.json`：按设计表 §2 填满五神（各 2 锚点 + 5 可变）。
3. `relics.json`：按设计表 §6 迁移 8 条旧 perk 归属 + 新增约 14 条。
4. `evolutionRecipes.json`：设计表 §5 的 6 条配方（C6 已有 frozenThunder 则核对替换为定稿版）。
5. 新增 2 个效果原子 `restore` / `statBuff`（设计表 §7），进 `AtomName`、解释器、`docs/skills-schema.json`、`skillValidator`。
6. 文案与视觉：`src/data/texts.json` 补 `gods.*`、全部 `cards.*`、`evolution.*`、`affixes.*`；`src/presentation/cardVisuals.json` 按现有视觉编码惯例给每张新卡配色/形状（同神共享主色相，类别决定形状语义）。
7. C5 的 `legacyResolveEquipBindings` 兼容路径删除（35 卡全部有进化树；产物卡无树但为终态单档，走终态解析）。

## 二、硬性不变量

1. 核心层零单卡 if：所有卡行为由 JSON + 原子表达。
2. 新原子必须服务 ≥3 张卡（设计表已满足），并接入 buildScaling 参数白名单审查（`buildModifierSystem` 的轴规则表按需扩展 restore/statBuff 的可缩放参数，保守起见首版不纳入缩放）。
3. 控制类效果全部经现有控制预算 / ccImmune / kbFatigue 仲裁。
4. 掉落三级范围（C3）与 `recipeOnly` 排除规则必须对 35+6 张全量生效。
5. 数值全部按设计表占位值填入，标定留给 C9；本任务的验收不含平衡性。

## 三、实施顺序（建议分 4 个 PR）

1. **PR-1 原子与 schema**：restore/statBuff 原子 + 解释器实现 + `effectAtoms.test.ts` 用例 + schema/validator 放行。
2. **PR-2 旧卡迁移**：11 张旧卡树化 + 词条池 + gods.json 五神填满 + 删 legacy 解析路径；固定 seed 回归（旧卡 3★A/5★A/6★ 路径下行为与迁移前一致）。
3. **PR-3 新卡与产物卡**：24 新卡 + 6 产物卡 + 配方 + 文案视觉。
4. **PR-4 遗物**：relics.json 全量 + 遗物-卡标签覆盖校验。

## 四、测试与验收

1. 配置校验全绿：五神各 7 张、35 卡 god 齐备、每卡树结构合法（3/5 各 3 支、4/6 公共）、词条池合法。
2. `tests/skillCompatibility.test.ts` 扩展：设计表 §8 每类乘法接口 ≥1 个跨神组合用例（易伤×链、受控增伤×dot、聚怪×aoe、攻速buff×onFire riders、全局经济×任意）；任意两卡装备并存不冲突的抽样矩阵。
3. 每张新卡冒烟：3★ 三分支各自可装备生效、消耗态可释放、6★ 终态形变正常（headless 逐卡脚本，参照 `tests/skillsBatch1/2.test.ts` 惯例新增 `tests/skillsGods.test.ts`）。
4. 6 条配方端到端：材料→确认→产物装备/消耗可用；产物不入任何掉落池。
5. 遗物：每条 targetTags 命中 ≥3 张卡；候选只来自已选神+中立（C4 回归）。
6. 固定 seed 10 波整局 headless 通关：全程无未选神卡泄漏、无异常、runSummary 完整。
7. 遥测新增字段核对：`card_shown_by_god / card_collected_by_god / affix_rolled` 覆盖新卡。
