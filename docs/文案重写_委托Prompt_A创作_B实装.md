# 文案重写委托包（Prompt A 创作 / Prompt B 实装）

本文件含两个可独立复制的 prompt。**先用 A，你审核确认全量文案稿之后，再用 B。**

- **Prompt A**：交给任意 AI（含网页版），产出一份全量文案稿 Markdown，不碰代码。
- **Prompt B**：待你审定文案稿后，交给任意能读写本仓库的 AI Agent，把稿子实装进 `src/data/texts.json` 与相关 TS，并跑通测试。

附件清单见文末「附件说明」。

---
---

# ===== PROMPT A 开始（复制这一段给创作用的 AI）=====

# 任务：为塔防游戏 ProjectVL 重写全部玩家可见文案（魅魔题材）

你是这个游戏的文案设计师。这是纯文字创作任务，**不要求你写代码、不要求你改文件**，只需按指定格式产出一份完整的文案稿。

## 一、世界观与语气（最重要，上一版就是栽在这里）

**世界观**：玩家扮演一只魅魔，守着自己的地盘，击退一波波狂热扑上来的追求者。所有技能都要包装成她"拒绝 / 整治 / 反撩"追求者的桥段——电他、冻他、烧他、推开他、设陷阱勾他、反击他、顺手收走他送的东西。游戏里的敌人**统一叫「追求者」，不叫「敌人」**；玩家的血量叫「心防」；掉落物是追求者送的「心意」。

**语气铁律**：

1. **说人话，不要文绉绉。** 禁止堆砌四字成语、书面语、刻意工整的对仗。要像现代人吐槽/发消息时会说的话。
2. **技能名不限字数、不限句式。** 可以两个字，可以一整句带标点的话。`我不喜欢你！` 这种第一人称吐槽句是**正确方向**，比硬凑四字成语好得多。
3. **反例（曾被否决的风格，别再写成这样）**：`以牙还烫`、`本命桃花`、`越界天谴`、`霜打分成`、`头号通缉`、`雷罚印记`。每个字都对得上机制，但读起来像生造的成语，不是人话。
4. **正面参照**：这个项目早期上线过一批名字——`直球拒绝`、`保持距离`、`冷淡处理`、`热情退烧`、`暧昧诱饵`、`带刺玫瑰`、`私人领域`、`禁入红线`。它们成立的原因是**都是约会语境里真实会说的短语**，不是生造词。这次可以比它们更进一步，直接用口语句子，例如给一张"击退"卡叫「离我远点」，给一张"电人"卡叫「别碰我，会电」，给一张"放狠话"卡叫「我说了不约」。这些只是给你体会语感，**不要照抄**，请为全部卡牌重新创作。
5. **擦边尺度**：暧昧、调侃、有点占便宜的小机灵即可（参照上面那批旧名的程度），不涉及具体性内容，不低俗。
6. **机制信息不能丢。** 幽默放在名字和弹窗标题上；描述句必须让人一眼看懂效果，保留可辨识的机制关键词（冻结／减速／易伤／击退／穿透／连锁／分裂／护盾／反伤／掉落／持续伤害等）。只有梗没有信息量的描述，等于没写。

## 二、你手上的材料

**附件 `文案工单`（若干个 Markdown 文件）**是你的唯一权威依据。它是从游戏代码里直接导出的，每张卡都给你：

- 卡的 id、所属神、类别、**身份契约**（这张卡跨全部分支不变的核心特征，是起名的锚）
- **每一条分支、每一档消耗态的"精确效果"句**——这是游戏里真实结算的效果，直接从配置生成，**这就是机制真相**
- 每一个文案槽位的 **JSON 路径** 和当前的占位值（当前值大多是占位或有问题的，是你要替换的对象）

工单里出现的所有 JSON 路径（如 `cards.chainLightning.name`），请在你的产出里**原样保留**，实装的人靠它对位。

## 三、必须解决的既有问题（当前文案的真实病症，逐条治）

