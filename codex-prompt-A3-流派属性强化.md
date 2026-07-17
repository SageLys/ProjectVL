# Codex 任务 A3：流派 Perk 对技能效果的真实强化（buildModifierSystem）

> 「构筑闭环」四连任务第三步。**前置：A1 已合并**（`synergyTags`、`buildState`、数据驱动 PerkDef 及其 `buildScaling` 效果已存在且为 no-op）；A2 与本任务无依赖关系，先后皆可。
> 文件行号基于 A1 开工前的 `main`，以符号名为准。每阶段结束保持 `npm test` 与 `npm run build` 通过。

---

## 一、本任务目标

让 A1 中存储的 `buildScaling` 效果真正作用于战斗：

1. 装备态与消耗态技能效果在**解析阶段**按卡的 `synergyTags` × 玩家已选 Perk 进行参数缩放——不在任何原子执行处写 per-card if。
2. 桥接 Perk `controlledDamageTakenMul`（受控敌人承伤增加）接入伤害管线。
3. 双标签卡可同时获得两个维度的强化；同一 Perk 对同一张卡**最多生效一次**（多标签命中不叠加）。
4. 严格防止重复放大：同名参数在不同原子中含义不同（`ratio` 可能是减速/易伤/减免/DoT），必须按**原子→参数**显式映射，绝不按参数名全局匹配。

---

## 二、硬性不变量（实现后逐条自查）

1. 效果解释器架构不变：触发器总线（`fireTrigger`）、interval 时钟、`getModifiers` 聚合、`releaseConsumable`、zone/aura tick 的调用关系全部保持（`src/core/effects/interpreter.ts` / `runtime.ts`）。
2. `resolveEquipBindings` 的星级锚点语义（3/5/6 锚点、4★ amplifyAxis 同构放大，L43-47）与 `resolveConsumableTier` 的插值（L279-285）不动；缩放发生在其**输出之后**。
3. 未选任何流派 Perk 时，所有技能数值与现状**逐位相等**（这是最重要的回归红线）。
4. utility Perk（damage/rate/heal/maxhp/xpgain）继续走 A1 的 stat 路径，不经过本系统；炮台基础弹伤害（`totalDamage`）不受 buildScaling 影响。
5. `amplifyAxis`（4★ 放大）与本系统叠乘顺序固定：先 amplifyAxis（已有），后 buildScaling。
6. 现有上限继续生效并补齐：`breachReduction` 聚合封顶 0.9（interpreter L211）不动；新增缩放不得让 `damageRetention > 1`、`slow.ratio > 0.8`。
7. RNG 纪律同前。本任务不新增 rng 消耗。

---

## 三、现状（已核实的接入点）

| 位置 | 内容 | 处置 |
|---|---|---|
| `interpreter.ts` L50-57 `equippedBindings` | 所有装备态消费的唯一汇聚点（fireTrigger / tickIntervalBindings / getModifiers 都走它） | 在 yield 前对 bindings 做缩放——**一处接入，全链生效** |
| `interpreter.ts` L251-267 `releaseConsumable` | 消耗态入口，`resolveConsumableTier` 后执行 | tier 结果缩放（含 `radius`/`duration` 顶层字段） |
| `runtime.ts` L18-41 `tickZones` | zone 用创建时快照的 `effects`/`baseDamage` | 无需改：zone 参数在创建时已被缩放（groundZone 的内嵌 effects 是绑定参数的一部分） |
| `runtime.ts` L44-74 `tickAuras` | aura 从 `getModifiers` 读参数 | 无需改：getModifiers 走 equippedBindings，天然拿到缩放后的 aura params |
| `src/core/systems/damageSystem.ts` L33-43 `dealDamage` | 伤害唯一入口，`damageTakenMultiplier(enemy)` 只看敌人状态 | 桥接易伤在此叠乘（§六） |
| `src/core/effects/statusSystem.ts` | `damageTakenMultiplier` / 状态判定 | 增加导出「敌人是否处于受控状态」的谓词 |
| `interpreter.ts` L26 `clone`（structuredClone） | 每次消费都克隆绑定 | 缩放直接改克隆件，安全；性能见 §七 |
| `src/core/systems/progressionSystem.ts`（A1 后） | `applyPerk` 已记录 perkStacks/effects | 本任务读取 `cfg.progression.perks` × `state.perkStacks` 聚合 |

---

## 四、新模块 `src/core/systems/buildModifierSystem.ts`

### 1. 聚合玩家当前的缩放需求

