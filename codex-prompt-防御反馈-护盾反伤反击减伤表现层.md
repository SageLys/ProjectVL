# 任务：防御类效果的提示与反馈表现层（护盾 / 反伤 thorns / 反击 nova+onBreach / 减伤 breachReduction）

## 背景（已诊断的缺口）

测试发现"逻辑已生效但玩家看不见"的防御反馈问题。逐项核对当前代码：

- **护盾 shield**：`src/render/drawEffects.ts` 的 `drawSummonsAndShield` 只画了一圈很淡的蓝色环（半径 46，`globalAlpha` 仅 0.25~0.40），**看不出还剩几层、吸收了没有、什么时候在再生**。`absorbBreach`（`src/core/effects/runtime.ts`）吸收一次突破时静默 `hits--` 并 `return null`，无任何瞬间反馈；破裂时只 push `{ type:'shieldBroken' }` → toast「护盾破裂！」，护盾环本身不炸不闪。再生（`tickShield`）完全静默。
- **反伤 thorns**：`src/core/systems/enemySystem.ts` 中，`thornsRatio` 只在"反噬致死"时触发（普通突破分支 ~line 409、Boss 贴身脉冲分支 ~line 209），直接 `killEnemy` 把敌人删掉，**没有任何反弹视觉，玩家不知道是被反伤打死的**。
- **反击 retaliation / nova**：
  - `onBreach` 的 `burstDamage`（`src/core/effects/registry.ts` ~line 498）只在原点撒 10 个粉色粒子，**混在突破粒子里几乎看不出来**；
  - 破盾附带的 `novaOnBreak`（`absorbBreach` 内）造成伤害+击退，但**完全没有独立视觉**。
- **减伤 breachReduction**：`absorbBreach` 结尾 `return damage * (1 - mods.breachReduction)`，纯数值乘法，**零反馈**，玩家无法判断减伤是否生效、生效了多少。

**决策（已确认）**：反馈渠道 = Canvas 战斗特效 + Toast；覆盖上述全部四类；做**完整系统**（新增一批防御向 `CombatVfx` 种类并全部接线，而非临时补丁）。**不做**浮字伤害数字、**不做** HUD 常驻读数。

## 关键约束（务必遵守）

1. **`state.vfx` 是纯输出通道**：核心系统只能"推入 + 由 `tickEffects` 递减 remaining"，**绝不读取 vfx 分支逻辑**，headless 测试与模拟结果不受影响（沿用 `src/core/types.ts` 中 `CombatVfx` 上方注释的既有约定）。
2. **新反馈不得消耗 RNG**：模拟是确定性的，现有 `spawnParticle(state, rng, ...)` 会推进 `rng` 流。**新增的防御反馈一律走 `state.vfx.push(...)`（不吃 rng），禁止在结算钩子里为了反馈新增 `spawnParticle` 调用**，以免破坏回放确定性与既有测试的随机流对齐。（现有 burstDamage 的 10 粒子、突破的 `breakthroughParticles` 保持原样，不要动其 rng 调用次数。）
3. 颜色沿用现有视觉语言：护盾 = 青色 `#8cecff`；反击/反伤 = 品红/粉系（与炮台♥ `#ff8ed4`、burst `#ff9de2` 一致）。减伤为"护盾色的弱化内闪"。
4. Toast 只用于**低频状态跃迁**（破盾、护盾重铸），高频事件（每次吸收、每次反伤、每次减伤）**只走 Canvas**，避免 toast 刷屏。

---

## 具体改动

### 1. 新增防御向 VFX 种类（`src/core/types.ts`：`CombatVfx` 联合体）

在现有 `mortarTarget | mortarImpact | tauntPulse | summonEvent` 基础上追加：

```ts
  | { kind: 'shieldAbsorb'; x: number; y: number; remaining: number }                    // 护盾吸收一次突破的瞬间高亮闪 ~0.25s
  | { kind: 'shieldBreak'; x: number; y: number; remaining: number }                     // 破盾碎裂扩张环 ~0.45s
  | { kind: 'shieldRegen'; x: number; y: number; remaining: number }                     // 护盾重铸：向内收拢的成形环 ~0.5s
  | { kind: 'thornsReflect'; x: number; y: number; enemyId: number; remaining: number }  // 反伤反弹：炮台→敌人的尖刺回冲弧 ~0.35s
  | { kind: 'retaliationNova'; x: number; y: number; radius: number; remaining: number } // 反击/nova 扩张冲击环 ~0.4s
  | { kind: 'breachMitigated'; x: number; y: number; remaining: number };                // 减伤生效：炮台处弱化内闪 ~0.3s
```

`createInitialState`（`src/core/createInitialState.ts`）已有 `vfx: []`；确认 `jumpToWave` / 波切换的 vfx 清理逻辑同样清掉这些新种类（与现有 vfx 一起被清即可，无需特判）。`tickVfx`（`runtime.ts`）已统一递减 `remaining` 并回收，无需改动。

### 2. 结算钩子推入 VFX + 事件（`src/core/effects/runtime.ts`、`src/core/systems/enemySystem.ts`）