1. **配置字段名泄漏到玩家文案里。** 现状例子：`链弧以chain @ onHit承担核心机制。`、`onHit + requiresStatus:'vulnerable' → burstDamage（小范围，按命中点）`、`在死亡坐标生成 groundZone 导电区`。**产出里禁止出现任何英文标识符、`@`、`→`、`requiresStatus`、`spreadStatus`、`cd 1.5s` 这类写法。**
2. **同一条分支的多个字段整段复制。** 现状 210 条分支里 `summary` 与 `buildFit` 100% 一字不差重复。新结构下每个字段各司其职，不许互抄。
3. **跨分支复制同一句话。** 同一张卡的 A/B/C 三条分支，描述必须能看出区别——玩家正是靠这三句话做三选一决策。三句话读起来一样 = 这张卡的分支设计等于没传达。
4. **「适合：……」这一行要删掉。** 它现在渲染成「适合：chain @ onHit」，纯噪音。新结构里没有这个字段，你不用产出它。
5. **设计笔记混进了玩家文案。** 例如 `overview` 里出现「（现存三个 3★ 同构，本卡全部重写）」「改造理由：现状 harvest/fateLoom 都不产赏印……」。这些是内部备注，产出里一律清除。
6. **称呼不统一。** 现在框架文案说「追求者」，机制词典说「敌人」，同一个游戏两套称呼。**全库统一用「追求者」。**
7. **配方产物卡三档文案完全相同**，且里程碑正文直接抄了短句。产物卡是终态卡（永远 6★），三档共用一句可以接受，但**手牌短句与装备短句必须不同**（一个说"拖出去会炸成什么样"，一个说"装上后一直在干嘛"），里程碑正文也不能照抄短句。

## 四、产出清单（这些全都要写）

### 4.1 五神（5 组）

五神现在叫「迅霆 / 凛冬 / 焚狱 / 磐垒 / 丰饶」，是玩家选神时看到的流派名。**这次要一并题材化**——换成魅魔口吻的流派叫法，同时给每个神一句题材化的主题描述（现状是「雷霆与速度：连锁、穿透、攻速与易伤叠层」这种说明书口吻）。

同时给每个神的**资源**定一个玩家可见名并全库统一使用（这是最容易翻车的地方，一定要先定名再写卡）：

| 神 | 资源机制真相 | 现在的叫法 |
|---|---|---|
| 迅霆 | 给追求者叠"受到伤害提高"的层，再靠命中兑现 | 感电 / 易伤 |
| 凛冬 | 命中叠寒意，叠满转冻结，冻住的更好打 | 寒意 → 冰封 |
| 焚狱 | 直接点燃（可引燃后续）与地面火场两条线 | 灼烧 / 火场 |
| 磐垒 | 玩家侧护盾存量，破盾/被突破时反打 | 壁垒 |
| 丰饶 | 给追求者打标记，标记引导集火与产出 | 赏印 / 标记 |

定名后：卡牌描述、分支描述、机制词典（`glossary`）、状态名表（`effectText.statuses`）**必须全部用同一个名字**，不许一处叫"易伤"另一处叫"感电"。

### 4.2 60 张卡（35 张正式卡 + 25 张配方产物卡）

每张卡要写：

- `name`：卡名（口语化、不限字数、可带标点）
- `overview`：一句话卡牌概述，出现在卡牌详情页顶部，负责讲清"这张卡是干嘛的 + 题材梗"
- `hand.shortByTier`：手牌里显示的短句，说清**拖到战场会立刻发生什么**。工单里列了这张卡有哪几档（正式卡通常 1/3/6★），每档写一句，**建议 ≤14 字**（卡面只有两行）
- `equip.shortByTier`：装备后显示的短句，说清**装上之后一直在干嘛**。同上按工单给的档位写
- `hand.milestones` / `equip.milestones`：升星到关键档位时弹出的提示条，每条含 `title`（戏谑标题，这是全篇最适合放梗的位置）+ `detail`（一句机制说明，说清这一级新增了什么）。`fx` 字段不用你写，保持工单里的原值

**手牌与装备的短句语义必须不同**：手牌 = 一次性丢出去的效果；装备 = 常驻被动。同一张卡这两套文案雷同就是错的。

### 4.3 210 条进化分支（35 张正式卡 × 3★ 三选一 × 5★ 三选一 × ……，具体以工单为准）

新结构每条分支只写三个字段：

- `name`：分支名（同样口语化，可短句）
- `summary`：**玩家向**一句话，说清这条分支干什么。这是玩家在三选一弹窗里读到的主说明，必须能支撑决策——三条并排读，差异一眼可辨
- `intent`：**设计向**一句话，说明这条分支在构筑里的定位（例如"给靠命中兑现的路线补铺设面"）。只在内部设计工作台显示，玩家看不到，所以这条可以写得直白、不需要梗，但**同样禁止出现英文字段名**

