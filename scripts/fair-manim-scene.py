"""Fair lesson renderer: trusted code consumes a validated JSON plan, never model code.

Run: python fair-manim-scene.py fair-render-plan.json fair-teaching.mp4
Requires Manim Community 0.22.0. Text uses Pango; no LaTeX execution.
"""
import json
import math
import sys
import textwrap
from pathlib import Path

from manim import (Scene, Text, VGroup, Rectangle, Line, Dot, ReplacementTransform, FadeIn,
                   tempconfig, config, DOWN)

FAIR_INK = "#17344e"
FAIR_COLORS = ["#b17a14", "#167566", "#6553ad"]
FAIR_PLACES = ["ones", "tens", "hundreds"]
FAIR_UNIT = .075
FAIR_TEN_COLUMNS = 10


def fair_text(value, size=32, width=12, height=5, color=FAIR_INK, wrap=62):
    lines = "\n".join(textwrap.fill(str(line), width=wrap, break_long_words=True)
                      for line in str(value).splitlines())
    result = Text(lines, font_size=size, color=color, line_spacing=.8)
    if result.width > width:
        result.scale_to_fit_width(width)
    if result.height > height:
        result.scale_to_fit_height(height)
    return result


def fair_block(place):
    unit = FAIR_UNIT
    width, height = (unit * 10 if place == 2 else unit), (unit * 10 if place else unit)
    block = VGroup(Rectangle(width=width, height=height, color=FAIR_COLORS[place],
                            fill_color=FAIR_COLORS[place], fill_opacity=.8, stroke_width=.8))
    if place:
        for index in range(1, 10):
            y = -height / 2 + index * unit
            block.add(Line([-width / 2, y, 0], [width / 2, y, 0], color="#ffffff", stroke_width=.5))
            if place == 2:
                x = -width / 2 + index * unit
                block.add(Line([x, -height / 2, 0], [x, height / 2, 0], color="#ffffff", stroke_width=.5))
    return block


def fair_position(place, index):
    columns = [10, FAIR_TEN_COLUMNS, 3][place]
    spacing_x, spacing_y = [(0.25, .25), (.14 if FAIR_TEN_COLUMNS == 20 else .26, FAIR_UNIT * 10 + .13), (FAIR_UNIT * 10 + .13, FAIR_UNIT * 10 + .13)][place]
    center = [4, 0, -4][place]
    return [center - (columns - 1) * spacing_x / 2 + index % columns * spacing_x,
            1.25 - math.floor(index / columns) * spacing_y, 0]


def fair_blocks(counts):
    return [[fair_block(place).move_to(fair_position(place, index))
             for index in range(count)] for place, count in enumerate(counts)]


def fair_notation(scene):
    visual, state = scene['visual'], scene['state']
    if visual['mode'] == 'digit-shift':
        return f"{visual['number']} × 10 = {state['finalValue']}"
    if visual['mode'] == 'expanded' and visual['number'] < 100 and scene['beat'] != 'recap':
        place = state['place']
        count = state['final'][place]
        return f"{count} × {10 ** place} = {count * 10 ** place}"
    terms = [str(count * 10 ** place) for place, count in reversed(list(enumerate(state['final']))) if count]
    return f"{' + '.join(terms)} = {visual['number']}"


