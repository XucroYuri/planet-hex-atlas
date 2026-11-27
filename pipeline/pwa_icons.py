"""Render PWA icons from the same seven-hexagon brand mark used by the header."""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web/meta'
COLORS = ['#729283', '#39766c', '#a66a46', '#668d74', '#4e8170', '#39766c', '#294f60']
CELLS = [(13, 1), (24, 7), (24, 20), (13, 25), (2, 20), (2, 7), (13, 13)]
SIZE = 38
SUPERSAMPLE = 4
BACKGROUND = '#f5f4eb'


def hexagon(cx, cy, width=12, height=13):
    return [
        (cx + width / 2, cy),
        (cx + width, cy + height * 0.25),
        (cx + width, cy + height * 0.75),
        (cx + width / 2, cy + height),
        (cx, cy + height * 0.75),
        (cx, cy + height * 0.25),
    ]


def render(px):
    canvas = px * SUPERSAMPLE
    mark = canvas * 0.82
    scale = mark / SIZE
    offset = (canvas - mark) / 2
    image = Image.new('RGB', (canvas, canvas), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for (left, top), color in zip(CELLS, COLORS):
        points = [(offset + x * scale, offset + y * scale) for x, y in hexagon(left, top)]
        draw.polygon(points, fill=color)
    return image.resize((px, px), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for px in (192, 512, 180):
        name = 'apple-touch-icon.png' if px == 180 else f'icon-{px}.png'
        render(px).save(OUT / name, optimize=True)
        print(name, (OUT / name).stat().st_size)


if __name__ == '__main__':
    main()
