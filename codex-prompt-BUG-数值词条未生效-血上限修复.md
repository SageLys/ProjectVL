# Codex Prompt · 修复「数值词条未生效」（血上限为主，全词条对账）

> 背景：测试时发现装备带「血上限 +X」词条的卡牌，装上/卸下对血上限毫无影响。
> 下面的定位是我基于 `main` 分支当前源码逐行核对后的结论，**已剔除不实项**，请按此执行。

---

## 一、确认的事实（已核对源码，不要再重复推断）

### 1. `maxHpAdd` 装备词条 —— 真实失效（本次核心 BUG）
- `src/core/systems/cardAffixSystem.ts` 的 `equipmentAffixAdd(state, 'maxHpAdd')` 会正确统计已装备卡牌上的 `maxHpAdd` 词条值。
- `src/core/effects/interpreter.ts` 的 `getModifiers()`（约 373–380 行）把它塞进 `equipmentAffixAdd.maxHpAdd`。
- **但没有任何消费者读取它**：`src/core/stats.ts` 只有 `totalDamage / totalFireRate / totalMulti / totalRange`，**没有 `totalMaxHp`**；`state.maxHp` 只在 `createInitialState`（`cfg.combat.hp.max`）、`waveRewardSystem`、`game.ts` 调参处被写，从不因装备变化重算。
- 结论：装/卸 `maxHpAdd` 卡对 `state.maxHp` 零影响。**真实存在，需修复。**

### 2. `maxHpAdd` 确实是玩家能抽到的活跃词条
在 `src/config/base/skills.json` 的 affixPool 中，以下卡牌词条池含 `maxHpAdd`（min–max，step5）：
`galvanicWard / impact / frozenBulwark / cinderheart / aegis(5–15) / decoy / retribution / springOfLife(5–15)`。
所以这不是预留类型，是当前配置就会掉到玩家手上的失效词条。

### 3. 消耗态 / 限时 `maxHpAdd` 也失效
装备卡被消耗时走 `activateConsumableAffixes()`，把词条推进 `state.statModifiers`（`operation:'add'`，带 `remaining`）。
`runtime.ts`（约 180–182 行）会按 `remaining` 递减并到期删除，但**没有任何地方调用 `modifierTotal(state,'maxHpAdd')`**，因此限时 `maxHpAdd` 同样不生效、到期也无需重算。

### 4. HUD 最大生命写死为 100 —— 真实
- `index.html` 第 13 行：`<span>HP <b id="hpText">100</b> / 100</span>`，分母 `100` 是死值。
- `src/ui/renderHud.ts` 只更新 `hpText` 与血条宽度，从不写最大生命文本。
- 即使修好数值层，界面仍会永远显示 `/ 100`。**需一并修复。**

### 5. 离散百分比词条取整吞没效果 —— 真实（次要）
- `src/core/systems/buildModifierSystem.ts` 的 `scaleNumber()`：整数轴用 `next = Math.max(original, Math.round(original*(1+value)))`。
- `defenseDurabilityMul` 命中 `shield.absorbHits`（3★护盾基础 2 次）。aegis 该词条取值 {0.10,0.15,0.20,0.25}：
  - `2×1.10=2.2 → round 2`、`2×1.15=2.3 → 2`、`2×1.20=2.4 → 2`、`2×1.25=2.5 → 3`。
  - 单靠该词条时，4 个取值有 3 个在基础值 2 上零提升（叠加遗物 total 时可能过阈，非恒为零）。
- 用的是 `Math.round`，不是"向上取整"。**建议修，但可与主 BUG 分开评估。**

---

## 二、需要修正的「不实结论」（不要照做，避免引入伪修复）

