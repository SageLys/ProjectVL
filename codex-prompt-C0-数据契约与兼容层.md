# Codex 任务 C0：神池构筑系统 · 数据契约与兼容层

> C 系列第一步，总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 本阶段**只建立类型与配置骨架，零玩法变化**：旧 11 张卡照常战斗，所有旧测试保持通过。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 建立神（GodId）、遗物、进化配方、波末奖励、进化树、词条池的全部 TypeScript 类型与 JSON 配置文件骨架。
2. 给现有 11 张卡临时补 `god` 字段（分派见 §五），新字段全部有默认值。
3. 新配置接入 `src/config/loader.ts` 加载与校验管线。
4. 不改任何运行时行为。

## 二、硬性不变量

1. `getCardPool()`、掉落、合成、升级、波次逻辑一概不动。
2. 现有 `skills.json` 的 `stars/amplifyAxis/consumable` 结构原样保留（C5 才改为进化树解析）。
3. `BuildTag` 枚举不改名不增删；它从本阶段起在注释层面明确为"机制标签"，与神无关。
4. 所有新增配置文件缺失或为空时，游戏行为与今日完全一致（兼容层）。

## 三、现状（已核实）

| 位置 | 事实 |
|---|---|
| `src/core/types.ts` `Card` | 仅 `{ id: number; type: CardType; star: number }` |
| `src/core/effects/defs.ts` `CardDef` | `id/category/synergyTags/textKey/teaching/stars(3,5,6)/amplifyAxis/consumable` |
| `src/config/base/skills.json` | `cards` 长度 = 11 |
| `src/config/types.ts` | 已有 `PerkDef/PerkStatEffect/BuildScalingAxis/ValidationRewardSpec` 等 |
| `src/config` | 已有 skillValidator / progressionValidator / stagePlanValidator / difficultyValidator 惯例 |

## 四、新增类型（`src/config/types.ts` 与 `src/core/effects/defs.ts`）

```ts
// ---- 神（=重新设计后的流派）----
export type GodId = string; // 首版：'storm' | 'winter' | 'inferno' | 'bulwark' | 'plenty'

export interface GodDef {
  id: GodId;
  textKey: string;
  anchorCardIds: string[];    // 2 张身份锚点
  variableCardIds: string[];  // 5 张可变卡
  mainRosterSize: number;     // 5 = 2 锚点 + 抽 3
  subRosterSize: number;      // 3 = 2 锚点 + 抽 1
}

// ---- 遗物（C4 使用）----
export interface RelicDef {
  id: string;
  god?: GodId;                       // 缺省 = 中立遗物
  rarity: 'common' | 'rare' | 'epic';
  textKey: string;
  targetTags: BuildTag[];            // 机制标签，供 buildScaling 白名单
  effects: PerkEffect[];             // 复用现有 stat / buildScaling 效果结构
  poolInfluence?: { godWeightAdd: number; pityDrops?: number };
  maxStacks: number;
}

// ---- 卡间进化配方（C6 使用）----
export interface CardRequirement { cardId: string; minStar: number; }
export interface EvolutionRecipeDef {
  id: string;
  ingredientA: CardRequirement;
  ingredientB: CardRequirement;
  outputCardId: string;
  outputStar: number;
  allowedPhase: 'intermission';
}

// ---- 波末基础奖励（C2 使用）----
export type RunBaseStatKind = 'damageAdd' | 'fireRateAdd' | 'rangeAdd' | 'multiAdd' | 'maxHpAdd' | 'heal';
export interface WaveRewardDef {
  id: string;
  waves: 'all' | number[];
  effect: { stat: RunBaseStatKind; add: number };
}

// ---- 进化树（C5 使用；挂在 CardDef 上，可选）----
export interface EvolutionOptionDef { id: string; textKey: string; equip: BindingDef[]; }
export interface EvolutionCheckpointDef { star: number; options: EvolutionOptionDef[]; } // 首版 star ∈ {3,5}，options 长度 3
export interface EvolutionSharedNodeDef { star: number; equip?: BindingDef[]; amplify?: Record<string, string>; } // 首版 star ∈ {4,6}
export interface EvolutionTreeDef { checkpoints: EvolutionCheckpointDef[]; sharedNodes: EvolutionSharedNodeDef[]; }

// ---- 数值词条池（C7 使用；挂在 CardDef 上，可选）----
export type CardStatKind = RunBaseStatKind | BuildScalingAxis; // 词条既可加基础值也可加机制缩放
export interface CardAffixCandidateDef { stat: CardStatKind; weight: number; min: number; max: number; step: number; consumableDuration: number; }
export interface CardAffixPoolDef { count: number; candidates: CardAffixCandidateDef[]; }
```

