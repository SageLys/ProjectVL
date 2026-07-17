# Codex 任务 A1：流派标签层 + 数据驱动 Perk 与角色化三选一

> 本任务是「构筑闭环」四连任务（A1→A2→A3→A4）的第一步。所有文件路径与行号均已对照开工前 `main` 分支核实；若行号有偏移，以符号名为准。
> 每个阶段结束必须保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。
> 四连任务总目标：**升级选择表达构筑方向 → 普通掉落与 Bounty 供给该方向的组件（A2）→ 技能效果按方向获得实际强化（A3）→ 每波波末 Boss 提供万能卡突破资源（A4）**。

---

## 一、本任务目标

1. 给 11 张技能卡增加多值宽协同标签 `synergyTags`（不动现有 `category`）。
2. 在 `GameState` 中建立玩家的**流派倾向状态** `buildState.affinity`。
3. 把经验升级 Perk 从固定 `kind` switch 重构为**数据驱动**：Perk 携带流派归属（lane）、倾向增量（affinityGain）、效果列表（effects）。
4. 升级三选一从纯权重随机改为**角色化**：主推位 / 桥接位 / 转型位。
5. 升级弹窗展示流派标签与「哪些卡会受益」。

本任务**不实装**流派对技能数值的强化（A3）与对掉落概率的影响（A2）。`buildScaling` 类效果在本任务只被解析、校验、存储，运行时为 no-op。战斗行为唯一的变化是：Perk 池内容变了（见 §五）。

---

## 二、硬性不变量（实现后逐条自查）

1. `category` 字段语义不变，仍用于卡牌颜色 / UI 分类（`src/presentation/cardVisual.ts`、`src/ui/cardMeta.ts` 等消费方不动）。
2. 经验曲线不动：`xpNeedBase=10`、`xpGrowth=2`、`killXpMul=1`、`perkChoices=3`（`src/config/base/progression.json`）。注意 `xpGrowth=2` 意味着一局升级次数有限（约 6~8 次），Perk 的 maxStacks 与角色化选取要在这个预算内工作。
3. `levelUp` / `addXp` / pendingLevelUps 队列语义不变（`src/core/systems/progressionSystem.ts` L33-49）：连续跨级仍逐级弹三选一。
4. utility 类 Perk（治疗/上限/经验/基础伤害/射速）的既有效果路径不变：仍写 `state.hp/maxHp/xpGainBonus/damageBonus/fireRateBonus`，`src/core/stats.ts` 不动。
5. 掉落系统、Bounty、万能卡、波次全部不动（那是 A2/A4 的事）。
6. RNG 纪律：只用注入的 `rng`，禁止 `Math.random`；固定 rng 序列可复现。角色化选取会改变同 seed 下的 rng 消耗序列，属预期。
7. `skillValidator` 保持「失败即抛错，绝不降级」的严格风格。

---

## 三、现状（已核实）

| 位置 | 内容 | 处置 |
|---|---|---|
| `src/core/effects/defs.ts` L7 | `Category` 五值；`CardDef`（L66-80）无标签字段 | 新增 `BuildTag` 与 `CardDef.synergyTags` |
| `src/config/base/skills.json` | 11 张卡，只有单值 `category` | 每张卡加 `synergyTags`（§四表） |
| `src/config/skillValidator.ts` L5 | `CARD_KEYS` 严格白名单，不含 `synergyTags`——**不改会启动抛错** | 白名单加入并校验 |
| `src/config/types.ts` L121-129 | `PerkDef`：`kind` 六选一 + value | 重定义为数据驱动结构（§五） |
| `src/config/base/progression.json` L6-61 | 6 个通用 Perk | 替换为新 Perk 池（§五） |
| `src/core/systems/progressionSystem.ts` L6-30 | `rollPerkChoices`：全池按权重无放回抽 3 | 改为角色化三选一（§六） |
| `progressionSystem.ts` L52-87 | `applyPerk`：固定 `switch (perk.kind)` | 改为遍历 `perk.effects` + 记录 affinity（§五.3） |
| `src/core/types.ts` `GameState` | 无 buildState | 新增（§四.3） |
| `src/core/createInitialState.ts` | 无 buildState 初始化 | 初始化全 0 |
| `src/game.ts` L84-88, L101-107 | `resolveOfferedPerks` 按 id 查 `cfg.progression.perks`；`onPerk` 调 `applyPerk` | 结构不变，随 PerkDef 类型编译通过即可 |
| `src/ui/modals.ts` L22-33 | `showLevel` 只渲染 title+desc | 增加流派标签与受益卡展示（§七） |
| `src/data/texts.json` | 无流派名文案 | 增加 `lanes.*` 与升级弹窗提示文案 |
| `tests/progressionSystem.test.ts` | 针对旧 kind 的测试 | 更新 + 新增（§八） |