3★ 的三条分支在设计上分别是**稳定型 / 覆盖型 / 节奏型**；5★ 的三条分支分别是**兑现 / 传播 / 转化**接口（工单里标了 `接口角色`）。写 `summary` 时把这个区别体现出来，别三条都写成"打得更疼"。

### 4.4 机制词典与词条说明

- `glossary`（36 条）：每个机制关键词一句解释，玩家点开卡牌详情时看到。要求准确 + 口语，可以带一点题材味，但**准确优先**
- `affixHelp`（15 条）：数值词条的说明句
- `effectText.atoms` / `triggers` / `statuses` / `sources` / `stats`：机制名词表。这是**全库文案的词汇基准**，先定这里，其它地方跟着用
- `affixes.stats` / `waveRewardStats` / `lanes`：属性名与流派名

### 4.5 框架与提示文案

`center` / `buttons` / `decisions` / `intermission` / `toast`（34 条）/ `wildcard` / `result` / `rewards` / `rewardReceipt` / `evolution` 顶层提示串。现状有一部分已经是题材化的（「守住心防」「第 {wave} 波追求者开始」），有一部分是干巴巴的系统腔（「选择进化分支」「准备完成」），需要统一到同一个语气。

**注意占位符**：`{wave}` `{name}` `{star}` `{count}` 这类花括号变量**必须原样保留，一个都不能改名或删除**，否则游戏会显示错误。

### 4.6 自动生成的机制句模板（这一项要读附件 `effectText.ts`）

游戏里"精确效果"那一栏的句子是代码按模板拼的，例如：

```
`命中后向附近敌人弹跳 ${bounces} 次，每次最多连接 ${targets} 个目标，每次保留 ${retention} 伤害`
```

附件里给了这个文件。请把其中面向玩家的中文句式**重写一遍**：把「敌人」统一改成「追求者」，把说明书腔调改得更顺口，同时**严格保持句子里的数值变量和插入位置不变**（`${...}` 一个都不能少、不能挪到会读不通的位置）。产出时按「原句 → 新句」逐条列出即可，不需要你写完整代码。

## 五、产出格式（严格照做，实装的人靠这个对位）

用 Markdown，按工单的顺序组织。每张卡一个小节，卡内用表格给出「JSON 路径 → 新文案」。示例：

```markdown
## `chainLightning`

| JSON 路径 | 新文案 |
|---|---|
| `cards.chainLightning.name` | 一个都别想跑 |
| `cards.chainLightning.overview` | 电流会顺着人群一路传下去——他带来的朋友越多，你越省事。 |
| `cards.chainLightning.hand.shortByTier.1` | 一发电流串一片 |
| ... | ... |
| `cards.chainLightning.hand.milestones.3.title` | 电得腿软了 |
| `cards.chainLightning.hand.milestones.3.detail` | 连锁电流现在会让被电到的追求者更容易受伤。 |
| `evolution.chainLightning.chainLightningA.name` | 一个传一个 |
| `evolution.chainLightning.chainLightningA.summary` | 命中后电流在追求者之间弹跳 2 次，每跳都让对方更容易受伤。 |
| `evolution.chainLightning.chainLightningA.intent` | 稳定型铺设，跟着主炮命中走，是靠命中兑现路线的基础铺面。 |
```

`milestones` 请拆成 `.title` 和 `.detail` 两行分别给，不要写成一个合并单元格。

**产出规模很大（约 1500+ 条）。请分批产出**：五神各一批（每批 7 张卡）、配方产物卡一批（25 张）、词典与框架文案一批。每批产完停下来等我说继续，不要为了塞进一条回复而压缩质量或省略条目。

## 六、自检清单（每批产出前对照一遍）

- [ ] 没有任何英文标识符、`@`、`→`、`requiresStatus` 之类的配置写法
- [ ] 没有四字成语堆砌；技能名读起来像人话
- [ ] 同一张卡的 A/B/C 三条分支 `summary` 差异明显，能支撑三选一
- [ ] 同一条分支的 `summary` 与 `intent` 不是同一句话的改写
- [ ] 手牌短句与装备短句语义不同
- [ ] 全篇称呼是「追求者」，没有「敌人」漏网
- [ ] 机制关键词（冻结/减速/易伤/击退/穿透/连锁/分裂/护盾/掉落…）保留，看得懂效果
- [ ] `{wave}` `{name}` 这类占位符原样保留
- [ ] 资源名（感电/寒意/灼烧/壁垒/赏印一类）全库同名，没有一处一个叫法
- [ ] 没有内部设计笔记（"同构""重写""改造理由"等）残留

