# Stencil Studio

A browser-local editor that turns SVG outlines into narrow cut channels with uncut retaining tabs. Downloaded SVGs contain closed, filled cut paths at physical millimeter dimensions.

## Run

Requires Node.js 20 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. To build a static deployment, run `npm run build`; the finished app is in `dist/`. `npm run preview` serves that build. Set `PORT` to use a different port.

## Use

1. Upload or drop an SVG, or choose a sample.
2. Set the artwork width in millimeters; height scales proportionally. The output includes an 8 mm margin on each side (more if required for the channel).
3. Adjust channel width, tab width, tabs per contour, and tab position. Black/purple areas are cut away. Gaps leave material intact.
4. Inspect the stencil and cut-path previews, then download. Yellow highlights and original-outline overlays are preview-only.
5. Import the file into your vinyl cutter's software, preserving its physical dimensions, and cut the edges of the filled shapes. Test a small sample for the material you use.

Paths, compound paths, standard shapes, and transforms are supported. Convert live text, masks, and clipping to plain paths first. Raster images are skipped. This follows every vector outline; it does not trace raster images or resolve overlapping filled artwork into a silhouette. Open paths produce channels with square ends. Every contour gets tabs. Small contours may get fewer or narrower tabs, with a warning. Intersecting channels may cut across tabs; the editor warns when another channel crosses a tab center. Inspect intricate overlaps before cutting. No outer sheet boundary is exported.

All uploaded artwork is processed locally in the browser and is not sent to a server. Geometry dependencies are vendored, with attribution, in `vendor/`. Fonts are self-hosted, with their licenses in `vendor/fonts/`. No remote services are needed at runtime.

## Verification

`npm test` checks channel and bridge widths, seam wrapping, tiny contours, open paths, intersection warnings, and SVG export dimensions.

Built with Paper.js 0.12.18 for SVG geometry and Clipper 6.4.2 for polygon offsets and unions.
