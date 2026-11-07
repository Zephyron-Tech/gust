"""Builds the Gust brand SVGs with all text converted to outlines.

Usage: python build_svgs.py <out_dir> <sora_semibold.ttf> <surgena.woff2> <poppins_regular.ttf>
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
SORA, SURGENA, POPPINS = sys.argv[2:5]

STROKE = 'M33 34H44A15 15 0 1 1 29 19H56'
ECHO = 'M41 9H54'
INK = '#11131E'
ECHO_ON_TILE = '#8B80FF'
ACCENT = '#4235E5'


def text_path(font_path, text, size, tracking_em=0.0):
    """Returns (svg path d, width, ascent) for text set at `size`, baseline at y=0."""
    font = TTFont(font_path)
    upm = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font['hmtx']
    scale = size / upm
    x = 0.0
    parts = []
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[name].draw(tpen)
        parts.append(pen.getCommands())
        adv = hmtx[name][0] * scale
        x += adv + (tracking_em * size if i < len(text) - 1 else 0)
    ascent = font['OS/2'].sCapHeight * scale if hasattr(font['OS/2'], 'sCapHeight') else size * 0.7
    return ' '.join(parts), x, ascent


def mark(tile, stroke_color='currentColor', echo_color=ACCENT):
    t = f'<rect width="64" height="64" rx="15" fill="{INK}"/>' if tile else ''
    sc = '#FFFFFF' if tile else stroke_color
    ec = ECHO_ON_TILE if tile else echo_color
    return (
        f'{t}<path d="{STROKE}" fill="none" stroke="{sc}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{ECHO}" fill="none" stroke="{ec}" stroke-width="4.5" stroke-linecap="round"/>'
    )


def svg(w, h, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
        f'<title>{title}</title>{body}</svg>\n'
    )


def write(name, content):
    (out / name).write_text(content)
    print('wrote', name)


# Marks
write('gust-mark.svg', svg(64, 64, mark(False), 'Gust'))
write('gust-mark-white.svg', svg(64, 64, mark(False, '#FFFFFF', ECHO_ON_TILE), 'Gust'))
write('gust-mark-tile.svg', svg(64, 64, mark(True), 'Gust'))
write('favicon.svg', svg(64, 64, mark(True), 'Gust'))

# Wordmark: Sora 600, tracking -0.045em; size 0.82 of the mark (64 -> 52.5)
S = 64
word_size = S * 0.82
word_d, word_w, word_cap = text_path(SORA, 'gust', word_size, -0.045)


def lockup(dark, tile, byline):
    fg = '#FFFFFF' if dark else INK
    gap = S * 0.3
    x0 = S + gap
    # Optical centre: x-height block of "gust" sits around the mark's middle.
    base_y = S * 0.62 if not byline else S * 0.5
    body = f'<g>{mark(tile, fg, ECHO_ON_TILE if dark else ACCENT)}</g>'
    body += f'<path transform="translate({x0:.2f} {base_y:.2f})" d="{word_d}" fill="{fg}"/>'
    width = x0 + word_w
    height = S
    if byline:
        by_size = S * 0.27
        by_d, by_w, _ = text_path(POPPINS, 'by', by_size)
        z_d, z_w, _ = text_path(SURGENA, 'Zephyron', by_size * 1.18, -0.01)
        by_y = base_y + S * 0.36
        opacity = '0.6'
        body += f'<path transform="translate({x0:.2f} {by_y:.2f})" d="{by_d}" fill="{fg}" fill-opacity="{opacity}"/>'
        body += f'<path transform="translate({x0 + by_w + by_size * 0.35:.2f} {by_y:.2f})" d="{z_d}" fill="{fg}"/>'
        width = max(width, x0 + by_w + by_size * 0.35 + z_w)
        height = S * 1.12
    return svg(width + 2, height, body, 'Gust by Zephyron' if byline else 'Gust')


write('gust-wordmark.svg', svg(word_w + 2, word_size * 1.05, f'<path transform="translate(0 {word_size * 0.78:.2f})" d="{word_d}" fill="{INK}"/>', 'Gust'))
write('gust-lockup-light.svg', lockup(False, True, False))
write('gust-lockup-dark.svg', lockup(True, False, False))
write('gust-lockup-by-zephyron-light.svg', lockup(False, True, True))
write('gust-lockup-by-zephyron-dark.svg', lockup(True, False, True))

# Maskable PWA icon: full-bleed ink, mark inside the 80 % safe zone.
write('gust-icon-maskable.svg', svg(64, 64, f'<rect width="64" height="64" fill="{INK}"/><g transform="translate(9.6 9.6) scale(0.7)">{mark(False, "#FFFFFF", ECHO_ON_TILE)}</g>', 'Gust'))
