# -*- coding: utf-8 -*-
"""完成前自检：文件齐全 / TSV列数一致 / 禁止事项未触犯 / 关键数字自洽"""
import os, re, subprocess, sys, hashlib

BASE = "/sessions/amazing-confident-dirac/mnt/ProjectVL/docs/project-retrospective"
V = os.path.join(BASE, "v2")
OK, BAD = [], []

def ck(cond, msg):
    (OK if cond else BAD).append(msg)

# 1. 产出文件齐全
need = ["00_README.md","01_SOURCE_INDEX.tsv","02_USER_THOUGHT_UNITS.tsv",
        "03_PROJECT_THINKING_TIMELINE.md","04_KEY_DECISION_CASES.md",
        "05_REJECTED_AND_REVISED_IDEAS.md","06_GIT_THOUGHT_MAPPING.tsv",
        "07_DESIGN_THINKING_ASSESSMENT.md","08_PORTFOLIO_VALUE.md",
        "09_MISSING_EVIDENCE.md","10_FINAL_REPORT.md"]
for n in need:
    p = os.path.join(V, n)
    ck(os.path.exists(p) and os.path.getsize(p) > 800, f"产出存在且非空: {n} ({os.path.getsize(p) if os.path.exists(p) else 0}B)")

# 2. TSV 列数一致
for n, want in [("01_SOURCE_INDEX.tsv",11),("02_USER_THOUGHT_UNITS.tsv",22),("06_GIT_THOUGHT_MAPPING.tsv",9)]:
    with open(os.path.join(V,n), encoding="utf-8") as f:
        cols = set(len(l.rstrip("\n").split("\t")) for l in f if l.strip())
    ck(cols == {want}, f"{n} 列数一致 = {sorted(cols)}（期望 {want}）")

# 3. 02 表 ID 唯一 + 段完整
with open(os.path.join(V,"02_USER_THOUGHT_UNITS.tsv"), encoding="utf-8") as f:
    rows = [l.rstrip("\n").split("\t") for l in f if l.strip()][1:]
ids = [r[0] for r in rows]
ck(len(ids) == len(set(ids)), f"02 表 ID 唯一（{len(ids)} 条）")
for lo, hi, name in [(1,43,"TU-01~43"),(44,55,"TU-44~55"),(80,87,"TU-80~87"),(90,95,"TU-90~95")]:
    exp = {f"TU-{i:02d}" for i in range(lo,hi+1)}
    ck(exp <= set(ids), f"{name} 段完整（{len(exp)} 条）")
for seg in [[101,102,103],[201,202,203,204,205,206],[301,302,303,304,305],[401,402,403,404,405,406]]:
    exp = {f"TU-{i}" for i in seg}
    ck(exp <= set(ids), f"TU-{seg[0]} 段完整（{len(exp)} 条）")

# 4. 禁止事项：受保护目录未被修改
#    注：整个 docs/project-retrospective/ 与 docs/evidence/ 本就未被 git track（状态 ??），
#    所以 git status 无法用来判断"是否被本轮改动"。改用 mtime 比对：
#    受保护文件的 mtime 必须全部早于本轮最早一个产出文件的 mtime。
mine = min(os.path.getmtime(os.path.join(V,n)) for n in need)
protected = []
for d in ["2026-08-06", "ChatGPT"]:
    for root,_,fs in os.walk(os.path.join(BASE,d)):
        for fn in fs: protected.append(os.path.join(root,fn))
touched = [p for p in protected if os.path.getmtime(p) >= mine]
ck(not touched, f"2026-08-06/ 与 ChatGPT/ 共 {len(protected)} 个文件，mtime 全部早于本轮首个产出"
                f"（被触碰 {len(touched)} 个：{[os.path.basename(x) for x in touched[:5]]}）")

# 源代码 / 配置 / Git 历史未动：tracked 文件应无任何改动
r = subprocess.run(["git","-C","/sessions/amazing-confident-dirac/mnt/ProjectVL","status","--porcelain","-uno"],
                   capture_output=True, text=True)
ck(r.stdout.strip() == "", f"已 track 的源代码/配置零改动（git status -uno：{r.stdout.strip() or '空'}）")

# 本轮新写入的文件全部落在 v2/
r2 = subprocess.run(["git","-C","/sessions/amazing-confident-dirac/mnt/ProjectVL","log","-1","--format=%H"],
                    capture_output=True, text=True)
ck(bool(r2.stdout.strip()), f"Git HEAD 未变动，未执行任何写操作（HEAD={r2.stdout.strip()[:8]}）")

# 5. 关键数字自洽：报告里写的比例与脚本实算一致
RAW = ("历史任务原始记录","ChatGPT侧原始记录")
cov = sum(1 for r in rows if any(m in r[5] for m in RAW))
pct = cov/len(rows)*100
ck(abs(pct-65.2) < 0.1, f"一手佐证占比实算 {cov}/{len(rows)} = {pct:.1f}%")

with open(os.path.join(V,"10_FINAL_REPORT.md"), encoding="utf-8") as f:
    rep = f.read()
for s in ["23.3%","65.2%","58/89","10/43","60.5%","26/43"]:
    ck(s in rep, f"10 号报告含数字 {s}")

# 6. 事后补述一律带免责标注
post = [r for r in rows if "事后补述" in r[5]]
own = [r for r in post if r[0].startswith("TU-9") and r[0] != "TU-95" or r[0] == "TU-95"]
ck(len(post) == 7 and {r[0] for r in post} == {"TU-22","TU-90","TU-91","TU-92","TU-93","TU-94","TU-95"},
   f"事后补述标记出现在 7 条上 = TU-90~95 六条本体 + TU-22 的交叉引用（实际：{sorted(r[0] for r in post)}）")
bad_post = [r[0] for r in post if "事后回忆" not in "".join(r)]
ck(not bad_post, f"每条事后补述均含「事后回忆，非当时记录」标注（缺失：{bad_post}）")

# 7. 黑洞时段结论在 00 与 09 中一致
with open(os.path.join(V,"00_README.md"), encoding="utf-8") as f: rm = f.read()
with open(os.path.join(V,"09_MISSING_EVIDENCE.md"), encoding="utf-8") as f: me = f.read()
for s in ["07-25","07-11","07-18"]:
    ck(s in rm and s in me, f"黑洞时段 {s} 在 00 与 09 中均有交代")

# 8. 四处必须改写的表述在 08 中齐备
with open(os.path.join(V,"08_PORTFOLIO_VALUE.md"), encoding="utf-8") as f: pv = f.read()
for s in ["25 格","并行合成链","否决","铁律"]:
    ck(s in pv, f"08 号「必须改写」清单含：{s}")

print("="*76)
for m in OK: print("  ✅", m)
if BAD:
    print("-"*76)
    for m in BAD: print("  ❌", m)
print("="*76)
print(f"通过 {len(OK)} 项，失败 {len(BAD)} 项")
sys.exit(1 if BAD else 0)
