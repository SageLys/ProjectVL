"""ProjectVL P4 合成经济敏感性蒙特卡洛。

默认主扫描复刻方案 B（锁定即装备）的关键运行时语义：

* 目录可有 12 张卡，但每局只从 active pool 中掉落；卡型在经济模型中等价。
* 普通拾取有 ``p2`` 概率直接为 2★；其余为 1★。
* 仅“尚无 3★ 且 1★ 等价值恰为 3”的类型获得定向掉落权重。
* 锁定卡跳过自动合成；达到 2★ 后尽快锁定不同类型，最多 ``max_locked`` 张。
* 未锁同型同星卡可显式喂养锁卡；自动合成和喂养均计一次 merge。
* 满槽拾取先记一次 cardsFull；bot 随后消耗未锁且类型进度最低的卡，再重试拾取。

同一 seed 与参数会产生字节稳定的 JSON/CSV（文件中不写墙钟时间）。权重扫描在相同
active pool / N 组合下共享随机数流，便于做配对敏感性比较。

示例：

    python docs/sim/merge_sim.py
    python docs/sim/merge_sim.py --runs 8000 --seed 20260712
    python docs/sim/merge_sim.py --types 5,7,12 --pickups 38,45 \
        --near-completion-weights 1,2.25 --legacy-sweep
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import statistics
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence


TOOL_VERSION = "2.0.0"
DEFAULT_SEED = 20260712
DEFAULT_RUNS = 4000
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "outputs" / "p4_20260712" / "sim"


@dataclass
class Card:
    type_id: int
    star: int
    locked: bool = False


@dataclass(frozen=True)
class MainScenario:
    catalog_size: int
    active_pool_size: int
    pickups: int
    shared_slots: int
    max_locked: int
    p2: float
    near_completion_weight: float
    merge_copies: int = 2
    max_star: int = 3
    equip_threshold: int = 2

    def stream_key(self) -> dict[str, int | float]:
        """权重不进入流 key，使同一 n/N 的权重方案共享均匀随机数。"""
        return {
            "catalogSize": self.catalog_size,
            "activePoolSize": self.active_pool_size,
            "pickups": self.pickups,
            "sharedSlots": self.shared_slots,
            "maxLocked": self.max_locked,
            "p2": self.p2,
            "mergeCopies": self.merge_copies,
            "maxStar": self.max_star,
            "equipThreshold": self.equip_threshold,
        }

    def output_dict(self) -> dict[str, int | float | str]:
        return {
            "catalogSize": self.catalog_size,
            "activePoolSize": self.active_pool_size,
            "activePoolSelection": "fixed-symmetric-loadout",
            "pickups": self.pickups,
            "sharedSlots": self.shared_slots,
            "maxLocked": self.max_locked,
            "p2": self.p2,
            "nearCompletionWeight": self.near_completion_weight,
            "mergeCopies": self.merge_copies,
            "maxStar": self.max_star,
            "equipThreshold": self.equip_threshold,
        }


@dataclass
class RunResult:
    merges: int = 0
    formed3: int = 0
    locked3: int = 0
    forcedConsumes: int = 0
    cardsFull: int = 0
    firstEquipAt: int | None = None
    first3At: int | None = None


class LockEconomyRun:
    """一局方案 B 经济状态；卡型对称，因此 active pool 固定取前 n 类。"""

    def __init__(self, scenario: MainScenario, rng: random.Random):
        self.scenario = scenario
        self.rng = rng
        self.active_types = tuple(range(scenario.active_pool_size))
        self.cards: list[Card] = []
        self.result = RunResult()

    def card_value(self, card: Card) -> int:
        return self.scenario.merge_copies ** (card.star - 1)

    def type_progress(self, type_id: int) -> int:
        return sum(self.card_value(card) for card in self.cards if card.type_id == type_id)

    def has_three_star(self, type_id: int) -> bool:
        return any(card.type_id == type_id and card.star >= 3 for card in self.cards)

    def drop_weight(self, type_id: int) -> float:
        # 与 runtime 口径一致：只补首张 3★，并且必须恰差 1 份 1★ 等价值。
        if not self.has_three_star(type_id) and self.type_progress(type_id) == 3:
            return self.scenario.near_completion_weight
        return 1.0

    def roll_drop_type(self) -> int:
        weights = [self.drop_weight(type_id) for type_id in self.active_types]
        roll = self.rng.random() * sum(weights)
        cumulative = 0.0
        for type_id, weight in zip(self.active_types, weights):
            cumulative += weight
            if roll < cumulative:
                return type_id
        return self.active_types[-1]

    def record_formed(self, result_star: int, pickup_index: int) -> None:
        if result_star != 3:
            return
        self.result.formed3 += 1
        if self.result.first3At is None:
            self.result.first3At = pickup_index

    def auto_merge(self, pickup_index: int) -> None:
        """按槽位顺序循环合成；锁定卡完全跳过。"""
        copies = self.scenario.merge_copies
        while True:
            merged = False
            for first_index, first in enumerate(self.cards):
                if first.locked or first.star >= self.scenario.max_star:
                    continue
                partners: list[int] = []
                for partner_index in range(first_index + 1, len(self.cards)):
                    partner = self.cards[partner_index]
                    if partner.locked:
                        continue
                    if partner.type_id == first.type_id and partner.star == first.star:
                        partners.append(partner_index)
                        if len(partners) == copies - 1:
                            break
                if len(partners) != copies - 1:
                    continue
                result_star = first.star + 1
                self.cards[first_index] = Card(first.type_id, result_star, locked=False)
                for partner_index in reversed(partners):
                    del self.cards[partner_index]
                self.result.merges += 1
                self.record_formed(result_star, pickup_index)
                merged = True
                break
            if not merged:
                return

    def feed_one_locked(self, pickup_index: int) -> bool:
        for target in self.cards:
            if not target.locked or target.star >= self.scenario.max_star:
                continue
            for source_index, source in enumerate(self.cards):
                if source is target or source.locked:
                    continue
                if source.type_id == target.type_id and source.star == target.star:
                    target.star += 1
                    del self.cards[source_index]
                    self.result.merges += 1
                    self.record_formed(target.star, pickup_index)
                    return True
        return False

    def lock_one_distinct_type(self, pickup_index: int) -> bool:
        locked_cards = [card for card in self.cards if card.locked]
        if len(locked_cards) >= self.scenario.max_locked:
            return False
        locked_types = {card.type_id for card in locked_cards}
        for card in self.cards:
            if card.locked or card.star < self.scenario.equip_threshold:
                continue
            if card.type_id in locked_types:
                continue
            card.locked = True
            if self.result.firstEquipAt is None:
                self.result.firstEquipAt = pickup_index
            return True
        return False

    def manage_equipment(self, pickup_index: int) -> None:
        # 复刻简单 bot：先喂已有装备，再把达到 2★ 门槛的不同类型尽快锁定。
        action_limit = len(self.cards) + self.scenario.max_locked + 4
        for _ in range(action_limit):
            if self.feed_one_locked(pickup_index):
                continue
            if self.lock_one_distinct_type(pickup_index):
                continue
            return
        raise RuntimeError("装备管理超过动作上限，疑似出现非收敛状态")

    def choose_forced_consume(self) -> int | None:
        candidates: list[tuple[tuple[int, int, int], int]] = []
        for index, card in enumerate(self.cards):
            if card.locked:
                continue
            key = (self.type_progress(card.type_id), card.star, index)
            candidates.append((key, index))
        return min(candidates)[1] if candidates else None

    def collect_drop(self, drop: Card, pickup_index: int) -> None:
        if len(self.cards) >= self.scenario.shared_slots:
            # runtime 先拒绝本次拾取；bot 看到 cardsFull 后才释放一张卡并重试。
            self.result.cardsFull += 1
            consume_index = self.choose_forced_consume()
            if consume_index is None:
                return
            del self.cards[consume_index]
            self.result.forcedConsumes += 1

        if len(self.cards) >= self.scenario.shared_slots:
            return
        self.cards.append(drop)
        self.auto_merge(pickup_index)
        self.manage_equipment(pickup_index)

    def run(self) -> RunResult:
        for pickup_index in range(1, self.scenario.pickups + 1):
            type_id = self.roll_drop_type()
            star = 2 if self.rng.random() < self.scenario.p2 else 1
            self.collect_drop(Card(type_id, star), pickup_index)
        self.result.locked3 = sum(1 for card in self.cards if card.locked and card.star >= 3)
        return self.result


def stable_seed(base_seed: int, payload: object) -> int:
    encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    digest = hashlib.blake2b(encoded, digest_size=8, person=b"P4MERGE").digest()
    return base_seed ^ int.from_bytes(digest, "big")


def splitmix64(value: int) -> int:
    value = (value + 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
    return value ^ (value >> 31)


def percentile(sorted_values: Sequence[float], probability: float) -> float:
    if not sorted_values:
        return math.nan
    position = (len(sorted_values) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(sorted_values[lower])
    fraction = position - lower
    return float(sorted_values[lower] * (1 - fraction) + sorted_values[upper] * fraction)


def distribution(values: Iterable[int | float]) -> dict[str, float | int]:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return {}
    return {
        "min": ordered[0],
        "p10": percentile(ordered, 0.10),
        "p25": percentile(ordered, 0.25),
        "p50": percentile(ordered, 0.50),
        "p75": percentile(ordered, 0.75),
        "p90": percentile(ordered, 0.90),
        "p95": percentile(ordered, 0.95),
        "max": ordered[-1],
        "mean": statistics.fmean(ordered),
    }


COUNT_METRICS = ("merges", "formed3", "locked3", "forcedConsumes", "cardsFull")
OPTIONAL_TIMING_METRICS = ("firstEquipAt", "first3At")


def summarize_main_scenario(
    scenario: MainScenario,
    runs: int,
    base_seed: int,
) -> tuple[dict[str, object], list[RunResult]]:
    stream_seed = stable_seed(base_seed, scenario.stream_key())
    results: list[RunResult] = []
    for run_index in range(runs):
        run_seed = splitmix64(stream_seed + run_index)
        results.append(LockEconomyRun(scenario, random.Random(run_seed)).run())

    metrics: dict[str, object] = {}
    for metric in COUNT_METRICS:
        metrics[metric] = distribution(getattr(result, metric) for result in results)
    for metric in OPTIONAL_TIMING_METRICS:
        observed = [getattr(result, metric) for result in results if getattr(result, metric) is not None]
        metrics[metric] = {
            "observed": len(observed),
            "missing": runs - len(observed),
            "completionRate": len(observed) / runs,
            "distributionCompleted": distribution(observed),
        }

    invariant_violations = sum(
        result.cardsFull != result.forcedConsumes for result in results
    )
    summary: dict[str, object] = {
        "scenario": scenario.output_dict(),
        "runs": runs,
        "streamSeed": stream_seed,
        "metrics": metrics,
        "invariants": {
            "cardsFullEqualsForcedConsumes": invariant_violations == 0,
            "violationRuns": invariant_violations,
        },
    }
    return summary, results


def flatten_main_summary(summary: dict[str, object]) -> dict[str, object]:
    row: dict[str, object] = {}
    scenario = summary["scenario"]
    assert isinstance(scenario, dict)
    row.update(scenario)
    row["runs"] = summary["runs"]
    row["streamSeed"] = summary["streamSeed"]
    metrics = summary["metrics"]
    assert isinstance(metrics, dict)
    for metric in COUNT_METRICS:
        metric_summary = metrics[metric]
        assert isinstance(metric_summary, dict)
        for stat, value in metric_summary.items():
            row[f"{metric}_{stat}"] = value
    for metric in OPTIONAL_TIMING_METRICS:
        timing = metrics[metric]
        assert isinstance(timing, dict)
        row[f"{metric}_completionRate"] = timing["completionRate"]
        row[f"{metric}_observed"] = timing["observed"]
        row[f"{metric}_missing"] = timing["missing"]
        timing_distribution = timing["distributionCompleted"]
        assert isinstance(timing_distribution, dict)
        for stat in ("min", "p10", "p25", "p50", "p75", "p90", "p95", "max", "mean"):
            row[f"{metric}_{stat}Completed"] = timing_distribution.get(stat, "")
    invariants = summary["invariants"]
    assert isinstance(invariants, dict)
    row["cardsFullEqualsForcedConsumes"] = invariants["cardsFullEqualsForcedConsumes"]
    row["invariantViolationRuns"] = invariants["violationRuns"]
    return row


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_csv(path: Path, rows: Sequence[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def print_main_table(summaries: Sequence[dict[str, object]]) -> None:
    header = (
        " pool  N  weight | merges  formed3 locked3 forced full | firstEq first3"
    )
    print(header)
    print("-" * len(header))
    for summary in summaries:
        scenario = summary["scenario"]
        metrics = summary["metrics"]
        assert isinstance(scenario, dict) and isinstance(metrics, dict)
        first_equip = metrics["firstEquipAt"]
        first_three = metrics["first3At"]
        assert isinstance(first_equip, dict) and isinstance(first_three, dict)
        first_equip_dist = first_equip["distributionCompleted"]
        first_three_dist = first_three["distributionCompleted"]
        assert isinstance(first_equip_dist, dict) and isinstance(first_three_dist, dict)
        print(
            f"{scenario['activePoolSize']:>5} {scenario['pickups']:>3} "
            f"{scenario['nearCompletionWeight']:>7.2f} | "
            f"{metrics['merges']['mean']:>6.2f} "
            f"{metrics['formed3']['mean']:>8.2f} "
            f"{metrics['locked3']['mean']:>7.2f} "
            f"{metrics['forcedConsumes']['mean']:>6.2f} "
            f"{metrics['cardsFull']['mean']:>4.2f} | "
            f"{first_equip_dist.get('p50', math.nan):>7.1f} "
            f"{first_three_dist.get('p50', math.nan):>6.1f}"
        )


# ---------------------------------------------------------------------------
# 旧 D1-D4 模型：保留原文档的独立装备格、贪婪合成/装备语义用于复跑历史结论。


def run_legacy(
    pickups: int = 45,
    hand_slots: int = 7,
    merge_copies: int = 2,
    max_star: int = 3,
    threshold: int = 2,
    p2: float = 0.05,
    types: int = 7,
    rng: random.Random | None = None,
) -> dict[str, int]:
    rng = rng or random.Random()
    hand: list[tuple[int, int]] = []
    equip: dict[int, int] = {}
    merges = forced = formed = 0
    first_equip: int | None = None
    first_top: int | None = None

    def try_merge(pickup_index: int) -> None:
        nonlocal merges, formed, first_top
        changed = True
        while changed:
            changed = False
            for type_id, star in list(hand):
                if star >= max_star or hand.count((type_id, star)) < merge_copies:
                    continue
                for _ in range(merge_copies):
                    hand.remove((type_id, star))
                hand.append((type_id, star + 1))
                merges += 1
                if star + 1 == max_star:
                    formed += 1
                    first_top = first_top or pickup_index
                changed = True
                break

    def try_equip(pickup_index: int) -> None:
        nonlocal merges, formed, first_equip, first_top
        changed = True
        while changed:
            changed = False
            for card in list(hand):
                type_id, star = card
                if star < threshold:
                    continue
                if type_id not in equip and len(equip) < 3:
                    equip[type_id] = star
                    hand.remove(card)
                    first_equip = first_equip or pickup_index
                    changed = True
                    break
                if type_id in equip and equip[type_id] == star and star < max_star:
                    equip[type_id] = star + 1
                    hand.remove(card)
                    merges += 1
                    if star + 1 == max_star:
                        formed += 1
                        first_top = first_top or pickup_index
                    changed = True
                    break
                if type_id in equip and star > equip[type_id]:
                    old_star = equip[type_id]
                    equip[type_id] = star
                    hand.remove(card)
                    hand.append((type_id, old_star))
                    changed = True
                    break

    def progress(type_id: int) -> int:
        value = sum(
            merge_copies ** (star - 1)
            for owned_type, star in hand
            if owned_type == type_id
        )
        if type_id in equip:
            value += merge_copies ** (equip[type_id] - 1)
        return value

    for pickup_index in range(1, pickups + 1):
        type_id = rng.randrange(types)
        star = 2 if rng.random() < p2 else 1
        if len(hand) >= hand_slots:
            try_merge(pickup_index)
        while len(hand) >= hand_slots:
            victim = min(hand, key=lambda card: (card[1], progress(card[0]), hand.index(card)))
            hand.remove(victim)
            forced += 1
        hand.append((type_id, star))
        try_merge(pickup_index)
        try_equip(pickup_index)

    return {
        "formed3": formed,
        "merges": merges,
        "forcedConsumes": forced,
        "firstEquipAt": first_equip or pickups + 1,
        "first3At": first_top or pickups + 1,
        "locked3": sum(1 for star in equip.values() if star == max_star),
    }


def legacy_cases() -> list[tuple[str, dict[str, int | float]]]:
    return [
        ("D2_binary", {"merge_copies": 2}),
        ("D2_ternary", {"merge_copies": 3}),
        ("D1_cap3", {"max_star": 3}),
        ("D1_cap4", {"max_star": 4}),
        ("D3_threshold1", {"threshold": 1}),
        ("D3_threshold2", {"threshold": 2}),
        ("D3_threshold3", {"threshold": 3}),
        ("D4_hand5", {"hand_slots": 5}),
        ("D4_hand6", {"hand_slots": 6}),
        ("D4_hand7", {"hand_slots": 7}),
        ("D4_hand8", {"hand_slots": 8}),
        ("D4_hand10", {"hand_slots": 10}),
    ]


def run_legacy_sweep(runs: int, seed: int) -> list[dict[str, object]]:
    summaries: list[dict[str, object]] = []
    for label, overrides in legacy_cases():
        rng = random.Random(seed)
        results = [run_legacy(rng=rng, **overrides) for _ in range(runs)]
        metrics = {
            metric: distribution(result[metric] for result in results)
            for metric in ("merges", "formed3", "locked3", "forcedConsumes", "firstEquipAt", "first3At")
        }
        summaries.append({
            "label": label,
            "overrides": overrides,
            "runs": runs,
            "seed": seed,
            "metrics": metrics,
        })
    return summaries


def flatten_legacy(summary: dict[str, object]) -> dict[str, object]:
    row: dict[str, object] = {
        "label": summary["label"],
        "runs": summary["runs"],
        "seed": summary["seed"],
        "overrides": json.dumps(summary["overrides"], ensure_ascii=False, sort_keys=True),
    }
    metrics = summary["metrics"]
    assert isinstance(metrics, dict)
    for metric, metric_summary in metrics.items():
        assert isinstance(metric_summary, dict)
        for stat, value in metric_summary.items():
            row[f"{metric}_{stat}"] = value
    return row


def parse_int_list(raw: str) -> list[int]:
    try:
        values = [int(value.strip()) for value in raw.split(",") if value.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"不是有效整数列表: {raw}") from exc
    if not values:
        raise argparse.ArgumentTypeError("列表不能为空")
    return values


def parse_float_list(raw: str) -> list[float]:
    try:
        values = [float(value.strip()) for value in raw.split(",") if value.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"不是有效数字列表: {raw}") from exc
    if not values:
        raise argparse.ArgumentTypeError("列表不能为空")
    return values


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ProjectVL P4 方案B合成经济敏感性蒙特卡洛",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--types", "--active-pool-sizes",
        dest="active_pool_sizes", type=parse_int_list, default=[5, 7, 12],
        help="每局有效掉落池大小，逗号分隔",
    )
    parser.add_argument("--catalog-size", type=int, default=12, help="全部已实现卡牌目录大小")
    parser.add_argument("--pickups", type=parse_int_list, default=[38, 45], help="每局有效拾取数，逗号分隔")
    parser.add_argument(
        "--weights", "--near-completion-weights",
        dest="weights", type=parse_float_list, default=[1.0, 2.25],
        help="差一份成首张3★时的定向权重，逗号分隔",
    )
    parser.add_argument("--shared-slots", type=int, default=10, help="方案B共享槽位数")
    parser.add_argument("--max-locked", type=int, default=3, help="最多锁定装备数")
    parser.add_argument("--p2", type=float, default=0.05, help="拾取直接为2★的概率")
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS, help="每个参数组合的局数")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="全局可复现种子")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="JSON/CSV 输出目录")
    parser.add_argument("--legacy-sweep", action="store_true", help="同时复跑旧独立装备格 D1-D4 扫描")
    parser.add_argument("--quiet", action="store_true", help="不打印摘要表，只写文件")
    return parser


def validate_args(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    if args.runs <= 0:
        parser.error("--runs 必须大于 0")
    if args.catalog_size <= 0:
        parser.error("--catalog-size 必须大于 0")
    if any(value <= 0 or value > args.catalog_size for value in args.active_pool_sizes):
        parser.error("每个 active pool 大小必须位于 1..catalog-size")
    if any(value <= 0 for value in args.pickups):
        parser.error("每个 pickups 必须大于 0")
    if any(value <= 0 for value in args.weights):
        parser.error("定向权重必须大于 0")
    if args.shared_slots <= 0:
        parser.error("--shared-slots 必须大于 0")
    if args.max_locked < 0 or args.max_locked >= args.shared_slots:
        parser.error("--max-locked 必须位于 0..shared-slots-1")
    if not 0 <= args.p2 <= 1:
        parser.error("--p2 必须位于 0..1")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)
    output_dir = args.output_dir.resolve()

    scenarios = [
        MainScenario(
            catalog_size=args.catalog_size,
            active_pool_size=active_pool_size,
            pickups=pickups,
            shared_slots=args.shared_slots,
            max_locked=args.max_locked,
            p2=args.p2,
            near_completion_weight=weight,
        )
        for active_pool_size in args.active_pool_sizes
        for pickups in args.pickups
        for weight in args.weights
    ]
    summaries = [
        summarize_main_scenario(scenario, args.runs, args.seed)[0]
        for scenario in scenarios
    ]

    main_payload = {
        "schemaVersion": "1.0.0",
        "toolVersion": TOOL_VERSION,
        "model": "lock-equip-shared-slots-runtime-approximation",
        "seed": args.seed,
        "runsPerScenario": args.runs,
        "scenarioCount": len(summaries),
        "notes": [
            "active pool 中卡型经济上对称；fixed-symmetric-loadout 等价于从 catalog 选择任意同规模组合。",
            "N 是有效拾取预算，不含掉率、过期和反应延迟；这些由完整 headless simulator 建模。",
            "p2=0.05 是P4经济敏感性假设，不代表普通击杀运行时必有5%二星掉落。",
            "cardsFull 先发生，bot 消耗后重试；在合法槽位参数下应与 forcedConsumes 一一对应。",
        ],
        "summaries": summaries,
    }
    main_json = output_dir / "merge_sim_summary.json"
    main_csv = output_dir / "merge_sim_summary.csv"
    write_json(main_json, main_payload)
    write_csv(main_csv, [flatten_main_summary(summary) for summary in summaries])

    if not args.quiet:
        print_main_table(summaries)
        print(f"\nJSON: {main_json}")
        print(f"CSV : {main_csv}")

    if args.legacy_sweep:
        legacy = run_legacy_sweep(args.runs, args.seed)
        legacy_payload = {
            "schemaVersion": "1.0.0",
            "toolVersion": TOOL_VERSION,
            "model": "legacy-independent-equip-slots",
            "seed": args.seed,
            "runsPerScenario": args.runs,
            "summaries": legacy,
        }
        legacy_json = output_dir / "merge_sim_legacy_summary.json"
        legacy_csv = output_dir / "merge_sim_legacy_summary.csv"
        write_json(legacy_json, legacy_payload)
        write_csv(legacy_csv, [flatten_legacy(summary) for summary in legacy])
        if not args.quiet:
            print(f"Legacy JSON: {legacy_json}")
            print(f"Legacy CSV : {legacy_csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
