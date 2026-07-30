# ProjectVL 美术资源目录

## 目录约定

- `Sprites/Arena`：战场背景、边框和地面装饰。
- `Sprites/Turret`：主炮塔、诱饵炮塔和炮塔状态层。
- `Sprites/Enemies`：普通、快速、坦克、悬赏和验证精英。
- `Sprites/Bosses`：Boss 本体、接触阶段和阶段覆盖层。
- `Sprites/Projectiles`：子弹、光束、范围指示与命中特效贴图。
- `Sprites/Cards`：41 张卡牌主图；文件名使用卡牌配置 ID。
- `Sprites/Drops`：普通掉落、悬赏奖励、验证奖励和万能卡。
- `UI`：HUD、按钮、面板、九宫格边框和图标。
- `VFX`：受击、死亡、阶段转换、掉落、拾取和施放反馈。
- `Materials`：Sprite、UI 与 VFX 材质。
- `Animations`：Animator Controller、Animation Clip 和遮罩。
- `Fonts`：项目字体及字体许可说明。
- `Audio`：音乐与音效源文件。

预制体放在同级 `Prefabs` 目录，并按敌人、Boss、子弹、VFX、UI 分类。

## 命名和导入规范

1. 资源文件名使用稳定 ID，不使用显示名称。例如 `chainLightning.png`、`tank.png`、`boss.contact.png`。
2. 游戏内 Sprite 默认 `Pixels Per Unit = 100`、关闭 Mipmap、启用 Alpha、双线性过滤。
3. PC 单图 `Max Size` 不超过 2048；Android 默认不超过 1024，优先 ASTC 6x6；文字或细线 UI 使用 ASTC 4x4。
4. 可拉伸面板必须在 Sprite Editor 设置 Border，并使用 Sliced；九宫格资源不得使用 Tight Mesh。
5. 图集按 `Gameplay`、`Cards`、`UI` 分组；需要独立材质或独立加载的资源不要强行合图。
6. 所有正式资源都通过 `VisualCatalog` 按 ID 查询。缺失条目会继续使用程序化后备图形，不阻断游戏。
7. 导入素材时必须连同对应 `.meta` 一起提交，禁止在文件管理器中移动后只提交素材文件。
