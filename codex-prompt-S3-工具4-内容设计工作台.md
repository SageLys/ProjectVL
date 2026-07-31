# Codex 任务 S3·工具4：内容设计工作台（design.html）

> Stage 3 工具线第 4 项。前置已完成：S2 配置编辑器 v1（`editor.html` + `src/editor/**`，commit `8d36a77`）、
> S3 工具1 中文标签与解释单源（`src/editor/labels.ts`）、工具2 配置 Excel 双向同步、
> 工具3 文案编辑并入各模块（`entityTextEditor.ts` + `ConfigSaveFlow.saveEntityWithTexts`，commit `690e3b7`）。
> **地基契约见 `docs/配置管线v1_说明.md`（必读）**；阅读态排版基准见 `docs/ProjectVL_内容设计审阅手册_2026-07-28.pdf`。
> 本任务**不碰游戏运行时**，只新增一个 dev-only 前端入口 + 一层可测试的纯函数渲染层。
> 分三个阶段、三个 commit 交付，每个阶段自身可独立验收。每个 commit 结束时 `npm run test` / `npm run build` / `npm run validate` 全绿。

---

## 一、目标

现有 `editor.html` 是**结构编辑器**：导航按 15 个配置域分，界面镜像 JSON 结构（域 → 字段 → 树）。它解决的是"怎么安全地改一个字段"。

本任务做的是**内容工作台** `design.html`：按**设计单位**（神 / 卡 / 演化分支 / 遗物 / 融合配方）组织，把**机制与文案并排**呈现，并提供纸质手册和 Excel 都给不了的**横切对照视图**。它只服务一个循环——人工审阅现有内容 + 手工设计新内容。

两者共存、互不替代：改 waves / economy 这类纯参数域仍走 `editor.html`；批量数值调整仍走 Excel 往返（`npm run config:export-xlsx`）。

## 二、硬性不变量

1. **不绕过端点**：读走 `/__config/domains` + fetch 文件，校验走 `/__config/validate`，写走 `/__config/write`。**禁止**自己序列化 JSON 写盘（端点用 `stableJson` 统一格式）。
2. **不改游戏运行时**：`src/core`、`src/render`、`src/ui`、`src/input`、`src/config` 的运行时逻辑一律不动。阶段二/三对 `src/config/base/*.json` 与 `src/data/texts.json` 的改动**只能经端点发生**，不得在本任务里手改数据文件内容。
3. **dev-only**：`design.html` 不进生产构建、不被游戏加载。
4. **不重复实现契约**：中文标签只从 `src/editor/labels.ts` 取——缺条目就**补进 labels.ts** 并更新 `tests/editorLabels.test.ts`，**不得**在 `src/design/` 里另起一份字典；效果参数元数据只从 `core/effects/atomContract.ts` 的 `ATOM_CONTRACT` 读；词条落点只从 `src/config/affixSinks.ts` 的 `AFFIX_SINKS` 读；校验结论只认端点返回的 `ValidationReport`。
5. house style：**不引入 UI / 状态管理 / CSS 框架**（README §架构规则），原生 TS + DOM，参照 `src/editor/` 现有写法。
6. **渲染逻辑与 DOM 分离**：所有"把配置翻译成人类可读描述"的逻辑集中在 `src/design/describe.ts`，**纯函数、零 DOM、可单测**；视图层只消费其返回值。这是本任务能被测试覆盖的前提，也是打印视图与屏幕视图不漂移的前提。
7. `npm run test` / `npm run build` 全绿；`npm run validate` 仍 0 error。

## 三、现状（已核实，直接依赖）

### 3.1 可直接复用的编辑器模块（**勿重写**）

