# Codex 任务 S3-工具2：配置 ↔ Excel 双向同步（skills 展开为关联多 sheet）

> S3 前置工具链**第 2 步**。前置：**工具1（标签层）已合入**——Excel 表头/列说明复用标签层，不另写中文。
> 目标：让人在 Excel 里批量审查/编辑全部配置，再**无损**导回。导回**必须**经配置管线校验，校验不过不落盘。
> 结束时 `npm run test` / `npm run build` / `npm run validate`（0 error）全绿。

---

## 一、目标（两条 CLI + 幂等硬指标）

- `npm run config:export-xlsx` → 读全部 15 个可写域（+ 引用的 `texts`）导出为一个人类可读工作簿（路径写死并在文档说明，建议 `交付/配置总表.xlsx`）。
- `npm run config:import-xlsx` → 读回工作簿，重建每个域的 JSON，**逐域经 `validateCandidate` 校验**；全过才落回 `src/config/base/*.json` 与 `src/data/texts.json`，用 `src/config/format` 的 `stableJson` 统一格式。任一域 error → **整体不落盘**、打印精确 `path`。
- **无损幂等硬指标**：干净仓库 `export → import → git diff` 为空；`export → 改一格 → import → git diff` 只含该值变化。

## 二、硬性不变量

1. **不绕过校验**：导回走 pipeline 的 `validateCandidate(domain, data)`（node 脚本里可直接 import `config/pipeline.ts` / `config/validateAll.ts`，参照 `scripts/validateConfig.ts` 的用法——这是 node 脚本，与 S2「编辑器只能经端点」的约束不同）。
2. **格式稳定**：写盘只用 `stableJson`（与 `/__config/write`、`npm run format:config` 同款），保证 diff 干净、无整文件重排。
3. **不改运行时、不改配置语义、不改端点、不改编辑器行为**——Excel 工具是独立脚本 + 两条 package.json script。
4. **标签复用**：sheet 表头/列注释经工具1 的标签层取中文，不再写第二份。
5. 全绿 + `validate` 0 error + 幂等测试通过。

## 三、表示方案（用户已定：skills 展开为关联多 sheet）

### 扁平域（一域一 sheet）
`combat / waves / enemies / difficulty / gods / relics / evolutionRecipes / waveRewards / progression / economy / bounty / input / tuner`：行=数组元素或键值项，列=字段。引用其它实体 id 的列保持文本（导回交给 validate 兜底）。玩家可见名（gods/relics 的 name/desc）**join 进本 sheet 作可写列**，映射回 `texts.<domain>.<id>`（导回时拆写 `texts` 域）。

### skills 域拆多张关联 sheet（用 id/index 串联，导回重建嵌套）
已核实 `skills.json` 卡结构键：`id/god/category/synergyTags/textKey/teaching/implementationBatch/stars/amplifyAxis/consumable/designNotes/affixPool/evolutionTree`；`stars` 分 `3/5/6`，每星 `equip: BindingDef[]`，`BindingDef{trigger, triggerParams?, effects: EffectDef[]}`，`EffectDef{atom, params?}`；`groundZone`/`aura` 等 `allowsNestedEffects` 原子的 `params.effects` 可再嵌套。

- `skills.cards`：一行一卡（上列字段 + 从 `texts.cards.<id>` join 的中文名/分星文案概览）。
- `skills.bindings`：一行一绑定 —— `cardId / star(3|5|6) / mode(equip|consume) / bindingIndex / trigger / triggerParams(JSON)`。
- `skills.effects`：一行一效果 —— `cardId / star / mode / bindingIndex / effectIndex / parentEffectPath / atom`。`parentEffectPath` 空=顶层，非空=某父效果的 `params.effects` 内（承载 groundZone/aura 嵌套）。
- `skills.effectParams`（长表）：`cardId / star / mode / bindingIndex / effectIndex / parentEffectPath / paramName / value`。异构参数与嵌套都能无损表达。

**导入重建顺序**：cards → bindings → effects（按 `parentEffectPath` 拓扑，先父后子）→ effectParams 回填 → 组装成 `CardDef` → `validateCandidate('skills', data)`。

### texts 全局段
单独一张 `texts.global` sheet（key→value），承载非实体 UI 文案：`center/buttons/lanes/levelup/affixes/decisions/waveRewardStats/intermission/toast/wildcard/result/effectText/glossary/affixHelp` 等。实体文案（cards/gods/relics）**不放这里**，随各自实体 sheet。

## 四、边界与坑（必须处理）

- **嵌套 `params.effects`**（groundZone/aura）：用 `parentEffectPath` 递归表达，import 先父后子重建。
- **参数类型**：export 按 `ATOM_CONTRACT` 的 `type` 决定单元格写法；import 按同一 spec 解析（number/integer→数值、boolean→TRUE/FALSE、enum→字符串、record/联合→JSON 文本列、effects→由 effects/effectParams 行重建）。**留空 = 用默认**（不写该键），与编辑器「留空=默认 X」一致。
- **决定性排序**：export 行/键顺序稳定（域内按现数组顺序、对象按稳定 key 序），否则幂等断言会挂。
- **引用完整性**：import 不做前置修补，交给 validate 兜底并报 `path`（形如 `$.gods.gods[0].anchorCardIds`）。
- **只改 texts 时结构域零 diff**：仅改名称/描述时 `src/config/base/*.json` 不得出现差异（对齐 S2 遗物验收 §3）。

## 五、交付与验收

- 两个脚本（如 `scripts/exportConfigXlsx.ts` / `scripts/importConfigXlsx.ts`）+ package.json 两条 script；工作簿产出路径与是否 gitignore 写清。
- 测试 `tests/configXlsxRoundtrip.test.ts`（node）：①构造小工作簿断言 `export→import→export` 幂等；②import 遇非法值（悬空卡 id、越界数值）被 `validateCandidate` 拦下且**不写盘**；③skills 一条**嵌套 groundZone** 效果 round-trip 无损。
- 手动验收 `docs/配置Excel双向同步_验收.md`：①导出→改 `chainLightning` 的 `bounces`→导入→`git diff` 只该值；②某神池 `anchorCardIds` 填不存在卡→导入被拦、报 `$.gods...`；③改一条遗物名称→只 `texts.relics.<id>.name` 变、`npm run validate` 0 error；④干净仓库 `export→import` diff 为空。
- `npm run test` / `build` / `validate` 全绿。

## 六、明确不做

- 不做曲线图 / 数据透视 / 蒙特卡洛预览；不做 skills 之外域的进一步拆分；不做 Excel 内公式校验（校验只认导回时的 pipeline）；不做增量/合并导入（v1 = 全量覆盖式）。

## 工程注意
该项目挂载盘写文件曾现行尾/尺寸缓存坑——脚本一律用 Node `fs` 正常写 + `stableJson`；产出后自跑一次 `npm run validate` 自检。
