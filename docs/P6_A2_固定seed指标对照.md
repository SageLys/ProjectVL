# R1-A2 固定 seed 指标对照

验收夹具为 `tests/fixtures/telemetry_session_seed42.json`，固定 `seed=42`。事件时间线：波开始 `0s`、spawn `5s`、进入危险区 `18s`、kill `20s`、掉落落地 `25s`、拾取/合成机会 `26s`、perk 弹出 `28s`、波清 `30s`；同屏样本为 `0,2,4,6,8,4,0`；前 90 秒有效输入为 3 次。

| 指标 | 手工推演 | `computeExperienceMetrics` / 单测 | 结论 |
|---|---:|---:|---|
| E1 P50 | 排序 `0,0,2,4,4,6,8`，中位数 = 4 | 4.0 | 一致 |
| E1 P95 | 位置 `(7-1)×.95=5.7`，`6+.7×(8-6)=7.4` | 7.4 | 一致 |
| E2 | `spawn 5s → dangerEnter 18s` 为最长间隔，13s | 13.00s | 一致 |
| E6 | `t≤90s` 的有效输入共 3 次 | 3 | 一致 |
| E7 | 前 15s 事件密度 `2/15`；末 15s 事件全集密度 `6/15`（合成机会不属于 E），比值 3 | 3.000 | 一致 |

运行 `npm run metrics -- tests/fixtures/telemetry_session_seed42.json` 可复算上表。HUD 的 E1 使用同一 `percentile()`；E2 最大值采用同一相邻事件间隔口径；E6 均按 `at≤90` 过滤。全部边界由 `tests/experienceMetrics.test.ts` 固化。
