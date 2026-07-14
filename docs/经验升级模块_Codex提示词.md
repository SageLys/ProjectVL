# ProjectVL — 主角经验获取与升级模块（开发调参）Codex 提示词

> 直接把本文件内容发送给 Codex。目标：把当前"能跑但最小"的经验/升级骨架，
> 补成一个**可在开发调参面板上完整调节**的经验获取 + 升级三选一模块。

---

## 0. 背景与铁律（务必先读）

ProjectVL 是 Vite + TypeScript 的塔防射击可玩原型。架构约束**不可违反**：

- `src/core/` 是**纯规则层**：禁止 DOM / Canvas / 浏览器 API；系统函数签名统一为
  `fn(state, config, dt, rng) → GameEvent[]`，随机一律走**注入的 `rng: () => number`**，
  禁止 `Math.random()`。表现副作用只能由 `GameEvent` 驱动（core 产出语义事件，UI 层消费）。
- 数值/参数改 `src/config/base/*.json`（六域），**不在代码里写死**。
- 技能效果走 `core/effects` 通用解释器，本任务**不碰技能卡**。
- "删旧界面铁律"：替换掉的旧 UI（如 index.html 里写死的 3 个 perk 按钮）**直接删除，不留兜底**。
- 完成判据：`npm run build`（tsc + vite 构建）与 `npm run test`（vitest）**全绿**，并为新逻辑补测试。

### 现状（已确认，勿重复实现）
- 撃破 XP **已接线**：`src/core/systems/damageSystem.ts` 的 `killEnemy` 调
  `addXp(state, enemy.xp * getModifiers(state).xpMul)`。
- 过期转化 XP **已接线但本任务要移除**：`src/core/systems/dropSystem.ts` 的 `tickDrops`
  （`expiryConvert` 修饰）会把过期掉落按概率转成 XP。见 §8，本任务**删除该功能**。
- 升级曲线：`src/config/base/progression.json` 仅 `xpNeedBase: 8`、`xpGrowth: 1.35`（等比）。
- `src/core/systems/progressionSystem.ts`：`addXp` / `levelUp` / `applyPerk` 已存在，但
  **单次判定不连升**（一次撃破给足两级只升一级），perk 是**固定 3 个**（damage/rate/repair）。
- `index.html` 第 48–49 行：升级弹窗 3 个写死按钮 `data-perk="damage|rate|repair"`；
  `src/ui/domRefs.ts` 用 `querySelectorAll('[data-perk]')` 静态抓取，`src/ui/modals.ts`
  `showLevel()` 只加 class 显示、不重建按钮；`src/game.ts` `onPerk` 调 `applyPerk` 后 `hideLevel`。
- 调参面板：`src/ui/tunerSchema.ts` + `src/config/base/tuner.json` + `src/ui/tunerPanel.ts`
  （数值滑杆，键=点路径，`setNumberAt(cfg, path, value)` **即时生效**；`TunerGroup` 现为
  `'waves'|'combat'|'enemies'|'drops'|'p2'`）。**经验曲线/倍率当前完全没有暴露**；仅
  `enemies.types.*.xp`（每类敌人经验）已在调参里。

### 本次范围（用户拍板）
1. **XP 来源 = 仅撃破敌人 XP**（不新增拾取/波次/时间 XP；**并移除已有的"过期转化 XP"功能**，见 §8）。
2. **升级奖励 = 随机三选一 perk 池**（带权重、去重/上限，池可配置）。
3. **调参暴露 = 曲线 + 来源 + 倍率 全部暴露**到开发调参面板。

---

## 1. 配置层改造 `src/config/base/progression.json` + `src/config/types.ts`

把 `progression` 扩成如下形状（在 `ProgressionConfig` / `PerkDef` 类型里同步）：