```ts
export interface BuildScalingTotals {
  /** axis → targetTag → 累计值。mul 轴存累加的 value×stacks（使用时 1+x）；add 轴存整数累加。 */
  byAxis: Partial<Record<BuildScalingAxis, Partial<Record<BuildTag, number>>>>;
}
export function aggregateBuildScaling(state: GameState): BuildScalingTotals
```

遍历 `cfg.progression.perks`，对每个 perk 的每条 `kind==='buildScaling'` 效果：`stacks = state.perkStacks[perk.id] ?? 0`，`totals.byAxis[axis][tag] += effect.value * stacks`（对 effect.targetTags 中每个 tag 分别累计）。

### 2. 对一张卡取生效值（多标签防叠加的关键）

```ts
export function scalingFor(totals: BuildScalingTotals, def: CardDef, axis: BuildScalingAxis): number
```

规则：取 `def.synergyTags` 中各 tag 在该 axis 下累计值的**最大值**（不是求和）。这样 `targetTags:['projectile']` 的 Perk 对双标签卡 chainLightning 生效一次；而假想中同时写 `targetTags:['projectile','control']` 的 Perk 也只生效一次。当前 Perk 池每条 effect 只有单 tag，max 规则同时覆盖未来多 tag 情况。

### 3. 缩放应用

```ts
export function applyBuildScalingToBindings(state: GameState, def: CardDef, bindings: BindingDef[]): BindingDef[]
export function applyBuildScalingToTier(state: GameState, def: CardDef, tier: ConsumableTierDef): ConsumableTierDef
```

- 输入必须已是克隆件（equippedBindings 与 resolveConsumableTier 均已 clone，直接原地改并返回）。
- 深度遍历 effects 树（`groundZone`/`aura` 的 `params.effects` 递归进入——**这是必须项**，灼烧区的 dot、光环内嵌 slow 都在嵌套层）。
- 对每个 EffectDef 按 §五 的映射表改写参数；tier 顶层的 `radius`/`duration` 也按 areaScaleMul 处理（仅当卡含 domain 标签）。
- totals 全空时直接原样返回（零成本路径）。

---

## 五、轴 → 原子 → 参数 映射表（显式白名单，禁止按参数名泛匹配）

设 `v = scalingFor(totals, def, axis)`；mul 轴按 `p = p * (1 + v)`，add 轴按 `p = p + v`。整数语义参数改后取整规则见备注。

| axis | 原子.参数 | 备注 |
|---|---|---|
| `effectDamageMul` | `aoeOnHit.damageRatio`、`burstDamage.damageMul`、`split.damageRatio`、`beamMorph.damageRatio`、`mortarMorph.damageRatio`、`summon.explodeDamageMul`、`summon.damageRatio`、`pierce.damageRetention`、`chain.damageRetention` | 两个 `damageRetention` 缩放后 `Math.min(1, x)` 封顶 |
| `quantityAdd` | `pierce.count`、`chain.bounces`、`split.count`、`ricochet.bounces` | 整数加法；`Math.round` 后 ≥ 原值 |
| `controlPotencyMul` | `slow.ratio`（封顶 0.8）、`freeze.duration`、`stun.duration`、`knockback.distance`、`vulnerable.ratio` | `freeze.stacksToTrigger` **不**缩放 |
| `areaScaleMul` | `aura.radius`、`aura.radiusRatioOfRange`、`groundZone.radius`、`groundZone.duration`、consumable tier 顶层 `radius`/`duration` | 仅 domain 标签卡会有非零 v，无需额外判断 |
| `dotDamageMul` | `dot.damageRatio` | |
| `defenseDurabilityMul` | `shield.absorbHits`（`Math.round`，≥原值）、`summon.hp` | |
| `retaliationMul` | `novaOnBreak.damage`、`thorns.ratio`、以及 `binding.trigger === 'onBreach'` 的绑定内 `burstDamage.damageMul` | trigger 条件判断在遍历时携带绑定上下文 |
| `controlledDamageTakenMul` | 不走参数缩放，见 §六 | |

映射表在代码中写成常量结构（`axis → [{atom, param, clamp?, integer?}]`），遍历逻辑通用化；`onBreach` 特例单独处理。任何不在表内的参数一律不碰。

---

## 六、桥接 Perk：受控敌人承伤（`ctrl_bridge` / axis `controlledDamageTakenMul`）

1. `statusSystem.ts` 新增导出：

```ts
/** 受控 = 减速 / 冻结 / 眩晕 / 嘲讽任一生效。 */
export function isControlled(enemy: Enemy): boolean
```

