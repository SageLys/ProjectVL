# Codex 实施 Prompt：35 卡全字段重写 + 25 配方进化系统（含全部已知 bug 修复）

## 角色与目标

你是本仓库的实施工程师。本次任务把三份定稿文档一次性落地：

1. `docs/五神35卡_完整设计表_v4.md` —— 35 张基础卡全字段重写（九宫格 + identityContract + interfaceRole + stars/consumable/affix/文案生成规则）
2. `docs/卡牌进化_25配方卡方案_v1.md` —— 25 条进化配方与产物（本次只做 **B0 灰盒**产物，正式产物 B1–B3 后续批次）
3. `docs/卡牌进化系统_重构实行方案_v2.md` —— 进化系统机制（25 格矩阵、即时拖拽、钉选、导演、第 9/10 波奖励）

**三份文档是唯一事实来源。本 prompt 只做导航与验收，内容冲突时以文档为准（优先级：配方方案 > 35 卡表 > 本 prompt）。**

数值全部占位：照表抄，不自行平衡。

---

## 阶段 P0：基线与引擎能力

### P0.1 黄金回放基线（先做，后续所有阶段的回归依据）

按 `docs/黄金回放_fixture规格.md` 录一次基线。P5 改动阶段机（`validationRewardSettle`）前必须有此基线；完工后对比**非进化路径无漂移**。

### P0.2 新增引擎能力（全项目仅此一批，禁止超出）

1. **`chain.spreadStatus` / `chain.spreadParams`**（35 卡表 §0.7）：`chain` 原子每跳后对目标施加指定状态（`vulnerable`/`slow`/`dot`），**不发完整 onHit**（避免链式套娃）。跨卡融合按 statusSystem 既有仲裁（取最强/取最长），把该契约写进 `interpreter.ts` 顶部注释，并在 `fusionOrderInvariance.test.ts` 补用例。
2. B0 阶段**不实现**配方方案 §4.3 机制聚类表中的其余能力（`chainRelay`、summon.onDeath 效果表、charge 计量、requiresStatus 数组化、`extraDrop.secure`、zone 动态参数）——它们属于 B1–B3 正式产物批次，先在类型层预留注释即可。

### P0.3 已知引擎事实（写代码前先读，35 卡表 §0.9）

- `fireTrigger('onHit')` 全项目唯一触发点在 `combatSystem:164`（hitIds 去重后）；`chainFrom`/`explode`/zone tick 只走 `dealDamage` 不发 onHit
- `onKill`/`onBreach` 触发时敌人已被 splice 移出数组，直接作用单体必然打空
- zone 内 `dot` 直接掉血不挂状态；`requiresSource` 真实可用值只有 `weapon`/`chain`/`dot`
- `shield` 容量取最大再生取最小；`novaOnBreak` 分轴取最大；`breachReduction` 相加封顶 0.9；`execute` 取最高
- 第 9、10 波普通掉落完全关闭（`dropSystem.ts:75,:90`）；验证精英清场后立即刷 Boss；第 10 波 Boss 后直接 `endGame`
- `protectedCards()` 硬编码 `.slice(0,3)`、`generateActivePool` 硬编码 `.slice(0,7)`（`activePoolSystem.ts:90,179`）
- `locatedCards` 已过滤 `provisional`；`offerRosterPreviews` 已冻结候选卡组；`calculateCommitmentScore = Σ2^(星-1)`

---

## 阶段 P1：配置契约

### P1.1 类型（`src/config/types.ts` + `src/core/effects/defs.ts`）

- `CardDef` 新增：`identityContract: string`；产物卡另有 `primaryGod` / `sourceGods: GodId[]`（`recipeOnly` 卡专用，普通卡缺省）
- `EvolutionOptionDef` 新增：`interfaceRole?: 'payoff' | 'spread' | 'convert'`
- `EvolutionRecipeDef` 重写为 v2 §12.1 形状：`recipeType: 'sameGod'|'crossGod'`、`variableGod`、`anchorGod`、`ingredientVariable`、`ingredientAnchor`（双方 `minStar: 5`）、`outputCardId`、`outputStar: 6`；**删除 `allowedPhase`**
- 删除 `allowedPhase` 需同改 6 处：`config/types.ts:303`、`godValidator.ts:118`、`evolutionRecipes.json`、`design/describe.ts:212`、`design/cardView.ts:214`、`design/mechanismEditor.ts:303-305`、`editor/labels.ts:215`
- `RunDecision`：删除未使用的 `recipeEvolution` 占位，新增 `{ kind: 'recipePin'; candidates: string[] }`

### P1.2 `economy.json` 新增 `evolution` 块（v2 §12.1 原文照抄）

