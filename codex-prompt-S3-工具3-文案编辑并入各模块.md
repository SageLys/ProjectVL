# Codex 任务 S3-工具3：文案编辑入口并入各模块（推广遗物双域样板）

> S3 前置工具链**第 3 步**。前置：工具1（标签层）。与工具2 相互独立。
> **已核实的关键事实**：遗物文案**不是**特殊结构——所有域文案统一为「域文件存 `textKey` 指针、内容在 `src/data/texts.json`」：卡 `cards.<id>`、神 `gods.<id>`、遗物 `relics.<id>`（`relics.json` 那条只有 `"textKey":"relics.proj_damage"`）。遗物编辑器的「内联名称/描述 + 双域写回」是**正确样板**，本步把它推广到其它实体域。**无数据迁移、无 bug 需先修**。
> 结束时 `npm run test` / `npm run build` / `npm run validate`（0 error）全绿。

---

## 一、目标

让人在编辑卡 / 神等实体时，就地编辑其玩家可见文案（名称、描述、分星文案等），保存时像遗物一样：**分别写实体域与 `texts` 域、各自过端点校验、任一 422 则整体不落盘**。真正全局的 UI 文案（`center/buttons/lanes/levelup/affixes/decisions/waveRewardStats/intermission/toast/wildcard/result/effectText/glossary/affixHelp`）保留在独立「文案」模块集中管理。

## 二、硬性不变量

1. **复用遗物样板**：抽出 `src/editor/relicsEditor.ts` 里「双域预检 + 分别写回 + 任一失败整体不提交」逻辑成共用函数，供卡/神/遗物复用，**不新造第二套写盘路径**；仍只经 `/__config/validate`、`/__config/write`。
2. **不改 `texts` 存储结构、不改运行时**——只搬/加编辑器 UI 入口。
3. 中文标签用工具1 标签层；house style 原生 TS+DOM；dev-only 不变。
4. 全绿 + `validate` 0 error。

## 三、要做

- **卡编辑器 `skillsEditor.ts`**：新增「名称与文案 · 写入 `texts` 域」区，编辑 `texts.cards.<id>` 的**真实存在**字段（按 `texts.json` 实际结构：`name`、`hand.shortByTier` 的 `1|3|6`、`milestones` 等，**不臆造字段**）。保存 = 写 `skills`（若卡结构也改了）+ `texts` 双域。
- **神编辑器**：给 gods 实体加同样的 `texts.gods.<id>`（`name` / `theme`）内联区。
- **遗物**：保持现状（已是样板），仅切到统一封装。
- **独立「文案」模块**：只保留非实体全局段；实体段（cards/gods/relics）从中移除或标注「请在对应模块编辑」，避免两处入口打架。

## 四、交付与验收

- 共用「实体文案子表单 + 双域保存」函数 + 卡/神接线 + 文案模块收敛。
- 手动验收补进 `docs/配置编辑器v1_验收.md`：①卡编辑器改 `chainLightning` 名称→保存→`git diff` 只动 `texts.cards.chainLightning.name`，`skills.json` 无差异；制造悬空/非法→整体 422 不落盘；②神同理；③全局文案仍在文案模块可编。
- 测试：扩展 `tests/editorContract.test.ts` 或新增——断言双域保存封装在**任一域校验失败**时不发第二个 `/__config/write`（不产生半落盘）。
- `npm run test` / `build` / `validate` 全绿。

## 五、明确不做

- 不给 `texts` 加结构化 schema 校验（管线 v1 只保证引用命中 + 无孤儿，见 S2 §7）。
- **不改文案措辞**（内容设计本身，人工在编辑器/Excel 里做）。
