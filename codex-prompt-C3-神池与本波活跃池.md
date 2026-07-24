# Codex 任务 C3：神池 · 本局卡组 · 本波活跃池 · 掉卡入口收口

> 前置：C0、C1 已合并（C2 无硬依赖）。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`，设计依据 `docs/神池系统_设计方案_v1.md`。
> 这是 C 系列的架构分水岭：完成前不得开始 C8 批量制卡。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 选神流程：第 1 波前主神 3 选 1，第 2/3 波间副神 2 选 1，第 3 波后锁池；第 4–8 波选本波重点神（2 选 1），第 9–10 波三神 3 选 1 定兑现方向。
2. 三级合法范围：全局卡库 → 本局卡组（11 张，选神时抽定、入 state 不再重抽）→ 本波活跃池（5–7 张）。
3. **所有**掉卡入口收口：普通掉落用活跃池；Bounty 用本局卡组；validation 高星按重点神定向；skillExtra 用活跃池；调试入口显式选档。任何正常路径不得出现第四神的卡。
4. 新副神 3 张卡的展示保底（前 9 次普通掉落内各至少展示一次）。

## 二、硬性不变量

1. discovery/build/pivot 三角色框架、role bag、连发保护、build pity 机制全部保留，只把候选集合从全局池换成活跃池。
2. `ordinaryDropRate` 预算器不动。
3. 神房权重只偏置 discovery/pivot 的候选与配额，**不覆盖** build 角色对高投入链的照顾。
4. RNG 纪律；固定 seed 下三神与名册可重现。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/systems/dropTypePolicy.ts` `getCardPool` | `cfg.skills.cards.map(c => c.id)` 全局池 | 拆为 `getRunRoster(state)` / `getActivePool(state)`；本函数仅保留给调试 |
| `dropTypePolicy.ts` `selectDiscoveryType/selectBuildTypeBase/selectPivotType/refillNormalDropRoleBag` | 全部直接调 `getCardPool()` | 全部改为 `getActivePool(state)`（pivot 额外限制：候选必须属于已选三神） |
| `dropTypePolicy.ts` `refillNormalDropRoleBag` 的 `bootstrapMinDiscovery` | 检测全局未见卡加 discovery | 抽象为通用"定向展示任务"，服务新神保底（§六） |
| `src/core/systems/bountySystem.ts` `shuffleRewardBag` | `getCardPool()` 建奖励袋 | 改 `getRunRoster(state)`，加权偏向本波重点神与已投入卡（复用 `calculateCommitmentScore`） |
| `src/core/systems/waveBossSystem.ts` | validation 奖励 `typePolicy: 'build'|'pivot'` 走 `selectBuildType/selectPivotType` | 新增 typePolicy `'focusGod'`：从本局卡组中属于当前重点神的卡里按投入分选；waves.json validation 段改用它 |
| `src/core/systems/dropSystem.ts` `spawnTestDrops` | `getCardPool()` 轮换 | 增加显式池参数（global/run/active），默认 active |
| 技能产生额外卡牌（`extraDrop` 原子，见 `src/core/effects/` 实现处） | 从全局池随机 | 改为活跃池 |
| `src/core/systems/progressionSystem.ts` `applyPerk` | affinity 加到 BuildTag、刷新 roleBag/rewardBag/pity | 本阶段不动（C4 改为按神）|
| `cfg.economy.normalDropTypePolicy` | `roleBagSize=10, earlyMix 6/3/1, lateMix 1/7/2, build.topK=3, bootstrapMinDiscovery=6, affinity.pityWindow=2` | 数值沿用 |

## 四、状态与选神规则（新增 `src/core/systems/godPoolSystem.ts`）

```ts
// src/core/types.ts
export interface GodPoolState {
  mainGod: GodId | null;
  subGods: GodId[];                    // 最多 2
  focusGod: GodId | null;              // 本波重点神
  runRoster: CardType[];               // 选神时抽定，锁池后固定 11 张
  rosterByGod: Record<GodId, CardType[]>;
  offerDrought: Record<GodId, number>; // 连续未进候选波数（保底用）
  bootstrapQueue: CardType[];          // 新神未展示卡
  bootstrapDropsRemaining: number;
}
// GameState 增加：godPool: GodPoolState;
```