```jsonc
{
  "xpNeedBase": 8,          // 1→2 级所需经验
  "xpGrowth": 1.35,         // 每级需求 ×该系数（等比）
  "killXpMul": 1.0,         // 全局撃破经验倍率（配置基线，独立于效果解释器的 xpMul）
  "perkChoices": 3,         // 每次升级提供几个候选
  "perks": [
    // kind 保持可被 applyPerk 解释；weight=加权抽样权重；maxStacks=该 perk 一局内最多被选次数（去重/限次）
    { "id": "damage",  "title": "高能弹芯", "desc": "基础伤害 +20%",   "kind": "damagePct",  "value": 0.20, "weight": 1.0, "maxStacks": 99 },
    { "id": "rate",    "title": "过载供能", "desc": "射速 +15%",        "kind": "fireRatePct","value": 0.15, "weight": 1.0, "maxStacks": 99 },
    { "id": "repair",  "title": "重整心防", "desc": "私人空间恢复 20 点","kind": "heal",       "value": 20,   "weight": 0.8, "maxStacks": 99 },
    { "id": "maxhp",   "title": "扩容心防", "desc": "心防上限 +15",     "kind": "maxHp",      "value": 15,   "weight": 0.8, "maxStacks": 99 },
    { "id": "range",   "title": "延伸射界", "desc": "射程 +8%",         "kind": "rangePct",   "value": 0.08, "weight": 0.7, "maxStacks": 6  },
    { "id": "xpgain",  "title": "洞悉弱点", "desc": "撃破经验 +12%",    "kind": "xpGainPct",  "value": 0.12, "weight": 0.6, "maxStacks": 6  }
  ]
}
```

要求：
- `PerkDef.kind` 联合类型扩为 `'damagePct' | 'fireRatePct' | 'heal' | 'maxHp' | 'rangePct' | 'xpGainPct'`。
  新增字段 `weight: number`、`maxStacks: number`。
- `ProgressionConfig` 增 `killXpMul: number`、`perkChoices: number`。
- 上面的 perk 池是**建议默认值**；若某 kind 落地成本高，可精简，但池内 eligible perk 数必须
  **稳定 > perkChoices**，否则三选一退化。数值都从 config 读，禁止写死在逻辑里。

---

## 2. 规则层 `src/core/systems/progressionSystem.ts`（核心）

### 2.1 撃破经验倍率
`killEnemy` 处的经验计算改为叠加**配置基线倍率**与**玩家自身增益**与**效果解释器倍率**：

```
xpGain = enemy.xp * cfg.progression.killXpMul * (1 + state.xpGainBonus) * getModifiers(state).xpMul
```
- 新增 `state.xpGainBonus`（初值 0，见 §4），由 `xpGainPct` perk 累加。
- `damageSystem.ts` 里 `addXp(state, xpGain, rng)` 传入 rng（见 2.3 签名变更）。

### 2.2 连续升级（修 bug）
一次经验注入可能跨多级。改为 while 循环逐级结算，并把**待选择的升级次数入队**，
避免一次弹窗吞掉多级：

```ts
export function addXp(state, amount, rng): GameEvent[] {
  const events = [];
  state.xp += amount;
  while (state.xp >= state.xpNeed) {
    events.push(...levelUp(state, rng));
  }
  return events;
}

export function levelUp(state, rng): GameEvent[] {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * cfg.progression.xpGrowth);
  state.pendingLevelUps++;      // 队列 +1
  state.paused = true;
  if (state.offeredPerks.length === 0) {
    state.offeredPerks = rollPerkChoices(state, rng);  // 仅当前没有待选项时抽新的
  }
  return [{ type: 'levelUp' }];
}
```

### 2.3 加权无放回抽样（注入 rng，可确定性测试）
```ts
export function rollPerkChoices(state, rng): string[] {
  // eligible = perks.filter(p => (state.perkStacks[p.id] ?? 0) < p.maxStacks)
  // 从 eligible 加权无放回抽 min(perkChoices, eligible.length) 个，返回 id 数组
  // 抽样只用注入的 rng()，禁止 Math.random
}
```