# ===== PROMPT A 结束 =====

---
---

# ===== PROMPT B 开始（文案审定后，复制这一段给实装用的 AI Agent）=====

# 任务：把审定的文案稿实装进 ProjectVL，并完成分支文案字段的结构精简

你在改一个 Vite + TypeScript + Vitest 的塔防原型 `ProjectVL`。本任务分两部分：**(1) 结构改造**——精简进化分支的文案字段并删除界面上的「适合：…」行；**(2) 内容落地**——把审定的全量文案稿写进 `src/data/texts.json` 与少量 TS 模板。

**禁止改动任何战斗规则、技能数值、掉落/合成经济、点击判定、效果解释器。** 本任务只动文案数据、文案取值逻辑、与展示这些文案的 UI 片段。

构建：`npm run build`（先 `tsc --noEmit` 再 `vite build`）；测试：`npm test`（Vitest）；配置校验：`npm run validate`。

## 输入

- **文案稿**（随本任务附上）：Markdown，按「JSON 路径 → 新文案」逐条给出。路径即 `src/data/texts.json` 内的写入位置。
- 稿子里 `cards.<id>.hand.milestones.<star>.title` / `.detail` 是拆开给的，写入时要合回同一个对象，并**保留该对象原有的 `fx` 字段值不变**。

## 第一部分 · 结构改造（先做，做完跑一次测试，再做第二部分）

### 1.1 进化分支文案字段：五个减到三个

`texts.json` 的 `evolution.<cardId>.<optionId>` 现在有 `name` / `summary` / `intent` / `keywords` / `buildFit` 五个字段。**删除 `keywords` 与 `buildFit`**，保留三个，并按下述语义重新定位：

| 字段 | 语义 | 在哪显示 |
|---|---|---|
| `name` | 分支名 | 三选一弹窗标题、卡面路线徽标、卡牌详情技能树 |
| `summary` | **玩家向**一句话效果说明 | 三选一弹窗说明行、卡牌详情技能树选项正文 |
| `intent` | **设计向**一句话定位 | 仅设计工作台（`src/design/**`），玩家侧不显示 |

**注意这是一次语义调换**：当前代码在玩家侧显示的是 `intent`，改造后玩家侧一律显示 `summary`。

### 1.2 逐文件改动点（行号仅供导航，以符号名为准）

**`src/ui/cardDetailModel.ts`**
- `DetailTexts` 里 `evolution` 节点的类型：删 `keywords?: string[]`、`buildFit?: string`
- `SkillTreeOption` 接口：删 `keywords: string[]`
- `optionCopy()`：删掉 `keywords`、`buildFit` 的读取；玩家向文案改为读 `copy?.summary`，回退顺序 `summary → intent → 自动生成的机制关键词兜底句`
- `buildEvolutionOptionViewModel()`：返回值删 `keywords` 字段

**`src/ui/cardDetailModal.ts`**（约 197–200 行）
- 删除 `const keywords = ...` 及其 `适合：${option.keywords...}` 赋值与 `optionSummary.append(name, keywords)` 里的 `keywords`
- `optionSummary` 只保留分支名；分支说明仍由下方 `intent` 段落承载，但该段落改为渲染新的玩家向文案（即 `SkillTreeOption` 里承载 `summary` 的那个字段）

**`src/ui/modals.ts`**（约 116–119 行）
- 删除 `.choice-fit` 元素及 `适合：${optionModel?.keywords...}`，并从 `button.append(...)` 里移除它
- `.choice-desc` 继续显示分支说明，取值同样改为玩家向的 `summary`

**`src/design/describe.ts`**（约 25–26、172–173 行）：删 `keywords` / `buildFit` 两个字段的类型声明与读取。

**`src/design/cardView.ts`**（约 93–95、109–112 行）：删掉「关键词 / 构筑适配」那一行渲染与对应两个可编辑字段；保留 `summary`（标签改为「玩家摘要」）与 `intent`（标签改为「设计意图」）。

**`src/design/crossViews/copyCompleteness.ts`**
- `EVOLUTION_FIELDS` 改为 `['name', 'summary', 'intent']`
- `placeholderFields()` 里删掉 `buildFit === keywords` 那条判定；**保留并强化** `summary === intent` 判定，以及「同一卡多个分支同一字段取值相同」的跨分支重复判定（这是本次要长期防复发的两个病）