`CardDef`（`src/core/effects/defs.ts`）增加可选字段：

```ts
export interface CardDef {
  // ...现有字段不动...
  god?: GodId;                       // C0 起必填校验（11 卡先临时分派）
  evolutionTree?: EvolutionTreeDef;  // C5 前允许缺省
  affixPool?: CardAffixPoolDef;      // C7 前允许缺省
}
```

`Card` 实例（`src/core/types.ts`）增加可选字段并在 `createInitialState.ts`/所有创建点给默认值：

```ts
export interface Card {
  id: number;
  type: CardType;
  star: number;
  evolutionPath?: string[];   // 已选分支 optionId 列表，默认 []
  affixes?: CardAffixRoll[];  // C7 定义 CardAffixRoll，默认 []
}
```

## 五、新增配置文件（`src/config/base/`）

1. `gods.json`：5 个神骨架。C0 阶段先按下表把 11 张旧卡临时分派（与 `docs/五神卡牌设计表_v1.md` §2 的正式归属一致，缺的卡位留空数组，校验器允许"卡数不足"仅告警不报错）：

| god | anchorCardIds（临时） | variableCardIds（临时） |
|---|---|---|
| storm | chainLightning, pierce | （空，C8 补） |
| winter | frost, impact | （空） |
| inferno | scorch, splitBlast | （空） |
| bulwark | aegis, thorns | decoy, sanctum |
| plenty | harvest | （空） |

2. `relics.json`：`{ "version": "0.1.0", "relics": [] }` 空骨架。
3. `evolutionRecipes.json`：`{ "version": "0.1.0", "recipes": [] }` 空骨架。
4. `waveRewards.json`：`{ "version": "0.1.0", "rewards": [] }` 空骨架。
5. `skills.json`：每张卡增加 `"god": "..."` 字段，其余不动。

## 六、加载与校验

1. `src/config/loader.ts` / `src/config/index.ts`：挂载 `cfg.gods / cfg.relics / cfg.evolutionRecipes / cfg.waveRewards`，variants 深合并语义与现有域一致。
2. 新增 `src/config/godValidator.ts`：
   - 每张卡的 `god` 必须存在于 `gods.json`；
   - 神的 anchor/variable 卡 id 必须存在于 `skills.json` 且不重复；
   - `mainRosterSize = anchor数 + 抽取数` 自洽（首版 2+3 / 2+1）；
   - recipes 的 ingredient/output 卡 id 必须存在（output 允许是"不入普通池"的配方产物卡，见 C6，用 `recipeOnly: true` 标记预留字段）；
   - waveRewards 的 `stat` 必须是合法 `RunBaseStatKind`。
3. `skillValidator.ts`：放行新可选字段（god/evolutionTree/affixPool/recipeOnly），对 evolutionTree 做结构校验（checkpoints 星级只能 3/5、每档 3 个 option、sharedNodes 只能 4/6）。

## 七、测试与验收

新增 `tests/godConfig.test.ts`：

1. 加载默认配置成功，`cfg.gods` 5 个神、11 张卡均有合法 `god`。
2. 构造非法配置（卡 god 不存在 / 神引用不存在的卡 / checkpoint 星级为 2）时校验器报错。
3. 旧测试全部通过、`npm run build` 通过。
4. headlessRun（`tests/headlessRun.test.ts`）固定 seed 结果与改动前一致（零玩法变化的回归证据）。