### 2.4 应用 perk（校验候选、消队、按需再弹）
```ts
export function applyPerk(state, config, perkId, rng): GameEvent[] {
  if (!state.offeredPerks.includes(perkId)) return [];   // 只能选本次给出的候选
  const perk = cfg.progression.perks.find(p => p.id === perkId);
  if (!perk) return [];
  switch (perk.kind) {
    case 'damagePct':   state.damageBonus  += totalDamage(state, config)  * perk.value; break;
    case 'fireRatePct': state.fireRateBonus += totalFireRate(state, config) * perk.value; break;
    case 'heal':        state.hp = Math.min(state.maxHp, state.hp + perk.value); break;
    case 'maxHp':       state.maxHp += perk.value; state.hp += perk.value; break;
    case 'rangePct':    state.rangeBonus += perk.value; break;   // 若无 range 增益字段，新增并接入 stats
    case 'xpGainPct':   state.xpGainBonus += perk.value; break;
  }
  state.perkStacks[perkId] = (state.perkStacks[perkId] ?? 0) + 1;
  state.pendingLevelUps--;
  state.offeredPerks = state.pendingLevelUps > 0 ? rollPerkChoices(state, rng) : [];
  state.paused = state.pendingLevelUps > 0;   // 还有待升级则保持暂停并再弹
  return [
    { type: 'perkApplied', title: perk.title },
    ...(state.pendingLevelUps > 0 ? [{ type: 'levelUp' as const }] : []),
  ];
}
```
- `rangePct`：`stats.ts` 的 `totalRange` 现为
  `Math.min(config.range + equipmentBonus(state).range, maxAttackRange())`。新增 `state.rangeBonus`（初值 0）
  后改为 `Math.min(config.range + equipmentBonus(state).range + config.range * state.rangeBonus, maxAttackRange())`。
  **注意射程被 `maxAttackRange()` 硬上限钳制**（画布内留预留带），靠近上限时该 perk 会变成近似 no-op——
  若认为不值当，可把 `range` perk 从默认池移除并在注释里说明，保持池 eligible 数 > perkChoices 即可。
- 更新 `damageSystem.ts` / `dropSystem.ts` 里 `addXp` 调用点以匹配新签名（都能拿到 rng）。

---

## 3. 表现层：升级弹窗改为动态渲染（删旧写死按钮）

- **`index.html`**：删掉 `#levelModal` 里写死的 3 个 `data-perk` 按钮，保留一个空容器
  `<div class="choices" id="perkChoices"></div>` 供动态填充。
- **`src/ui/domRefs.ts`**：去掉静态 `perkButtons = querySelectorAll('[data-perk]')`，
  改为引用容器 `perkChoices: el('#perkChoices')`。
- **`src/ui/modals.ts`**：`showLevel(perks: PerkDef[])` 接收当前候选，**每次重建按钮**
  （清空容器→按 perks 生成 `<button class="choice" data-perk=id><b>title</b>desc</button>`），
  用事件委托绑定点击回调（容器级监听，读 `e.target.closest('[data-perk]').dataset.perk`）。
- **`src/game.ts`**：
  - `dispatch` 里 `if (ev.type === 'levelUp') modals.showLevel(resolveOfferedPerks(state))`，
    其中 `resolveOfferedPerks` 把 `state.offeredPerks`（id 数组）映射为 `PerkDef[]`。
  - `onPerk(id)`：调 `applyPerk(state, config, id, rng)` → `dispatch(events)`。
    若返回事件里**仍含 `levelUp`**（队列未清空），`dispatch` 会自动再次 `showLevel` 展示新候选；
    否则 `modals.hideLevel()`。确保先渲染再判断隐藏，避免闪烁。
  - 保留 DEV 遥测：`telemetry?.recordInput('perkSelect', id)`。
- 注意 `rng` 在 game 层的来源要与现有战斗循环一致（同一个注入实例）。

---

## 4. 状态字段 `src/core/types.ts` + `src/core/createInitialState.ts`

`GameState` 新增并在 `createInitialState` 初始化：
- `pendingLevelUps: number` = 0
- `offeredPerks: string[]` = []
- `perkStacks: Record<string, number>` = {}
- `xpGainBonus: number` = 0
- （若实现 rangePct）`rangeBonus: number` = 0

`xp/xpNeed/level` 已存在，`xpNeed` 初值继续用 `cfg.progression.xpNeedBase`。

---

## 5. 调参面板暴露（曲线 + 来源 + 倍率）

### 5.1 `src/config/base/tuner.json` 增范围
```jsonc
"progression.xpNeedBase": { "min": 1, "max": 60, "step": 1 },
"progression.xpGrowth":   { "min": 1.0, "max": 2.0, "step": 0.01 },
"progression.killXpMul":  { "min": 0, "max": 5, "step": 0.05 },
"progression.perkChoices":{ "min": 2, "max": 5, "step": 1 }
```
（每类敌人经验 `enemies.types.*.xp` 已在调参里，无需重复。）

### 5.2 `src/ui/tunerSchema.ts`
- `TunerGroup` 增 `'progression'`。
- `TUNER_PARAMS` 追加：
```ts
{ path: 'progression.xpNeedBase',  label: '经验 · 首级需求',   group: 'progression' },
{ path: 'progression.xpGrowth',    label: '经验 · 每级增长',   group: 'progression' },
{ path: 'progression.killXpMul',   label: '经验 · 撃破倍率',   group: 'progression' },
{ path: 'progression.perkChoices', label: '升级 · 候选数量',   group: 'progression' },
```

