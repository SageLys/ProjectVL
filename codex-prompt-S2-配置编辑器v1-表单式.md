# Codex 任务 S2：配置编辑器 v1（表单式）

> Stage 2。总纲见 `docs/接下来任务计划_v1.md`；**地基契约见 `docs/配置管线v1_说明.md`（必读）**。
> 前置已完成（commit `ff1d1ce`）：固化1（`ATOM_CONTRACT`）、固化2（tuner 元数据单源 / 遗物文案入 key / 融合结构位）、固化4（`/__config/*` 端点 + `npm run validate`）。
> D5：**只做表单，不做节点图**。本阶段**不碰游戏运行时**，只新增一个 dev-only 编辑器前端。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 一、目标

做一个**本地 Web 配置编辑器**（dev-only），让人和 AI 不再手改嵌套 JSON。编辑器**不碰磁盘**，一切读/校验/写都走配置管线 v1 的三个端点。核心价值集中在**原始 JSON 最难编辑的两处**：技能效果树（从 `ATOM_CONTRACT` 自动生成参数表单）和调参项（从 `TunerParamMeta` 自动生成控件）。

## 二、硬性不变量

1. **不绕过端点**：读走 `/__config/domains` + fetch 文件，校验走 `/__config/validate`，写走 `/__config/write`。**禁止**在编辑器里自己序列化 JSON 再写盘（端点用 `stableJson` 统一格式）。
2. **不改游戏运行时**：`src/core`、`src/config` 的运行时逻辑、`skills.json` 等配置数据一律不动；本任务只加编辑器前端 + 一个新 Vite 入口。
3. **dev-only**：编辑器入口不进生产构建、不被游戏加载；生产构建体积不受影响。
4. **不重复实现契约**：效果参数元数据只从 `core/effects/atomContract.ts` 的 `ATOM_CONTRACT` 读；调参元数据只从 `config/tunerMeta.ts` / `tuner.json` 读；校验结论只认端点返回的 `ValidationReport`。
5. house style：**不引入 UI/状态管理框架**（与 README 架构规则一致），用原生 TS + DOM（可参照 `src/ui/tunerPanel.ts` 的写法）。
6. `npm run test` / `npm run build` 全绿；`npm run validate` 仍 0 error。

## 三、现状（已核实，直接依赖）

### 3.1 端点契约（`docs/配置管线v1_说明.md` §2、§3 权威）
- `POST /__config/domains` → `{ ok, domains: Record<WritableDomain, filePath> }`。
- `POST /__config/validate` → 入参 `{}`（校验磁盘现状）或 `{ domain, data }`（校验"用 data 覆盖该域后"的整套配置）；返回 `{ ok, report }`。
- `POST /__config/write { domain, data }` → `200 { ok, path, report }` / `422 { ok:false, error, path, report }`（校验未过，未写盘）/ `400`（请求非法）。
- 写盘后配置单例不热更，**需刷新页面**才生效（一局内不漂移，见交付说明 §3.2）。

### 3.2 可写域（`config/pipeline.ts` `WRITABLE_DOMAINS`，15 个）
`combat, waves, enemies, difficulty, skills, gods, relics, evolutionRecipes, waveRewards, progression, economy, bounty, input, tuner`（→ `src/config/base/*.json`），`texts`（→ `src/data/texts.json`）。

### 3.3 校验结论形状（`config/validateAll.ts`）
```ts
interface ValidationIssue { level: 'error'|'warning'; layer: 'schema'|'reference'|'semantic'; domain: ValidationDomain; path: string; message: string }
interface ValidationReport { ok: boolean; issues: ValidationIssue[]; checks: ... }
// CandidateReport 额外带 variants: { variant, report }[]
```
`path` 形如 `$.gods.gods[0].id`、`$.skills.cards[3].stars.5.equip[0].effects[1].params.radius`——用于**定位跳转**。

### 3.4 效果参数元数据（`core/effects/atomContract.ts`，表单生成源）
`ATOM_CONTRACT: Record<AtomName, AtomContract>`，每原子：`params: Record<string, AtomParamSpec>`、`allowedTriggers`、`supports{equip,consume}`、`emitsEvents`、`allowsNestedEffects?`、`modifierOnly?`。
`AtomParamSpec`：`type`（number/integer/string/boolean/enum/effects/record，或类型联合）、`required?`、`default?`/`consumeDefault?`/`passiveDefault?`/`variantDefaults?`、`min?`/`max?`/`enum?`/`note?`。
另有 `RUNTIME_STAT_KINDS`、`TRIGGER_NAMES` 可枚举。

### 3.5 技能数据形状（`core/effects/defs.ts`）
`EffectDef = { atom: A; params?: EffectParamsMap[A] }`（按 atom 判别）。`CardDef`：`id/god/category/synergyTags/textKey/teaching/stars{'3'?,'5'?,'6'}/amplifyAxis/consumable/evolutionTree?/affixPool/fusionPolicy?`。`StarTierDef.equip: BindingDef[]`，`BindingDef{ trigger, triggerParams?, effects: EffectDef[] }`。**`fusionPolicy` 是 D2 预留位，编辑器可显示但标注"未实现，暂不建议填写"。**

### 3.6 调参元数据（`config/tunerMeta.ts`）
`tuner.params: TunerParamMeta[]`；helper：`exposedParams` / `sliderParams` / `paramsInGroup` / `findParam` / `getNumberAt` / `setNumberAt` / `TUNER_GROUP_ORDER`。参数有 `type`（number/boolean/enum/text）、`group`、`labelKey`、`min/max/step`、`applyPolicy`、`exposed?`。

