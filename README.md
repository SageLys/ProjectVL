# ProjectVL · 魅魔心防战

360° 塔防可玩原型。中央「清醒炮台」自动迎击从四面八方涌来的追求者，
击杀掉落心意卡，拾取 → 自动合成 → 装配强化，守住 8 个普通波并击败第 9 阶段 Boss 即胜利。

工程目标：**玩法规则可测试、数值可配置、模块边界清晰**，方便后续 AI Agent 安全地做局部迭代。
这是原型工程，不是商业前端项目。

## 技术栈

Vite + TypeScript + Canvas 2D + 原生 DOM UI + JSON 配置 + Vitest。
不引入任何游戏/UI/状态管理/CSS 框架，不使用 localStorage 等持久化。

## 运行 / 构建 / 测试

```bash
npm install       # 安装依赖（vite / typescript / vitest）
npm run dev       # 本地开发服务器（默认 http://localhost:5173）
npm run build     # tsc 类型检查 + vite 生产构建，产物在 dist/
npm run preview   # 预览 dist/ 构建产物
npm run test      # 运行 Vitest（core/ 系统单元测试）
npm run test:watch
npm run sim:balance -- --runs 1000 --json outputs/sim.json --csv outputs/sim.csv
```

> `dist/` 由 `npm run build` 生成，不再手工复制打包。

## 目录结构

```text
ProjectVL/
├─ index.html              # 极薄：静态 DOM 外壳 + 挂载 /src/main.ts，无内联样式/脚本
├─ src/
│  ├─ main.ts              # 薄胶水：加载数据 → 建状态 → 绑输入 → 主循环
│  ├─ styles/app.css       # 全部样式（含 880/560px 响应式断点）
│  ├─ config/              # 唯一数值/规则配置来源（P3 六域拆分 + variant 机制）
│  │  ├─ base/             # combat / waves / enemies / skills / progression / economy / tuner
│  │  ├─ variants/         # 覆盖文件（方案A、短局、P4 easy/hard 难度）
│  │  ├─ loader.ts         # 深合并 + URL ?variant= 解析（A/B 测试基建）
│  │  └─ index.ts          # 运行配置单例 cfg / applyVariants
│  ├─ data/texts.json      # 皮肤层文案（题材解耦 P0-5，可整体替换）
│  ├─ core/                # 纯规则层（禁止 DOM/Canvas）
│  │  ├─ types.ts          # State/Card/Enemy/... 与 GameEvent 事件类型
│  │  ├─ createInitialState.ts
│  │  ├─ stats.ts          # 总伤害/射速/弹丸/射程/掉落概率与时限（含修饰乘数）
│  │  ├─ endGame.ts
│  │  ├─ updateGame.ts     # 单帧编排，返回 GameEvent[]
│  │  ├─ effects/          # 效果解释器：defs(数据模型)/registry(31原子)/interpreter(触发器总线
│  │  │                    # +passive聚合+消耗释放)/statusSystem(状态+冲突仲裁)/runtime(区域/光环/召唤/护盾 tick)
│  │  └─ systems/          # waveSystem/enemySystem/combatSystem/dropSystem/damageSystem/
│  │                       # cardSystem/equipmentSystem/progressionSystem/particleSystem
│  ├─ sim/                 # P4 真实 core headless Monte Carlo + baseline bot
│  ├─ render/              # canvasRenderer + drawArena/Enemies/Bullets/Drops/Particles/Turret/Effects
│  ├─ ui/                  # domRefs/renderHud/renderCards/renderEquipment/
│  │                       # tunerPanel/modals/toast/slotFactory/eventText/format
│  ├─ input/               # pointerDrag（含拖入主画面=消耗释放）/ dropClick / keyboard
│  └─ debug/exposeDebugApi.ts
├─ scripts/                # runBalanceSim.ts 等可复现实验入口
├─ tests/                  # Vitest：系统测试 + 原子/解释器/加载器/整局/模拟器 + helpers
├─ legacy/                 # 归档（勿删）：单文件原型 + 历史备份 + 任务记录
└─ docs/                   # 立项案 docx 等
```

## 架构规则（供后续 Agent 遵守）

1. **`src/core` 禁止 import 任何 DOM / Canvas / 浏览器 API。** 系统函数只接收
   `state + config + dt`，随机数经注入的 `rng: () => number` 传入，返回状态变更与 `GameEvent[]`。
2. **表现副作用（toast、弹窗、粒子表现、UI 刷新）统一由事件驱动**：`updateGame` 与各系统返回语义化
   `GameEvent[]`，在 `ui/` 的 `dispatch` 中翻译为文案并触发弹窗与重绘。core 不产出最终文案。
3. **按层改动**：
   - 改数值/规则参数 → 只改 `src/config/base/*.json`；做 A/B 对照 → 加 `src/config/variants/*.json` 并在 `loader.ts` 登记（URL `?variant=名字` 或调参面板切换）
   - 改技能卡 → 只改 `src/config/base/skills.json` 的 cards（数据）——**禁止在 core 里为某张卡写 if**，效果由 `core/effects` 通用解释器结算
   - 改皮肤文案 → `src/data/texts.json`
   - 改规则 → `src/core`（**必须补测试**）
   - 改画面 → `src/render`
   - 改界面 → `src/ui`
   - 改输入 → `src/input`
4. **调试口**：`window.__game` 暴露 `getState / start / reset / spawnGroundDrop / addTestPair /
   moveOrSwap / consumeAt / toggleLock / setConfig / getVariants`，**仅 DEV 模式注入**（生产构建自动摇树移除），供人工与浏览器自动化测试使用。

## 行为契约

**P3（2026-07-12）起行为按 P2/P3 设计变更，与单文件原型不再逐条一致**：临时栏已移除（拖入主画面=
消耗释放，落点=技能锚点）；入装门槛 2★、上限 3★、二合、同类型唯一、喂养合成；基座默认「锁定即装备」
（方案B，共享 10 格锁 3），独立装备格为 `equip-slots` variant。技能=JSON 数据+通用解释器
（8 触发器×31 效果原子）。P4 起基座为 8 普通波+Boss、单局有效卡池 5/目录 12、差一张权重
2.25、单一局外火力乘数；`difficulty-easy` / `difficulty-hard` 为数值覆盖。全部规则由 `tests/`
下 Vitest 用例固化，改规则时先更新/新增测试。

## 归档

`legacy/single-file/炮台射击_可玩原型_2026-07-07.html` 为重构前的自包含单文件原型，
可直接双击用浏览器打开游玩，作为行为对照基准；`legacy/backups/`、`legacy/task-records/` 保留历史。