| 模块 | 导出 | 用途 |
| --- | --- | --- |
| `editor/api.ts` | `ConfigApi`（`domains` / `load` / `validate` / `write`）、`ConfigEndpointError` | 全部端点交互 |
| `editor/saveFlow.ts` | `ConfigSaveFlow.save(candidates)` / `.saveEntityWithTexts(batch)` / `.canSave` | 批量预检 + 写入失败逐个回滚；**卡·神·遗物与 texts 的双域原子保存唯一入口** |
| `editor/contracts.ts` | `EDITOR_DOMAINS` / `ValidationReportDto` / `ValidationIssueDto` / `reportHasErrors` / `collectIssues` | 端点 DTO 与判定 |
| `editor/dom.ts` | `el` / `button` / `labeled` / `selectControl` / `numberControl` / `deepClone` / `formatValue` | DOM 原语 |
| `editor/labels.ts` | `describeLabel(kind,key)` / `labelWithKey(kind,key,fallback)` / `cardLabel(id)`；`LabelKind = 'atom' \| 'atomParam' \| 'domainField' \| 'enumValue'` | 中文标签单源 |
| `editor/references.ts` | `buildReferenceCatalog(data)` → `{gods,cards,textKeys,tags}`、`referenceKind` / `referenceOptions` | 反向引用与下拉候选 |
| `editor/effectEditor.ts` | `renderEffectsEditor` / `allowedTriggersForEffects` | **阶段三**复用 |
| `editor/entityTextEditor.ts` | `entityTextNode` / `entityTextTitle` / `entityTextChangeHandlers` / `renderEntityTextSection` | **阶段二**复用 |
| `editor/validationPanel.ts` | `renderValidationPanel` | 校验渲染与定位 |
| `editor/treeEditor.ts` | `renderTreeEditor` | 任何未覆盖字段的兜底 |

触发器中文名的键格式是 `enumValue` + `trigger.<name>`（见 `skillsEditor.ts` 的 `enumOption('trigger')`）。

### 3.2 内容数据形状（当前工作树快照，实现前请以实际文件为准复核）

- **`skills.json`**：41 张卡 = 35 张五神名册卡 + 6 张 `recipeOnly` 融合产物。`CardDef`（`core/effects/defs.ts`）：`id / god / category / synergyTags / textKey / teaching / stars{'3'?,'5'?,'6'} / amplifyAxis / consumable / evolutionTree? / affixPool / fusionPolicy?`；`StarTierDef.equip: BindingDef[]`，`BindingDef{ trigger, triggerParams?, effects: EffectDef[] }`。
- **`gods.json`**：5 神（storm/winter/inferno/bulwark/plenty），每神 `anchorCardIds`(2) + `variableCardIds`(5)。主神本局抽 5 张（2 锚点 + 3 可变），副神抽 3 张（2 锚点 + 1 可变）。
- **`relics.json`**：22 件。`god` 有值 = 专属，无 = 通用；`effects[].axis: CardStatKind`（17 种 = `RunBaseStatKind` 6 + `BuildScalingAxis` 11，见 `config/types.ts`）；另有 `rarity / targetTags / maxStacks / poolInfluence`。
- **`evolutionRecipes.json`**：6 条。`ingredientA/B{cardId,minStar}` + `outputCardId` + `outputStar` + `allowedPhase`。
- **`texts.json`** 内容相关键：`cards.<id>{name, hand{shortByTier,milestones}, equip{shortByTier,milestones}, overview}`、`evolution.<cardId>.<optionId>{name,summary,intent,keywords[],buildFit}`、`gods.<id>{name,theme}`、`relics.<id>{name,desc}`、`effectText.atoms` / `effectText.triggers`、`glossary`。
- **演化树**：`checkpoints` 在 3★ / 5★ 各 3 个选项（A/B/C）；`sharedNodes` 在 4★（`amplifyAxis` 强化，无独立里程碑文案）与 6★（公共终态）。
- **33 个效果原子 / 9 个触发器**（`ATOM_NAMES` / `TRIGGER_NAMES`；README 里"8 触发器×31 原子"是旧数，以代码为准）。

### 3.3 已知实现陷阱（务必处理，均为实测踩过的）

