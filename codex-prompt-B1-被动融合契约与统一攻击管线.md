# 任务:确立装备被动融合契约 + 统一攻击管线(修复主炮形态静默覆盖/触发链旁路/灼烧死效果)

## 背景与根因(已完成诊断,直接按此实施)

以下事实已逐行核对过当前代码,不需要重新调查:

1. **主炮形态静默覆盖**:`src/core/effects/interpreter.ts` 的 `Modifiers` 只有单一 `morph: 'none'|'beam'|'mortar'` 字段(约 L188),`getModifiers()` 遍历装备时遇到 `beamMorph`/`mortarMorph` 就直接赋值(约 L223-227)。同时装备两张 6★ 主炮形态卡(pierce 6★ 光束、splitBlast 6★ 榴弹)时,装备槽顺序靠后的覆盖靠前的,被覆盖的 6★ 完全无效,UI 无任何提示。
2. **换形绕过触发链**:`src/core/systems/combatSystem.ts` 中:
   - `shoot()` 的 mortar 分支(约 L59-75)生成榴弹后**不调用 `onFire`**;
   - `explodeMortar()`(约 L174-183)直接 `dealDamage`,**不触发 `onHit`**、不结算 riders;
   - `updateTurret()` 的 beam 分支(约 L107-125)完全绕过 `shoot()`,直接调 `ATOMS.beamMorph` 结算直线伤害,**不触发 `onFire`/`onHit`**,且 `star: 3` 写死(无视卡牌实际星级);
   - 结论:启用任一换形后,所有依赖 onFire/onHit 的装备被动(chainLightning 连锁减速、frost 冻结叠层、scorch 命中灼烧区、splitBlast 低星分裂、impact 每发击退、pierce 低星穿透)全部静默失效。这是"被动没有合理共存"的核心原因。
3. **"持续光束"名不副实**:配置 `interval: 0.9`,每 0.9s 瞬时结算一次直线伤害+10 个粒子,无持续实体。文案(`src/data/texts.json` 的 `cards.pierce.equip.*.6`)写"主炮化为持续光束,自动横扫"。**已拍板:实装真持续光束**(见下)。
4. **致命命中的真实行为**(注意:与早前外部分析不同,以此为准):`hitEnemy()`(combatSystem 约 L135-171)中 `onHit` 触发**在敌人移出数组之前**,所以致命命中**会**触发 onHit 绑定(连锁可以从垂死敌人跳出、灼烧区会生成)。真正被跳过的是 **riders**:L142 `if (enemy.hp > 0 && bullet.riders)`——致命命中时 onFire 附着的 riders(frost 的 slow/freeze、impact 的 knockback 等)不结算。修复方式见下,不要按"onHit 不触发"去修。
5. **灼烧"烧死蔓延"是死效果**:scorch 3★/5★ 的 onKill 绑定要求 `requiresStatus: "dot"`(`src/config/base/skills.json` 约 L111/L115),检查的是 `enemy.status.dots.length > 0`(interpreter `enemyHasStatus`)。但当前配置里 `dot` 原子**全部**嵌在 groundZone/aura 内、以 `zoneTick` 路径直接 `dealDamage`(registry `dot` 原子约 L300-303),从不 `applyDot` 写状态。因此 `status.dots` 在全局永远为空,该绑定 100% 不可能触发。

## 一、被动效果融合契约(正式系统规则,写入代码注释与文档)

设计拍板:**主炮形态不互斥,采用"效果融合"**;所有类别的装备被动都必须有明确、与装备槽顺序无关的融合规则。在 `src/core/effects/interpreter.ts` 文件头注释中写入下表(仿照 statusSystem.ts 的 CONFLICT_RULES 惯例,导出 `FUSION_RULES` 常量数组):

| 效果类别 | 融合规则 |
|---|---|
| 数值乘数(dropRateMul/dropLifetimeMul/xpMul) | 乘法叠加(现状,保留) |
| 加法数值(thorns/breachReduction) | 加法,breachReduction 上限 0.9(现状,保留) |
| 阈值类(execute) | 取最高(现状,保留) |
| 状态施加(slow/vulnerable/freeze/stun) | statusSystem 现有仲裁:取最强、时长取最大(保留) |
| 光环/领域(aura) | 按来源独立并行(现状,保留) |
| 触发型绑定(onFire/onHit/onKill/onBreach/onWaveStart/interval) | 所有装备独立触发;任何攻击形态都必须经统一管线发出这些触发 |
| 召唤物(summon) | 每个(卡,绑定)单实例(B2 实施) |
| 护盾(shield) | absorbHits 取最大,regenSeconds 取最小(当前 registry.shield 已近似,补齐 regen 取最小并写注释) |
| **主炮形态(weaponForm)** | **正交轴分解融合,见下** |