### 5.3 `src/ui/tunerPanel.ts`
- 在分组标签/渲染映射里给 `'progression'` 加中文分组名（如"经验与升级"），
  确保新组像现有组一样渲染滑杆。
- 这些参数**非 waveDeferred**，`setNumberAt(cfg, path, value)` 即时生效即可
  （下一次升级/撃破读取新值；已进行中的 `xpNeed` 不追溯，符合调参语义）。

---

## 6. 测试 `tests/`

新增/扩展（vitest，注入确定性 rng）：
1. `addXp` 连续升级：一次注入跨 2–3 级 → `pendingLevelUps` 正确入队、`level`/`xpNeed` 正确、`paused=true`。
2. `rollPerkChoices` 确定性：固定 seed rng 下返回稳定；数量 = `min(perkChoices, eligible)`；无重复 id。
3. 去重/限次：把某 perk `maxStacks` 设小，选满后不再出现在候选里。
4. `applyPerk`：非候选 id 被拒（返回空、状态不变）；选后 `perkStacks` +1、队列 -1；
   队列清空时 `paused=false` 且 `offeredPerks=[]`，未清空时再抽新候选且仍 `paused=true`。
5. 倍率链：`killXpMul` / `xpGainBonus` / 解释器 `xpMul` 三者相乘正确。
6. 调参 round-trip：`getNumberAt`/`setNumberAt` 对 4 个新 progression 路径读写一致。
7. 现有整局无头 bot 冒烟测试仍绿（升级流程不因 pause/队列卡死——bot 若不选 perk，需在测试里模拟选择或直接调 applyPerk 推进）。

---

## 7. 交付要求

- �
---

## 8. 移除"过期转化 XP"功能（`expiryConvert`）

背景：过期掉落原本会按 `expiryConvert` 修饰的 `ratio` 概率转成 1 点 XP。现决定**取消此功能**——
过期掉落一律视为损失，只计 `expired`，不再产出任何 XP。当前**没有任何技能卡使用该原子**
（`skills.json` 里 0 处引用），因此可安全整体移除；这会把效果原子库从 31 → 30。

逐文件删除：

1. **`src/core/systems/dropSystem.ts`** — `tickDrops` 内删除 `expiryConvert` 相关整块：
   删掉 `const convert = getModifiers(state).expiryConvert;` 与 `if (convert && rng() < convert.ratio) { ... addXp ... }`。
   过期分支只保留 `state.groundDrops.splice(i, 1); state.expired++;`。同步更新函数上方注释
   （删掉"expiryConvert 修饰…转化为经验"那句）。若移除后 `rng` / `addXp` 在本文件不再被使用，一并清理 import。
2. **`src/core/types.ts`** — 删除 `expiredConverted: number;` 字段及其上方注释。
3. **`src/core/createInitialState.ts`** — 删除 `expiredConverted: 0,` 初始化。
4. **`src/core/effects/interpreter.ts`** — 删除 modifiers 中的 `expiryConvert` 字段声明（约 L134）、
   初始化里的 `expiryConvert: null`（约 L147）、以及 `case 'expiryConvert': ...`（约 L167–168）。
5. **`src/core/effects/defs.ts`** — 从修饰原子联合类型里删除 `'expiryConvert'` 成员（约 L30）。
6. **`src/core/effects/registry.ts`** — 删除 `expiryConvert: noopModifier,`（约 L341）。
7. **`docs/skills-schema.json`** — 从原子枚举（约 L101）与原子定义块（约 L279）移除 `expiryConvert`；
   若 schema 里有原子计数/版本号，相应更新（31→30，schema 版本可 bump 并在文件内注明）。
   ⚠️ 该文件曾出现"尺寸缓存截断"问题——修改前先与 git HEAD 比对，改后 `git diff` 复核完整性。
8. **`tests/effectInterpreter.test.ts`** — 删除 `expiryConvert：过期掉落转化为经验` 这条用例（约 L178–179）。
   若有 drop 系统测试断言过期转化，也一并删除/改写。

验收：全仓 `grep -rn "expiryConvert\|expiredConverted" src tests docs` **零命中**（除本提示词自身）；
`npm run build` 与 `npm run test` 全绿。