1. **`params.effects` 是嵌套效果原子数组**（`aura` / `groundZone` 等 `allowsNestedEffects` 的原子），必须**递归描述**。当成普通数组直接字符串化会输出对象字面量，完全不可读。全库当前约 120 处嵌套。
2. **一张卡的机制来源有四处，缺一不可**：`stars['3'|'5'|'6'].equip`（当前实际生效值）、`evolutionTree.checkpoints[].options[].equip`（3★/5★ 分支候选）、`evolutionTree.sharedNodes`（4★ / 6★）、`consumable.anchors['1'|'3'|'6']`（消耗态落点）。只读 `stars` 会漏掉全部分支内容。
3. **`recipeOnly` 卡没有 `evolutionTree`**，只有 `stars['6']` 与 `consumable`。视图必须分支处理，不能假设 `evolutionTree` 存在。
4. `amplifyAxis` 只有一段描述文本，**没有**独立里程碑文案；视图应显式说明"数值静默提升，不弹窗"，而不是显示为文案缺失。
5. 表格里 CJK 长串在分页时会被拦腰截断（打印视图必须处理，见 §5.4）。

### 3.4 端点契约（`docs/配置管线v1_说明.md` §2、§3 权威）

- `POST /__config/domains` → `{ ok, domains: Record<WritableDomain, filePath> }`
- `POST /__config/validate` → 入参 `{}`（校验磁盘现状）或 `{ domain, data }`（校验"用 data 覆盖该域后"的整套配置）；返回 `{ ok, report }`
- `POST /__config/write { domain, data }` → `200 { ok, path, report }` / `422 { ok:false, error, path, report }`（未写盘）/ `400`
- `report.issues[].path` 形如 `$.skills.cards[3].stars.5.equip[0].effects[1].params.radius`，用于定位跳转
- 写盘后配置单例不热更，需刷新页面才在游戏中生效

## 四、放置与数据流

- 新增 Vite 入口 **`design.html`**（仓库根目录，与 `editor.html` 平级，`http://localhost:5173/design.html`）。`vite.config.ts` 未配置 `rollupOptions.input`，因此新增的 html 天然不进 `dist/`——**不要**为它添加 build input，也不要改 `index.html`。
- 前端代码在 **`src/design/`**：
  ```
  src/design/
    main.ts           # 入口，挂载 #design-root
    app.ts            # 三栏外壳、状态、加载/保存编排
    describe.ts       # 纯函数渲染层（本任务核心，无 DOM）
    navTree.ts        # 左栏内容树 + 搜索筛选
    cardView.ts       # 中栏卡牌阅读态/编辑态
    relicView.ts      # 遗物阅读态/编辑态
    contextPanel.ts   # 右栏：校验 / 反向引用 / 文案槽位
    crossViews/       # 五个横切视图，每个一文件
    styles.css
    print.css
  ```
- **允许 import**：`src/editor/*`、`ATOM_CONTRACT` / `ATOM_NAMES` / `TRIGGER_NAMES`、`src/config/types` 的类型、`src/config/affixSinks.ts` 的 `AFFIX_SINKS`。
- **禁止 import**：`src/config/pipeline.ts`、`src/config/validateAll.ts`（SSR / 读盘，只能经端点）。
- 数据流同编辑器：`/__config/domains` → `fetch` 各域 JSON → 内存编辑 → `POST /__config/validate` → `POST /__config/write` → 提示"刷新以在游戏中生效"。

---

## 五、阶段一：只读工作台（commit 1）

本阶段**零写入**，风险最低，且独立可用——它立刻取代重新生成 A4 PDF 的流程。

### 5.1 `src/design/describe.ts`（本阶段核心交付）

按此签名实现，测试按此签名写：