- **`heal` 不是玩家当前能抽到的词条。** 全量 `skills.json` 的 affixPool 里**没有任何卡含 `heal`**。`heal` 仅出现在：`RunBaseStatKind` 类型联合、god/skill 校验白名单、以及 `waveRewards.json` 的 `floorHeal`（`stat:"heal"`，由 `waveRewardSystem` 的 `case 'heal'` 正确即时结算）。
  - 所以「玩家会抽到失效的 heal 词条」为**假**。
  - `affixOperation()` 用 `endsWith('Add')` 推断、会把 `heal` 误判为 `mul`，这是**潜在隐患**（一旦有人把 heal 加进 affixPool 就会踩雷），可做防御性修复，但**不要**把它描述成当前线上 BUG。
- 其余乘法类词条（`effectDamageMul / controlPotencyMul / areaScaleMul / dotDamageMul / retaliationMul / controlledDamageTakenMul / xpMul / dropRateMul / dropLifetimeMul`）在 `BUILD_SCALING_RULES` 与 `controlledDamageTakenBonus()` 中**都有落点**，装备态经 `cardAffixScaling` → `applyBuildScalingToBindings` 生效、消耗态经 `statModifiers` → `runtimeScalingFor` 生效。**不要**当作失效处理；但需补测试证明（见第四节）。
  - 注意一个真实边界：装备态乘法词条只作用于「该卡自身绑定里含对应 atom/param」的效果。若某卡池给它配了本卡没有对应 atom 的词条（例如给无 `xpMul` atom 的卡配 `xpMul`），装备态该词条在这张卡上不会有落点——这属于配置校验问题，请在第三节的 P1 校验里覆盖，而不是改结算逻辑。

---

## 三、实施要求

### P0-A：新增统一「最大生命」派生与对账
1. 在 `src/core/stats.ts` 新增：
   ```ts
   export function totalMaxHp(state: GameState): number;
   ```
   组成明确为：
   ```
   baseMaxHp(基础 + 永久波间奖励累计)
     + getModifiers(state).equipmentAffixAdd.maxHpAdd
     + modifierTotal(state, 'maxHpAdd').add        // 限时消耗态
   ```
2. 拆分「永久基础」与「派生上限」：
   - 新增 `state.baseMaxHp`（初始 = `cfg.combat.hp.max`）。
   - `state` 里现有的 `state.maxHp` 改为**派生结果缓存**，只由对账函数写。
3. 新增对账函数（放 `stats.ts` 或新建 `src/core/systems/vitalStatSystem.ts`）：
   ```ts
   export function reconcileMaxHp(state: GameState): void {
     const prevMax = state.maxHp;
     const missing = Math.max(0, prevMax - state.hp);   // 保留已损失血量
     const next = totalMaxHp(state);
     state.maxHp = next;
     const floor = state.mode === 'playing' ? 1 : 0;
     state.hp = Math.min(next, Math.max(floor, next - missing));
   }
   ```
   语义示例：70/100 装 +10 → 80/110；卸下 → 70/100。既符合波间奖励语义，也杜绝反复装卸刷血。
4. 在所有会改变最大生命来源的位置调用 `reconcileMaxHp`：装备 / 卸下 / 装备交换 / 喂养升星 / 装备被消耗 / 限时 `maxHpAdd` 开始 / 限时 `maxHpAdd` 到期 / 波间永久 `maxHpAdd` 生效 / 对局重置恢复。
   - 装备相关入口：`src/core/systems/equipmentSystem.ts`（当前只调 `reconcileEquipmentPassives()`，它只管召唤物，不碰生命——需在其前后补对账）。
   - 限时到期入口：`src/core/effects/runtime.ts` 删除 `statModifiers` 后，若被删项 `stat==='maxHpAdd'` 则调对账。
5. 改造 `src/core/systems/waveRewardSystem.ts` 的 `case 'maxHpAdd'`：
   ```ts
   // 旧：state.maxHp += effect.add; state.hp += effect.add;
   case 'maxHpAdd':
     state.baseMaxHp += effect.add;
     reconcileMaxHp(state);   // 派生 + 保留缺失血量后按规则回填
     break;
   ```
   > 保证 `baseMaxHp` 是唯一「永久」来源，避免与装备派生重复计数。

