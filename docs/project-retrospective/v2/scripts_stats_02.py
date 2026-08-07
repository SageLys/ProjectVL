# -*- coding: utf-8 -*-
"""统计校验：列数一致性 / 归属标记计数 / 一手原始记录佐证占比（新旧同口径对比）

口径（与上一轮 23% 保持一致，可复算）：
  只看「观点归属」列。该列出现 “历史任务原始记录” 或 “ChatGPT侧原始记录”
  （含 ·逐字证实 等后缀变体）才算「有一手原始记录佐证」。
  仅在「来源ID / 后续变化」里提到检索过某份原始记录（但结论是“未找到”）的，不算。
再细分：
  全条佐证 = 归属里只有正面一手标记；
  部分佐证 = 归属里同时含一手标记与「未找到 / 来源不明 / 项目记忆 / 未见 / 零命中」等保留语。
"""
import os, re, collections

BASE = "/sessions/amazing-confident-dirac/mnt/ProjectVL/docs/project-retrospective"
OLD = os.path.join(BASE, "2026-08-06", "02_USER_THOUGHT_UNITS.tsv")
NEW = os.path.join(BASE, "v2", "02_USER_THOUGHT_UNITS.tsv")

RAW = ("历史任务原始记录", "ChatGPT侧原始记录")
RESERVE = ("未找到", "来源不明", "项目记忆", "未见", "零命中", "未确认", "转述", "分析推断", "事后补述")

def read(p):
    with open(p, encoding="utf-8") as f:
        rows = [l.rstrip("\n").split("\t") for l in f if l.strip()]
    return rows[0], rows[1:]

def report(name, path):
    hdr, rows = read(path)
    ia, isrc = hdr.index("观点归属"), hdr.index("来源ID")
    print("=" * 78)
    print(f"{name}   {os.path.relpath(path, BASE)}")
    TAB = chr(9)
    hastab = "有" if any(TAB in c for r in rows for c in r) else "无"
    print(f"  表头列数 {len(hdr)}；数据行列数集合 {sorted(set(len(r) for r in rows))}；单元格含制表符: {hastab}")
    print(f"  思考单元数 {len(rows)}；ID 重复 "
          f"{[k for k,v in collections.Counter(r[0] for r in rows).items() if v>1] or '无'}")

    full, part, none_ = [], [], []
    for r in rows:
        a = r[ia]
        if any(m in a for m in RAW):
            (part if any(x in a for x in RESERVE) else full).append(r[0])
        else:
            none_.append(r[0])
    tot = len(rows); cov = len(full) + len(part)
    print(f"  【有一手原始记录佐证】 {cov}/{tot} = {cov/tot*100:.1f}%")
    print(f"       其中 全条佐证 {len(full)}  部分/拆层佐证 {len(part)}")
    print(f"  【无一手原始记录佐证】 {len(none_)}/{tot} = {len(none_)/tot*100:.1f}%")
    print(f"       -> {' '.join(none_)}")

    cnt = collections.Counter()
    for r in rows:
        for m in re.findall(r"【([^】]+)】", r[ia]):
            base = m.split("·")[0].split("：")[0].split("（")[0].strip()
            cnt[base] += 1
    print("  归属标记计数（归一化到主标记，按次数）:")
    for k, v in cnt.most_common(14):
        print(f"      {v:>3}  【{k}】")
    return set(full) | set(part), tot

old_cov, old_n = report("上一轮 2026-08-06", OLD)
new_cov, new_n = report("本轮 v2", NEW)

print("=" * 78)
print(f"一手原始记录佐证占比：{len(old_cov)}/{old_n} = {len(old_cov)/old_n*100:.1f}%"
      f"  ->  {len(new_cov)}/{new_n} = {len(new_cov)/new_n*100:.1f}%")
up = sorted([i for i in new_cov - old_cov if int(i.split('-')[1]) <= 43], key=lambda x: int(x.split('-')[1]))
print(f"旧 TU-01~43 中本轮升级为「有一手佐证」的 {len(up)} 条: {' '.join(up)}")
down = sorted(old_cov - new_cov)
print(f"旧表中原有佐证、本轮降级的 {len(down)} 条: {' '.join(down) if down else '无'}")
newids = sorted([i for i in new_cov if int(i.split('-')[1]) > 43], key=lambda x: int(x.split('-')[1]))
print(f"本轮新增且带一手佐证的 {len(newids)} 条: {' '.join(newids)}")
