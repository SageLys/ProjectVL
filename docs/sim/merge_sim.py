"""ProjectVL 合成经济蒙特卡洛：扫描 合成配方×星级上限×入装门槛×卡槽数.
模型: 一局提供 N 次拾取(均匀 7 种卡型, 5% 为 2★ 赏金掉落), 手牌容量 S,
装备 3 格(同类型唯一), 门槛星级 T 才能装备, 支持喂养合成(手牌与已装备同型同星合成升星).
策略 bot: 贪婪合成 > 装备/喂养 > 槽满时被迫消耗(进度最少类型的最低星卡).
"""
import random, statistics as st
from collections import Counter

TYPES = 7
def run(N=45, S=7, merge_k=2, max_star=3, threshold=2, lock_in_slot=False, p2drop=0.05, rng=None):
    rng = rng or random.Random()
    hand = []            # list[(type,star)]
    equip = {}           # type -> star
    merges = casts = 0
    first_equip_at = first_top_at = None
    top_formed = 0       # 达到 max_star 的次数(含喂养)
    def cap_used():
        return len(hand) + (len(equip) if lock_in_slot else 0)
    def try_merge():
        nonlocal merges, top_formed, first_top_at
        changed = True
        while changed:
            changed = False
            c = Counter(hand)
            for (t, s), n in c.items():
                if n >= merge_k and s < max_star:
                    for _ in range(merge_k): hand.remove((t, s))
                    hand.append((t, s + 1)); merges += 1; changed = True
                    if s + 1 == max_star:
                        top_formed += 1
                        if first_top_at is None: pass
                    break
    def try_equip(i_pickup):
        nonlocal merges, top_formed, first_equip_at
        changed = True
        while changed:
            changed = False
            for card in list(hand):
                t, s = card
                if s < threshold: continue
                if t not in equip and len(equip) < 3:
                    equip[t] = s; hand.remove(card); changed = True
                    if first_equip_at is None:
                        globals()  # noop
                elif t in equip and equip[t] == s and s < max_star:
                    equip[t] = s + 1; hand.remove(card); merges += 1; changed = True
                    if s + 1 == max_star: top_formed += 1
                elif t in equip and s > equip[t]:
                    hand.remove(card); hand.append((t, equip[t])); equip[t] = s; changed = True
        return
    def progress(t):
        return sum((merge_k ** s) for (tt, s) in hand if tt == t) + (merge_k ** equip[t] if t in equip else 0)
    for i in range(N):
        t = rng.randrange(TYPES)
        s = 2 if rng.random() < p2drop else 1
        if cap_used() >= S:
            try_merge()
        while cap_used() >= S:
            cands = sorted(hand, key=lambda c: (c[1], progress(c[0])))
            hand.remove(cands[0]); casts += 1
        hand.append((t, s))
        try_merge(); try_equip(i)
        if first_equip_at is None and equip: first_equip_at = i + 1
        if first_top_at is None and (top_formed > 0): first_top_at = i + 1
    eq_stars = sorted(equip.values(), reverse=True)
    return dict(top=top_formed, merges=merges, casts=casts,
                first_eq=first_equip_at or N + 1, first_top=first_top_at or N + 1,
                eq_top=sum(1 for v in equip.values() if v == max_star),
                eq_cnt=len(equip))

def sweep(label, runs=4000, **kw):
    rng = random.Random(42)
    rs = [run(rng=rng, **kw) for _ in range(runs)]
    def med(k): return st.median(r[k] for r in rs)
    def mean(k): return sum(r[k] for r in rs) / len(rs)
    print(f"{label:46s} 满星件数 med={med('top'):.0f} mean={mean('top'):.2f} | "
          f"装备满星 mean={mean('eq_top'):.2f} | 合成 mean={mean('merges'):.1f} | "
          f"被迫消耗 mean={mean('casts'):.1f} | 首装@{med('first_eq'):.0f} | 首满星@{med('first_top'):.0f}")

print("=== A. 合成配方对比 (N=45, S=7, 门槛2★, 上限3★) ===")
sweep("二合 (2同型同星→+1星, 3★=4张)", merge_k=2)
sweep("三合 (3张→+1星, 3★=9张)", merge_k=3)
print()
print("=== B. 星级上限对比 (二合, N=45, S=7, 门槛2★) ===")
sweep("上限3★", max_star=3)
sweep("上限4★ (4★=8张)", max_star=4)
print()
print("=== C. 入装门槛对比 (二合, 上限3★, N=45, S=7) ===")
sweep("门槛1★ (掉落即装备)", threshold=1)
sweep("门槛2★", threshold=2)
sweep("门槛3★ (现行代码)", threshold=3)
print()
print("=== D. 卡槽数量 (二合, 上限3★, 门槛2★, N=45, 独立装备格) ===")
for S in (5, 6, 7, 8, 10):
    sweep(f"手牌 {S} 格", S=S)
print()
print("=== E. 装备占槽模型 (锁定即装备: 装备卡占手牌槽) ===")
for S in (7, 8, 10):
    sweep(f"共享 {S} 格 (锁定占槽)", S=S, lock_in_slot=True)
print()
print("=== F. 拾取预算敏感性 (二合, 3★, 门槛2★, S=7) ===")
for N in (30, 38, 45, 52, 60):
    sweep(f"N={N} 次拾取/局", N=N)
