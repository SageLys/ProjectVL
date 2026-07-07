# H5 原型重构计划 + Claude Code 提示词

更新时间：2026-07-07
适用对象：`炮台立项/炮台射击_可玩原型.html`（706 行单文件，V0.2）

---

## 一、现状核对（基于实际代码，修正 ChatGPT 建议中的偏差）

方向确认：**Vite + TypeScript + Canvas 2D + 原生 DOM UI + JSON 配置 + Vitest**，不上 Phaser / Pixi / React。这个判断正确，予以采纳。

但以下几点与实际代码不符，已在下方 prompt 中修正：

1. **升级系统被遗漏**。原型有完整的经验/等级系统：击杀得 xp，xpNeed 初始 8、每级 ×1.35，升级时暂停并弹出三选一强化（高能弹芯：伤害+20%；过载供能：射速+15%；重整心防：回血20）。ChatGPT 给的约束清单没有这条，照抄会丢功能。
2. **敌人生成不是固定权重**。实际规则：`roll < 0.2 + wave*0.025` 出重装，`roll < 0.47` 出高速，其余普通；第 5 波最后一只强制 boss（HP 420）。
3. **存在死代码**。`dragPayload()`、`parsePayload()` 及槽位上的 `dragover/drop/dragleave` 监听依赖 HTML5 拖拽，但卡牌 `draggable = false` 且从未绑定 `dragstart`，这套逻辑从未生效。实际生效的是 pointerdown + document 级 pointermove/pointerup 的自定义拖拽。
4. **multi（界限）卡有特殊规则**：1 星时不加弹丸、转为伤害 +2.5×倍率；2 星及以上才弹丸 +1。
5. **掉落概率上限 0.95，boss 必掉**。
6. **`项目总览.md` 已过时**：目录现在已是 git 仓库（remote: github.com/SageLys/ProjectVL），"不是 Git 仓库"的结论和"手动复制 + 重打 zip"的发布建议需要随重构一并更新。
7. 当前主 HTML（V0.2）与 `备份/任务08` 并不相同，备份链条有独立价值，全部保留。

## 二、重构目标

不是换技术栈炫技，而是：**让规则可测试、数值可配置、模块边界清晰，使 AI Agent 后续每次只改该改的文件，为迭代测试做准备。**

## 三、阶段划分（每阶段一个 git commit，可随时回退）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| 0 | git 归档现状，旧文件移入 `legacy/` | 旧 HTML 双击仍可玩 |
| 1 | 搭 Vite+TS 工程，整段脚本平移进 `main.ts`，样式移入 css | `npm run dev` 行为与旧版一致 |
| 2 | 硬编码数据抽入 `src/data/*.json` | 行为不变，改 JSON 即改数值 |
| 3 | 抽纯规则层 `src/core`（禁止碰 DOM/Canvas），逐系统补 Vitest | `npm run test` 全绿 |
| 4 | 拆渲染层 `src/render` 与 UI 层 `src/ui`、输入层 `src/input` | 行为不变，删除死代码 |
| 5 | debug API、工程化 README、更新项目总览 | 全部验收标准通过 |

## 四、给 Claude Code 的提示词（以下整段复制）

---