---

## 四、流派标签层

### 1. 类型定义（`src/core/effects/defs.ts`）

```ts
/** 宽协同流派标签。utility 为通用辅助（当前仅 harvest），暂不作为主推流派。 */
export type BuildTag = 'projectile' | 'control' | 'domain' | 'defense' | 'utility';

export interface CardDef {
  // ...现有字段不动
  /** 宽协同标签（1~2 个，非空、去重）；与 category 独立，仅用于构筑协同。 */
  synergyTags: BuildTag[];
}
```

### 2. 11 张卡的标签分配（写入 `src/config/base/skills.json`，逐张核对过效果原子）

| 卡 id | category | synergyTags | 依据 |
|---|---|---|---|
| pierce | projectile | `["projectile"]` | 穿透/折返/光束 |
| chainLightning | projectile | `["projectile", "control"]` | 连锁 + slow |
| splitBlast | projectile | `["projectile", "domain"]` | 分裂 + aoeOnHit/榴弹 |
| frost | control | `["control", "domain"]` | slow/freeze + 6★ 光环/碎冰区域 |
| decoy | control | `["control", "defense"]` | 嘲讽 + 图腾耐久/自爆 |
| impact | control | `["control", "defense"]` | 击退/眩晕 + 破门反制 |
| sanctum | domain | `["domain", "control"]` | 光环 + 易伤/减速 |
| scorch | domain | `["domain"]` | 灼烧区/DoT |
| thorns | defense | `["defense", "domain"]` | 减免/反噬 + DoT 光环/处决 |
| aegis | defense | `["defense"]` | 护盾/破盾新星 |
| harvest | economy | `["utility"]` | 唯一经济卡，经济流派待卡池扩充后再开放 |

> 注意 `sanctum` 在 skills.json 中 `category` 为 `domain`（不是 control），以文件实际为准。

### 3. 流派倾向状态（`src/core/types.ts` + `src/core/createInitialState.ts`）

```ts
export interface BuildState {
  /** 玩家通过升级主动表达的流派倾向；不锁流派，只表达意图。 */
  affinity: Record<BuildTag, number>;
  /** 依次记录已选 perk id。 */
  perkHistory: string[];
}
// GameState 增加：
buildState: BuildState;
```

初始化：五个键全 0、`perkHistory: []`。`BuildTag` 从 `./effects/defs` 导入。

### 4. 校验（`src/config/skillValidator.ts`）

- `CARD_KEYS` 加入 `'synergyTags'`。
- 每张卡校验：必须是非空数组、长度 ≤2、元素 ∈ {projectile, control, domain, defense, utility}、无重复。失败 `fail(path, ...)`。
- 版本号保持 `0.4.0` 不升（字段新增走白名单即可；如果现有测试断言版本字符串，不要动它）。

---

## 五、数据驱动 Perk

### 1. 新 `PerkDef`（`src/config/types.ts`）

```ts
export type PerkStatKind = 'damagePct' | 'fireRatePct' | 'heal' | 'maxHp' | 'xpGainPct' | 'rangePct';

/** 数值型效果：本任务即时生效（沿用旧 switch 的写法则）。 */
export interface PerkStatEffect { kind: 'stat'; stat: PerkStatKind; value: number; }

/** 流派缩放效果：A3 才接入运行时；本任务仅解析存储。axis 枚举先定死，A3 不得擅自增删。 */
export type BuildScalingAxis =
  | 'effectDamageMul'        // 弹道类衍生伤害
  | 'quantityAdd'            // 穿透/弹跳/分裂数量
  | 'controlPotencyMul'      // 减速比/冻结眩晕时长/击退距离/易伤比
  | 'controlledDamageTakenMul' // 桥接：受控敌人承伤增加
  | 'areaScaleMul'           // 区域/光环半径与持续
  | 'dotDamageMul'           // 持续伤害
  | 'defenseDurabilityMul'   // 护盾次数/召唤物 HP
  | 'retaliationMul';        // 反噬/破盾新星/突破反击
export interface PerkBuildEffect { kind: 'buildScaling'; targetTags: BuildTag[]; axis: BuildScalingAxis; value: number; }

export type PerkEffect = PerkStatEffect | PerkBuildEffect;

export interface PerkDef {
  id: string;
  title: string;
  desc: string;
  /** 归属流派；utility 表示通用。 */
  lane: BuildTag;
  /** 选择后 affinity[lane] 增量（utility 类为 0）。 */
  affinityGain: number;
  effects: PerkEffect[];
  /** 三选一角色：route=主推流派、bridge=桥接、utility=通用。 */
  offerRole: 'route' | 'bridge' | 'utility';
  weight: number;
  maxStacks: number;
}
```

