# Codex 任务 S3-工具1：中文标签与解释（编辑器可读性的单一来源）

> 属 S3「人工正式内容设计」的前置工具链，**第 1 步**（共三步：工具1 标签 → 工具2 Excel → 工具3 文案入模块）。
> 前置：S2 配置编辑器已合入（`editor.html` + `src/editor/**`）；固化1/2/4（`ATOM_CONTRACT` 单源、tuner 元数据单源、`/__config/*` 端点 + `npm run validate`）在 commit `ff1d1ce`。
> 本步只做**可读性层**：不改配置数据、不改运行时、不改端点、不改生产构建。结束时 `npm run test` / `npm run build` / `npm run validate`（0 error）全绿。

---

## 一、目标

现在编辑器里大量标识是源码英文：原子名（`chain` / `beam` / `groundZone`）、参数名（`bounces` / `radius` / `targets`）、各域字段名、enum 取值。人看不懂，无法做内容设计。

做一个**统一的「人类可读标签 + 解释」单一来源**，覆盖编辑面里出现的四类命名：原子、原子参数、可写域字段、enum 取值，并接进**所有**编辑器面板。这个来源随后被工具2（Excel 表头/列说明）直接复用——所以它是整条工具链的地基。

## 二、硬性不变量

1. **不制造第二事实源**：原子与参数的**结构**只从 `core/effects/atomContract.ts` 的 `ATOM_CONTRACT` 读；已有中文只从既有来源读、不另抄——`texts.glossary`（原子解释，33 条，键=原子名）、`texts.effectText.atoms`（原子中文名，如 `chain`→"连锁"）、`texts.tuner.*`（调参标签，`tunerEditor.ts` 已在用）。标签层只**聚合 + 补齐缺口**。
2. **不改运行时 / 不改配置语义数据**：`src/core`、`src/config/base/*.json`、`skills.json` 一律不动；`texts.json` 现有值不改（**可新增**缺失的解释键，但不改动既有键值）。不改 `/__config/*` 端点、不改 `index.html`、编辑器保持 dev-only 不进生产构建。
3. **house style**：原生 TS + DOM，不引入 UI/状态框架（参照 `src/editor/tunerPanel.ts` / `src/editor/dom.ts` 写法）。
4. 全绿：`npm run test` / `npm run build` / `npm run validate`（0 error）。

## 三、现状（已核实，直接依赖）

- **原子级中文已存在但没接**：`texts.glossary`（键=原子名：pierce/chain/split/…/groundZone/restore/statBuff）、`texts.effectText.atoms`（`chain`→"连锁"）。编辑器的原子下拉、卡片列表仍显示英文。
- **参数级半成品**：`ATOM_CONTRACT[atom].params.<p>.note` 部分已是中文（如 `chain.bounces` → "起点之后的弹跳次数"），`src/editor/effectEditor.ts` 第 195 行已把 `note` 渲染成 `<small class="param-note">`。缺口：(a) 参数**名本身**仍是英文 key（第 178~179 行 `${name}`）；(b) 许多参数没有 note。
- **调参级是好样板**：`tunerEditor.ts` 第 89 行经 `param.labelKey` → `texts.tuner.params.<path>` 已显示中文——保持不动、风格对齐它。
- **通用结构树 `treeEditor.ts` 与 `skillsEditor.ts`**：god/category/textKey/teaching 等字段（`skillsEditor.ts` 第 188~199 行）显示裸英文 key，无中文。

## 四、要做

### 4.1 单一标签来源（新模块，放 editor 层，浏览器安全）
新增 `src/editor/labels.ts`（或 `src/config/humanLabels.ts`，须浏览器可 import、**禁止** import `pipeline.ts`/`validateAll.ts`）。对外一个查询层，例如 `describe(kind, key): { label: string; help?: string }`，覆盖四个命名空间：

- `atom`（原子）：label 取 `effectText.atoms[atom]`，help 取 `glossary[atom]`。
- `atomParam`（`"<atom>.<paramName>"`）：help 优先取 `ATOM_CONTRACT[atom].params[p].note`（已有的直接用）；label = 参数中文名（缺口，见下）。
- `domainField`（`"<domain>.<fieldName>"` 或路径）：中文字段名（缺口）。
- `enumValue`（编辑器里用到的枚举取值，如 rarity/category/god/trigger）：中文（缺口）。

**新增文案的落点**（写清并二选一）：**推荐**把"开发者词汇"（原子名、参数名、域字段名、enum）放进标签模块常量——它们不是玩家可见文案，不该塞进 `texts` 让 validate 承担孤儿/引用检查；只有玩家可见文案才留在 `texts`。缺口全部在标签模块内一处补齐，禁止散落到各编辑器文件。

### 4.2 接进所有编辑器
- `effectEditor.ts`：参数标签行改为「中文名（`englishKey`）」并把 note/help 作为副标题；原子下拉项显示「连锁 (chain)」而非 `chain`。
- `skillsEditor.ts`：卡列表/卡表单显示卡中文名（`texts.cards.<id>.name`）+ id；god / category / 字段用中文标签。
- `treeEditor.ts`：字段键渲染中文标签（查 `domainField`），**查不到回退英文 key**（不阻断、不报错）。
- `tunerEditor.ts`：保持现状（已中文），仅确保与新标签风格一致。

### 4.3 覆盖度测试 `tests/editorLabels.test.ts`（node 环境）
- 断言 `ATOM_CONTRACT` 里**每个原子**、**每个原子参数**都能从标签层拿到非空 `label`。
- 断言 15 个可写域每个至少注册了顶层字段标签。
- 断言标签层未 import `pipeline.ts` / `validateAll.ts`（保持浏览器安全）。

## 五、交付与验收

- `src/editor/labels.ts`（或等价）+ 各编辑器接线 + `tests/editorLabels.test.ts`。
- 打开 `/editor.html`：技能域参数/原子/卡名均中文；通用域字段中文，缺失回退英文不报错。
- `npm run test` / `build` / `validate` 全绿；`dist/` 无编辑器产物。
- 手动验收补进 `docs/配置编辑器v1_验收.md` 新小节：随机挑 3 个原子确认其参数中文、挑 2 个非 skills 域确认字段中文。

## 六、明确不做

- 不做 Excel（工具2）、不搬文案入口（工具3）。
- **不改玩家可见文案的措辞**——那是内容设计本身，后续由人在编辑器/Excel 里做。
- 不给 `texts` 加结构化 schema 校验（延后）。
