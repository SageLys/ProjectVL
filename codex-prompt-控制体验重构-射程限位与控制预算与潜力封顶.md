# 任务:控制效果体验重构——射程限位 + 全局控制预算 + 潜力封顶(三层合一)

## 背景:前两次修复为何没治本

已上线两次针对性修复:击退按类型抗性 + 疲劳(`knockbackResist` / `knockbackFatigue` / `kbFatigue`);冰冻按类型抗性 + 解控免疫窗(`ccResist` / `ccImmunity` / `ccImmune`)。但高星冰冻+击退打**一群小怪**仍然出问题:小怪被反复推出射程、玩家毫无压力、战斗被拖得很长。

诊断出**三个结构性根因**(前两次的按效果加抗性都没覆盖):

1. **位移出射程 = 直接归零 DPS**。`combatSystem.findTarget` 里 `if (dist > range) continue;`——被推出射程的敌人既不被索敌也不吃伤害。击退一旦把敌人推出射程,炮台就空转,这才是"战斗拖长"的直接机制。抗性/疲劳都没管"是否还在射程内"。

2. **高星控制潜力是乘法叠加,固定下限拦不住**。`buildModifierSystem` 的 `controlPotencyMul` 轴会把击退 `distance`、冰冻/眩晕 `duration` **乘大**(见 `BUILD_SCALING_RULES.controlPotencyMul`,freeze/stun/knockback 均无 cap)。之前的抗性是固定比例、疲劳下限是 ×0.125,高星把基础值乘上去后,残余值依然足以把敌人推出射程或接近满覆盖冻结。

3. **疲劳在人群中不累积**。`kbFatigue` 是每敌 2 秒窗口;炮台对一群怪是分散点射,单个敌人两次挨打常间隔 > 2 秒,窗口过期即重置回满额击退。于是人群整体永远吃满击退,疲劳形同虚设。

用户已确认采用**组合方案(1+2+3)**。三层协同,分别对应上面三个根因。全部仲裁集中在 `statusSystem.ts`(项目 P2 §2 正交性约束),数值走 config,禁止散落进各原子的业务分支。

---

## Layer 1:射程限位——击退永不把敌人推出炮台射程(治"拖长")

**目标**:击退可以顿挫、可以把敌人推到射程边缘,但**不得把原本在射程内的敌人推到射程外**,从而炮台始终有目标、DPS 不中断。

### 改 `src/core/effects/statusSystem.ts` 的 `applyKnockback`

给签名加一个可选钳制半径:

```ts
export function applyKnockback(
  e: Enemy, fromX: number, fromY: number, distance: number,
  clampToRange?: number,   // 传入时:位移后与炮台的距离不得超过 max(clampToRange, 位移前距离)
): boolean
```

实现顺序(在现有 冻结无效 判定之后):
1. `distance = Math.min(distance, cfg.combat.controlCeiling.knockbackDistance);`(见 Layer 3);
2. 施加类型抗性与疲劳(沿用现有逻辑)得到 `eff`;`eff <= 0` 直接 return false;
3. 记录位移前 `preDist = hypot(e - turret)`(炮台取 `cfg.combat.turret`);
4. 执行位移;
5. **限位**:若传入 `clampToRange`,计算 `postDist`,`maxAllowed = Math.max(clampToRange, preDist)`;若 `postDist > maxAllowed`,把敌人沿"炮台→敌人"方向拉回到 `maxAllowed` 半径处。
   - 关键:用 `max(clampToRange, preDist)` 而非直接 `clampToRange`,保证**只拦截"被推出去"、绝不把原本就在射程外的敌人吸进来**(AoE 击退命中远处敌人时不产生诡异的向心位移)。
6. 位移后再更新疲劳(沿用现有)。

### 传入 `clampToRange` 的调用点

