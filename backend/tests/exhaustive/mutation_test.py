"""Schema mutation testing: take a known-valid backtest, mutate one field at a time,
and verify the validator catches the violation.

Every mutation that *should* fail but passes is a bug in the schema (too permissive).
Every mutation that *should* pass but fails is a bug in the schema (too strict).
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "schemas" / "backtest.schema.json"
EXAMPLE_PATH = ROOT / "schemas" / "backtest.example.json"


@dataclass
class Mutation:
    name: str
    apply: callable
    should_fail: bool  # True if validation should reject this


def m_delete_top_level(field: str) -> Mutation:
    def apply(d):
        del d[field]
        return d
    return Mutation(f"delete required top-level '{field}'", apply, should_fail=True)


def m_wrong_type_top_level(field: str, value) -> Mutation:
    def apply(d):
        d[field] = value
        return d
    return Mutation(f"top-level '{field}' = {value!r}", apply, should_fail=True)


def m_bad_enum(path: list[str], value) -> Mutation:
    def apply(d):
        cur = d
        for p in path[:-1]:
            cur = cur[p]
        cur[path[-1]] = value
        return d
    return Mutation(f"{'.'.join(path)} = {value!r}", apply, should_fail=True)


def m_extra_top_level(field: str) -> Mutation:
    def apply(d):
        d[field] = "extra"
        return d
    return Mutation(f"add unknown top-level '{field}'", apply, should_fail=True)


def m_short_pattern_violation(field: str, value: str) -> Mutation:
    def apply(d):
        d[field] = value
        return d
    return Mutation(f"top-level '{field}' = {value!r} (pattern violation)", apply, should_fail=True)


def m_no_op() -> Mutation:
    return Mutation("no-op (sanity)", lambda d: d, should_fail=False)


def m_remove_optional_extras() -> Mutation:
    def apply(d):
        d.pop("extras", None)
        return d
    return Mutation("remove optional 'extras'", apply, should_fail=False)


def m_extra_under_extras() -> Mutation:
    def apply(d):
        d.setdefault("extras", {})["whatever_garbage"] = {"nested": True}
        return d
    return Mutation("add custom key under extras (should be allowed)", apply, should_fail=False)


def m_empty_trades() -> Mutation:
    def apply(d):
        d["trades"] = []
        return d
    # Schema currently doesn't enforce minItems on trades — should pass
    return Mutation("trades = [] (empty)", apply, should_fail=False)


MUTATIONS = [
    m_no_op(),

    # Required field deletion
    m_delete_top_level("schema_version"),
    m_delete_top_level("result_type"),
    m_delete_top_level("backtest_id"),
    m_delete_top_level("strategy"),
    m_delete_top_level("assumptions"),
    m_delete_top_level("metrics"),
    m_delete_top_level("time_series"),
    m_delete_top_level("trades"),

    # Wrong types
    m_wrong_type_top_level("schema_version", 1.0),         # must be string
    m_wrong_type_top_level("backtest_id", 123),            # must be string
    m_wrong_type_top_level("trades", "not-an-array"),
    m_wrong_type_top_level("time_series", []),             # must be object

    # Bad enums
    m_bad_enum(["result_type"], "live_trading"),           # not in enum
    m_bad_enum(["schema_version"], "2.0"),                 # const violation
    m_bad_enum(["strategy", "type"], "long_short_neutral"),
    m_bad_enum(["strategy", "instrument_type"], "stocks"),
    m_bad_enum(["assumptions", "timeframe"], "1Y"),
    m_bad_enum(["assumptions", "execution"], "next_bar_open"),
    m_bad_enum(["assumptions", "brokerage", "type"], "per_contract_usd"),

    # Additional properties — schema is closed-form at top level
    m_extra_top_level("debug_info"),
    m_extra_top_level("my_custom_block"),

    # Pattern violation on backtest_id
    m_short_pattern_violation("backtest_id", "BT"),         # too short
    m_short_pattern_violation("backtest_id", "BT*invalid"), # bad char

    # Should be ALLOWED
    m_remove_optional_extras(),
    m_extra_under_extras(),
    m_empty_trades(),
]


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text())
    base = json.loads(EXAMPLE_PATH.read_text())
    validator = Draft202012Validator(schema)

    # Sanity: base must validate
    base_errors = list(validator.iter_errors(base))
    if base_errors:
        print(f"FATAL: base example fails validation: {base_errors[0].message}")
        return 1

    print(f"Running {len(MUTATIONS)} mutations against example…\n")
    bugs = 0
    for m in MUTATIONS:
        d = copy.deepcopy(base)
        d = m.apply(d)
        errors = list(validator.iter_errors(d))
        rejected = bool(errors)

        if m.should_fail and rejected:
            print(f"  ✅ correctly REJECTED  : {m.name}")
        elif (not m.should_fail) and (not rejected):
            print(f"  ✅ correctly ACCEPTED  : {m.name}")
        elif m.should_fail and not rejected:
            print(f"  ❌ FALSE NEGATIVE     : {m.name}  (schema is too permissive - should have rejected)")
            bugs += 1
        else:
            print(f"  ❌ FALSE POSITIVE     : {m.name}  (schema is too strict - should have accepted)")
            print(f"      first error: {errors[0].message}")
            bugs += 1

    print(f"\n{'-' * 60}")
    print(f"Total mutations: {len(MUTATIONS)} | bugs: {bugs}")
    return 0 if bugs == 0 else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