```text
# 任务：将 ProjectVL 单文件 H5 原型重构为模块化 Vite + TypeScript 工程

## 背景

仓库根目录是一个游戏策划归档仓库（git 已初始化，remote 为 SageLys/ProjectVL，工作区干净）。
当前唯一开发入口是单文件原型 `炮台立项/炮台射击_可玩原型.html`（约 706 行，V0.2），
样式、页面结构、玩法规则、数值、渲染、UI、输入、调参面板全部混在一个 HTML 里。
`炮台立项/网页打包/index.html` 与 zip 内文件是它的手工复制副本。
`备份/` 下有任务 04–08 的历史 HTML，`任务记录/` 下有 01–10 期过程文档。

重构目的：让玩法规则可测试、数值可配置、模块边界清晰，方便后续 AI Agent 安全地做局部迭代。
这是原型工程，不是商业前端项目。

## 技术选型（硬约束）

- Vite + TypeScript + Canvas 2D + 原生 DOM UI + JSON 配置 + Vitest
- 禁止引入 Phaser、PixiJS、React、状态管理库、CSS 框架
- 禁止使用 localStorage 等持久化（原型阶段不做存档）
- Node 包只允许：vite、typescript、vitest（及其必要 peer 依赖）

## 最高优先级约束：行为契约（重构前后必须完全一致）

以下是从当前代码逐条核实的规则，重构后的游戏必须逐条复现，禁止顺手"优化"数值或规则：

### 战斗
- 中央炮台位于 (480, 300)，画布 960×600，自动锁定射程内最近敌人并转向
- 默认参数：伤害 16、射速 3.3/s、射程 430、掉落概率 50%、掉落存在 6s、敌速 100%
- 子弹速度 620、存活 1.25s、半径 4；多弹丸时按 0.12 弧度扇形散布
- 主循环 dt 上限 0.033s
- 敌人接近炮台 55 像素内即突破：扣血、敌人消失、toast 提示；HP≤0 失败

### 波次
- 共 5 波；第 N 波生成 5 + N×3 个敌人；首只延迟 0.4s，之后间隔 max(0.28, 0.72 − N×0.05)
- 敌人类型判定：roll < 0.2 + N×0.025 → 重装；roll < 0.47 → 高速；否则普通
- 第 5 波最后一只强制 boss；从四边随机出生（边缘外 45px）
- 敌人数值（基础 + 每波成长）：
  - 普通"热情追求者"：HP 38+7N，速度 24+1.5N，半径16，伤害8，xp1，色 #f3b95f
  - 高速"急切追求者"：HP 23+5N，速度 42+2N，半径12，伤害6，xp1，色 #62d8ff
  - 重装"执着追求者"：HP 90+13N，速度 15+0.8N，半径22，伤害14，xp2，色 #ff7b86
  - boss"命定追求者"：HP 420，速度12，半径35，伤害28，xp5，色 #c58aff
- 波间隔 2.4s；波结束 toast"第 N 波完成 · 整理卡槽"；5 波全清胜利

### 掉落与卡牌
- 击杀按当前掉落概率生成地面心意掉落，概率上限 0.95，boss 必掉；掉落 1 星、限时存在、超时消失并计入"超时"统计
- 点击画布 34px 内最近掉落拾取；卡槽（7 格）满则 toast 拒绝
- 卡牌 5 类（damage清醒/rate从容/multi界限/range余韵/luck眷恋），星级 1–3
- 拾取后自动合成：同类型同星级两两合一升 1 星，循环直到无法合成，3 星封顶；空位不阻碍合成
- 星级效果倍率 cardScale = [0, 1, 2.25, 4]
- 卡牌效果（按倍率）：damage 伤害+5；rate 射速+0.38；range 射程+32；luck 掉落+0.05
- multi 特殊规则：星级≥2 时弹丸+1，1 星时改为伤害+2.5×倍率

### 装备栏
- 左侧装备栏 3 格，仅接受 3 星卡，违规拖入 toast 拒绝
- 右侧临时栏无限张数，任意星级可入；投入计入"装配"统计；下一波开始时全部清空并 toast
- 装备栏与临时栏加成叠加计入总伤害/射速/弹丸/射程/掉落
- 双击卡槽卡牌 → 快速装备到装备栏空位（满则提示）；双击装备卡 → 快速卸回卡槽空位（满则提示）
- 拖拽：pointerdown 开始、经过槽位高亮（.hot）、pointerup 落点判定，支持卡槽↔装备栏移动与交换
- 移入/移出卡槽后触发自动合成；每次移动/交换/投入临时栏 uses+1

### 经验与升级（注意：这个系统容易被遗漏，必须保留）
- 击杀得 xp；xpNeed 初始 8，每级 ×1.35 取整
- 升级时游戏暂停、弹出三选一模态：高能弹芯（当前总伤害+20% 记入 damageBonus）、过载供能（当前总射速+15% 记入 fireRateBonus）、重整心防（回血 20，不超上限）
- 选择后关闭弹窗、恢复游戏、toast 确认

### UI 与控制
- HUD：血条、经验条与等级、波次、伤害/射速/弹丸实时数值、掉落遥测（地面/已拾取/超时）
- 实时调参面板 6 项滑杆：基础伤害 6–40、每秒攻击 1–10、射程 160–520、掉落概率 0–100%、存在时间 2–15s、敌速 40–180%；即时生效；"恢复默认参数"按钮
- 按钮：开始/重新开始、暂停（P 键同效）、"生成测试掉落"（在固定位置生成 4 份同类型 1 星掉落，类型按合成次数轮换）
- 结算弹窗：胜/负标题与文案、击杀/合成/装配统计、"再来一局"
- toast 提示 1.5s；中央引导文案；故事背景、验证重点等侧栏文案原样保留
- Canvas 视觉原样保留：网格、内圈、射程虚线圈、敌人多边形（高速3边/普通4边/重装6边/boss8边）与血条、掉落倒计时圆环、炮台造型（恶魔角+♥）、粒子、子弹辉光
- 移动端响应式断点（880px / 560px）样式行为保留

### 已知死代码（重构时明确处理）
`dragPayload()`、`parsePayload()` 及槽位上的 dragover/drop/dragleave 监听依赖 HTML5 拖拽，
但卡牌 draggable=false 且从未绑定 dragstart，这套逻辑从未生效。
重构时删除这套死代码，只保留 pointer 拖拽实现，并在 commit message 中注明。

## 目标目录结构

ProjectVL/
├─ package.json / vite.config.ts / tsconfig.json / vitest.config.ts
├─ index.html                  ← 极薄，仅挂载点
├─ README.md                   ← 重写为工程型 README
├─ 项目总览.md                  ← 更新（见下）
├─ src/
│  ├─ main.ts                  ← 只做胶水：加载数据→建状态→绑输入→主循环
│  ├─ styles/app.css
│  ├─ data/                    ← gameConfig.json / cards.json / enemies.json / waves.json / perks.json / texts.json
│  ├─ core/                    ← 纯规则层：types.ts、createInitialState.ts、updateGame.ts
│  │  └─ systems/              ← waveSystem / enemySystem / combatSystem / dropSystem / cardSystem / equipmentSystem / progressionSystem / particleSystem
│  ├─ render/                  ← canvasRenderer + drawArena/drawEnemies/drawBullets/drawDrops/drawParticles/drawTurret
│  ├─ ui/                      ← domRefs / renderHud / renderCards / renderEquipment / renderTempSlot / tunerPanel / modals / toast
│  ├─ input/                   ← pointerDrag / dropClick / keyboard
│  └─ debug/exposeDebugApi.ts
├─ tests/                      ← cardSystem / equipmentSystem / dropSystem / waveSystem / combatSystem / progressionSystem
└─ legacy/
   ├─ single-file/炮台射击_可玩原型_2026-07-07.html
   ├─ backups/                 ← 原"备份"5 份 HTML 原样移入
   └─ task-records/            ← 原"任务记录"原样移入
（`炮台立项/炮台射击_游戏立项案.docx` 移入 legacy/ 或 docs/，禁止删除任何历史文件）

## 架构规则（写入 README，供后续 Agent 遵守）

1. src/core 禁止 import DOM/Canvas/任何浏览器 API；系统函数只接收 state+config+dt（随机数经注入的 rng），返回状态变更与 GameEvent[]
2. 表现副作用（toast、弹窗、粒子表现、UI 刷新）统一由事件驱动，在 ui/render 层消费
3. 改数值 → 只改 src/data/*.json；改规则 → src/core（必须补测试）；改画面 → src/render；改界面 → src/ui
4. 保留并增强调试口：window.__game 暴露 getState / start / reset / spawnGroundDrop / addTestPair / moveOrSwap / setConfig（仅 DEV 模式注入），供人工与 Playwright 浏览器测试使用

## 执行步骤（每完成一步 git commit，禁止一次性大爆炸重构）

1. 【归档】建 legacy/ 结构，移动旧文件（git mv），删除"网页打包"目录与 zip（构建产物今后由 npm run build 生成，不再手工复制）。commit。
2. 【平移】搭 Vite+TS 工程；把 <style> 原样移入 app.css，把 IIFE 脚本尽量原样平移进 src/main.ts（允许最小 TS 适配，不拆结构、不改逻辑）。验证 npm run dev 与旧版行为一致。commit。
3. 【抽数据】CARD_TYPES→cards.json、DEFAULT_CONFIG/TURRET/星级倍率/卡槽数→gameConfig.json、敌人数值→enemies.json、波次规则→waves.json、升级三选一→perks.json、界面文案→texts.json。只改读取方式不改规则。commit。
4. 【抽规则+测试】逐个抽出 core/systems 并为每个系统补 Vitest（先 cardSystem，再 equipmentSystem、dropSystem、waveSystem、combatSystem、progressionSystem）。每抽一个系统跑一次全量测试。commit（可多次）。
5. 【拆表现】draw() 拆入 render/，DOM 渲染拆入 ui/，输入拆入 input/；删除 HTML5 拖拽死代码。commit。
6. 【收尾】debug API、重写 README（运行/构建/测试/模块边界/Agent 修改规则）、更新项目总览.md（新结构、git 状态、新开发流程），根目录加 .gitignore（node_modules、dist）。commit。

## 测试最低覆盖（Vitest）

- cardSystem：两张同类1星→2星；四张同类1星→3星；3星不再合成；不同类型不合成；中间有空位仍合成；multi 卡 1 星按伤害计、2星按弹丸计
- equipmentSystem：1/2星不可入装备栏；3星可入；装备满时快速装备失败并不改状态；交换后两侧状态正确；临时栏接受任意星级；下波开始清空临时栏
- dropSystem：超时消失并计数；拾取入槽并触发合成；槽满拒绝拾取且掉落保留；掉落概率上限0.95；boss必掉
- waveSystem：第N波生成数=5+3N；第5波最后一只boss；5波全清胜利；HP归零失败
- combatSystem：锁最近敌人；射程外不锁；多弹丸散布数量正确；子弹命中扣血与击杀
- progressionSystem：xpNeed 成长 ×1.35；三种 perk 效果正确

## 最终验收（全部满足才算完成）

1. npm install / npm run dev / npm run build / npm run test 全部成功
2. 浏览器实测与 legacy 旧版对照：开局→5波→胜利/失败全流程一致；拾取、合成、拖拽、双击装备、临时栏清空、升级三选一、调参面板、P键暂停、测试掉落按钮全部正常
3. 浏览器控制台无报错
4. src/core 无任何 DOM/Canvas 引用（可用 grep 验证）
5. legacy/ 下旧单文件 HTML 仍可直接双击打开游玩
6. git 历史为多个语义清晰的 commit，而非单个巨型 commit

开始前先通读 `炮台立项/炮台射击_可玩原型.html` 全文核对以上契约，如发现契约描述与代码不符，以代码为准并在最终报告中列出差异。
```

---

## 五、重构完成后的下一步（不在本次范围）

1. 用 Playwright + `window.__game` 建立浏览器级冒烟测试（开局→速通→结算）。
2. 数值实验：基于 JSON 配置做 A/B 参数包，供外部试玩测试。
3. 按"验证型垂直切片"标准补齐：单局 5–10 分钟节奏、2–3 轮外部测试后，再评估转 Unity。
