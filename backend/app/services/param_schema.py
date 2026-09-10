"""Parameter schema contract (Chirag Section 3.3 + Items #4, #5).

Every engine declares a schema of the shape:

    {
        "family": "ema_cross_rsi",
        "variants": ["core"],
        "params": {
            "<group>": {
                "<field>": {"type": "int|number|date|enum|bool|string",
                             "default": ..., "min": ..., "max": ...,
                             "options": [...]}
            }
        },
        "constraints": ["ema_fast < ema_slow", ...],
        "holdout": {"enforced": true, "reserve_tail_months": 12}
    }

Two concerns live here:

  * validate_params(schema, params) — checks every submitted param against
    its field spec, then evaluates every constraint expression. Returns
    a list of violations; empty list means valid.

  * enforce_holdout(schema, params) — trims/rejects date_range if it
    would use the reserved tail window. Chirag Item #5's overfitting
    guardrail.

Constraint expressions are safe-evaluated with a whitelisted subset of
Python: comparison operators, arithmetic, and lookups into the flattened
params dict. NO import, NO attribute access, NO function calls.
"""

from __future__ import annotations

import ast
import operator
from datetime import date, datetime, timedelta
from typing import Any

# ── Supported field types ──────────────────────────────────────────

_TYPE_CHECKERS = {
    "int":    lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "bool":   lambda v: isinstance(v, bool),
    "string": lambda v: isinstance(v, str),
    "date":   lambda v: _is_iso_date(v),
    "enum":   lambda v: True,  # value-in-options checked separately
}


def _is_iso_date(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        datetime.strptime(v, "%Y-%m-%d")
        return True
    except ValueError:
        return False


# ── Public API ──────────────────────────────────────────────────────


class SchemaError(Exception):
    """Raised when the schema itself is malformed (developer error)."""


def flatten_params(schema: dict, params: dict) -> dict[str, Any]:
    """Merge groups so constraint expressions can reference `ema_fast`
    instead of `signal.ema_fast`. If two groups share a name, the later
    group wins - same rule as JSON merge.
    """
    flat: dict[str, Any] = {}
    for group_name, group_schema in (schema.get("params") or {}).items():
        submitted_group = params.get(group_name, {}) if isinstance(params, dict) else {}
        for field_name, spec in group_schema.items():
            if not isinstance(spec, dict):
                continue
            val = submitted_group.get(field_name, spec.get("default"))
            flat[field_name] = val
    return flat


def validate_params(schema: dict, params: dict) -> list[dict]:
    """Return a list of violations. Empty list = valid.

    Each violation is {'path': 'group.field', 'message': '...'}.
    """
    violations: list[dict] = []
    schema_params = schema.get("params") or {}
    if not isinstance(schema_params, dict):
        raise SchemaError("schema.params must be a dict of groups")

    for group_name, group_schema in schema_params.items():
        submitted_group = params.get(group_name, {}) if isinstance(params, dict) else {}
        if not isinstance(submitted_group, dict):
            violations.append({
                "path": group_name,
                "message": f"Expected a dict, got {type(submitted_group).__name__}",
            })
            continue
        for field_name, spec in group_schema.items():
            path = f"{group_name}.{field_name}"
            _validate_field(path, spec, submitted_group.get(field_name), violations)

    # Constraint expressions
    flat = flatten_params(schema, params)
    for expr in (schema.get("constraints") or []):
        try:
            ok = _safe_eval(expr, flat)
        except Exception as e:
            violations.append({"path": "constraints", "message": f"{expr}: {e}"})
            continue
        if not ok:
            violations.append({
                "path": "constraints",
                "message": f"Constraint failed: {expr}",
            })

    return violations


def enforce_holdout(schema: dict, params: dict) -> tuple[dict, list[dict]]:
    """Return (adjusted_params, violations). If holdout is enforced and the
    submitted date_range's `to` extends into the reserved tail window,
    clamp `to` down. If the whole range is inside the tail, add a
    violation instead.
    """
    holdout = schema.get("holdout") or {}
    if not holdout.get("enforced"):
        return params, []

    months = int(holdout.get("reserve_tail_months") or 0)
    if months <= 0:
        return params, []

    # Locate the date_range — Chirag's example lives under 'window_capital'
    # but the field name is fixed at 'start_date' / 'end_date'.
    window = (params.get("window_capital") if isinstance(params, dict) else None) or {}
    end_str = window.get("end_date") or window.get("date_range", {}).get("to")
    if not end_str:
        return params, []

    try:
        end_dt = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError:
        return params, [{"path": "window_capital.end_date", "message": "Invalid date format"}]

    cutoff = _months_before(date.today(), months)
    if end_dt <= cutoff:
        return params, []

    # Clamp end_date down to cutoff. If start_date > cutoff, the whole
    # window is inside the reserved tail — reject.
    start_str = window.get("start_date") or window.get("date_range", {}).get("from")
    if start_str:
        try:
            start_dt = datetime.strptime(start_str, "%Y-%m-%d").date()
            if start_dt >= cutoff:
                return params, [{
                    "path": "window_capital",
                    "message": (
                        f"Entire window is inside the reserved tail "
                        f"(last {months} months). Extend the start date back "
                        f"before {cutoff.isoformat()}."
                    ),
                }]
        except ValueError:
            pass

    new_params = _deep_copy(params)
    new_params.setdefault("window_capital", {})["end_date"] = cutoff.isoformat()
    return new_params, []


# ── Internals ───────────────────────────────────────────────────────


def _validate_field(path: str, spec: dict, value: Any, violations: list[dict]) -> None:
    if not isinstance(spec, dict):
        raise SchemaError(f"Malformed spec at {path}: {spec!r}")
    ftype = spec.get("type")
    if not ftype:
        raise SchemaError(f"Field {path} missing 'type'")
    # If value missing, only check required-ness (defaults handle omissions)
    if value is None:
        if spec.get("required") and "default" not in spec:
            violations.append({"path": path, "message": "Required field missing"})
        return
    checker = _TYPE_CHECKERS.get(ftype)
    if not checker:
        raise SchemaError(f"Unknown type at {path}: {ftype}")
    if not checker(value):
        violations.append({"path": path, "message": f"Expected {ftype}, got {type(value).__name__}"})
        return
    if ftype in ("int", "number"):
        lo = spec.get("min")
        hi = spec.get("max")
        if lo is not None and value < lo:
            violations.append({"path": path, "message": f"Value {value} < min {lo}"})
        if hi is not None and value > hi:
            violations.append({"path": path, "message": f"Value {value} > max {hi}"})
    if ftype == "enum":
        opts = spec.get("options") or []
        if value not in opts:
            violations.append({"path": path, "message": f"Value {value!r} not in {opts}"})


# Whitelisted AST nodes for safe constraint evaluation.
_ALLOWED_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv,
}
_ALLOWED_COMPARES = {
    ast.Lt: operator.lt, ast.LtE: operator.le,
    ast.Gt: operator.gt, ast.GtE: operator.ge,
    ast.Eq: operator.eq, ast.NotEq: operator.ne,
}
_ALLOWED_BOOLOPS = {ast.And: all, ast.Or: any}


