# @gust/brand

Logo, icons and colour tokens for Gust. All text in the SVGs is converted to
outlines, so they render the same everywhere without the fonts installed.

## Files

| File                                                    | Use                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| `svg/gust-mark.svg`                                     | Mark alone, takes `currentColor`, stream in Zephyron violet |
| `svg/gust-mark-white.svg`                               | Mark for dark grounds                                       |
| `svg/gust-mark-tile.svg`, `svg/favicon.svg`             | App icon tile (night ink `#11131E`)                         |
| `svg/gust-icon-maskable.svg`                            | Full-bleed icon for PWA `maskable`                          |
| `svg/gust-wordmark.svg`                                 | "gust" in Sora 600, tracking −0.045em                       |
| `svg/gust-lockup-light.svg`, `svg/gust-lockup-dark.svg` | Mark + wordmark                                             |
| `svg/gust-lockup-by-zephyron-*.svg`                     | With the "by Zephyron" signature (Zephyron in Surgena)      |
| `png/gust-icon-{16…1024}.png`                           | Raster icon sizes                                           |
| `png/apple-touch-icon.png`                              | 180 px home-screen icon                                     |
| `png/gust-icon-maskable-{192,512}.png`                  | PWA manifest icons                                          |
| `favicon.ico`                                           | 16, 32 and 48 px                                            |
| `tokens.css`                                            | App colour tokens, dark and light                           |

## Rules

- One stroke draws the G from its crossbar round the bowl and leaves the top as
  a straight stream; a shorter stream above it gives the motion.
- Minimum size: icon 16 px, full lockup 96 px wide.
- Clear space round the logo: the height of the shorter stream.
- Do not rotate, stretch, add shadows or gradients. Colours: ink, white, violet.
- "gust" is always lower case. "by Zephyron" only where Gust introduces itself
  (sign-in, installer, footer), Zephyron always in its logotype face.

## Rebuilding

`scripts/build_svgs.py` regenerates the SVGs from the font files of the
zephyron-website repo (Sora SemiBold, Surgena, Poppins) with fontTools; PNGs
come from `rsvg-convert`. Surgena was marked "personal use only" when the
website got it; check its licence before any public release of Gust.