```ts
export interface ParamView { key: string; label: string; value: string }
export interface EffectView {
  atom: AtomName; label: string; glossary?: string;
  params: ParamView[];      // 不含嵌套效果
  nested: EffectView[];     // params.effects 递归展开，无嵌套时为空数组
}
export interface BindingView { trigger: Trigger; triggerLabel: string; effects: EffectView[] }
export interface BranchView {
  id: string; name: string; summary: string; intent: string;
  keywords: string[]; buildFit: string; bindings: BindingView[];
}
export interface TierView {
  star: 3 | 4 | 5 | 6;
  kind: 'checkpoint' | 'amplify' | 'shared' | 'fixed';  // fixed = recipeOnly 的固定 6★
  visibleText: string;                                   // texts equip.shortByTier
  milestone?: { title: string; detail: string };
  options: BranchView[];                                 // 仅 checkpoint 非空
  bindings: BindingView[];                               // 仅 shared / fixed 非空
  amplifyDescription?: string;                           // 仅 amplify
}
export interface ConsumableTierView {
  star: 1 | 3 | 6; visibleText: string;
  milestone?: { title: string; detail: string };
  radius?: number; duration?: number; effects: EffectView[];
}
export interface AffixView {
  stat: CardStatKind; statLabel: string;
  weight: number; min: number; max: number; step: number; consumableDuration: number;
}
export interface RecipeView { id: string; a: { cardId: string; name: string; minStar: number };
  b: { cardId: string; name: string; minStar: number }; outputStar: number; allowedPhase: string }
export interface CardView {
  id: string; name: string; godId?: string;
  roster: 'anchor' | 'variable' | 'recipeOnly';
  categoryLabel: string; tagLabels: string[]; teaching: boolean;
  overview: string;
  tiers: TierView[]; consumable: ConsumableTierView[];
  affixPool?: { count: number; candidates: AffixView[] };
  designNotes?: string; recipe?: RecipeView;
}
export interface RelicView { id: string; name: string; desc: string; godId?: string;
  rarityLabel: string; tagLabels: string[];
  effects: Array<{ axis: CardStatKind; axisLabel: string; value: number }>;
  maxStacks: number; poolInfluence?: Record<string, number> }

export interface DescribeContext {
  texts: Record<string, unknown>;
  gods: GodsConfig; recipes: EvolutionRecipesConfig;
}
export function describeEffect(effect: EffectDef): EffectView;
export function describeBinding(binding: BindingDef): BindingView;
export function describeCard(card: CardDef, ctx: DescribeContext): CardView;
export function describeRelic(relic: RelicDef, ctx: DescribeContext): RelicView;
```

实现规则：

- 参数中文名一律 `describeLabel('atomParam', ...)`，原子名 `describeLabel('atom', atom)`，触发器 `labelWithKey('enumValue', \`trigger.${trigger}\`, trigger)`，词条轴走 `domainField`/现有条目。缺条目 → **补 labels.ts**。
- `params.effects` 递归进 `nested`，**不得**同时出现在 `params` 里。
- 数值格式化：浮点去尾零、布尔转"是/否"、对象参数展开为 `k=v` 串。
- **不做任何补写**：文案缺失就是空串，由视图层显示"缺失"标记。`describe.ts` 不臆造默认文案。

### 5.2 三栏布局

- **左栏 · 内容树**：按设计语义分组——五神（每神下 2 锚点 / 5 可变 / 专属遗物）、融合卡（6 张，带配方来源）、通用遗物。搜索框匹配中文名与 id。筛选：`synergyTags`、`category`、"用到了某个效果原子"、"存在文案缺失/占位"、"有 designNotes"。
- **中栏 · 卡牌阅读态**：排版对齐 `docs/ProjectVL_内容设计审阅手册_2026-07-28.pdf` 的卡片块——标题行（中文名 + id + 类别/标签/教学/名册角色徽章）、概述、3★ 与 5★ 的三分支并排、4★ 强化、6★ 终态、消耗态三档表格、词条池表格、设计备注。玩家可见文案与设计层机制在每一档里**并排**，不分开两栏。
- **右栏 · 上下文**：
  1. 该实体的校验 issue——启动时 `POST /__config/validate {}` 取全量报告，按 `path` 前缀过滤到当前实体；
  2. 反向引用——被哪条融合配方消耗/产出、哪些遗物的 `targetTags` 命中它的 `synergyTags`、属于哪个神的名册（用 `buildReferenceCatalog` + 自建反向索引）；
  3. 该实体在 `texts.json` 下的全部槽位一览（含缺失项）。

### 5.3 五个横切视图（相对 PDF / Excel 的真正增量）

每个视图独立一页（左栏顶部切换），均支持导出为当前页打印。

