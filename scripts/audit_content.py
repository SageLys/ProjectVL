#!/usr/bin/env python3
"""内容设计体检：原子扩散度 / 标签构成 / 进化分叉差异 / 同类卡同质化。

用法：python3 scripts/audit_content.py [--md]
数据源：src/config/base/skills.json + gods.json（改完内容直接重跑）。
判据见 docs/内容差异化与联动体系_诊断与方案.md。
"""
import json, sys, collections, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CN = {'storm': '迅霆', 'winter': '凛冬', 'inferno': '焚狱', 'bulwark': '磐垒', 'plenty': '丰饶'}
TAG = {'projectile': '弹道', 'control': '控制', 'domain': '领域',
       'defense': '防御', 'utility': '增益', 'economy': '经济'}
CATS = ['projectile', 'control', 'domain', 'defense', 'economy']
TAGS = ['projectile', 'control', 'domain', 'defense', 'utility']


def load():
    with open(os.path.join(ROOT, 'src/config/base/skills.json'), encoding='utf-8') as f:
        cards = json.load(f)['cards']
    with open(os.path.join(ROOT, 'src/config/base/gods.json'), encoding='utf-8') as f:
        gods = json.load(f)['gods']
    return cards, gods


def walk(node, out):
    if isinstance(node, dict):
        if 'atom' in node:
            out['atoms'].append(node['atom'])
        if 'trigger' in node:
            out['triggers'].append(node['trigger'])
        if 'triggerParams' in node:
            tp = node['triggerParams']
            for key in ('requiresStatus', 'requiresSource'):
                if key in tp:
                    out['gates'].append((key, tp[key]))
        for v in node.values():
            walk(v, out)
    elif isinstance(node, list):
        for v in node:
            walk(v, out)


def scan(card):
    out = {'atoms': [], 'triggers': [], 'gates': []}
    for key in ('stars', 'evolutionTree', 'consumable'):
        walk(card.get(key, {}), out)
    return out


def sig(blocks):
    return tuple(sorted(
        (b.get('trigger'), tuple(sorted(e['atom'] for e in b.get('effects', []))))
        for b in blocks or []
    ))


def branch_kind(options):
    sigs = [sig(o.get('equip')) for o in options]
    if len(set(sigs)) == 1:
        return '纯数值差异'
    asets = [set(a for _, ats in s for a in ats) for s in sigs]
    if set().union(*asets) - set.intersection(*asets):
        return '有不同原子'
    tsets = [set(t for t, _ in s) for s in sigs]
    if set().union(*tsets) - set.intersection(*tsets):
        return '仅触发器不同'
    return '其他结构差异'