`maxRecipeCompletions: 2`、`completionLimitPerRecipe: 1`、`assistWindowWaves: [4,8]`、`assistCheckpoints: [6,8]`、`assistMaxCorrections: 2`、`assistMaxCorrectionsPerMaterial: 1`、`assistRewardPolicy: "minimumMergeCompletion"`、`allowDirectFiveStarAssist: false`、`recipeProtectionSlots: 2`、`bountyRecipeMaterialBonus: 1.6`、`bountyReadySideMultiplier: 0.5`

### P1.3 状态层（v2 §12.2）

新增 `RecipeRunState`：`compatibleRecipeIds` / `pinnedRecipeId` / `readyRecipeIds` / `notifiedRecipeIds` / `completedRecipeIds`（取代只写不读的 `state.completedRecipes`）/ `assistBudgetUsed` / `assistClosed` / `firstReadyWave`。

---

## 阶段 P2：校验器与静态测试（先立规矩再写内容）

### P2.1 `skillValidator.ts`：V1–V14 全部硬失败（35 卡表 §7.1）

V1 3★ 两两载体或触发器不同｜V2 3★ 全产本神资源｜V3 5★ 三选项 `interfaceRole` 覆盖 payoff/spread/convert 各一｜V4 3★ 与 5★ 不强化同一 param（amplify 键 vs 5★ 强化键）｜V5 条件效果有 0 资源 fallback｜V6 普通卡不用他神身份原子（磐垒 `mergeMaterialRefund` 明示例外；`recipeOnly` 卡走白名单：仅允许 `sourceGods` 两神的身份原子）｜V7 九宫格组合无重复绑定集合｜V8 onKill/onBreach 不得含直接作用单体敌人的原子｜V9 `requiresStatus:'dot'` 必须有本神直接 dot 供给分支｜V10 6★ 不撞分支的取最大/覆盖原子｜V11 `requiresSource` ∈ {weapon,chain,dot}｜V12 每神锚定卡 1 铺设 + 1 兑现｜V13 跨神同 category 3★ 指纹不重复（警告级）｜V14 每卡非空 `identityContract`；全部 5★ 选项有 `interfaceRole` 且三选项互不相同

### P2.2 `godValidator.ts`：配方图 13 条（v2 §13.1 原文）

恰好 25 条（20 cross + 5 same）；5×5 每格恰好 1 条；每神恰好 1 同神、每无序神对恰好 2 条反向；材料身份正确（variable 是该神可变卡、anchor 是该神锚点）；可变卡度数恰好 1、每神锚点度数 {2,3}、任意材料度数 ≤3；25 个无序材料对唯一；minStar 双 5、outputStar 6；产物 `recipeOnly: true`、无 `evolutionTree`、绑定在 `stars['6']`、id 唯一、被恰好 1 条配方引用；产物不作任何配方材料；材料不得是 `recipeOnly` 卡；产物绑定无重复取最大/覆盖原子、onKill/onBreach 必须坐标类；删除 `allowedPhase` 校验。

### P2.3 `tests/recipeReachability.test.ts`（v2 §13.2）

穷举 7,500 种名册状态，**按计数严格断言**：零配方局 = 0；分布 1:4.8% / 2:24.0% / 3:41.2% / 4:26.4% / 5:3.6%；均值 3.0；≥1 跨神 96.4%、≥1 同神 74.4%、两类同时 70.8%；单条同神 20.0%（5 条全等）、单条跨神 10.0%（20 条全等）；生产恢复兜底在合法配置下触发 0 次。

---

## 阶段 P3：35 卡内容重写（`skills.json` + `texts.json`）

对照 `docs/五神35卡_完整设计表_v4.md` 逐卡执行。要点：

1. **每卡**：`identityContract`＋3★ A/B/C（载体@触发照表）＋4★ amplify（表中 params，键只放大分支中实际存在的参数）＋5★ 三选项（`interfaceRole` 照表：1=payoff、2=spread、3=convert；fallback 照表）＋6★ 公共＋消耗态 anchors 1/3/6＋affixPool（§0.4 神系模板，偏差卡照标注）＋stars 迁移锚点（§0.2 规则：3=A、5=A+5★1、6=A+5★1+6★）
2. **文案**（§0.5 规则，功能性占位；不写题材文案）：name/overview 照表；分支 summary 从效果列提炼，禁止跨分支复制同一句
3. **删除** 6 张旧 `recipeOnly` 产物卡（frozenThunder / solarLance / avalanche / pyrestorm / crownOfThorns / goldenIdol）与 `evolutionRecipes.json` 全部 6 条旧配方
4. **不改 `gods.json`**（`harvest` 只改效果，anchorCardIds 不动）

### P3.1 本阶段消灭的内容 bug（验收时逐项核对）