1. **分支同质化检查**——同一 checkpoint 的 A/B/C 两两比较，标注：(a) `summary` 字面完全相同；(b) 机制结构相同（trigger 集合与 atom 集合完全一致，仅参数值不同）。按"两项都命中 > 仅文案相同 > 仅机制相同"排序。**这是当前内容设计的首要待办清单**，全库存在大量占位分支。
2. **文案完整性看板**——卡 × 槽位矩阵。槽位 = `name`、`overview`、`hand.shortByTier{1,3,6}`、`hand.milestones{3,6}`、`equip.shortByTier{3,5,6}`、`equip.milestones{3,5,6}`、每条 evolution 的 `name`/`summary`/`intent`/`keywords`/`buildFit`。三态判定：**缺失**（键不存在或空串）／**占位**（`summary === intent`，或 `buildFit === keywords.join('、')`，或与同 checkpoint 兄弟分支字面相同）／**完成**。
3. **星级功率对照**——单神 7 张卡 × {3★, 5★, 6★} 网格，格内显示原子集合与关键数值，用于发现数值节奏不一致。
4. **原子使用分布**——33 个原子 × 使用它的卡数/分支数，零使用的高亮；点击可列出使用位置。
5. **词条轴覆盖**——17 个 `CardStatKind` ×（遗物 `effects[].axis` 计数 + 各卡 `affixPool` 计数），并单独标出 `AFFIX_SINKS[axis].equipment === 'unsupported'` 的轴作为警示。

### 5.4 打印

`@media print` 输出 A4：

- 打印范围用一个 select 选择：**当前实体 / 当前神整章 / 全部内容 / 当前横切视图**。
- 三分支并排在打印时降级为单列堆叠（屏幕宽度够、A4 不够）。
- 必须写入的分页规则（均为 PDF 版实测踩过的坑）：`h2, h3 { break-after: avoid }`（否则出现标题独占一页的空白页）、`tr { break-inside: avoid }`（否则表格行被拦腰截断，标签与数值分落两页）、卡片块 `break-inside: avoid`。
- 打印视图**取代** `docs/ProjectVL_内容设计审阅手册_*.pdf` 的重新生成；旧 PDF 保留为历史快照，不必更新，也**不要**去修改任何生成脚本。

### 5.5 阶段一 DoD

- `design.html` 可打开；五神 + 融合卡 + 全部遗物可浏览；5 个横切视图可用；打印预览分页正确无空白页、无截断行。
- 新增 `tests/designDescribe.test.ts`：
  - `describeEffect` 对 `groundZone{ params.effects:[dot] }` 返回 `nested.length === 1` 且 `nested[0].label` 是中文，且 `params` 中不含 `effects`；
  - `describeCard(chainLightning)` 返回 3★/5★ 各 3 个 `options` + 4★ amplify + 6★ shared；
  - `describeCard(frozenThunder)`（`recipeOnly`）返回单一 `kind: 'fixed'` 的 6★，`tiers` 中无 checkpoint，且 `recipe` 有值；
  - 遍历 `ATOM_NAMES`，用 `ATOM_CONTRACT` 的 `default` 造样本，断言 `describeEffect` 对全部 33 个原子不抛错且 `label` 非空（防止新增原子后视图静默降级为英文 id）。
- 新增 `tests/designViews.test.ts`：同质化检查在当前 `skills.json` 上命中数 > 0；文案完整性槽位总数与卡数吻合；原子使用计数总和等于全库效果实例数。
- `npm run build` 后确认 `dist/` 不含 design 产物。

---

## 六、阶段二：文案就地编辑（commit 2）

