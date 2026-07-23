# 任务:战斗表现层(光束/榴弹/诱饵可视化 + 开发面板计数)与全卡牌兼容性测试矩阵

前置:B1(融合契约与统一攻击管线)、B2(诱饵生命周期)已完成合入。本任务让"逻辑已生效但玩家看不见"的效果可感知,并建立防回归的兼容性测试网。

## 背景

诊断确认的表现缺口:

- 光束:B1 后已有 `state.beams` 实体,但无渲染(旧实现只有 10 个粒子);
- 榴弹:`drawBullets` 对所有子弹统一画青色圆点,榴弹只是半径略大;无落点预警、无飞行高度感、无爆炸范围圈;
- 诱饵:14px 圆 + 小血条(`drawEffects.drawSummonsAndShield`),无嘲讽范围显示、无敌人被吸引反馈;
- 调参/验证时无法区分"没触发 / 触发了没目标 / 造成了伤害但看不见 / 被融合衰减"。

## 具体改动

### 1. 运行时表现数据 `state.vfx`(`src/core/types.ts` + `createInitialState` + `jumpToWave` 清理)

```ts
type CombatVfx =
  | { kind: 'mortarTarget'; x: number; y: number; radius: number; remaining: number }   // 落点预警圈,弹在飞行中持续存在
  | { kind: 'mortarImpact'; x: number; y: number; radius: number; remaining: number }   // 爆炸扩张圈 ~0.35s
  | { kind: 'tauntPulse'; enemyId: number; remaining: number }                          // 敌人目标切换瞬间头顶标记 ~0.6s
  | { kind: 'summonEvent'; x: number; y: number; event: 'hit'|'destroyed'|'respawn'; remaining: number };
```

- 由核心系统在对应结算点推入(mortar 发射/爆炸、moveTargetFor 目标切换、summon 受击/摧毁/重生);`tickEffects` 统一递减 remaining 并清理;
- 核心逻辑不得读取 vfx(纯输出通道),headless 测试不受影响。

### 2. 渲染(`src/render/`)

- **光束**(新 `drawBeams.ts`,接入 canvasRenderer,画在敌人层上方):从炮口沿 `angle` 画到 `range` 末端,宽 `width`,主体半透明 + 中心亮线,随 `remaining/duration` 淡出;融合形态下命中点爆炸复用 mortarImpact 圈;
- **榴弹弹体**(`drawBullets.ts` 按 `kind` 分支):榴弹画为暖色(#ffb347 系)大弹,按飞行进度 sin 曲线缩放半径模拟抛物线高度;`fragment` 弹片画小号;普通弹不变;
- **落点预警圈/爆炸圈**:虚线圈(mortarTarget)与扩张描边圈(mortarImpact),新 `drawVfx.ts`;
- **诱饵**:脚下常驻嘲讽半径淡圈(alpha≈0.08+描边);正在被嘲讽的敌人 → 敌人到诱饵的短暂细连线(可只在 tauntPulse 存活期画);受击闪烁、摧毁爆点、重生波纹用 summonEvent;
- 渲染顺序保持"区域下、召唤物上":嘲讽半径圈并入 drawZones 层级之后、实体之前亦可,自行安排但注释说明。

### 3. 开发面板:每装备卡触发统计(`src/telemetry/devTelemetry.ts` + `src/debug/devToolsMode.ts`)

- 新增每波归零的计数器:`perCard: Record<cardId, { triggers, hits, damage, suppressedByFusion? }>`;
- 埋点在统一管线:fireTrigger 命中绑定 +triggers;resolveImpact 归因到来源卡 +hits/+damage(attack/rider 需携带来源卡 id——B1 的 attack 结构已有 sourceCardId,riders 补上);
- DEV 面板按装备槽列出:卡名/星级、当前形态(含"融合:光束+榴弹")、本波触发/命中/伤害;
- 目标:能立即区分四种情况——根本没触发 / 触发了没目标 / 有伤害但表现不足 / 被融合衰减改写。

### 4. 文案核对(`src/data/texts.json`)

- B1 实装真持续光束后,`cards.pierce.equip` 6★ 文案"持续光束/自动横扫"已属实,保留;
- 双形态融合状态在装备栏 UI(renderEquipment)加一行小字提示"已融合:光束轰击"(复用现有 shortByTier 渲染通道,文案键新增 `cards.fusion.beamMortar` 之类,措辞可自定)。

### 5. 全卡牌兼容性测试矩阵(新建 `tests/skillCompatibility.test.ts`)

不再新增孤立单卡测试,建立三层网:

1. **配置自动审计**(数据驱动,遍历 `skills.json` 全部卡牌全部星级):
   - 每个出现的 atom 在 `ATOMS` 有处理器,且若为纯修饰(noopModifier)则必须出现在 getModifiers 的聚合 switch 或 FUSION_RULES 白名单中——任何"配置了但没接线"的原子直接测试失败;
   - 每个 `triggerParams.requiresStatus/requiresSource` 的取值在运行时确实可能出现(维护合法值清单:frozen、dot 等来源标签);
   - 每个装备态 summon 绑定带 placement 参数(B2 约定)。
2. **两两兼容抽样**(不做全 N² 组合,选高风险对):
   - 光束+连锁 / 光束+冻结 / 光束+灼烧 / 榴弹+分裂 / 榴弹+击退 / 光束+榴弹融合 / 融合+连锁;
   - 每对断言:可数的触发次数或状态变化(冻结层、灼烧区数量、击退位移、连锁伤害事件),且交换装备槽顺序结果不变;
3. **回归锚点**(B1/B2 已建测试的补充口):
   - 致命命中 riders、灼烧 source 蔓延、榴弹大 dt、诱饵三波单实例——若 B1/B2 已覆盖则此处只补"headlessRun 长跑 10 波不出现 summons/beams/vfx 泄漏(数组规模有界)"。

## 明确不做

- 不调数值强度;
- 不做正式美术(仍是 canvas 占位画法,对齐 drawEffects.ts 头注释的 P3/P5 约定)。

## 验收标准

`npm test` 全绿;DEV 模式下装备光束+榴弹+诱饵+连锁四卡打一波,肉眼可见:持续光束线、命中点爆炸圈、榴弹抛射与落点预警、诱饵嘲讽范围与敌人改道连线;面板中四张卡的触发/命中/伤害均非零。