| # | bug | 修复方式 |
|---|---|---|
| 1 | `onKill`/`onBreach` 打空绑定 **42 处 / 8 卡**（最重 `retribution` ×14、`cinderheart` ×5、`overcharge` ×2） | 全部改为按事件坐标的范围/区域/玩家侧效果（V8 拦截回归） |
| 2 | 6★ 覆盖分支 **14 处**（`galvanicWard`、`frozenBulwark`、`aegis`、`harvest` 等） | 6★ 全部换正交原子（V10 拦截回归） |
| 3 | `ironvine` `requiresSource:'retaliation'` 不可达 ×1 | 已删，改按表（V11 拦截回归） |
| 4 | 丰饶锚定卡不产赏印（副神丰饶 60% 无身份效果） | `harvest` 改造为赏印铺设锚（V12 拦截回归） |
| 5 | 3★ 选项同构 45/105 对 | 105 支全部重写（V1 拦截回归） |
| 6 | `mergeMaterialRefund` / `wildcardRewardBonus` 零使用 | 分别启用于 `ironvine` 5★3 / `fateLoom` 5★3 |
| 7 | `vulnerable` 泄漏 11 卡、`shield` 泄漏 4 卡等他神原子扩散 | 按 §1.2 归属收回（V6 拦截回归） |

---

## 阶段 P4：进化系统运行时（v2 §6 / §12.3）

1. `confirmRecipe` 阶段判定从「必须波间」改为 v2 §6.1 的五条（`mode`/`decisionQueue`/`intermission.step`/上限/已完成）；**修复现存 bug：`availableRecipes()` 不过滤已完成配方 → 必须过滤 `completedRecipeIds` 与 2 次上限**
2. **卡叠卡即时拖拽**（v2 §6.2）：`onDrop` 中把 `matchRecipeDrop`（无序材料对识别）插到 `moveOrSwap` **之前**，仅当两卡构成**当前 ready** 的配方时拦截；A→B 与 B→A 等效；产物落在**目标卡**槽位；四种槽组合（手↔手/手↔装/装↔手/装↔装）全支持；无二次确认弹窗（删除 `window.confirm`）；配方失效时只取消、不回退成交换；拖拽期目标槽强高亮 + 产物名预览
3. **进化事务 9 步**（v2 §12.3）：按实例 ID 重定位 → 无序匹配 → 校验（星级/provisional/已完成/上限）→ 消耗两材料 → 目标槽 `createCardWithAffixes` 建产物 → 写 `primaryGod`/`sourceGods`/`RecipeLineage` → 正式 `commitMerge` 一次 → 对账（`reconcileMaxHp`/`reconcileEquipmentPassives`/召唤物/光环/武器时钟）→ 发完整事件 + `autoMergeCards` 连锁。失败路径不改状态、不消耗随机数
4. **退役波间面板配方区块**（v2 §6.3）：删除 `intermissionPanel.ts` 的配方列表/装备勾选/确认按钮/`window.confirm`，只留进度展示
5. 系统函数拆分照 v2 §12.3 表：`getRosterCompatibleRecipes` / `getActionableRecipes` / `recomputeRecipeReadiness`（首次 ready 置 `assistClosed`）/ `matchRecipeDrop` / `evolveRecipePair` / `updateRecipeDirector`
6. 产物**不继承**材料分支效果，只记 `RecipeLineage`；进化预览明确提示「原分支被终极形态替代」

## 阶段 P5：供给导演与第 9/10 波奖励（v2 §5 / §7，决议 3/4）

1. **导演（波 4–8）三条干预**：活跃池保护名额 3→5（2 个专用配方材料，池上限仍 7）；追踪材料强制插入 `buildCandidatesForBuildRole` Top-K（按缺口 `16-Σ2^(星-1)` 动态加权，不看主副神）；Bounty 权重 ×1.6 / 已 5★ 侧 ×0.5。**不新增 `recipe` 掉落角色**
2. **检查点阶梯**（v2 §5.5）：第 6 波只调权重；第 8 波起定向修正——**只发「加入后即可完成一次升星的最低星复制卡」，禁止直接发 5★**；最多 2 次、每材料 1 次；任意配方首次 ready → `assistClosed` 永久关闭全部保障；`assistBudgetUsed` 入 runSummary 与遥测
3. **决议 3a**：validation 定向卡牌奖励改为**直接进手牌**（入空槽即走 `autoMergeCards`+`commitMerge`；手牌满退化为落地 `secure` 掉落）；新增事件 `validationRewardGranted { wave, cardType, star, delivery }`
4. **决议 3b**：新增 `wavePhase: 'validationRewardSettle'`（精英清场 → 结算窗 → Boss）：停止出怪、等待安全奖励拾取、允许整理/万能卡/即时进化，玩家确认或**超时 12s** 生成 Boss；第 10 波 Boss 战后奖励不计入保底。改 `waveSystem.advanceWavePhase`、`intermissionSystem`、HUD 倒计时——**改前必须已有 P0.1 黄金回放基线**
5. **锁池与钉选**（v2 §5.3）：第 3 波锁池后算 `compatibleRecipeIds`，弹 `recipePin` 决策（可跳过，第 4 波自动钉进度最高者）；钉选可改、不重置额度；**所有兼容配方一律公开可完成，不做随机禁用**