def _safe_eval(expr: str, ctx: dict[str, Any]) -> bool:
    """Evaluate a constraint expression against ctx. Whitelist-only."""
    tree = ast.parse(expr, mode="eval")
    return bool(_eval(tree.body, ctx))


def _eval(node: ast.AST, ctx: dict[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in ctx:
            raise ValueError(f"unknown name: {node.id}")
        return ctx[node.id]
    if isinstance(node, ast.BinOp):
        op = _ALLOWED_BINOPS.get(type(node.op))
        if not op:
            raise ValueError(f"disallowed op: {type(node.op).__name__}")
        return op(_eval(node.left, ctx), _eval(node.right, ctx))
    if isinstance(node, ast.Compare):
        left = _eval(node.left, ctx)
        for op_node, right_node in zip(node.ops, node.comparators):
            op = _ALLOWED_COMPARES.get(type(op_node))
            if not op:
                raise ValueError(f"disallowed compare: {type(op_node).__name__}")
            right = _eval(right_node, ctx)
            if not op(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.BoolOp):
        op = _ALLOWED_BOOLOPS.get(type(node.op))
        if not op:
            raise ValueError(f"disallowed boolop: {type(node.op).__name__}")
        return op(_eval(v, ctx) for v in node.values)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval(node.operand, ctx)
    raise ValueError(f"disallowed node: {type(node).__name__}")


def _months_before(d: date, months: int) -> date:
    year = d.year
    month = d.month - months
    while month <= 0:
        month += 12
        year -= 1
    # Clamp day to 28 to avoid Feb-30 style errors; good-enough for a
    # holdout cutoff (few days of slop don't matter here).
    return date(year, month, min(d.day, 28))


def _deep_copy(d: Any) -> Any:
    if isinstance(d, dict):
        return {k: _deep_copy(v) for k, v in d.items()}
    if isinstance(d, list):
        return [_deep_copy(v) for v in d]
    return d