- 中栏每个文案块加"编辑"切换：进入编辑态渲染输入/多行输入（复用 `renderEntityTextSection`，或按 `entityTextEditor.ts` 里 `textControl` 的同样写法），退出即回阅读态。**分块切换，不要把整张卡变成一张裸字段表单。**
- 本阶段**只放开 texts 域**：`cards.<id>.*`、`evolution.<cardId>.<optionId>.*`、`gods.<id>.*`、`relics.<id>.*`。实体域字段一律保持只读。
- 改动即 `POST /__config/validate { domain:'texts', data }`，渲染右栏；有 error 时禁用保存，warning 不拦。
- 保存走 `ConfigSaveFlow.save([{ domain:'texts', data, original }])`；若后续阶段导致同批次也改了实体域，改走 `saveEntityWithTexts`。422 时展开 `report.issues`，**不改本地未保存态**。
- 文案完整性看板的每个缺失/占位单元格可点击直达对应字段的编辑态。
- **DoD**：改一条 `evolution.<id>.summary` 保存后 `git diff` 只含该值；`npm run validate` 仍 0 error；mock 测试覆盖 validate→save 主路径与 422 不落地（参照 `tests/editorContract.test.ts` 的 `EditorFetch` mock 写法）。

## 七、阶段三：机制编辑（commit 3）

- 放开编辑：
  - 卡牌的 `stars` / `evolutionTree.checkpoints[].options[].equip` / `sharedNodes` / `consumable.anchors` 的 bindings——**复用 `renderEffectsEditor` 与 `allowedTriggersForEffects`**，不要另写效果表单；
  - `affixPool.candidates`（stat 下拉限定 `CardStatKind`，权重/范围/步进/消耗态时限数值控件）、`amplifyAxis`、`designNotes`、`synergyTags`、`category`、`teaching`；
  - 遗物的 `rarity` / `targetTags` / `effects[].axis|value` / `maxStacks` / `poolInfluence`；
  - `evolutionRecipes` 的材料、产出、`outputStar`、`allowedPhase`。
- 编辑态**直接嵌在阅读态对应块内**，不跳转去 `editor.html`。
- 引用型字段一律下拉（`referenceOptions(key, catalog)`），禁自由文本，避免写出会被校验拦下的悬空引用。
- 一次保存涉及多域时（如改配方同时动 `skills`），组成同一批次交给 `ConfigSaveFlow.save`，依赖它的预检 + 回滚，不要逐域裸调 `write`。
- **本阶段不实现**：新增/删除卡牌、遗物、神、配方等**实体级结构操作**（留在 `editor.html`）；`fusionPolicy`（D2 预留位，显示但标注"未实现，暂不建议填写"）。
- **DoD**：改 `chainLightning` 某 3★ 分支的 `bounces` 保存 → 文件 diff 只含该值；把某神名册指向不存在的卡 → 保存被 422 拦下且右栏精确定位；全绿。

## 八、交付与验收

- 文件：`design.html` + `src/design/**` + `tests/designDescribe.test.ts` + `tests/designViews.test.ts`（+ 阶段二/三追加的 mock 测试）+ `docs/内容设计工作台_验收.md`。
- `docs/内容设计工作台_验收.md` 写清逐阶段手动验收脚本，至少包含：
  1. 打开 `design.html`，逐神翻一遍 7 张卡，对照 `docs/ProjectVL_内容设计审阅手册_2026-07-28.pdf` 抽查 3 张卡的机制与文案一致；
  2. 分支同质化检查列出的条目，人工确认确实是占位内容；
  3. 打印预览（Ctrl+P）三种范围各一次，无空白页、无截断表格行；
  4. 阶段二：改一条文案 → diff 只含该值 → `npm run validate` 0 error；
  5. 阶段三：改一个数值 → diff 只含该值；制造一个悬空引用 → 422 拦下。
- 三个 commit，每个自身 `npm run test` / `npm run build` / `npm run validate` 全绿。

## 九、明确不做（勿在本任务引入）

- 节点图 / 蓝图式效果编排（D5 已明确排除）。
- 实体级增删（新增卡/遗物/神/配方）——留在 `editor.html`。
- 数值曲线拟合、蒙特卡洛模拟、自动平衡建议。
- 修改或重跑生成 A4 PDF 的 Python 脚本；打印视图取代之。
- 与 Excel 双向同步的任何耦合（两条路各自独立）。
- 把 `editor.html` 的 15 域导航复制进来——本工作台**只**呈现 skills / gods / relics / evolutionRecipes / texts 五个域的内容切面。