## 阶段 P6：UI（v2 §11）

图谱：锁池后只列名册兼容 1–5 条（进度 `Σ2^(星-1)`/16），全局其余配方在图鉴标「本局材料未入池」不得静默隐藏；HUD 开局即显示 `进化 0/2`，达上限后停画可操作连线。连线：`.recipe-hints` **波间也渲染**（删 `wavePhase !== 'between'` 拦截）；材料卡独特形状标识（无障碍）；共享锚点多配方分叉用不同色相 + 「用于其中一条后另一条无法完成」提示。文案：删 `texts.evolution.recipeCombatHint` 的「（波间可确认）」与 `recipeAsIngredient` 的旧描述，改「拖动任一材料至另一张，立即进化」。副神候选界面补：该神带入 3 张卡 + 组合后新增潜在配方（标同神/跨神、未锁池标「候选」）。卡详情 `ingredientRecipeViewModels` 改局内/图鉴双模式。5★ 万能卡拖向已就绪材料时警示态「升到 6★ 不会提升进化产物」（不禁止）。完成演出 ≤0.6s、不暂停战斗、`prefers-reduced-motion` 降级。

## 阶段 P7：B0 灰盒产物 + 配方数据

1. `evolutionRecipes.json` 重写为 25 条（配方方案 §1 矩阵；id `r_<可变卡>_<锚点卡>`）
2. 25 张灰盒产物卡（配方方案 §0.5）：`recipeOnly: true`、仅 `stars['6']`、统一 `interval 2.5s → burstDamage(point)` + `passive → statBuff`（逐张参数微调）、`primaryGod`=锚点方、`sourceGods` 双神、文案标「灰盒占位」；必须通过 P2 全部校验
3. 正式产物 B1（5 同神）→ B2（10 正向）→ B3（10 反向）**不在本次范围**；B2/B3 前先做配方方案 §4.3 机制聚类

---

## 测试与回归（v2 §13.3 / §13.4）

- **反转/删除旧断言**（`tests/recipeEvolution.test.ts`）：战斗阶段拒绝→反转为通过；装备勾选 opt-in→删除；silent hint→失效；模块只导出两函数→新增导出
- **即时交互**：战斗/Boss/波间 free/`validationRewardSettle` 成功；暂停/弹窗/结算/decide 拒绝且 reason 正确；产物严格落目标槽、四组合全覆盖；过期实例/星级不足/provisional 不改状态不消耗随机数；不误触发交换/喂养；完成同帧移除连线；同配方不可二次完成；2 次上限严格
- **奖励与保底**：手牌有空槽直接入手并 autoMerge；满槽退化落地不丢失；结算窗超时 12s；修正奖励恒为最低星复制卡、永不 5★；`assistBudgetUsed` ≤2 且每材料 ≤1；首次 ready 后 `assistClosed` 永久
- **回归**：`recipeOnly` 卡不进 `getCardPool`/`runRoster`/`activePool`/bounty 袋/validation 奖励；进化计一次 merge 并触发 `onMerge`；进 runSummary；`npm test` 与 `npm run build` 通过；黄金回放非配方路径无漂移

## 红线（违反即返工）

1. 不为单张产物在核心层写 if；通用能力必须服务 ≥2 张卡
2. 不实现 v1 已作废方案（`ensureRecipeMaterials` 注入、`drawRoster` 避让、开放 3 条制、`recipeMix` 掉落角色、进化核心落点）——名册生成逻辑**一行不改**
3. 不做产物动态继承材料分支效果（只记 `RecipeLineage`）
4. 不放行暂停期拖拽；不为进化改 `pointerRouter` 的 `isPaused` 语义
5. 数值只抄占位，不自行平衡；文案只写功能性占位，不写题材文案
6. 遗物系统、`buildModifierSystem`、双神加成机制一概不动（`sourceGods` 仅存档/图鉴/遥测）

## 提交顺序建议

P0 → P1 → P2（此时校验器对旧内容大量报错是预期）→ P3（让校验全绿）→ P4 → P5 → P6 → P7 → 全量测试与黄金回放对比。每阶段独立提交，附验收清单勾选结果。