### 主炮形态融合:正交轴分解

把"换形"从互斥枚举改为可组合的三个正交轴:

- **delivery(投递方式)**:攻击如何到达目标。`projectile`(默认普通弹)/ `line`(光束)/ `lob`(抛射)。
- **impact(命中效果)**:命中点发生什么。`single`(默认单体)/ `aoe`(范围爆炸)。
- **cadence(节奏)**:由 delivery 决定(projectile/lob 用射速 shotCd;line 用自身 interval+duration)。

每张形态卡声明自己的**核心轴**:beamMorph 的核心是 `delivery=line`;mortarMorph 的核心是 `impact=aoe`(单独装备时其 lob 投递只是默认包装)。

融合算法 `composeWeaponForm(forms: WeaponFormContribution[]): WeaponFormSpec`:

1. 收集所有装备贡献,**按 cardType 字典序排序**(保证与装备槽顺序无关的确定性);
2. delivery:取声明优先级最高者(`line > lob > projectile`);
3. impact:所有声明的 impact 依次叠加到每个命中点(single 之外再套 aoe);
4. 融合衰减:第 2 个及之后的形态,其 damageRatio 乘 `combat.weaponFusion.damping`(新配置,默认 0.75),aoe 半径乘 `combat.weaponFusion.radiusMul`(默认 0.6),防止双 6★ 数值失控。

当前两卡的融合结果:**持续光束扫射,光束命中的每个敌人处产生缩小版榴弹爆炸**。装备顺序互换必须得到完全相同的 spec(写测试)。

### 数据结构改动(`interpreter.ts` + `src/core/types.ts`)

- 删除 `Modifiers.morph`/`morphParams`,改为:
  ```ts
  weaponForms: WeaponFormContribution[]; // { sourceCardId, sourceCardType, star, kind: 'beam'|'mortar', params }
  ```
- `getModifiers()` 收集全部 passive 形态绑定(不再互相覆盖);新增导出 `composeWeaponForm()`。
- 全仓 grep `mods.morph` / `morphParams` 的用点(combatSystem、可能的 devtools/UI/测试)同步迁移。

## 二、统一攻击管线(`src/core/systems/combatSystem.ts` 为主)

把普通弹、光束、榴弹、分裂片全部收敛到同一条链:

```
beginAttack(每次开火/每道光束=一个 attack 实例,含 attackId、riders)
  → fireTrigger('onFire', { attack })      // riders 附着到 attack,不再只附着到 bullet
  → resolveImpact(attack, enemy, damage, point)
       // 统一命中结算:易伤/受控乘数 → 扣血 → riders 结算 → onHit → execute → 死亡走 killEnemy(source)
  → killEnemy → onKill(现有,保留)
```

具体要求:

1. **新增 `resolveImpact()`**,重构 `hitEnemy()`、`explodeMortar()`、beam tick 三处共用它。语义:
   - riders 在死亡结算**之前**运行(修复 L142 的 `hp > 0` 门:致命命中也要结算 riders;状态类原子作用在将死敌人上无害,aoeOnHit/split 等冲击类 rider 必须照常爆开);
   - `onHit` 对**每个 attack 实例、每个敌人至多触发一次**(attack 上维护 hitIds;防止持续光束每 0.1s tick 都刷 onHit 导致连锁/灼烧滚雪球);
   - 弹道结构类原子(pierce/ricochet)仅对 `projectile` delivery 生效,其他 delivery 下 no-op(注释写明,不算失效——它们的语义只属于实体弹);状态/冲击类 rider 对所有 delivery 生效。