class FairLesson(Scene):
    def __init__(self, plan, **kwargs):
        self.fair_plan = plan
        super().__init__(**kwargs)

    def fair_check_frame(self):
        for item in self.mobjects:
            points = item.get_all_points()
            if len(points) and (abs(points[:, 0]).max() > config.frame_width / 2 + .03
                                or abs(points[:, 1]).max() > config.frame_height / 2 + .03):
                raise ValueError('Teaching visual exceeds the video frame; refusing a clipped export.')

    def fair_wait_until(self, at):
        remaining = at - self.time
        if remaining > 1 / 60:
            self.wait(remaining)

    def fair_base_ten(self, scene, start):
        global FAIR_UNIT, FAIR_TEN_COLUMNS
        visual, state = scene['visual'], scene['state']
        FAIR_UNIT = .045 if state['initial'][1] > 30 else .075
        FAIR_TEN_COLUMNS = 20 if state['initial'][1] > 30 else 10
        initial, final = state['initial'], state['final']
        cues = [start + cue['at'] for cue in scene['cues']]
        headings = VGroup(*[fair_text(FAIR_PLACES[p].upper(), 22, width=3).move_to([4 - p * 4, 2, 0]) for p in range(3)])
        self.add(headings)
        blocks = fair_blocks(initial)
        self.fair_wait_until(cues[0])
        self.add(*[block for column in blocks for block in column])
        self.fair_check_frame()
        self.fair_wait_until(cues[1])
        mode, place = visual['mode'], state['place']
        duration = max(1 / 30, min(.8, (cues[2] - cues[1]) * .65))
        animations = []
        if mode in ('group', 'trade'):
            bundles = (initial[place] - final[place]) // 10
            for index in range(bundles):
                source = VGroup(*blocks[place][index * 10:(index + 1) * 10])
                target = fair_block(place + 1).move_to(fair_position(place + 1, initial[place + 1] + index))
                animations.append(ReplacementTransform(source, target))
            for index, block in enumerate(blocks[place][bundles * 10:]):
                animations.append(block.animate.move_to(fair_position(place, index)))
            operation = f"10 {FAIR_PLACES[place]} = 1 {'ten' if place == 0 else 'hundred'}"
        elif mode == 'digit-shift':
            for p in range(2):
                for index, block in enumerate(blocks[p]):
                    target = fair_block(p + 1).move_to(fair_position(p + 1, index))
                    animations.append(ReplacementTransform(block, target))
            operation = 'Every block becomes ten times as large'
        elif mode == 'zero':
            outline = Rectangle(width=3, height=3.2, color=FAIR_COLORS[place], stroke_width=3).move_to([4 - place * 4, 0, 0])
            self.add(outline, fair_text(f"No {FAIR_PLACES[place]}", 25, width=2.8).move_to([4 - place * 4, 0, 0]))
            operation = f"0 {FAIR_PLACES[place]} — keep the place"
        elif mode == 'expanded':
            for block in blocks[place]:
                animations.append(block.animate.set_color('#d38025'))
            operation = f"Count the {FAIR_PLACES[place]}" if visual['number'] < 100 else 'Each place contributes its value'
        else:
            raise ValueError(f"Unsupported base-ten mode: {mode}")
        self.add(fair_text(operation, 27, width=12, height=.55).move_to([0, -1.8, 0]))
        if animations:
            self.play(*animations, run_time=duration)
        self.fair_wait_until(cues[2])
        self.add(fair_text(fair_notation(scene), 42, width=12, height=.65).move_to([0, -2.65, 0]))

    def fair_visual(self, visual):
        kind = visual['kind']
        if kind in ('steps', 'recap', 'equation'):
            items = visual.get('lines', visual.get('items'))
            group = VGroup(*[fair_text(value, 34, width=11, height=.85) for value in items])
            return group.arrange(DOWN, buff=.35).move_to([0, .1, 0])
        if kind == 'comparison':
            columns = []
            for key, x in [('left', -3.2), ('right', 3.2)]:
                columns.extend([fair_text(visual[key], 48, width=5.5, height=2).move_to([x, .6, 0]),
                                fair_text(visual[f'{key}Label'], 27, width=5.5, height=1.2).move_to([x, -1.2, 0])])
            return VGroup(*columns)
        if kind == 'number-line':
            minimum, maximum, mark = visual['min'], visual['max'], visual['mark']
            if not minimum < maximum or not minimum <= mark <= maximum:
                raise ValueError('Invalid number-line bounds')
            items = [Line([-5, 0, 0], [5, 0, 0], color=FAIR_INK)]
            for value, y in [(minimum, -.7), (maximum, -.7), (mark, .8)]:
                x = -5 + 10 * (value - minimum) / (maximum - minimum)
                items.extend([Dot([x, 0, 0], color=FAIR_COLORS[1]), fair_text(f'{value:g}', 28, width=3, height=.5).move_to([x, y, 0])])
            return VGroup(*items)
        if kind == 'place-value':
            whole, _, fraction = visual['number'].partition('.')
            digits = list(whole + fraction)
            exponents = list(range(len(whole) - 1, -len(fraction) - 1, -1))
            items = []
            for index, (digit, exponent) in enumerate(zip(digits, exponents)):
                x = (index - (len(digits) - 1) / 2) * 1.45
                color = FAIR_COLORS[1] if exponent == visual['highlightPlace'] else FAIR_INK
                items.extend([fair_text(digit, 54, width=1.3).move_to([x, .5, 0]).set_color(color),
                              fair_text(f'10^{exponent}', 21, width=1.3).move_to([x, -.55, 0])])
                if exponent == visual['highlightPlace']:
                    items.append(Rectangle(width=1.3, height=2, color=color).move_to([x, 0, 0]))
            # Decimal point is a separate explicit glyph; column exponents remain unchanged.
            if fraction:
                x = (len(whole) - .5 - (len(digits) - 1) / 2) * 1.45
                items.append(fair_text('.', 44, width=.3).move_to([x, .25, 0]))
            return VGroup(*items)
        raise ValueError(f'Unsupported visual kind: {kind}')

    def fair_captions(self, scene):
        cues = [cue for cue in self.fair_plan.get('captions', [])
                if scene['startSeconds'] <= cue['start'] < scene['startSeconds'] + scene['durationSeconds']]
        text = [fair_text(cue['text'], 21, width=12.8, height=.65, wrap=100).move_to([0, -3.55, 0]) for cue in cues]
        holder = VGroup(*text).set_opacity(0)
        holder.fair_active = -1
        def update_caption(mob, dt):
            time = self.time + self.fair_plan['introSeconds']
            active = next((index for index, cue in enumerate(cues) if cue['start'] <= time < cue['end']), -1)
            if active != mob.fair_active:
                for index, caption in enumerate(mob):
                    caption.set_opacity(1 if index == active else 0)
                mob.fair_active = active
        holder.add_updater(update_caption)
        self.add(Rectangle(width=14.23, height=.85, fill_color='#ebe9e2', fill_opacity=1,
                           stroke_width=0).move_to([0, -3.57, 0]), holder)

    def construct(self):
        for scene in self.fair_plan['scenes']:
            self.clear()
            start = scene['startSeconds'] - self.fair_plan['introSeconds']
            self.fair_captions(scene)
            self.add(fair_text(scene['title'], 38, width=12, height=.7).move_to([0, 3.05, 0]))
            if scene['beat'] == 'question':
                # Question content is only narration. Visual/title answers never enter this branch.
                self.add(fair_text(scene['narration'], 34, width=11.5, height=4.5, wrap=58).move_to([0, .15, 0]))
                self.fair_wait_until(start + .35 + scene['narrationSeconds'])
                self.add(fair_text('Take a moment to think.', 25, width=11, height=.45).move_to([0, -2.8, 0]))
            elif scene['visual']['kind'] == 'base-ten':
                self.fair_base_ten(scene, start)
            else:
                visual = self.fair_visual(scene['visual'])
                if scene['visual']['kind'] in ('steps', 'recap', 'equation'):
                    for index, item in enumerate(visual):
                        self.fair_wait_until(start + .35 + index / len(visual) * scene['narrationSeconds'])
                        self.play(FadeIn(item), run_time=min(.25, scene['narrationSeconds'] / len(visual) / 2))
                else:
                    self.add(visual)
                label = scene['visual'].get('label')
                if label:
                    self.add(fair_text(label, 26, width=11.5, height=.8).move_to([0, -2.6, 0]))
            self.fair_check_frame()
            self.fair_wait_until(start + scene['durationSeconds'])


if __name__ == '__main__':
    plan_path, output_path = map(Path, sys.argv[1:3])
    plan = json.loads(plan_path.read_text())
    with tempconfig({'pixel_width': plan['width'], 'pixel_height': plan['height'],
                     'frame_rate': plan['fps'], 'background_color': '#f8f6ef',
                     'renderer': 'cairo', 'write_to_movie': True, 'disable_caching': True,
                     'media_dir': str(output_path.parent / 'fair-manim-media'),
                     'output_file': str(output_path.resolve()), 'format': 'mp4',
                     'verbosity': 'WARNING'}):
        FairLesson(plan).render()