`BuildTag` 需要从 `../core/effects/defs` 导入（config→core 的类型 import 已有先例：`config/types.ts` L3 引 `CardDef`）。

### 2. 新 Perk 池（`src/config/base/progression.json` 完整替换 `perks` 数组）

8 个流派 Perk + 5 个 utility。文案风格与现有卡牌文案一致（恋爱塔防题材，主角守心防）：

| id | title | lane | offerRole | affinityGain | effects | weight | maxStacks | desc |
|---|---|---|---|---|---|---|---|---|
| proj_damage | 超压弹道 | projectile | route | 1 | buildScaling [projectile] effectDamageMul 0.15 | 1 | 5 | 弹道类技能的衍生伤害提高 15% |
| proj_quantity | 增殖弹药 | projectile | route | 1 | buildScaling [projectile] quantityAdd 1 | 1 | 3 | 穿透 / 弹跳 / 分裂数量 +1 |
| ctrl_potency | 凝滞力场 | control | route | 1 | buildScaling [control] controlPotencyMul 0.2 | 1 | 5 | 减速、冻结、眩晕、击退效果增强 20% |
| ctrl_bridge | 乘虚而入 | control | bridge | 1 | buildScaling [control] controlledDamageTakenMul 0.1 | 1 | 5 | 处于减速 / 冻结 / 眩晕的追求者承受伤害 +10% |
| domain_area | 领域扩张 | domain | route | 1 | buildScaling [domain] areaScaleMul 0.15 | 1 | 5 | 区域与光环的半径和持续时间提高 15% |
| domain_dot | 余烬灼心 | domain | route | 1 | buildScaling [domain] dotDamageMul 0.2 | 1 | 5 | 持续伤害提高 20% |
| def_durability | 加固壁垒 | defense | route | 1 | buildScaling [defense] defenseDurabilityMul 0.25 | 1 | 4 | 护盾吸收次数与召唤物耐久提高 25% |
| def_bridge | 荆棘反击 | defense | bridge | 1 | buildScaling [defense] retaliationMul 0.25 | 1 | 4 | 破盾新星、反噬与突破反击伤害提高 25% |
| damage | 高能弹芯 | utility | utility | 0 | stat damagePct 0.15 | 0.7 | 99 | 基础伤害 +15% |
| rate | 过载供能 | utility | utility | 0 | stat fireRatePct 0.12 | 0.7 | 99 | 射速 +12% |
| repair | 重整心防 | utility | utility | 0 | stat heal 20 | 0.8 | 99 | 私人空间恢复 20 点 |
| maxhp | 扩容心防 | utility | utility | 0 | stat maxHp 15 | 0.6 | 99 | 心防上限 +15 |
| xpgain | 洞悉弱点 | utility | utility | 0 | stat xpGainPct 0.12 | 0.5 | 6 | 击破经验 +12% |

设计说明（不必写进代码）：保留 damage/rate 作为 utility，是因为炮台基础弹与 A3 的流派缩放无关，纯控制/防御构筑需要一条不依赖流派的输出保底；rangePct 从池中移除（`rangeBonus` 字段与 stats 路径保留，`PerkStatKind` 仍含 `rangePct` 以便回加）。

### 3. `applyPerk` 重构（`src/core/systems/progressionSystem.ts`）

删除 switch，改为：

```ts
for (const effect of perk.effects) {
  if (effect.kind === 'stat') applyStatEffect(state, config, effect);   // 六个分支照抄旧 switch 的写法则
  // effect.kind === 'buildScaling'：本任务 no-op（A3 接入）
}
state.buildState.affinity[perk.lane] += perk.affinityGain;
state.buildState.perkHistory.push(perk.id);
```

其余（perkStacks、pendingLevelUps、offeredPerks、paused、事件）保持原逻辑。`perkApplied` 事件增加 `lane: BuildTag` 字段（`core/types.ts` 的 `GameEvent`），供 A2 做「选择后清袋」与遥测；`eventText.ts` 的 toast 不需要改（多余字段无害）。

### 4. 配置校验

`progression.json` 走 `config/loader.ts` 组装。如果 loader 对 progression 没有专门校验（以实际为准），在 loader 或新增校验函数里做最小结构断言：每个 perk 的 `lane`/`offerRole`/`effects[].kind`/`axis` 合法、`affinityGain>=0`、id 唯一。风格同 skillValidator：失败抛错。

---

## 六、角色化三选一（`rollPerkChoices` 重写）

保持签名 `rollPerkChoices(state, rng): string[]`，内部按槽位角色选取。术语：`主流派 = affinity 最大且 >0 的 lane`（并列时用 rng 在并列者中等概率取一）；`候选 = 未满 maxStacks 的 perk`。

