# ProjectVL · 魅魔心防战

360° 塔防可玩原型。中央「清醒炮台」自动迎击从四面八方涌来的追求者，
击杀掉落心意卡，拾取 → 自动合成 → 装配强化，守住 5 波即胜利。

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
```

> `dist/` 由 `npm run build` 生成，不再手工复制打包。

## 目录结构

```text
ProjectVL/
├─ index.html              # 极薄：静态 DOM 外壳 + 挂载 /src/main.ts，无内联样式/脚本
├─ src/
│  ├─ main.ts              # 薄胶水：加载数据 → 建状态 → 绑输入 → 主循环
│  ├─ styles/app.css       # 全部样式（含 880/560px 响应式断点）
│  ├─ data/                # 唯一数值/文案来源（JSON）
│  │  ├─ gameConfig.json   # 画布/炮台/HP/卡槽/星级倍率/默认参数/战斗常量/调参范围
│  │  ├─ cards.json        # 卡牌元数据 + 效果系数
│  │  ├─ enemies.json      # 敌人基础值与每波成长
│  │  ├─ waves.json        # 波次数量/节奏/类型判定/boss 波
│  │  ├─ perks.json        # 经验成长与升级三选一
│  │  └─ texts.json        # 界面文案与 toast 模板
│  ├─ core/                # 纯规则层（禁止 DOM/Canvas）
│  │  ├─ types.ts          # State/Card/Enemy/... 与 GameEvent 事件类型
│  │  ├─ createInitialState.ts
│  │  ├─ stats.ts          # 总伤害/射速/弹丸/射程/掉落概率
│  │  ├─ endGame.ts
│  │  ├─ updateGame.ts     # 单帧编排，返回 GameEvent[]
│  │  └─ systems/          # waveSystem/enemySystem/combatSystem/dropSystem/
│  │                       # cardSystem/equipmentSystem/progressionSystem/particleSystem
│  ├─ render/              # canvasRenderer + drawArena/Enemies/Bullets/Drops/Particles/Turret
│  ├─ ui/                  # domRefs/renderHud/renderCards/renderEquipment/renderTempSlot/
│  │                       # tunerPanel/modals/toast/slotFactory/eventText/format
│  ├─ input/               # pointerDrag / dropClick / keyboard
│  └─ debug/exposeDebugApi.ts
├─ tests/                  # Vitest：6 个系统测试 + helpers
├─ legacy/                 # 归档（勿删）：单文件原型 + 历史备份 + 任务记录
└─ docs/                   # 立项案 docx 等
```

## 架构规则（供后续 Agent 遵守）

1. **`src/core` 禁止 import 任何 DOM / Canvas / 浏览器 API。** 系统函数只接收
   `state + config + dt`，随机数经注入的 `rng: () => number` 传入，返回状态变更与 `GameEvent[]`。
2. **表现副作用（toast、弹窗、粒子表现、UI 刷新）统一由事件驱动**：`updateGame` 与各系统返回语义化
   `GameEvent[]`，在 `ui/` 的 `dispatch` 中翻译为文案并触发弹窗与重绘。core 不产出最终文案。
3. **按层改动**：
   - 改数值 → 只改 `src/data/*.json`
   - 改规则 → `src/core`（**必须补测试**）
   - 改画面 → `src/render`
   - 改界面 → `src/ui`
   - 改输入 → `src/input`
4. **调试口**：`window.__game` 暴露 `getState / start / reset / spawnGroundDrop / addTestPair /
   moveOrSwap / setConfig`，**仅 DEV 模式注入**（生产构建自动摇树移除），供人工与浏览器自动化测试使用。

## 行为契约

重构前后玩法逐条一致（伤害/射速/射程/掉落、波次生成与成长、卡牌合成与倍率、装备栏 3 星门槛、
临时栏本波生效、经验升级三选一等）。这些规则由 `tests/` 下的 Vitest 固化，改规则时先更新/新增测试。

## 归档

`legacy/single-file/炮台射击_可玩原型_2026-07-07.html` 为重构前的自包含单文件原型，
可直接双击用浏览器打开游玩，作为行为对照基准；`legacy/backups/`、`legacy/task-records/` 保留历史。