**`src/design/textEditing.ts`**（约 70 行）：多行字段名单里去掉 `buildFit`。

### 1.3 同步更新的测试

- `tests/textCoverage.test.ts`：删掉 `expect(branch?.keywords.length).toBeGreaterThan(0)` 与类型声明里的 `keywords`；**新增**断言：同一张卡同一 checkpoint 下三条分支的 `summary` 两两不相同；`summary !== intent`；`summary` 与 `intent` 均不匹配 `/[A-Za-z]{3,}|@|→|requiresStatus|spreadStatus/`（英文配置串泄漏防复发）
- `tests/decisionModal.test.ts`（约 65、95 行）：用例名与 `expect(...'.choice-fit'...).toContain('适合：')` 断言随之删除／改写为断言 `.choice-desc` 显示的是分支的玩家向说明
- 其它因结构变更而失败的用例，按新结构更新，不要为了让测试通过而恢复旧字段

### 1.4 数据迁移

用脚本或直接编辑，把 `src/data/texts.json` 里全部 210 条分支的 `keywords`、`buildFit` 键删除。JSON 需保持仓库的规范格式（改完跑 `npm run validate`，它带 `--format-check`）。

## 第二部分 · 内容落地

### 2.1 写入范围

按文案稿逐条写入 `src/data/texts.json`：

- `gods.*`（5 神的 `name` 与 `theme`）
- `cards.*`（60 张卡的 `name` / `overview` / `hand.shortByTier` / `hand.milestones` / `equip.shortByTier` / `equip.milestones`）
- `evolution.*`（210 条分支的 `name` / `summary` / `intent`）+ `evolution` 顶层的 `lockNotice` / `pending` / `nextCheckpoint` / `recipeCombatHint` / `recipeAsIngredient`
- `glossary`（36 条）、`affixHelp`（15 条）
- `effectText.atoms` / `triggers` / `statuses` / `sources` / `stats`
- `affixes`（含 `stats`）、`waveRewardStats`、`lanes`
- `center` / `buttons` / `decisions` / `intermission` / `toast` / `wildcard` / `result` / `rewards` / `rewardReceipt`

**不在范围**：`texts.tuner`（开发者调参面板标签，玩家看不到），除非文案稿里明确给了。

### 2.2 硬性约束

1. **只改文案值，不改键名、不改结构**（唯一的结构变更是第一部分明确列出的两个字段删除）。
2. **占位符原样保留**：`{wave}` `{name}` `{star}` `{count}` `{damage}` `{seconds}` 等花括号变量一个不能少、不能改名。改完全库搜一遍，确认每条文案的占位符集合与改前一致。
3. `milestones.<star>.fx` 的值（`core` / `major` / `transform`）**保持不变**。
4. `hand.shortByTier` / `equip.shortByTier` / `milestones` 的**档位键集合保持不变**（哪张卡有哪几档由代码结构决定，不要增删档）。
5. 文案稿里没覆盖到的键**保持原值**，不要自行发挥，改完向我列出未覆盖清单。

### 2.3 自动生成的机制句模板（`src/ui/effectText.ts`）

文案稿末尾给了「原句 → 新句」对照表。逐条替换 `formatEffect()` / `formatTrigger()` / `FALLBACK_TRIGGERS` 里的中文句式。

**硬性要求**：模板里的 `${...}` 变量与调用的格式化函数（`shown` / `pct` / `seconds` / `plusPctFromMul` / `statLabel` / `sourceLabel` / `statusLabel`）**一个都不能删、不能换**，只改中文措辞与语序。改完 `tests/effectText.test.ts` 若有快照/断言失败，按新句式更新断言（**不要**改回旧句式）。

同时 `src/ui/cardDetailModel.ts` 里的 `DEFAULT_GLOSSARY` 常量是 `texts.glossary` 的兜底副本，把它同步成新的词典内容，避免两处不一致。

### 2.4 其余散落在 TS 里的玩家可见硬编码串

以下文件里有玩家能看到、但没进 `texts.json` 的中文串，按文案稿的语气一并统一（重点是「敌人」→「追求者」和语气统一）：