### P0-B：修复 HUD 最大生命显示
- `index.html` 第 13 行改为：
  ```html
  <span>HP <b id="hpText">100</b> / <b id="maxHpText">100</b></span>
  ```
- `src/ui/domRefs.ts` 注册 `maxHpText`，`src/ui/renderHud.ts` 中：
  ```ts
  refs.maxHpText.textContent = String(Math.round(state.maxHp));
  ```

### P0-C：`heal` 消耗语义防御性修复（非线上 BUG，但顺手做对）
- 不要再让 `activateConsumableAffixes` 对所有词条一律 push 进 `statModifiers`。为词条区分「即时 vs 限时」：
  - 建立词条操作/结算方式的显式声明（见 P1 注册表），`heal` 标记为 `instant`。
  - `heal` 即时执行：`state.hp = Math.min(totalMaxHp(state), state.hp + roll.value)`，不建计时器、不进 `statModifiers`、不显示为限时。
- 同时**禁止 `heal` 作为常驻装备词条**（装备态 unsupported），防止装/卸刷血。配置校验里对此报错。

### P1：离散取整规则
- 对护盾次数、弹射数、穿透数等离散整数轴，优先把词条改为整数加法（如 `defenseDurabilityAdd`，min1 max2 step1），从数据层规避取整吞没。
- 若必须保留乘法，正向强化改为 `Math.ceil(original*(1+value))`（仍保留 `Math.max(original, …)` 下限），避免"配置合法、效果为零"。

### P1：词条「落点」构建期校验
在现有 affix 校验（`src/config/skillValidator.ts`）基础上新增 `AFFIX_SINKS` 契约校验，逐卡检查每个候选词条：
1. 是否存在全局消费者（如 `maxHpAdd → totalMaxHp`）；
2. 装备分支是否含可被缩放的 atom/param（对乘法轴）；
3. 消耗态锚点是否含对应参数；
4. 最小词条值经取整/封顶后是否仍能产生 ≥1 的可观察变化；
5. 若在所有可达分支都无落点 → **构建失败**，而非运行时静默失效。

---

## 四、必须新增/补齐的测试（`npm run test`）

数据驱动，遍历全部 `CardStatKind`，其中 `maxHpAdd` 为重点：
1. 装备 `maxHpAdd` 卡后 `state.maxHp` 按词条值上升，`totalMaxHp` 一致。
2. 卸下后 `maxHp` 精确恢复，且当前 `hp` 按「保留缺失血量」规则回填（满血 / 残血 / 濒死三态各一例）。
3. 反复装/卸 `maxHpAdd` 卡不能刷高 `hp`（防刷血回归）。
4. 消耗态即时词条：`heal`（若测试内注入到池）立即加血、不进 `statModifiers`；限时 `maxHpAdd` 生效并在 `remaining` 到期后 `maxHp` 精确回落。
5. 波间永久 `maxHpAdd` 奖励与装备派生叠加正确、互不重复计数。
6. HUD 同时显示正确的当前生命与最大生命（`maxHpText` 随 `state.maxHp` 更新）。
7. 离散强化：`defenseDurabilityMul`（或改后的 `defenseDurabilityAdd`）在最小取值下相对基础值产生 ≥1 的变化。
8. 契约校验测试：正式配置里每个候选词条至少有一个可达落点，否则构建失败。
9. 保留并通过既有 `tests/cardAffixSystem.test.ts` 的模板/装备 add/消耗用例。

---

## 五、验收标准
- `npm run test` 与 `npm run build` 全绿。
- 手动或 headless 验证：装备任一含 `maxHpAdd` 的卡，`state.maxHp` 与 HUD 分母同步上升；卸下精确还原；反复装卸不刷血。
- 不改动第二节所列「本已生效」词条的既有行为（回归不破坏）。
- 本次至少同时闭环 4 个缺陷：`maxHpAdd` 无结算入口、限时/消耗 `maxHpAdd` 无结算、HUD 死值 `100`、离散取整吞没；`heal` 误分类作为防御性修复顺带处理。