- `registry.ts` 的 `knockback` 原子:`const maxR = totalRange(ctx.state, ctx.config);`(`totalRange` 已 import),把 `maxR` 作为第 5 参传入 `applyKnockback`。
- `runtime.ts` 的 summon `explodeOnDeath` 与 `novaOnBreak` 两处 `applyKnockback`:同样传 `totalRange(state, config)`(已 import)。
- 直接单元测试里不传 `clampToRange` → 行为退化为无限位(保持旧测试可用)。

---

## Layer 2:全局控制预算——人群中始终保留"推进者"(治"无压力")

**目标**:无论怎么堆控制,场上永远有一批敌人不被硬控/击退、正常逼近炮台,保证残余压力。

### 在 `statusSystem.ts` 新增预算判定

```ts
/** 被"中和"= 不可动(冻结/眩晕)或刚被击退(疲劳窗内)。 */
function isNeutralized(e: Enemy): boolean {
  return isImmobile(e) || e.status.kbFatigue !== null;
}

/**
 * 控制预算:给"新"敌人施加硬控/击退前调用。返回 true = 应跳过(为保留推进者而拒绝)。
 * 已被中和的敌人刷新控制不受限(不会减少自由推进者)。
 * 小规模(总数 ≤ minFree)不设限——靠抗性/免疫窗处理,别把单 Boss 变不可控。
 */
export function controlBudgetDenies(state: GameState, e: Enemy): boolean {
  if (isNeutralized(e)) return false;
  const total = state.enemies.length;
  const cb = cfg.combat.controlBudget;
  if (total <= cb.minFreeAdvancers) return false;
  let free = 0;
  for (const o of state.enemies) if (!isNeutralized(o)) free++;
  const minFree = Math.max(cb.minFreeAdvancers, Math.ceil(total * (1 - cb.maxControlledRatio)));
  return free <= minFree;
}
```

### 在原子里过滤目标

`registry.ts` 的 `freeze`、`stun`、`knockback` 三个原子:对每个目标 `e`,施加前 `if (controlBudgetDenies(ctx.state, e)) continue;`。

- 注意:`slow`(软控)**不进预算**——减速不清零输入、不移出射程,保留 frost 身份。`taunt` 也不进(嘲讽是转移目标,不是中和)。
- 单 Boss 场景:`total(1) <= minFreeAdvancers` → 不设限,Boss 仍可被冻/击退,交由既有 `ccResist`/`ccImmune`/`knockbackFatigue` 调节。

---

## Layer 3:潜力封顶——硬控/位移的单次量级绝对上限(治"高星溢出")

**目标**:无论 `controlPotencyMul` 堆多高,单次冰冻时长/眩晕时长/击退距离都有绝对天花板,使控制无法逼近满覆盖。放在**施加点**(statusSystem)钳制,mode 无关、来源无关,比改 `BUILD_SCALING_RULES` 的 per-param cap 更干净(不会误伤消耗态基础值与 perk 的交互)。

### `src/config/base/combat.json` 新增(与 `knockbackFatigue`、`ccImmunity` 并列)

```json
"controlCeiling": { "freezeSeconds": 2.5, "stunSeconds": 1.5, "knockbackDistance": 120 },
"controlBudget": { "maxControlledRatio": 0.6, "minFreeAdvancers": 2 }
```

### 在 `statusSystem.ts` 施加点钳制

- `applyKnockback`:`distance = Math.min(distance, cfg.combat.controlCeiling.knockbackDistance)`(已在 Layer 1 步骤 1)。
- `applyFreeze`:进入真正冻结前 `duration = Math.min(duration, cfg.combat.controlCeiling.freezeSeconds)`,再乘 `ccResist`。
- `applyStun`:`duration = Math.min(duration, cfg.combat.controlCeiling.stunSeconds)`,再乘 `ccResist`。

> 消耗态大招(如 frost 消耗 3.5s 冻结、impact 消耗 180px 击退)会被天花板压到 2.5s / 120px。这是刻意的:配合 Layer 1/2,即便如此也不再拖长或零压。若你后续想给消耗态更高上限,再单开豁免,本次不做。

