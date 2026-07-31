# Codex 任务 固化4：配置管线 v1（校验 + 写回）

> Stage 1 B 线第一步，是"配置编辑器 v1"的地基（D5：先管线后编辑器）。总纲见 `docs/接下来任务计划_v1.md`。
> 依赖 固化1/固化2 收敛后的 schema。结束时 `npm run test` 与 `npm run build` 全绿，且 `npm run validate` 在当前配置上通过。

---

## 一、目标

1. **一条命令做完全部校验**：`npm run validate` = schema 校验 + 跨引用校验 + 语义校验 + 报告，失败时进程非零退出（CI 就绪）。
2. **统一写回端点**：把现有分散的 dev 写回中间件推广为通用的 `/__config/write`，任何配置域 JSON 都能经**校验后**以 Git 友好格式落盘。这是编辑器 v1 唯一的落盘通道。

## 二、硬性不变量

1. 零玩法变化；仅新增命令、语义校验规则、写回端点。
2. `npm run validate` 必须在**当前**配置上通过（若暴露既有数据问题，先记录到 `docs/`，能安全修的修，不能的列为待办，不得为过关而放宽规则）。
3. 写回必须**先校验后写**：校验不过则拒写并返回错误，绝不落地坏配置。

## 三、现状（已核实）

| 位置 | 事实 |
|---|---|
| `src/config/*Validator.ts` | 已有 skills/progression/difficulty/god/stagePlan 校验；`buildConfig` 已串起来 |
| `src/config/affixSinks.ts` | `AFFIX_SINKS` 可用于"每个词条必须有落点"的语义校验 |
| `vite.config.ts` | 已有 `/__tuner/preset`、`/__calibration/export`、`/__telemetry/*` 写回中间件（`writeFile` 到磁盘） |
| `package.json` scripts | 已有 `test`/`build`/`metrics`；加 `validate` |

## 四、要建的东西

### 4.1 校验命令 `scripts/validateConfig.ts` + `npm run validate`
分三层，全部复用现有校验器，只补"跨引用/语义"层：
- **schema 层**：调用现有各 `*Validator`（结构合法）。
- **跨引用层**：神池引用的卡牌 id 必须存在；配方产物/材料 id 必须存在；进化树节点引用合法；`textKey`/`nameKey`/`descriptionKey` 在 `texts.json` 必须命中；所有 id **全局唯一**。
- **语义层**：每个词条（`CardStatKind`）必须在 `AFFIX_SINKS` 有落点（防"最大生命词条无消费者"类问题复发）；效果原子参数对其所在触发器合法（复用 固化1 的 `ATOM_CONTRACT`）；`bossWaves` 在可达范围；波末奖励 kind 合法。
- 输出人类可读报告（按域分组，错误/警告分级），错误则 `process.exit(1)`。

### 4.2 通用写回端点 `/__config/write`（`vite.config.ts` 中间件）
- 入参：`{ domain: 'skills'|'relics'|'gods'|'waves'|'economy'|'tuner'|'texts'|..., data: unknown }`。
- 流程：用对应校验器校验 `data` → 通过则以 **Git 友好格式**写 `src/config/base/<domain>.json`（2 空格缩进、结尾换行、稳定 key 顺序）→ 失败则返回 4xx + 错误详情，不写盘。
- 保留现有 `/__tuner`、`/__telemetry`、`/__calibration` 端点（或让它们复用同一写盘工具函数）。
- **仅 dev 中间件**，不进生产构建。

### 4.3 稳定序列化工具 `scripts/formatConfig.ts`
- 统一的 JSON 序列化（稳定 key 顺序 + 缩进 + 末尾换行），供命令与端点共用，保证人工编辑与工具写回的 diff 一致、可 review。
- 可选加 `npm run format:config` 一次性规整所有配置文件。

## 五、验收

- `npm run validate` 在当前配置通过；故意破坏一处引用（如删一张被神池引用的卡）能被准确报错并非零退出。
- 经 `/__config/write` 写入合法/非法数据分别成功/被拒；写入后文件 diff 干净（仅目标改动）。
- `npm run test`/`npm run build` 全绿。
- 输出 `docs/配置管线v1_说明.md`：`validate` 的校验清单、写回端点契约、编辑器 v1 应如何调用（供下一步生成编辑器 prompt 使用）。
