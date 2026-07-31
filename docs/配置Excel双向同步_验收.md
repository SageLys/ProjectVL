# 配置 ↔ Excel 双向同步：使用与验收

## 命令与文件

- `npm run config:export-xlsx`：读取 14 个 `src/config/base/*.json` 域和 `src/data/texts.json`，固定导出到 `交付/配置总表.xlsx`。
- `npm run config:import-xlsx`：读取同一路径，重建 15 个可写域；逐域调用 `validateCandidate(domain, data)`，全部通过后才用 `stableJson` 写回。
- `交付/配置总表.xlsx` 已在 `.gitignore` 中精确忽略。它是本地批量审查/编辑产物，不进入 Git，避免二进制文件干扰配置 diff。

导入失败会以非零状态退出并打印配置 `path`。只要存在一个 error，15 个目标文件都不会写入；工作簿结构或 JSON 单元格本身无法解析时同样不会写入。

## 工作簿结构

`combat / waves / enemies / difficulty / progression / economy / bounty / input` 使用 path/value 长表；容器行保留对象、数组与原始键顺序。`gods / relics / evolutionRecipes / waveRewards / tuner` 一行一个实体，对象或数组字段使用 JSON 文本。

`skills` 使用四张关联表：

- `skills.cards`：卡片基本字段、去掉效果后的 stars/consumable 元数据，以及 `texts.cards.<id>` 的全部可写文案列。
- `skills.bindings`：`cardId / star / mode / bindingIndex` 唯一定位绑定。equip 使用 3/5/6 星；为覆盖真实 consumable anchors，consume 使用 1/3/6 档。
- `skills.effects`：`parentEffectPath` 为空是顶层；例如 `0` 表示父效果 0 的 `params.effects`，`0.1` 表示继续下钻到子效果 1。
- `skills.effectParams`：异构参数长表。数值、整数和布尔为 Excel 原生类型；record/联合对象为 JSON 文本。清空 value 会删除该参数键，由 `ATOM_CONTRACT` 默认值接管。

`texts.global` 保存非实体文案，以及没有对应配置实体的特殊文案。卡片、神祇、遗物实体文案分别随 `skills.cards`、`gods`、`relics` 写回。可见表头和参数解释都从 `src/editor/labels.ts` 与 `ATOM_CONTRACT` 取得；隐藏技术表头只用于稳定导入，不要删除。

## 手动验收

以下步骤应在没有其他配置改动的工作树执行。

### 1. 单改 chainLightning 的 bounces

1. 运行 `npm run config:export-xlsx`。
2. 在 `skills.effectParams` 筛选：`cardId=chainLightning`、`star=3`、`mode=equip`、`bindingIndex=0`、`effectIndex=0`、`parentEffectPath` 为空、`paramName=bounces`。
3. 把 value 从 `2` 改为 `3`，保存工作簿。
4. 运行 `npm run config:import-xlsx`。
5. 运行 `git diff -- src/config/base/skills.json src/data/texts.json`。预期只有该 `bounces` 值变化，`texts.json` 无变化。
6. 恢复该格为 `2`，再次导入，继续后续验收。

### 2. 悬空神池卡 id 被拦截

1. 重新导出，在 `gods` sheet 第一条神祇的 `anchorCardIds` JSON 数组中加入 `"missingCardFromExcel"`。
2. 保存后运行 `npm run config:import-xlsx`。
3. 预期命令失败，输出包含 `$.gods.gods[0].anchorCardIds`，并明确说明没有写入任何文件。
4. 运行 `git diff --exit-code -- src/config/base src/data/texts.json`；预期退出码为 0。

### 3. 只改遗物名称

1. 重新导出，在 `relics` sheet 找到 `id=proj_damage`，只修改文案名称列。
2. 保存并运行 `npm run config:import-xlsx`。
3. 运行 `git diff -- src/config/base src/data/texts.json`。预期只有 `src/data/texts.json` 的 `texts.relics.proj_damage.name` 变化，`src/config/base/*.json` 零 diff。
4. 运行 `npm run validate`；预期 `0 error`。

### 4. 干净 round-trip 零 diff

1. 确保配置文件无本地改动。
2. 依次运行 `npm run config:export-xlsx`、`npm run config:import-xlsx`。
3. 运行 `git diff --exit-code -- src/config/base src/data/texts.json`；预期退出码为 0。
4. 最后运行 `npm run test`、`npm run build`、`npm run validate`；全部应成功，validate 为 `0 error`。