| 波次 | 决策（经 C1 决策队列） | 结果 |
|---|---|---|
| 开局（第 1 波前） | `godDraft` 全部神 3 选 1 | 主神；2 锚点 + 5 可变抽 3 → rosterByGod 5 张 |
| 第 1 波后波间 | `godDraft` 未选神 2 选 1 | 副神 A；2 锚点 + 抽 1 → 3 张 |
| 第 2 波后波间 | `godDraft` 未选神 2 选 1 | 副神 B；3 张；**锁池**，runRoster=11 |
| 第 3–7 波后波间 | `godFocus` 已选三神 2 选 1 | 下一波（4–8）重点神 |
| 第 8–9 波后波间 | `godFocus` 三神全展示 3 选 1 | 第 9/10 波兑现方向 |

规则：抽取结果立即写入 `rosterByGod`，本局不重抽；`godFocus` 候选生成时，`offerDrought[god] >= 2` 的神必入候选（映射 pityWindow=2 语义）；选中后清零、未出现者 +1。

## 五、活跃池（新增 `src/core/systems/activePoolSystem.ts`）

```ts
export function getRunRoster(state: GameState): CardType[];
export function getActivePool(state: GameState): CardType[];       // 读缓存
export function generateActivePool(state: GameState, wave: number, rng: Rng): CardType[]; // startNextWave 时生成并缓存
```

生成顺序（去重，硬上限 7）：

1. **保护卡 ≤3**：优先级 已装备 > 2★+ > 差一次可合成 > 历史合成投入高（`calculateCommitmentScore`）。硬规则：满足前三类的卡最多休眠一波（上波不在池则本波必入）。
2. **重点神卡 3–4**：主神房从其 5 张选 3–4（优先已拾取过的）；副神房该神 3 张全入。
3. **转向卡 ≤1**：来自其他已选神；第 4–6 波允许，第 7 波起取消；第 8 波不得引入本局从未展示过的卡。
4. 第 1–3 波特例：第 1 波 = 主神 5 张全量；第 2/3 波 = 新副神 3 张 + 重点 3 张（参照神池方案 §8 表）。
5. 第 9–10 波：普通掉落大幅降频（预算器沿用 validation 段现状），活跃池 = 保护卡 + 重点神卡，仅作兜底。

discovery/build/pivot 全部改在活跃池内运行；`selectPivotType` 候选再过滤"属于已选三神"。

## 六、新神展示保底

副神加入时：`bootstrapQueue = 该神 3 张`，`bootstrapDropsRemaining = 9`。`selectNormalEnemyDropType` 顶部拦截：若 `bootstrapDropsRemaining > 0` 且队列有未展示卡，优先弹出展示（计入 recordCardDropShown），每次普通掉落 `bootstrapDropsRemaining--`。归零或队列空则回到正常角色流。现有 `bootstrapMinDiscovery` 的"存在未见卡加 discovery"逻辑改为只看**活跃池内**未见卡。

## 七、UI 与文案

- `godDraft/godFocus` 决策弹窗：神名、神主题一句话、（选主神时）该神本局 5 张卡预览（复用 `src/ui/cardMeta.ts` / `renderCards` 的卡面元素）；文案键 `texts.json` 增 `gods.*`、`decisions.godDraft/godFocus`。
- HUD 显示当前三神与本波重点神徽记（`renderHud.ts`）。

## 八、测试与验收

新增 `tests/godPoolSystem.test.ts`、`tests/activePoolSystem.test.ts`；改 `tests/dropTypePolicy.test.ts`、`tests/bountyRewards.test.ts`、`tests/waveBossRewards.test.ts`：

1. 第 3 波后 mainGod+2 subGods 固定、runRoster 恰 11 张且不再变化。
2. 主神固定 5 张（含 2 锚点）、副神固定 3 张（含 2 锚点）；固定 seed 可重现。
3. 活跃池去重、≤7；第 1 波 = 主神 5 张。
4. 整局模拟（headless，固定 seed）中：normalKill/bounty/bossKill/skillExtra/validationElite 所有掉落的 cardType ∈ runRoster；普通掉落 ∈ 当波 activePool。
5. 保护链最多休眠一波；第 8 波不首次引入新基础卡；转向卡第 7 波起消失。
6. 新副神 3 张在其后 9 次普通掉落内各展示 ≥1 次。
7. 神候选连续两波未出现必入候选。
8. validation 奖励卡属于当前重点神。
9. 遥测：`god_offer/god_selected/run_roster_created/active_pool_created/card_shown_by_god/card_collected_by_god`。
