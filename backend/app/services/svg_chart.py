"""Zero-dependency SVG chart generator for embedding in the PDF report.

WeasyPrint renders inline SVG crisply at any print size, so we avoid the
matplotlib footprint (~200MB) and just emit the SVG we actually need.

Two chart types:
  * line_chart(values)  — equity curve. Simple polyline, mid-line, y-axis
  * area_chart(values)  — drawdown. Filled area below zero, negative-only

Both accept a simple list of floats and take care of viewport normalisation.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ChartStyle:
    width: int = 800
    height: int = 240
    padding_left: int = 44
    padding_right: int = 12
    padding_top: int = 12
    padding_bottom: int = 24
    stroke: str = "#0284c7"      # accent-600 (sky)
    fill: str = "rgba(2,132,199,0.14)"
    axis: str = "#94a3b8"        # slate-400
    grid: str = "#e2e8f0"        # slate-200
    text: str = "#334155"        # slate-700


def _project(values: list[float], style: ChartStyle) -> tuple[list[tuple[float, float]], float, float]:
    n = len(values)
    plot_w = style.width - style.padding_left - style.padding_right
    plot_h = style.height - style.padding_top - style.padding_bottom
    lo = min(values)
    hi = max(values)
    span = (hi - lo) or 1.0
    step = plot_w / max(n - 1, 1)
    points: list[tuple[float, float]] = []
    for i, v in enumerate(values):
        x = style.padding_left + i * step
        y = style.padding_top + plot_h - (v - lo) / span * plot_h
        points.append((x, y))
    return points, lo, hi


def _grid_and_axes(style: ChartStyle, y_lo: float, y_hi: float, y_zero_line: bool = False) -> str:
    """Two mid-height grid lines + axis rulings. Simple, unobtrusive."""
    plot_w = style.width - style.padding_left - style.padding_right
    parts: list[str] = []
    # Horizontal grid at 25/50/75%
    for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
        y = style.padding_top + (style.height - style.padding_top - style.padding_bottom) * frac
        parts.append(
            f'<line x1="{style.padding_left}" x2="{style.padding_left + plot_w}" '
            f'y1="{y}" y2="{y}" stroke="{style.grid}" stroke-width="0.5"/>'
        )
        # Y-axis label
        val = y_hi - (y_hi - y_lo) * frac
        parts.append(
            f'<text x="{style.padding_left - 4}" y="{y + 3}" text-anchor="end" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="8" fill="{style.text}">'
            f'{val:,.1f}</text>'
        )
    return "".join(parts)


def line_chart(values: list[float], style: ChartStyle | None = None, unit: str = "") -> str:
    if not values:
        return f'<svg viewBox="0 0 800 240" xmlns="http://www.w3.org/2000/svg"><text x="400" y="120" text-anchor="middle" fill="#94a3b8" font-family="Helvetica" font-size="12">No data</text></svg>'
    style = style or ChartStyle()
    points, lo, hi = _project(values, style)
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    grid = _grid_and_axes(style, lo, hi)
    unit_lbl = f' <tspan fill="{style.axis}">{unit}</tspan>' if unit else ""
    return (
        f'<svg viewBox="0 0 {style.width} {style.height}" xmlns="http://www.w3.org/2000/svg" '
        f'style="width:100%; height:auto; display:block">'
        f'{grid}'
        f'<polyline points="{path}" fill="none" stroke="{style.stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
        f'</svg>'
    )


def area_chart(values: list[float], style: ChartStyle | None = None, negative: bool = True) -> str:
    """Filled area under (or over) a baseline. `negative=True` means the
    chart floor is 0 and the fill extends downward - used for drawdown."""
    if not values:
        return line_chart(values, style)
    style = style or ChartStyle(stroke="#dc2626", fill="rgba(220,38,38,0.14)")
    # For drawdown we want zero on top and negatives below. Force the range
    # to include zero at the top of the plot.
    lo = min(min(values), 0.0)
    hi = max(max(values), 0.0)
    span = (hi - lo) or 1.0
    plot_w = style.width - style.padding_left - style.padding_right
    plot_h = style.height - style.padding_top - style.padding_bottom
    step = plot_w / max(len(values) - 1, 1)
    zero_y = style.padding_top + plot_h - (0.0 - lo) / span * plot_h
    points = []
    for i, v in enumerate(values):
        x = style.padding_left + i * step
        y = style.padding_top + plot_h - (v - lo) / span * plot_h
        points.append((x, y))
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    first_x = points[0][0]
    last_x = points[-1][0]
    area_path = f"M {first_x:.1f} {zero_y:.1f} L {poly} L {last_x:.1f} {zero_y:.1f} Z"
    grid = _grid_and_axes(style, lo, hi)
    return (
        f'<svg viewBox="0 0 {style.width} {style.height}" xmlns="http://www.w3.org/2000/svg" '
        f'style="width:100%; height:auto; display:block">'
        f'{grid}'
        f'<path d="{area_path}" fill="{style.fill}" stroke="none"/>'
        f'<polyline points="{poly}" fill="none" stroke="{style.stroke}" stroke-width="1.4" stroke-linejoin="round"/>'
        f'<line x1="{style.padding_left}" x2="{style.padding_left + plot_w}" y1="{zero_y}" y2="{zero_y}" stroke="{style.axis}" stroke-width="0.8" stroke-dasharray="2,2"/>'
        f'</svg>'
    )
