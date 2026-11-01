"""Spec-driven Manim scenes for Studio V2.

Reads V2_MANIM_SPEC (JSON path): {width,height,portrait,palette,scenes:[...]}.
Each Scene_i class renders plan scene i at the scene's exact target duration so
concatenated segments line up with the narration timeline.
"""
import json
import math
import os

from manim import (
    ArcBetweenPoints, Arrow, Circle, CurvedArrow, Dot, FadeIn, GrowArrow, Line, MoveAlongPath,
    RoundedRectangle, Scene, Sector, Square, Text, Transform, VGroup, Write,
    Create, GrowFromCenter, Indicate, DOWN, LEFT, ORIGIN, RIGHT, UP, np,
)

SPEC = json.load(open(os.environ["V2_MANIM_SPEC"]))
P = SPEC["palette"]
FONT = "Helvetica Neue"


def T(s, size=0.7, color=None, weight=""):
    kwargs = {"font": FONT, "font_size": size * 48, "color": color or P["ink"]}
    if weight:
        kwargs["weight"] = weight
    return Text(str(s), **kwargs)


def node_icon(label, color):
    """Small pictorial glyphs drawn from manim primitives."""
    t = label.lower()
    g = VGroup()
    if any(k in t for k in ("sun", "solar", "heat", "warm", "energy", "light")):
        g.add(Circle(radius=0.22, fill_color="#e0a533", fill_opacity=1, stroke_width=0))
        for i in range(8):
            a = i * math.pi / 4
            g.add(Line([math.cos(a) * 0.34, math.sin(a) * 0.34, 0], [math.cos(a) * 0.48, math.sin(a) * 0.48, 0], color="#e0a533", stroke_width=5))
    elif any(k in t for k in ("cloud", "condens", "vapor", "vapour", "fog", "steam", "sky")):
        c = VGroup(
            Circle(radius=0.2, fill_color=color, fill_opacity=1, stroke_width=0).shift(LEFT * 0.16 + UP * 0.02),
            Circle(radius=0.26, fill_color=color, fill_opacity=1, stroke_width=0).shift(RIGHT * 0.12 + UP * 0.1),
            RoundedRectangle(corner_radius=0.12,height=0.24,width=0.7, fill_color=color, fill_opacity=1, stroke_width=0).shift(DOWN * 0.12),
        )
        g.add(c)
    elif any(k in t for k in ("rain", "precip", "snow", "storm", "drizzle", "hail", "sleet", "fall")):
        c = VGroup(
            Circle(radius=0.16, fill_color=color, fill_opacity=1, stroke_width=0).shift(LEFT * 0.13 + UP * 0.14),
            Circle(radius=0.2, fill_color=color, fill_opacity=1, stroke_width=0).shift(RIGHT * 0.1 + UP * 0.2),
            RoundedRectangle(corner_radius=0.1,height=0.2,width=0.56, fill_color=color, fill_opacity=1, stroke_width=0).shift(UP * 0.08),
        )
        for i, x in enumerate((-0.18, 0, 0.18)):
            c.add(Line([x, -0.02, 0], [x - 0.07, -0.3, 0], color="#387a99", stroke_width=5))
        g.add(c)
    elif any(k in t for k in ("river", "ocean", "sea", "lake", "water", "wave", "collect", "stream", "flow")):
        g = VGroup()
        for y in (0.1, -0.12):
            prev = None
            for x in range(-6, 7):
                pt = [x * 0.09, y + 0.08 * math.sin(x * 0.9), 0]
                if prev:
                    g.add(Line(prev, pt, color=color, stroke_width=5))
                prev = pt
    elif any(k in t for k in ("idea", "think", "learn", "question", "why", "how", "know")):
        g.add(Circle(radius=0.24, fill_color=P["soft"], fill_opacity=1, stroke_color=color, stroke_width=4).shift(UP * 0.08))
        g.add(VGroup(*[Line([-0.12 + i * 0.1, -0.16 - i * 0.01, 0], [-0.06 + i * 0.1, -0.16 - i * 0.01, 0], color=color, stroke_width=4) for i in range(3)]))
    elif any(k in t for k in ("check", "done", "complete", "finish", "success", "win", "goal", "answer", "correct")):
        g.add(Line([-0.26, 0.02, 0], [-0.06, -0.16, 0], color=color, stroke_width=8))
        g.add(Line([-0.06, -0.16, 0], [0.28, 0.2, 0], color=color, stroke_width=8))
    elif any(k in t for k in ("warn", "danger", "risk", "alert", "problem", "fail", "wrong", "avoid")):
        tri = VGroup(Line([-0.3, -0.2, 0], [0, 0.26, 0], color="#d29b12", stroke_width=8), Line([0, 0.26, 0], [0.3, -0.2, 0], color="#d29b12", stroke_width=8), Line([0.3, -0.2, 0], [-0.3, -0.2, 0], color="#d29b12", stroke_width=8))
        g.add(tri, Line([0, 0.05, 0], [0, -0.06, 0], color="#d29b12", stroke_width=6), Dot([0, -0.14, 0], color="#d29b12", radius=0.03))
    elif any(k in t for k in ("chart", "graph", "data", "percent", "count", "grow", "sales")):
        g.add(Line([-0.28, -0.26, 0], [-0.28, 0.26, 0], color=P["muted"], stroke_width=5), Line([-0.28, -0.26, 0], [0.3, -0.26, 0], color=P["muted"], stroke_width=5))
        for i, h in enumerate((0.16, 0.3, 0.46)):
            g.add(RoundedRectangle(corner_radius=0.03,height=h,width=0.14, fill_color=P["second"] if i == 2 else color, fill_opacity=1, stroke_width=0).shift(RIGHT * (i * 0.18 - 0.18) + UP * (h / 2 - 0.26)))
    elif any(k in t for k in ("people", "person", "team", "student", "kid", "child", "teacher", "human", "class")):
        g.add(Circle(radius=0.13, fill_color=color, fill_opacity=1, stroke_width=0).shift(UP * 0.16), RoundedRectangle(corner_radius=0.16,height=0.34,width=0.34, fill_color=color, fill_opacity=1, stroke_width=0).shift(DOWN * 0.14))
    else:
        g.add(Dot(color=color, radius=0.12))
    return g