2. `dealDamage`（damageSystem.ts L36）改为：

```ts
const controlledMul = isControlled(enemy) ? 1 + controlledDamageTakenBonus(state) : 1;
enemy.hp -= rawDamage * damageTakenMultiplier(enemy) * controlledMul;
```

`controlledDamageTakenBonus(state)` 由 buildModifierSystem 导出：直接取 `byAxis.controlledDamageTakenMul` 下**所有 tag 的最大值**（该轴是全局桥接，不绑卡，玩家选了就对一切伤害来源生效——包括炮台基础弹，这是设计意图：控制流的输出补偿）。

3. 易伤（vulnerable）与本乘数是两个独立乘区，直接相乘，不去重。

---

## 七、性能与缓存

`equippedBindings` 每帧被 fireTrigger/interval/getModifiers 多次调用，已有 structuredClone 开销。缩放聚合不要每次重算：

- `aggregateBuildScaling` 结果缓存在模块级或 `state.buildState.scalingCache`（推荐挂 state，可测试）：`applyPerk` 应用任何 perk 后使缓存失效（`state.buildState.scalingVersion++`，缓存带版本号比对）。
- totals 全空（版本 0 / 未选流派 perk）时 `applyBuildScalingToBindings` 立即返回入参，保证回归红线 §二.3 的零开销。

---

## 八、测试（新增 `tests/buildModifierSystem.test.ts`，扩展 `effectInterpreter.test.ts`）

用 fixture 卡定义（`registerSkillDefs` 注入）+ 真卡池双线覆盖：

1. **无 Perk 恒等**：未选任何流派 Perk 时，全部 11 卡在 3/4/5/6★ 的 `resolveEquipBindings` 经缩放前后深度相等；消耗态 1~6★ 同理。
2. **弹道路线**：`proj_damage`×2 层后——splitBlast 的 `split.damageRatio`、`aoeOnHit.damageRatio` ×1.3；pierce 的 `damageRetention` 提升但 ≤1；**aegis 的所有参数不变**；harvest 不变。
3. **数量路线**：`proj_quantity`×1 后 pierce.count 3→（原 2+1）、chain.bounces +1、split.count +1；ricochet.bounces +1；取整正确。
4. **控制路线**：`ctrl_potency`×1 后 frost 的 `slow.ratio` 0.3→0.36、`freeze.duration` ×1.2、impact 的 `knockback.distance` ×1.2；`slow.ratio` 封顶 0.8（构造高层数验证）；`stacksToTrigger` 不变。
5. **双标签双维度**：chainLightning 在 `proj_damage`+`ctrl_potency` 下：`damageRetention` 走弹道轴、`slow.ratio` 走控制轴，互不串扰。
6. **不重复乘算**：构造 fixture 卡 `synergyTags:['projectile','control']` + fixture Perk `targetTags:['projectile','control']` effectDamageMul 0.15 ×1 层 → 参数只 ×1.15 一次（max 规则）。
7. **嵌套穿透**：scorch 的 `groundZone.params.effects[].dot.damageRatio` 被 `domain_dot` 缩放；由此创建的 Zone 的 tick 伤害相应提高（走 runtime 集成断言）。
8. **消耗态**：frost 3★ 消耗释放在 `domain_area` 下 radius/duration ×1.15（frost 含 domain 标签）；pierce 消耗态 radius 不变（无 domain 标签）。
9. **onBreach 特例**：thorns 的 onBreach 绑定内 `burstDamage.damageMul` 被 `def_bridge` 放大；同卡 6★ aura 内的 dot 不被 retaliationMul 影响。
10. **受控承伤**：`ctrl_bridge`×2 后，减速中的敌人受 `dealDamage` 伤害 ×1.2，无状态敌人 ×1.0；与 vulnerable 相乘正确。
11. **缓存失效**：应用 perk 后立即生效（不需要等待帧）；`getModifiers` 拿到缩放后的 novaOnBreak/thorns 值。
12. 全量回归：`skillsBatch1/2`、`effectAtoms`、`headlessRun` 等不许挂。

---

## 九、实施顺序

1. buildModifierSystem 骨架 + `aggregateBuildScaling` + 缓存（纯函数测试先行）。
2. 映射表 + `applyBuildScalingToBindings/Tier` 深遍历（fixture 测试）。
3. 接入 `equippedBindings` 与 `releaseConsumable`。
4. `isControlled` + `dealDamage` 桥接乘区。
5. 真卡池全量断言 + 回归。