## 四、放置与数据流

- 新增 Vite 入口 `editor.html`（`apply: 'serve'` 语义，仅 dev 访问，如 `http://localhost:5173/editor.html`），前端在 `src/editor/`。**不改 `index.html`。**
- 编辑器**可直接 import**（浏览器安全的纯数据/类型）：`ATOM_CONTRACT`、`RUNTIME_STAT_KINDS`、`TRIGGER_NAMES`、`config/types` 的类型、`tunerMeta.ts` 的 helper。**禁止 import** `pipeline.ts`/`validateAll.ts`（SSR/读盘，只能经端点）。
- 数据流：`/__config/domains` 拿路径 → `fetch(path)` 读各域 JSON → 内存里编辑 → 改动即 `POST /__config/validate {domain,data}` 渲染右侧校验面板 → 保存 `POST /__config/write {domain,data}` → 200 后提示"刷新以在游戏中生效"。

## 五、v1 功能范围

### 5.1 必做（所有域可用）
- **域导航**：左栏列 15 个域；进入某域加载其 JSON。
- **通用结构化编辑器**：对任意域提供"对象/数组树"编辑（增删字段、按类型编辑标量），保证每个域都比裸文本安全可编辑。
- **实时校验面板**：改动即调 `/__config/validate`，按 `domain` 分组渲染 `report.issues`；`error` 红、`warning` 黄；点 `path` 定位到对应字段；**有 error 时禁用保存**，warning 不拦。同时展示 `variants[]` 里任一 variant 的失败。
- **保存**：调 `/__config/write`；422 时把 `report.issues` 展开，不改本地未保存态。
- **引用选择器（防悬空引用）**：凡是引用其它实体 id 的字段，用**下拉**而非自由文本，候选来自已加载配置——神 id、卡 id（神池/配方材料·产物）、`textKey`、`targetTags` 等。避免写出校验器会拦的悬空引用。

### 5.2 必做（三处专用表单，v1 的核心价值）
1. **技能/效果编辑器**（域 `skills`）：
   - 卡片列表：按 god / category / synergyTags 搜索筛选。
   - 选中卡 → 分星级（3/5/6）编辑 `equip` 绑定：每个 `BindingDef` 有 `trigger` 下拉（**候选限定为该绑定内各原子 `allowedTriggers` 的交集**）、`triggerParams`、`effects[]`。
   - **加效果**时选 `atom` → 依 `ATOM_CONTRACT[atom].params` **自动渲染参数表单**：按 `type` 出控件，展示 `default`（占位提示"留空=默认 X"）、`min/max` 约束、`enum` 下拉、`required` 星标、`note` 说明；`allowsNestedEffects` 的原子（groundZone/aura）允许递归编辑 `params.effects`。
   - `modifierOnly` 原子给出"仅 passive 聚合生效"提示。
   - 消耗态 `consumable` 同法编辑。
2. **调参编辑器**（域 `tuner`）：复用 `tunerMeta.ts` helper，按 `TUNER_GROUP_ORDER` 分组，`number`→滑杆+数字框（夹 `min/max/step`）、`boolean`→开关、`enum`→下拉、`text`→输入；`labelKey` 经 `texts.tuner.*` 显示中文标签。保存写回 `tuner` 域。（这是现有 `tunerPanel` 的超集：这里能持久化到磁盘。）
3. **遗物编辑器**（域 `relics` + `texts`）：表单编辑 god/rarity/targetTags/effects/poolInfluence/maxStacks；名称与描述编辑的是 `texts.relics.<id>.name/.desc`。保存时**分别写 `relics` 与 `texts` 两个域**（各自过端点校验），任一 422 则整体不提交并提示。

### 5.3 可选（stretch，不达标不算失败）
- "在 H5 中预览"：保存成功后按钮打开/刷新 `index.html`（新标签或 iframe），让运行时读到新配置。
- 变更 diff 预览（保存前展示将写入的字段变化）。

## 六、交付与验收

- `editor.html` + `src/editor/**`；`npm run build`（含 tsc）与 `npm run test` 全绿；生产构建**不含**编辑器入口（确认 `dist/` 无 editor 产物）。
- 冒烟测试 `tests/editorContract.test.ts`（node 环境，不需真实 dev server）：断言编辑器用到的契约仍成立——`WRITABLE_DOMAINS` 的键与编辑器域清单一致；每个 `AtomName` 在 `ATOM_CONTRACT` 有条目；`ValidationIssue` 关键字段（level/domain/path/message）存在。**编辑器的 fetch 逻辑与端点交互**用轻量 mock 覆盖 validate→save 一条主路径（error 禁用保存、422 不落地）。
- 手动验收脚本写进 `docs/配置编辑器v1_验收.md`：①改一条链锁闪电的 `bounces` 并保存 → 文件 diff 只含该值；②把某神池指向不存在的卡 → 保存被 422 拦下、面板精确定位；③编辑一条遗物名称 → `texts.relics.<id>.name` 更新且 `npm run validate` 仍 0 error。

## 七、明确不做（延后，勿在 v1 引入）
- 节点图 / 蓝图式效果编排（D5 明确排除）。
- 批量平衡表、曲线图、蒙特卡洛模拟预览。
- `texts` 的结构化 schema 校验（管线 v1 只保证"被引用键命中 + 无孤儿"，文案编辑器的结构校验是后续任务）。
- C# 代码生成、per-card 文件爆破（见决策结论 §6.2，均延后）。
