# ProjectVL 作品集截图清单

在线 Web Demo：<https://sagelys.github.io/ProjectVL/>

截图由 `npm run capture:portfolio` 基于生产构建与 `vite preview` 自动生成；桌面视口 1440×900，移动视口 390×844。

| 编号 | 文件 | 复现 URL | 服务的案例 | 图注（一句话，可直接用在作品集里） |
|---:|---|---|---|---|
| 01 | [01-selection-drops.png](./01-selection-drops.png) | `index.html?evidence=selection` | A | 自动战斗把手空出来之后，玩家的事落在地面拾取、手牌判断与下一步合成上。 |
| 02 | [02-build-pressure.png](./02-build-pressure.png) | `index.html?evidence=build` | D | 构筑期同屏超过 20 个敌人，Build 必须在整局最高压力里搭起来。 |
| 03 | [03-bounty-offer.png](./03-bounty-offer.png) | `index.html?evidence=bounty` | A | 悬赏在接受前亮明确定奖励，也把无惩罚拒绝权交给玩家。 |
| 04 | [04-bounty-active.png](./04-bounty-active.png) | `index.html?evidence=bountyActive` | A | 接受悬赏后，对应方向的强化敌群带着可识别的赏金标记推进。 |
| 05 | [05-validation.png](./05-validation.png) | `index.html?evidence=validation` | E | 验证期保留高强敌人却关闭普通掉落，把割草压力和手部负担拆成了两个量。 |
| 06 | [06-hand-full.png](./06-hand-full.png) | `index.html?evidence=handFull` | B | 七格手牌已经占满，可合成提示让“容量就是机会成本”直接出现在画面上。 |
| 07 | [07-card-detail.png](./07-card-detail.png) | `index.html?evidence=cardDetail` | B | 同一张卡把当前效果、数值词条和进化路线收进二级详情，宽度没有挤占战斗界面。 |
| 08 | [08-evolution-fork.png](./08-evolution-fork.png) | `index.html?evidence=evolution` | B | 3★ 检查点让一张卡在同一个槽里向不同路线生长，而不是继续横向加槽。 |
| 09 | [09-fusion-equipped.png](./09-fusion-equipped.png) | `index.html?evidence=fusion` | C | 三件装备占满时主炮同时兑现光束与榴弹，叠装不再反过来惩罚构筑。 |
| 10 | [10-tuner-panel-full.png](./10-tuner-panel-full.png) | `index.html?evidence=tuner` | 副题 | 几十个可调参数集中在这块面板里，案例 A 讲的那次降维就发生在这里。 |
| 11 | [11-tuner-key-params.png](./11-tuner-key-params.png) | `index.html?evidence=tuner` | A | 出怪、掉落和 TTK 派生读数并排后，原始参数才变成能对应玩家感受的三个抓手。 |
| 12 | [12-telemetry-hud.png](./12-telemetry-hud.png) | `index.html?evidence=telemetryHud` | D | E1–E7 把同屏密度、空窗、机会与威胁变成实时读数，这是我为体验曲线造的尺子。 |
| 13 | [13-editor-overview.png](./13-editor-overview.png) | `editor.html` | 副题 | 配置域、表单与只读提示同屏，证明规则数据与代码实现被分开管理。 |
| 14 | [14-editor-validation.png](./14-editor-validation.png) | `editor.html` | B | 16 项检查全部通过才允许保存，内容偏离会在进入游戏前被硬拦住。 |
| 15 | [15-design-workbench.png](./15-design-workbench.png) | `design.html` | B | 工作台把 60 张卡的设计、文案、反向引用与校验放在同一份内容契约里。 |
| 16 | [16-design-cards.png](./16-design-cards.png) | `design.html`（融合卡视图） | B | 融合卡直接展示材料方向与 6★ 产物，25 条有向配方不再靠散文和记忆维护。 |
| 17 | [17-mobile-portrait.png](./17-mobile-portrait.png) | `index.html?evidence=mobileLayout` | 移动端 | 竖屏手机里战斗、三件装备和七格手牌仍在同一条拇指操作路径上。 |
