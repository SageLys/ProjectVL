#!/usr/bin/env python3
"""Deterministic cross-card branch audit used by the V15 content gate."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "src" / "config" / "base" / "skills.json"


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main() -> int:
    payload = json.loads(SKILLS.read_text(encoding="utf-8"))
    groups: dict[str, list[str]] = defaultdict(list)
    branch_count = 0
    for card in payload["cards"]:
        if card.get("recipeOnly"):
            continue
        for checkpoint in card["evolutionTree"]["checkpoints"]:
            for option in checkpoint["options"]:
                branch_count += 1
                bindings = sorted(canonical(binding) for binding in option["equip"])
                groups["|".join(bindings)].append(f"{card['id']}/{option['id']}")

    duplicates = [members for members in groups.values()
                  if len({member.split("/", 1)[0] for member in members}) > 1]
    print(f"base branches: {branch_count}")
    print(f"cross-card isomorphic groups: {len(duplicates)}")
    for members in duplicates:
        print("  " + " = ".join(members))
    return 1 if duplicates else 0


if __name__ == "__main__":
    raise SystemExit(main())