**2.1 护盾吸收 / 破裂 / nova（`absorbBreach`，runtime.ts ~line 224）**

- 命中且 `shield.hits > 0`：`hits--` 之后，无论是否破裂，都 `state.vfx.push({ kind:'shieldAbsorb', x:t.x, y:t.y, remaining:0.25 })`（`t = cfg.combat.turret`）。
- `hits <= 0`（破裂）：在既有 `push({ type:'shieldBroken' })` 旁追加 `state.vfx.push({ kind:'shieldBreak', x:t.x, y:t.y, remaining:0.45 })`。
- `novaOnBreak` 分支：在造成伤害/击退的同时 `state.vfx.push({ kind:'retaliationNova', x:t.x, y:t.y, radius:220, remaining:0.4 })`（半径与现有 nova 影响范围 220 对齐）。

**2.2 护盾再生（`tickShield`，runtime.ts ~line 165）**

- 当 `regenRemaining` 递减到 `<=0`、`hits` 重置为 `maxHits` 的那一帧：`state.vfx.push({ kind:'shieldRegen', x:t.x, y:t.y, remaining:0.5 })`，并 push 新事件 `{ type:'shieldRestored' }`（用于 toast）。注意 `tickShield` 当前签名不带 `events`，需把 `events: GameEvent[]` 传进来（`tickEffects` 里调用处一并改），或让其返回事件由上层收集——二选一，保持与其它 tick 函数一致的事件收集风格。

**2.3 反伤 thorns（`enemySystem.ts` 两处 thornsRatio 致死分支：普通突破 ~line 409、Boss 贴身 ~line 209）**

- 在 `killEnemy(...)` 之前，`state.vfx.push({ kind:'thornsReflect', x:t.x, y:t.y, enemyId:e.id, remaining:0.35 })`（Boss 分支用 `boss.id` 与 `boss` 坐标）。
- 可选（低频、建议做）：push 新事件 `{ type:'thornsKill', enemyId }`，但**默认不出 toast**（见 §4 节流说明），仅保留给未来埋点/统计；若嫌冗余可不加此事件，仅保留 vfx。

**2.4 反击 onBreach burstDamage（`registry.ts` `burstDamage` ~line 498）**

- 在原有 10 粒子逻辑之外，追加一圈 `state.vfx.push({ kind:'retaliationNova', x:ctx.origin.x, y:ctx.origin.y, radius:num(p,'radius', ctx.radius ?? 100), remaining:0.4 })`。**保留原有 10 个 `spawnParticle` 调用不变**（不改 rng 调用次数），只叠加一个不吃 rng 的 vfx 环，让"反击触发"从粒子噪声里凸显出来。

**2.5 减伤 breachMitigated（`absorbBreach` 结尾 return 分支）**

- 当护盾未吸收、走到 `return damage * (1 - mods.breachReduction)` 且 `mods.breachReduction > 0` 时：`state.vfx.push({ kind:'breachMitigated', x:t.x, y:t.y, remaining:0.3 })`。这是"减伤此刻真的削减了一次突破伤害"的唯一可视信号。

> 以上钩子只 push，不读 vfx；不新增任何 `spawnParticle`。

### 3. 渲染（`src/render/`）

**3.1 护盾环增强（`drawEffects.ts` `drawSummonsAndShield` 护盾段，~line 86-97）**

把"一整圈淡环"改为**能一眼读出层数与状态**：

- **分段弧显示层数**：把 360° 环按 `maxHits` 均分为 N 段，画满 `hits` 段（段间留小缺口），未剩余的段用极淡描边。这样"还剩几层护盾"直接可数。
- **强度随层数**：`lineWidth` 与描边亮度随 `hits/maxHits` 递增；顶层再叠一层轻微呼吸脉冲（用 `state.time` 做 sin，不吃 rng）。
- **再生态可视**：当 `shield.hits === 0 && shield.regenRemaining != null`（正在再生）时，画一圈**虚线"重铸中"环**，其填充比例 = `1 - regenRemaining/regenSeconds`（顺时针补满），让玩家知道护盾正在恢复及大致进度。

**3.2 新 VFX 渲染（`drawVfx.ts`，在现有 if/else 链上追加分支）**

- `shieldAbsorb`：在半径 46 处画一圈**高亮青环**（`#d9fbff`→`#8cecff`），`lineWidth≈5`，随 `remaining/0.25` 快速淡出——"叮"的一下被弹开的感觉。
- `shieldBreak`：从 46 向外扩张的碎裂环（`radius = 46 + progress*40`），`lineWidth` 由粗到细、alpha 由 0.9 淡出；可叠 2~3 段错相位环模拟碎裂，颜色 `#8cecff`。
- `shieldRegen`：从大半径（~70）**向内收拢**到 46 的成形环（与 break 相反方向），青白色，表示"重新凝聚"。
- `thornsReflect`：从炮台 `(x,y)` 到 `state.enemies.find(id===enemyId)` 当前位置画一条**品红尖刺回冲弧/线**（`#ff8ed4`，带 1~2 个沿线的小三角"刺"），敌人已被移除则退化为炮台处一小圈品红爆点；随 remaining 淡出。
- `retaliationNova`：以 `(x,y)` 为心、`radius` 为终点的**扩张冲击环**（`#ff9de2`），`r = radius*(0.25+progress*0.75)`，`lineWidth` 由粗到细淡出——复用 mortarImpact 的表现手法但用粉色，和护盾青色区分开。
- `breachMitigated`：炮台处一圈**偏暗的青色内闪**（半径 ~34，`alpha≈0.5→0`，`lineWidth≈3`），比 shieldAbsorb 更弱更内，语义是"伤害被削了一截但没被完全挡下"。