2. **真持续光束**:新增运行时实体 `state.beams: BeamEntity[]`(types.ts + createInitialState + jumpToWave 清理):
   ```ts
   { angle, width, range, remaining, duration, tickTimer, tickInterval, damagePerTick, hitIds, impacts, sourceStar }
   ```
   - 每 `interval`(0.9s)由 updateTurret 发射一道:`duration≈0.6s`、`tickInterval=0.1s`,**每 burst 总伤 = baseDamage × damageRatio 保持与现状等值**(damagePerTick = 总伤/tick 数),角度每 tick 跟随炮台当前瞄准(横扫感);
   - 发射时走 beginAttack/onFire;每个敌人首次被 tick 命中时走 resolveImpact(onHit 一次),后续 tick 只掉血;
   - 修掉 `star: 3` 写死:用形态来源卡的实际星级;
   - 渲染实体线在 B3 做,本任务先保证 `state.beams` 数据正确(renderSmoke 测试若引用 state 结构需跟随)。
3. **榴弹入管线**:
   - `shoot()` 的 mortar 分支照常走 beginAttack/onFire(riders 附着到 attack);
   - `explodeMortar` 改为对圈内每个敌人调 `resolveImpact`(带 falloff 后伤害);
   - 大帧时间越过落点:到达判定改为"本帧位移线段是否跨过目标点"或剩余飞行距离夹取,替换现在的 `<14px` 距离判定(updateBullets 约 L197-205)。
4. **融合形态执行**:updateTurret 按 `composeWeaponForm` 的 spec 分派——`line` delivery 走光束节奏;命中点依 spec.impacts 叠加爆炸(爆炸内敌人同样走 resolveImpact,但**不**再递归触发该敌人的第二次 onHit,复用 attack.hitIds)。

## 三、灼烧死效果与伤害来源标签

1. `dealDamage` 已有 `source?: string` 形参且 `killEnemy` 会把它透传给 onKill(damageSystem L19-51),基础设施现成。补上调用点:
   - registry `dot` 原子的 zoneTick 分支 `dealDamage(..., 'dot')`;
   - 挂身 dot 结算(runtime `tickDots`)同样传 `'dot'`;
   - 光束/榴弹管线传 `'weapon'`(供未来过滤,可选)。
2. `skills.json` 中 scorch 3★/5★ 的 onKill 绑定由 `"requiresStatus": "dot"` 改为 `"requiresSource": "dot"`(两处)。`requiresStatus: "frozen"`(frost 5★)语义正确,**保留不动**。
3. 检查 `src/config/skillValidator.ts` 是否校验 triggerParams 键名,需要则同步。

## 明确不做

- 不调整任何伤害/半径/间隔数值强度(融合衰减系数除外,那是新参数);当前体感混杂"未触发/被覆盖/看不见"三种因素,先修正确性。
- 不做表现层(光束线渲染、榴弹落点圈等)——B3 任务。
- 不动诱饵/召唤物——B2 任务。

## 测试要求(vitest,`npm test` 全绿)

- 现有 `effectInterpreter.test.ts` 中 `getModifiers(s).morph` 断言按新结构迁移。
- 新增:
  - 双形态融合确定性:光束前榴弹后 / 榴弹前光束后,`composeWeaponForm` 输出深度相等;
  - 融合形态实战:两卡同装,推进若干秒后既有光束 tick 伤害又有命中点爆炸;
  - 光束 + chainLightning 3★:光束命中触发 onHit 连锁(触发次数可断言);光束 + frost:冻结层数增长;光束 + scorch:命中点生成灼烧区;
  - 榴弹 + splitBlast 3★(理论上 6★ 才换形,用测试 fixture 组合验证管线即可):爆炸命中触发 onHit;榴弹 + impact:圈内敌人被击退;
  - onHit 每 attack 每敌至多一次:单道光束多 tick 命中同一敌人,连锁只触发一次;
  - 致命命中 riders:一发致死仍结算 aoeOnHit/split rider;
  - 灼烧蔓延:敌人被灼烧区 dot 烧死 → 死亡点生成新灼烧区;被普通子弹击杀 → 不生成;
  - 榴弹大 dt(如 0.5s)不越过落点。

## 验收标准

装备"直球拒绝 6★ + 群发拒绝 6★"时:屏幕上持续存在光束伤害与命中点爆炸,两者伤害都入账;交换两卡装备槽位置,行为完全一致;同时装备 chainLightning/frost/scorch 等 onHit/onFire 卡,其效果在光束/榴弹形态下照常触发。