def outward_arrow(a, b):
    """Curved arrow a→b whose arc bulges away from the origin (ellipse center)."""
    mid = (a + b) / 2
    dvec = b - a
    d = float(np.linalg.norm(dvec)) or 1e-6
    normal = np.array([-dvec[1], dvec[0], 0]) / d
    outward = normal if float(np.dot(normal, mid)) > 0 else -normal
    r = d * 0.75
    h = math.sqrt(max(r * r - (d / 2) ** 2, 0.01))
    arc = ArcBetweenPoints(a, b, arc_center=mid + outward * h, color=P["muted"], stroke_width=5)
    arc.add_tip(tip_length=0.22)
    return arc


def water_backdrop(W, H):
    """Illustrated sky + sun + clouds + ocean band behind diagrams."""
    from manim import Rectangle
    sky = Rectangle(width=W, height=H * 0.74, fill_color="#e9f3f5", fill_opacity=0.55, stroke_width=0).move_to(UP * (H * 0.13))
    sun = VGroup(Circle(radius=0.42, fill_color="#e0a533", fill_opacity=0.85, stroke_width=0))
    for i in range(8):
        a = i * math.pi / 4
        sun.add(Line([math.cos(a) * 0.56, math.sin(a) * 0.56, 0], [math.cos(a) * 0.74, math.sin(a) * 0.74, 0], color="#e0a533", stroke_width=6))
    sun.move_to(RIGHT * (W * 0.36) + UP * (H * 0.33))
    clouds = VGroup(*[VGroup(
        Circle(radius=0.3, fill_color="#ffffff", fill_opacity=0.95, stroke_color=P["soft"], stroke_width=2).shift(LEFT * 0.3),
        Circle(radius=0.42, fill_color="#ffffff", fill_opacity=0.95, stroke_color=P["soft"], stroke_width=2).shift(RIGHT * 0.18 + UP * 0.12),
        RoundedRectangle(corner_radius=0.2,height=0.4,width=1.3, fill_color="#ffffff", fill_opacity=0.95, stroke_color=P["soft"], stroke_width=2),
    ).scale(s).move_to([x, y, 0]) for (x, y, s) in ((-W * 0.34, H * 0.34, 0.9), (-W * 0.12, H * 0.24, 0.65), (W * 0.1, H * 0.36, 0.7))])
    ocean = VGroup()
    band = Rectangle(width=W, height=H * 0.24, fill_color="#cfe6ea", fill_opacity=1, stroke_width=0).move_to(DOWN * (H * 0.38))
    wave = VGroup()
    for y, col in ((0.0, "#a9cfd8"),):
        prev = None
        for x in range(-36, 37):
            pt = [x * (W / 72.0), y + 0.12 * math.sin(x * 0.55), 0]
            if prev:
                wave.add(Line(prev, pt, color=col, stroke_width=6))
            prev = pt
    wave.move_to(DOWN * (H * 0.38) + UP * (H * 0.12))
    ocean.add(band, wave)
    return VGroup(sky, sun, clouds, ocean)