渲染顺序：`drawVfx` 已在 `canvasRenderer` 的敌人层之上、`drawSummonsAndShield`/`drawTurret` 之前调用；新种类多为炮台中心特效，画在护盾环/炮台下层也可接受。若护盾破裂环希望盖在炮台上，可考虑把这几个中心向特效挪到 `drawSummonsAndShield` 之后单独绘制——自行安排层级并加注释说明。

### 4. 文案与 Toast（`src/data/texts.json` + `src/ui/eventText.ts`）

- `texts.json` 的 `toast` 增加：`"shieldRestored": "护盾重铸"`（`shieldBroken` 已存在，保留）。
- `eventText.ts` `formatToast`：`shieldRestored` → `T.shieldRestored`。
- **节流**：`shieldBroken` / `shieldRestored` 天然低频，直接出 toast 即可。`thornsKill`（若实现了该事件）**返回 `null` 不出 toast**，或在其上做"每波首次触发才提示"的节流，避免刷屏。减伤、每次吸收**不出 toast**（只 Canvas）。
- 既有突破 toast「私人空间受压 -{damage}」中的 `{damage}` 已是减伤后的数值，保持不变即可。

### 5. 测试（`tests/`，扩展或新建 `tests/defenseFeedback.test.ts`）

因 vfx/事件是纯输出通道，测试断言"该触发时确实推入了对应反馈，且不改变模拟结果"：

1. **护盾吸收**：构造 `state.shield = { hits:2, maxHits:2, ... }`，对炮台施加一次会突破的敌人 → 断言 `hp` 未扣、`shield.hits===1`、`state.vfx` 含 `shieldAbsorb`。
2. **破盾 + nova**：`hits:1` + 配置 `novaOnBreak` → 吸收后断言 push 了 `shieldBroken` 事件、`shieldBreak` 与 `retaliationNova` vfx，且 nova 伤害/击退照旧生效。
3. **护盾再生**：`hits:0` 且 `regenRemaining` 走到 0 → 断言 `hits===maxHits`、push `shieldRestored` 事件 + `shieldRegen` vfx。
4. **反伤致死**：`thornsRatio` 足够致死的敌人突破 → 断言敌人被 `killEnemy`、push `thornsReflect` vfx（含正确 `enemyId`）。
5. **减伤**：`breachReduction>0` 且无护盾的突破 → 断言 `hp` 扣减 = `damage*(1-reduction)`（数值正确）、push `breachMitigated` vfx。
6. **确定性护栏**：同一 seed 下"开启/关闭这些新反馈"跑相同波次，断言 `rng` 消耗次数与关键模拟量（敌人存活、hp、击杀事件序列）**完全一致**——证明新反馈没吃 rng、没改模拟。
7. 复用/参考现有 `tests/` 与 `src/telemetry/combatCounters` 的构造工具，别新造一套 fixture。

---

## 验收标准

- 实战中玩家能一眼看出：护盾**还剩几层**、**每次吸收**（青环叮一下）、**破裂**（碎裂环+toast）、**正在再生**（重铸环+进度）；反伤致死有**品红回冲弧**；反击/nova 有**独立粉色冲击环**（不再淹没在突破粒子里）；减伤生效时炮台有**弱化内闪**。
- 所有新反馈只经 `state.vfx` / 事件，**核心逻辑不读 vfx、不新增 rng 调用**；`npm test`（vitest）全绿，确定性护栏测试通过。
- `tsc` 无类型错误（`CombatVfx` 联合体、新事件类型均已在 `types.ts` 声明并被 `eventText`/渲染 exhaustive 处理）。
- Toast 不刷屏：仅破盾/重铸出文案，高频防御事件纯 Canvas。

## 涉及文件清单（预期）

- `src/core/types.ts`（CombatVfx 新种类、GameEvent 新增 `shieldRestored`[、`thornsKill`]）
- `src/core/effects/runtime.ts`（`absorbBreach`、`tickShield` 事件签名与 vfx 推入）
- `src/core/effects/registry.ts`（`burstDamage` 叠加 `retaliationNova` vfx）
- `src/core/systems/enemySystem.ts`（thorns 两处致死分支推入 `thornsReflect`）
- `src/render/drawEffects.ts`（护盾环分段/强度/再生态增强）
- `src/render/drawVfx.ts`（6 个新 vfx 分支渲染）
- `src/data/texts.json` + `src/ui/eventText.ts`（`shieldRestored` 文案与映射）
- `tests/defenseFeedback.test.ts`（新建）