---

## 配置类型同步

`src/config/types.ts` 的 combat 配置类型新增:
```ts
controlCeiling: { freezeSeconds: number; stunSeconds: number; knockbackDistance: number };
controlBudget: { maxControlledRatio: number; minFreeAdvancers: number };
```
检查 `src/config/loader.ts` / `configLoader.test.ts` 是否需要默认值或校验跟随(参考 `knockbackFatigue`/`ccImmunity` 怎么接的)。

`src/config/base/tuner.json`(可选,建议):为 `combat.controlBudget.maxControlledRatio`(0~1,step 0.05)、`combat.controlBudget.minFreeAdvancers`(0~6,step 1)、三个 `controlCeiling.*` 加可调条目。

---

## 测试要求

在 `tests/effectAtoms.test.ts`(或新建 `tests/controlBudget.test.ts`)补充,并修正因新逻辑受影响的既有断言:

1. **射程限位**:构造炮台 + 射程 R,敌人在射程内近边缘,施加会推出 R 的击退 → 断言位移后 `hypot(e-turret) === R`(卡在边缘,未被推出);构造已在射程外的敌人受 AoE 击退 → 断言不会被拉回到 R 内(距离不减)。
2. **控制预算**:造 N 个敌人(N > minFreeAdvancers),连续对新敌人施加冻结/击退 → 断言任意时刻 `未被中和的敌人数 >= max(minFreeAdvancers, ceil(N*(1-maxControlledRatio)))`;对已中和敌人刷新控制不被拒绝;`total <= minFreeAdvancers`(含单 Boss)时预算不拦截。
3. **潜力封顶**:传入超天花板的 freeze/stun/knockback 参数 → 断言实际冻结时长/眩晕时长/击退距离被钳到 `controlCeiling`(再叠加 `ccResist`/`knockbackResist` 后不超过天花板×抗性系数)。
4. **回归·人群不再被无限推出**:模拟一群 normal 怪 + 高 `controlPotencyMul` + 高星击退/冰冻,跑若干秒 → 断言(a)始终有敌人在射程内(炮台每帧有 target,DPS 不为 0),(b)始终存在自由推进者向炮台靠近(某敌与炮台距离随时间下降)。
5. **软控保护**:`slow` 不受控制预算与天花板影响;frost 的减速在满控场景下仍全程生效。
6. 跑全量 `npx vitest run`,修复所有因新字段/新签名参数引入的类型或快照失败。

## 验收标准

1. 高星冰冻+击退打一群小怪:小怪不再被反复推出射程,炮台持续输出,战斗时长回到正常;
2. 同一群中始终有一批小怪逼近炮台,玩家有真实压力,不再"零威胁干等";
3. 单 Boss 场景由前两次修复(抗性+免疫窗+疲劳)继续调节,不被控制预算误伤;
4. frost 的减速手感、控制流"控场"的正反馈基本保留;
5. 全部测试通过,无 lint/类型错误。

## 禁止事项

- 不要把 `slow`/`taunt` 纳入控制预算或天花板——只约束硬控(freeze/stun)与位移(knockback);
- 不要改敌人速度/HP、不要改各卡牌 skills.json 的基础数值——只加"限位/预算/天花板"三层系统与 config;
- 射程限位不得产生"把远处敌人吸向炮台"的向心位移(必须用 `max(clampToRange, preDist)`);
- 抗性/疲劳/免疫窗/限位/预算/天花板的全部仲裁集中在 `statusSystem.ts`,不得散落进原子的条件分支(原子只负责调用与目标过滤);
- 不要给"冻结抑制击退""解控免疫窗"引入回归。

## 执行顺序建议

Layer 3(config + 施加点钳制)→ Layer 1(applyKnockback 限位 + 三处传参)→ Layer 2(预算判定 + 原子过滤)→ 补测试 → 全量回归。