- **槽 1（主推）**：主流派存在 → 从该 lane 的 route/bridge 候选中按 weight 抽 1；主流派不存在（开局全 0）→ 从四个战斗 lane（projectile/control/domain/defense）中随机取一个 lane 的 route 候选。
- **槽 2（桥接/支持）**：优先从「玩家已持有或已装备的卡的 synergyTags 所覆盖、且 ≠ 槽 1 所属 lane」的 lane 中抽 route/bridge 候选；没有这样的 lane → 从 ≠槽1 的战斗 lane 中随机抽。
- **槽 3（转型/通用）**：50%（rng）取「与槽 1、槽 2 均不同的战斗 lane」的 route 候选，否则取 utility 候选按 weight 抽 1；取不到再互为回退。
- 三个槽必须互不重复（id 级）；任一槽按上述规则取空时，回退为「从全部剩余候选按 weight 无放回抽取」补齐；最终返回 `min(perkChoices, 剩余候选数)` 个。
- 开局（affinity 全 0 且手牌/装备为空）的额外硬约束：三个槽来自**三个不同战斗 lane** 的 route 候选，避免出现「伤害、射速、射程」式的无路线选择。

实现建议：把「从候选数组按 weight 无放回抽 n」提炼为局部工具函数（现有 L13-27 的循环可复用）。

---

## 七、升级弹窗展示（`src/ui/modals.ts` + `src/data/texts.json` + `index.html`/CSS 如需）

`showLevel(perks)` 每个按钮渲染三行：

1. 标题（现有 `<b>`）+ 流派标签 chip：文案取 `texts.lanes.<lane>`（新增：projectile=弹道、control=控制、domain=领域、defense=防御、utility=辅助），utility 不显示 chip 或显示灰色 chip，样式加一个 `lane-<lane>` class（新增少量 CSS，颜色可先复用现有主题色变量）。
2. 描述（现有 desc）。
3. 受益卡行（仅 route/bridge perk）：遍历 `state.cards`+`state.equipment` 中 `synergyTags` 含该 lane 的去重卡名（`cardDisplayName`，来自 `src/ui/cardMeta.ts`），有则显示 `texts.levelup.benefits`（如 `"生效中：{names}"`）；另加一行固定提示 `texts.levelup.dropHint`（如 `"后续掉落将更偏向此流派"`——A2 落地前这句是预告，允许先展示）。

`showLevel` 需要拿到 `state`：`game.ts` L73 调用处改为 `modals.showLevel(resolveOfferedPerks(state), state)`（或让 createModals 闭包持有 state getter，选改动最小的方式）。

---

## 八、测试（更新 `tests/progressionSystem.test.ts`，可新增 `tests/buildTags.test.ts`）

1. **标签校验**：11 张卡都有合法 `synergyTags`；构造非法配置（空数组 / 未知标签 / 重复）时 `validateSkillsConfig` 抛错。
2. **affinity 记录**：连选 2 次 projectile route + 1 次 control → `affinity = {projectile:2, control:1, ...0}`；`perkHistory` 顺序正确；utility perk 不改 affinity。
3. **stat 效果等价**：heal/maxHp/damage/rate/xpgain 的数值行为与旧实现一致（heal 不超过 maxHp 等）。
4. **buildScaling no-op**：选择 route perk 前后 `resolveEquipBindings` / `totalDamage` 输出不变（防止 A1 偷跑数值）。
5. **角色化三选一**：
   - 开局全 0：三个选项来自三个不同战斗 lane。
   - `affinity.projectile=3` 时：槽 1 是 projectile 的 route/bridge perk（固定 rng 断言）。
   - 三选项 id 互不重复；全部 perk 满层后返回数量正确、不含已满层项。
   - maxStacks 边界：proj_quantity 已 3 层后不再出现。
6. **跨级队列回归**：一次大额 XP 连升 2 级 → 依次弹两轮三选一（沿用现有用例改造）。
7. 全量 `npm test` + `npm run build` 通过（`skillsV04.test.ts`、`configLoader.test.ts` 若断言卡字段白名单需同步更新）。

---

## 九、实施顺序

1. defs.ts `BuildTag`/`synergyTags` + skills.json 11 卡标签 + skillValidator（跑 configLoader/skillsV04 测试）。
2. types.ts `BuildState` + createInitialState 初始化。
3. config/types.ts 新 `PerkDef` + progression.json 新 Perk 池 + 最小配置校验（此时 progressionSystem 编译失败，属预期，同一提交内完成 4）。
4. progressionSystem：applyPerk 数据驱动 + rollPerkChoices 角色化 + `perkApplied` 事件加 lane。
5. modals/texts/game.ts 展示层。
6. 测试补齐与全量回归。