- `src/ui/eventText.ts`（约 18 条：进化失败提示、验证奖励提示等）
- `src/ui/renderHud.ts`（约 6 条：卡槽操作引导）
- `src/ui/renderMergeHints.ts`（2 条）、`src/ui/rewardCelebration.ts`（1 条）
- `src/ui/cardDetailModal.ts`（约 14 条分区标题："当前效果""数值词条""关键词解释""完整技能树"等）
- `src/ui/cardDetailModel.ts` 里的分区/兜底串（"基础释放""数值成长""分支选择""公共强化""公共终态""尚未选择路线"等）

**不要动** `src/editor/**`、`src/design/**`、`src/calibrate/**`、`src/config/**Validator**` 里的中文——那些是开发者工具与校验器信息，玩家看不到。

## 三、验收

1. `npm run build`、`npm test`、`npm run validate` 全绿。
2. `texts.json` 内全库检索，`evolution` 下不再存在 `keywords` / `buildFit` 键。
3. 全库检索确认：玩家可见文案里没有 `@`、`→`、`requiresStatus`、`spreadStatus`、`groundZone`、`burstDamage` 之类的英文配置写法；没有"敌人"漏网（`texts.json` + 上述 UI 文件）；没有"（现存…同构）""改造理由…"之类内部设计笔记。
4. 每张卡的 A/B/C 三条分支 `summary` 互不相同（新加的测试会守住这条）。
5. 打开设计工作台的「文案完整性看板」（`src/design` 视图），确认 `缺失 0，占位 0`。
6. 启动 `npm run dev`，抽查三处截图：① 手牌与装备卡面短句；② 3★ 分支三选一弹窗（确认没有「适合：」行、三条说明差异明显）；③ 任一 6★ 卡的卡牌详情页（概述 / 精确效果 / 技能树 / 关键词解释四段都读得通）。
7. 向我报告：本次改动的文件清单、未被文案稿覆盖的键清单、以及任何你认为文案与机制真相对不上的条目（**不要自行改机制去迁就文案**，报告出来即可）。

# ===== PROMPT B 结束 =====

---
---

# 附件说明

## 给 Prompt A（创作）的附件

**必须附上**（`docs/文案工单/` 目录下，已由 `scripts/exportCopyWorkOrder.ts` 从当前代码生成）：

| 文件 | 大小 | 内容 |
|---|---|---|
| `docs/文案工单/0_总览与神祇.md` | 0.8 KB | 五神现状 |
| `docs/文案工单/1_迅霆.md` | 53 KB | 迅霆 7 张卡（含全部分支精确效果与文案槽位） |
| `docs/文案工单/2_凛冬.md` | 49 KB | 凛冬 7 张卡 |
| `docs/文案工单/3_焚狱.md` | 52 KB | 焚狱 7 张卡 |
| `docs/文案工单/4_磐垒.md` | 46 KB | 磐垒 7 张卡 |
| `docs/文案工单/5_丰饶.md` | 50 KB | 丰饶 7 张卡 |
| `docs/文案工单/6_配方产物25张.md` | 54 KB | 25 张配方产物卡 |
| `docs/文案工单/7_框架与词典文案.md` | 13 KB | glossary / affixHelp / effectText / toast / result 等全部框架文案现值 |
| `src/ui/effectText.ts` | 12 KB | 自动生成的机制句模板（对应 Prompt A §4.6） |

按批次投喂时，每批只需给对应那一个工单文件 + `0_总览与神祇.md`。若对方模型能接受大文件，也可直接给合订本 `docs/文案工单_全量.md`（317 KB）。

**可选补充**（只在对方追问机制背景时给）：`docs/五神35卡_完整设计表_v4.md`（74 KB，35 卡设计定稿）、`docs/25配方卡_实装规格_v1.md`（28 KB，配方卡规格）。工单里的"精确效果"已经是从运行时配置导出的，比设计表更贴近真实，通常不需要这两份。

## 给 Prompt B（实装）的附件

Prompt B 面向能直接读写本仓库的 Agent，**不需要额外附件**，只要把审定后的**全量文案稿**贴给它即可。它需要访问的文件都在仓库里，路径已写进 prompt。

## 补充说明

- 工单由 `scripts/exportCopyWorkOrder.ts` 生成，代码或配置变动后可重跑刷新：
  `npx vite-node scripts/exportCopyWorkOrder.ts > docs/文案工单_全量.md`
- 工单里每条「精确效果」都来自 `formatBinding()`，与游戏内卡牌详情页显示的效果句**逐字一致**，所以文案作者看到的就是玩家看到的机制真相。
