"""Plotly grafikleri: tam dağılımdan görünüm, şut haritası ve xG akışı."""

import numpy as np
import plotly.graph_objects as go

from goal_illusion.analysis import Analysis
from goal_illusion.data import MatchData, Shot

HOME_COLOR = "#B6F36B"
AWAY_COLOR = "#69B9FF"
TEXT_COLOR = "#EBF1F5"


def shot_time(shot: Shot) -> str:
    if shot.second is None:
        added = f"+{shot.added_minutes}" if shot.added_minutes else ""
        return f"{shot.minute}{added}′"
    return f"{shot.minute}:{shot.second:02d}"


def style(figure: go.Figure, height: int = 360) -> go.Figure:
    figure.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=TEXT_COLOR),
        margin=dict(l=20, r=20, t=30, b=35),
        height=height,
        legend=dict(orientation="h", y=1.12, x=0),
    )
    return figure


def outcome_chart(result: Analysis, home: str, away: str) -> go.Figure:
    values = [result.home_win, result.draw, result.away_win]
    figure = go.Figure(
        go.Bar(
            x=[home, "Beraberlik", away],
            y=values,
            marker_color=[HOME_COLOR, "#94A4B2", AWAY_COLOR],
            text=[f"%{value * 100:.1f}" for value in values],
            textposition="outside",
            hovertemplate="%{x}: %{y:.1%}<extra></extra>",
        )
    )
    figure.update_yaxes(range=[0, 1.08], tickformat=".0%", gridcolor="#26333D")
    figure.update_xaxes(showgrid=False)
    return style(figure, 260)


def score_heatmap(result: Analysis, home: str, away: str) -> tuple[go.Figure, float]:
    def limit(pmf: np.ndarray) -> int:
        return min(len(pmf), max(5, min(9, int(np.searchsorted(pmf.cumsum(), 0.995)) + 1)))

    h, a = limit(result.home_pmf), limit(result.away_pmf)
    visible = result.score_matrix[:h, :a]
    figure = go.Figure(
        go.Heatmap(
            z=visible,
            x=list(range(a)),
            y=list(range(h)),
            colorscale=[[0, "#172129"], [0.4, "#3C775C"], [1, HOME_COLOR]],
            text=[[f"%{v * 100:.1f}" for v in row] for row in visible],
            texttemplate="%{text}",
            hovertemplate=f"{home}: %{{y}} · {away}: %{{x}}<br>Olasılık: %{{z:.2%}}<extra></extra>",
            colorbar=dict(tickformat=".0%", title="Olasılık"),
            xgap=3,
            ygap=3,
        )
    )
    figure.update_xaxes(title=f"{away} gol", dtick=1, side="bottom")
    figure.update_yaxes(title=f"{home} gol", dtick=1, autorange="reversed")
    return style(figure, 420), max(0.0, 1 - float(visible.sum()))


def shot_map(data: MatchData) -> go.Figure:
    figure = go.Figure()
    line = dict(color="#52675C", width=1.4)
    figure.add_shape(type="rect", x0=0, y0=0, x1=120, y1=80, line=line)
    figure.add_shape(type="line", x0=60, y0=0, x1=60, y1=80, line=line)
    figure.add_shape(type="circle", x0=50, y0=30, x1=70, y1=50, line=line)
    for left in (True, False):
        figure.add_shape(
            type="rect",
            x0=0 if left else 102,
            x1=18 if left else 120,
            y0=18,
            y1=62,
            line=line,
        )
        figure.add_shape(
            type="rect",
            x0=0 if left else 114,
            x1=6 if left else 120,
            y0=30,
            y1=50,
            line=line,
        )
        figure.add_shape(
            type="rect",
            x0=-2 if left else 120,
            x1=0 if left else 122,
            y0=36,
            y1=44,
            line=line,
        )
    for team, name, color in (
        (data.match.home_id, data.match.home, HOME_COLOR),
        (data.match.away_id, data.match.away, AWAY_COLOR),
    ):
        for is_goal in (False, True):
            shots = [
                s
                for s in data.shots_for(team)
                if s.x is not None and (s.outcome == "Goal") == is_goal
            ]
            if not shots:
                continue
            home = team == data.match.home_id
            figure.add_trace(
                go.Scatter(
                    x=[s.x if home else 120 - s.x for s in shots],
                    y=[s.y if home else 80 - s.y for s in shots],
                    mode="markers",
                    name=f"{name} · {'Gol' if is_goal else 'Şut'}",
                    marker=dict(
                        size=[9 + 30 * s.xg**0.5 for s in shots],
                        color=color,
                        symbol="star" if is_goal else "circle",
                        opacity=1 if is_goal else 0.65,
                        line=dict(color=TEXT_COLOR if is_goal else color, width=1),
                    ),
                    customdata=[
                        [
                            s.player,
                            shot_time(s),
                            s.xg,
                            "Gol" if is_goal else s.outcome,
                        ]
                        for s in shots
                    ],
                    hovertemplate="%{customdata[0]}<br>%{customdata[1]} · xG %{customdata[2]:.3f}"
                    "<br>%{customdata[3]}<extra>%{fullData.name}</extra>",
                )
            )
    figure.update_xaxes(range=[-4, 124], visible=False, fixedrange=True)
    figure.update_yaxes(
        range=[84, -4], visible=False, scaleanchor="x", scaleratio=1, fixedrange=True
    )
    figure.update_layout(plot_bgcolor="#13251D")
    figure = style(figure, 440)
    figure.update_layout(plot_bgcolor="#13251D")
    return figure


def xg_race(data: MatchData) -> go.Figure:
    figure = go.Figure()
    for team, name, color in (
        (data.match.home_id, data.match.home, HOME_COLOR),
        (data.match.away_id, data.match.away, AWAY_COLOR),
    ):
        shots = data.shots_for(team)
        cumulative = np.cumsum([s.xg for s in shots]).tolist()
        total = cumulative[-1] if cumulative else 0.0
        figure.add_trace(
            go.Scatter(
                x=[0] + [s.elapsed_minutes for s in shots] + [data.timeline_end],
                y=[0] + cumulative + [total],
                mode="lines",
                name=name,
                line=dict(color=color, width=3, shape="hv"),
                hovertemplate="Geçen süre: %{x:.1f} dk<br>Toplam xG: %{y:.2f}<extra>%{fullData.name}</extra>",
            )
        )
        goals = [(s, value) for s, value in zip(shots, cumulative) if s.outcome == "Goal"]
        if goals:
            figure.add_trace(
                go.Scatter(
                    x=[s.elapsed_minutes for s, _ in goals],
                    y=[value for _, value in goals],
                    mode="markers",
                    name=f"{name} gol",
                    showlegend=False,
                    marker=dict(color=color, size=13, symbol="star"),
                    customdata=[[s.player, shot_time(s)] for s, _ in goals],
                    hovertemplate="Gol · %{customdata[0]}<br>%{customdata[1]}<extra></extra>",
                )
            )
    for boundary in data.period_boundaries:
        figure.add_vline(x=boundary, line_dash="dot", line_color="#52616C")
    figure.update_xaxes(
        title="Geçen oyun süresi (duraklama dakikaları dahil)",
        range=[0, data.timeline_end],
        gridcolor="#26333D",
    )
    figure.update_yaxes(title="Birikimli xG", rangemode="tozero", gridcolor="#26333D")
    return style(figure, 360)