def main():
    cards, gods = load()
    by_id = {c['id']: c for c in cards}
    scans = {c['id']: scan(c) for c in cards}

    print('=' * 62)
    print('[1] 原子跨神扩散度  —— 越多神共用 = 神池区分性越弱')
    print('=' * 62)
    atom_gods = collections.defaultdict(set)
    for c in cards:
        for a in set(scans[c['id']]['atoms']):
            atom_gods[a].add(c['god'])
    buckets = collections.Counter(len(v) for v in atom_gods.values())
    for a, gs in sorted(atom_gods.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        flag = ' <<< 全神共用' if len(gs) == 5 else (' <<< 独占' if len(gs) == 1 else '')
        print(f'  {a:22s} {len(gs)}神 {sorted(CN[g] for g in gs)}{flag}')
    print(f'  汇总 扩散度分布: {dict(sorted(buckets.items()))}   '
          f'(独占原子 {buckets.get(1,0)} 个 / 共 {len(atom_gods)} 个)')

    print()
    print('=' * 62)
    print('[2] 每神标签与类别构成')
    print('=' * 62)
    print('  主类别   | ' + ' | '.join(f'{TAG[k]:>4s}' for k in CATS))
    for g in gods:
        roster = g['anchorCardIds'] + g['variableCardIds']
        c = collections.Counter(by_id[x]['category'] for x in roster)
        print(f'  {CN[g["id"]]}    | ' + ' | '.join(f'{c.get(k,0):>4d}' for k in CATS))
    print('  协同标签 | ' + ' | '.join(f'{TAG[k]:>4s}' for k in TAGS))
    for g in gods:
        roster = g['anchorCardIds'] + g['variableCardIds']
        c = collections.Counter(x for r in roster for x in by_id[r]['synergyTags'])
        tot = sum(c.values())
        print(f'  {CN[g["id"]]}    | ' + ' | '.join(f'{c.get(k,0):>4d}' for k in TAGS)
              + f'   (主标签占比 {max(c.values())/tot:.0%})')

    print()
    print('=' * 62)
    print('[3] 进化分叉差异体检  —— 口径：选项两两比对（比"三个全同"严格得多）')
    print('=' * 62)
    import itertools
    for star in (3, 5):
        tot = iso = 0
        with_iso = all_diff = all_same = 0
        detail = []
        for c in cards:
            for cp in (c.get('evolutionTree') or {}).get('checkpoints', []):
                if cp['star'] != star:
                    continue
                sigs = [sig(o.get('equip')) for o in cp['options']]
                pairs = list(itertools.combinations(range(len(sigs)), 2))
                n = sum(1 for i, j in pairs if sigs[i] == sigs[j])
                tot += len(pairs)
                iso += n
                if n:
                    with_iso += 1
                    detail.append((CN[c['god']], c['id'], n))
                if len(set(sigs)) == len(sigs):
                    all_diff += 1
                if len(set(sigs)) == 1:
                    all_same += 1
        print(f'  {star}★: 选项对 {tot} 组，结构同构 {iso} 组 ({iso/tot:.0%} 若 tot 非零)'
              if tot else f'  {star}★: 无检查点')
        print(f'      至少一对同构的卡 {with_iso} 张 / 三选项全不同 {all_diff} 张 / 三选项全同构 {all_same} 张')
        if star == 3 and detail:
            print('      同构最重的卡: ' + ' ; '.join(
                f'{g}·{cid}({n}对)' for g, cid, n in sorted(detail, key=lambda x: -x[2])[:8]))

    print()
    print('=' * 62)
    print('[4] 联动闸门覆盖率  —— requiresStatus/requiresSource = 唯一的卡间联动原语')
    print('=' * 62)
    gated = [c['id'] for c in cards if scans[c['id']]['gates']]
    print(f'  含闸门的卡: {len(gated)}/{len(cards)}  ({len(gated)/len(cards):.0%})')
    gate_ct = collections.Counter(g for c in cards for g in scans[c['id']]['gates'])
    for (kind, val), n in gate_ct.most_common():
        print(f'    {kind}={val:14s} {n}')
    for g in gods:
        roster = g['anchorCardIds'] + g['variableCardIds']
        n = sum(1 for x in roster if scans[x]['gates'])
        print(f'    {CN[g["id"]]} 闸门卡 {n}/{len(roster)}')

    print()
    print('=' * 62)
    print('[5] 同类卡跨神同质化  —— 同 category 的卡，3★ 结构指纹是否重复')
    print('=' * 62)
    for cat in CATS:
        group = [c for c in cards if c['category'] == cat and not c.get('recipeOnly')]
        fp = {}
        for c in group:
            s = (c.get('stars') or {}).get('3')
            if not s:
                continue
            fp.setdefault(sig(s.get('equip')), []).append(f'{CN[c["god"]]}·{c["id"]}')
        dup = {k: v for k, v in fp.items() if len(v) > 1}
        print(f'  {TAG[cat]}: {len(group)} 卡 / {len(fp)} 种 3★ 结构指纹'
              + ('  <<< 重复: ' + ' ; '.join('='.join(v) for v in dup.values()) if dup else ''))



    print()
    print('=' * 62)
    print('[6] 运行时陷阱  —— 这些不是平衡问题，是静默失效')
    print('=' * 62)
    # 6a: onKill/onBreach 直接作用于已移除敌人
    DIRECT = {'burstDamage', 'slow', 'freeze', 'stun', 'vulnerable', 'dot', 'knockback', 'execute'}
    dead = collections.Counter()

    def scan_dead(node, cid):
        if isinstance(node, dict):
            if node.get('trigger') in ('onKill', 'onBreach'):
                for e in node.get('effects', []):
                    if e['atom'] in DIRECT:
                        dead[(cid, node['trigger'], e['atom'])] += 1
            for v in node.values():
                scan_dead(v, cid)
        elif isinstance(node, list):
            for v in node:
                scan_dead(v, cid)

    for c in cards:
        scan_dead(c, c['id'])
    print(f'  6a 打空风险(onKill/onBreach → 直接作用敌人): {sum(dead.values())} 处绑定 / '
          f'{len(set(k[0] for k in dead))} 张卡')
    for (cid, trg, atom), n in sorted(dead.items(), key=lambda kv: -kv[1])[:10]:
        print(f'     {cid:16s} {trg:9s} → {atom:12s} ×{n}')

    # 6b: 6★ 公共节点重复声明分支已用的"取最大/后写覆盖"原子
    OVERWRITE = {'shield', 'novaOnBreak', 'expiryConvert', 'breachReduction', 'execute'}

    def atomset(blocks):
        return set(e['atom'] for b in blocks or [] for e in b.get('effects', []))

    clashes = []
    for c in cards:
        et = c.get('evolutionTree')
        if not et:
            continue
        s6 = next((n for n in et.get('sharedNodes', []) if n['star'] == 6), None)
        if not s6 or not s6.get('equip'):
            continue
        a6 = atomset(s6['equip'])
        for cp in et['checkpoints']:
            for o in cp['options']:
                hit = atomset(o.get('equip')) & a6 & OVERWRITE
                if hit:
                    clashes.append((CN[c['god']], c['id'], cp['star'], o['id'], sorted(hit)))
    print(f'  6b 6★覆盖分支(重复声明取最大/后写覆盖原子): {len(clashes)} 处')
    for g, cid, star, oid, hit in clashes[:10]:
        print(f'     {g} {cid:16s} {star}\u2605 {oid} 撞 {hit}')

    # 6c: requiresSource 是否为运行时真实产生的来源
    REAL_SOURCES = {'weapon', 'chain', 'dot'}
    bad = []

    def scan_src(node, cid):
        if isinstance(node, dict):
            tp = node.get('triggerParams') or {}
            src = tp.get('requiresSource')
            if src and src not in REAL_SOURCES:
                bad.append((cid, src))
            for v in node.values():
                scan_src(v, cid)
        elif isinstance(node, list):
            for v in node:
                scan_src(v, cid)

    for c in cards:
        scan_src(c, c['id'])
    print(f'  6c 不可达 requiresSource: {len(bad)} 处  {sorted(set(bad))}')

    # 6d: 已实现但零使用的原子
    used = set(a for sc in scans.values() for a in sc['atoms'])
    try:
        contract = open(os.path.join(ROOT, 'src/core/effects/atomContract.ts'), encoding='utf-8').read()
        declared = set(re.findall(r'\n  (\w+): \{\n    category:', contract))
        unused = sorted(declared - used)
        print(f'  6d 已实现但 35 卡零使用的原子: {len(unused)}  {unused}')
    except Exception as exc:
        print(f'  6d 跳过: {exc}')


if __name__ == '__main__':
    main()