def is_water(scene):
    t = " ".join([scene.get("title", ""), scene.get("narration", ""), " ".join(scene.get("labels") or [])]).lower()
    return any(k in t for k in ("water cycle", "evaporat", "condensat", "precipitat", "ocean", "rain", "cloud", "river"))


class _Base(Scene):
    idx = 0

    def construct(self):
        spec = SPEC
        self.scene_data = spec["scenes"][self.idx]
        self.camera.background_color = P["background"]
        W, H = self.camera.frame_width, self.camera.frame_height
        self.W, self.H = W, H
        self.spent = 0.0
        s = self.scene_data
        title = T(s["title"], 0.62, weight="BOLD").to_edge(UP, buff=0.7).to_edge(LEFT, buff=0.9)
        rule = Line([-1, 0, 0], [0, 0, 0], color=P["accent"], stroke_width=8).scale(0.5).next_to(title, DOWN, buff=0.22, aligned_edge=LEFT)
        self.play(Write(title), Create(rule), run_time=0.6)
        self.spent += 0.6
        if is_water(s) and s["kind"] in ("flow", "cycle", "orbit", "comparison"):
            self.play(FadeIn(water_backdrop(W, H), run_time=0.5))
            self.spent += 0.5
        getattr(self, "build_" + s["kind"], self.build_default)(s)
        remaining = s["duration"] - self.spent
        if remaining > 0:
            self.wait(remaining)

    def spend(self, *anims, run_time=0.5):
        self.play(*anims, run_time=run_time)
        self.spent += run_time

    def build_title(self, s):
        waves = VGroup(*[
            (lambda j: (lambda fn: fn.set_color(P["accent"] if j != 1 else P["second"]).set_stroke(width=8))(
                __import__("manim").ParametricFunction(lambda t: [t, 0.5 * math.sin(t * 1.6) + j * 0.9 - 0.9, 0], t_range=[-4.4, 4.4])))(j)
            for j in range(3)])
        waves.scale(0.9).move_to(ORIGIN)
        self.spend(Create(waves), run_time=1.2)
        sub = T(s.get("emphasis") or s["narration"].split(".")[0] + ".", 0.4, color=P["muted"])
        sub.to_edge(DOWN, buff=1.4)
        self.spend(FadeIn(sub), run_time=0.7)

    def build_flow(self, s):
        labels = (s.get("labels") or [s.get("emphasis") or s["title"]])[:4]
        n = len(labels)
        bw = min(3.4, (self.W - 4.0) / n - 0.7)
        boxes = VGroup()
        arrows = []
        for i, label in enumerate(labels):
            box = RoundedRectangle(corner_radius=0.22,height=1.6,width=bw, fill_color=P["soft"], fill_opacity=1, stroke_width=0)
            badge = VGroup(Circle(radius=0.34, fill_color=P["accent"], fill_opacity=1, stroke_color=P["background"], stroke_width=4), T(str(i + 1), 0.34, color="#ffffff", weight="BOLD"))
            badge.move_to(box.get_top() + DOWN * 0.02)
            icon = node_icon(label, P["accent"]).scale(0.8).move_to(box.get_center() + LEFT * (bw / 2 - 0.62) + UP * 0.1)
            words = label.split()
            mid = (len(words) + 1) // 2
            lab = T("\n".join([" ".join(words[:mid]), " ".join(words[mid:])]).strip(), 0.34)
            lab.move_to(box.get_center() + RIGHT * 0.5 + UP * 0.1)
            step = VGroup(box, badge, icon, lab)
            boxes.add(step)
        boxes.arrange(RIGHT, buff=0.9).move_to(ORIGIN)
        reveals = s.get("reveals") or []
        for i, step in enumerate(boxes):
            at = reveals[i]["at"] if i < len(reveals) else None
            if at is not None:
                gap = at - self.spent
                if gap > 0.15:
                    self.wait(gap)
                    self.spent += gap
            if i:
                a = GrowArrow(Arrow(boxes[i - 1].get_right() + RIGHT * 0.08, step.get_left() + LEFT * 0.08, buff=0.08, color=P["accent"], stroke_width=7))
                arrows.append(a)
                self.play(a, FadeIn(step), run_time=0.55)
            else:
                self.play(FadeIn(step), run_time=0.55)
            self.spent += 0.55

    def build_cycle(self, s):
        labels = list((s.get("labels") or [s.get("emphasis") or s["title"], "Repeats"]))[:4]
        if len(labels) == 1:
            labels.append("Repeats")
        n = len(labels)
        rx, ry = min(5.2, self.W * 0.33), min(2.2, self.H * 0.3)
        ring = [np.array([rx * math.cos(i / n * 2 * math.pi + math.pi / 2), ry * math.sin(i / n * 2 * math.pi + math.pi / 2), 0]) for i in range(n)]
        mark = VGroup(
            CurvedArrow(LEFT * 0.45 + UP * 0.18, RIGHT * 0.45 + UP * 0.18, color=P["accent"], stroke_width=7, radius=-0.9),
            CurvedArrow(RIGHT * 0.45 + DOWN * 0.18, LEFT * 0.45 + DOWN * 0.18, color=P["accent"], stroke_width=7, radius=-0.9),
        )
        self.spend(FadeIn(mark), run_time=0.5)
        reveals = s.get("reveals") or []
        nodes = []
        for i, (pt, label) in enumerate(zip(ring, labels)):
            at = reveals[i]["at"] if i < len(reveals) else None
            if at is not None:
                gap = at - self.spent
                if gap > 0.15:
                    self.wait(gap)
                    self.spent += gap
            node = VGroup(
                Circle(radius=0.62, fill_color=P["soft"], fill_opacity=1, stroke_color=P["accent"], stroke_width=5),
                Circle(radius=0.22, fill_color=P["accent"], fill_opacity=1, stroke_width=0).move_to([0, 0.62, 0]),
                node_icon(label, P["accent"]).scale(0.7).move_to([0, -0.1, 0]),
            )
            node.add(T(str(i + 1), 0.28, color="#ffffff", weight="BOLD").move_to([0, 0.62, 0]))
            if abs(pt[1]) > 0.4:
                lab_pos = [0, 1.15 if pt[1] > 0 else -1.35, 0]
            else:
                lab_pos = [np.clip(np.sign(pt[0]) * 1.9, -(self.W / 2 - 1.3) - pt[0], (self.W / 2 - 1.3) - pt[0]), 0, 0]
            node.add(T(label, 0.34).move_to(lab_pos))
            node.move_to(pt)
            anims = [FadeIn(node)]
            if i:
                prev_c = nodes[-1][0].get_center()
                d = float(np.linalg.norm(np.array(pt) - np.array(prev_c)))
                anims.insert(0, Create(outward_arrow(prev_c, np.array(pt))))
            self.play(*anims, run_time=0.55)
            self.spent += 0.55
            nodes.append(node)
        closer = Create(outward_arrow(np.array(nodes[-1][0].get_center()), np.array(ring[0])))
        self.spend(closer, run_time=0.6)
        dot = Dot(color=P["second"], radius=0.14).move_to(ring[0])
        path = VGroup(*[Dot(p, radius=0.01) for p in ring])
        self.spend(FadeIn(dot), MoveAlongPath(dot, __import__("manim").Circle(radius=rx, color=None).scale([1, ry / rx, 1])), run_time=min(2.2, max(0.8, s["duration"] - self.spent - 0.3)))

    def build_question(self, s):
        q = T(s["narration"], 0.42)
        q.scale_to_fit_width(min(q.width, self.W - 3)).move_to(ORIGIN + UP * 0.4)
        self.spend(Write(q), run_time=1.4)
        pause = min(5, max(0, s.get("pauseSeconds") or 0))
        if pause:
            bar = RoundedRectangle(corner_radius=0.11,height=0.22,width=pause * 1.1, fill_color=P["accent"], fill_opacity=1, stroke_width=0).move_to(DOWN * 1.4)
            self.spend(FadeIn(bar), run_time=0.4)
            self.play(bar.animate.stretch_to_fit_width(0.01, about_edge=LEFT), run_time=pause)
            self.spent += pause

    def build_recap(self, s):
        labels = (s.get("labels") or [])[:4]
        if not labels:
            first = s["narration"].split(".")[0] + "."
            labels = [s["emphasis"] if s.get("emphasis") and s["emphasis"] != s["title"] else first]
        items = VGroup(*[VGroup(Line([-0.24, 0.0, 0], [-0.06, -0.16, 0], color=P["accent"], stroke_width=8), Line([-0.06, -0.16, 0], [0.24, 0.2, 0], color=P["accent"], stroke_width=8), T(l, 0.46)).arrange(RIGHT, buff=0.35) for l in labels]).arrange(DOWN, buff=0.5, aligned_edge=LEFT).move_to(ORIGIN)
        for item in items:
            self.spend(FadeIn(item, shift=RIGHT * 0.3), run_time=0.5)

    def build_comparison(self, s):
        labels = (s.get("labels") or [s["title"], "Other"])[:2]
        cols = VGroup()
        for i, label in enumerate(labels):
            col = VGroup(Line([-1.2, 0, 0], [1.2, 0, 0], color=P["second"] if i else P["accent"], stroke_width=9), T(label, 0.44, color=P["second"] if i else P["accent"]), node_icon(label, P["second"] if i else P["accent"]).scale(1.1)).arrange(DOWN, buff=0.5)
            cols.add(col)
        cols.arrange(RIGHT, buff=3.6).move_to(ORIGIN)
        for col in cols:
            self.spend(FadeIn(col), run_time=0.6)

    def build_stat(self, s):
        value = str((s.get("numbers") or [None])[0] or s.get("emphasis") or s["title"])
        v = T(value, 1.6, weight="BOLD")
        self.spend(GrowFromCenter(v), run_time=0.9)
        label = (s.get("labels") or [s.get("emphasis")])[0]
        if label != value:
            self.spend(FadeIn(T(label, 0.42, color=P["muted"]).next_to(v, DOWN, buff=0.7)), run_time=0.6)

    def build_orbit(self, s):
        labels = (s.get("labels") or ["Observe", "Connect", "Understand"])[:4]
        rx, ry = 4.6, 2.0
        core = Circle(radius=0.85, fill_color=P["accent"], fill_opacity=1, stroke_width=0)
        ring_pts = [np.array([rx * math.cos(i / len(labels) * 2 * math.pi + math.pi / 2), ry * math.sin(i / len(labels) * 2 * math.pi + math.pi / 2), 0]) for i in range(len(labels))]
        from manim import Ellipse
        self.spend(FadeIn(core), Create(Ellipse(width=rx * 2, height=ry * 2, color=P["soft"], stroke_width=4)), run_time=0.8)
        for i, (pt, label) in enumerate(zip(ring_pts, labels)):
            node = VGroup(Dot(pt, color=P["second"], radius=0.2), T(label, 0.34).move_to(pt + (UP * 0.7 if pt[1] > 0 else DOWN * 0.8)))
            self.spend(FadeIn(node), run_time=0.45)

    def build_default(self, s):
        labels = (s.get("labels") or [s.get("emphasis")])[:3]
        items = VGroup(*[VGroup(node_icon(l, P["accent"]).scale(1.0), T(l, 0.5)).arrange(DOWN, buff=0.35) for l in labels if l]).arrange(RIGHT, buff=2.0).move_to(ORIGIN + UP * 0.2)
        self.spend(FadeIn(items), run_time=0.9)


for _i, _s in enumerate(SPEC["scenes"]):
    globals()[f"Scene_{_i}"] = type(f"Scene_{_i}", (_Base,), {"idx": _i})
