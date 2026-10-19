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
3. Adjust channel width, default tab width, automatic tabs per outline, and automatic tab position. Black/purple areas are cut away. Gaps leave material intact. Use **Edit tabs** to customize the layout.
4. Inspect the stencil and cut-path previews, then download. Amber squares mark automatic tabs; teal circles mark custom tabs. Tab highlights and original-outline overlays are preview-only.
5. Import the file into your vinyl cutter's software, preserving its physical dimensions, and cut the edges of the filled shapes. Test a small sample for the material you use.

Paths, compound paths, standard shapes, and transforms are supported. Convert live text, masks, and clipping to plain paths first. Raster images are skipped. This follows every vector outline; it does not trace raster images or resolve overlapping filled artwork into a silhouette. Open paths produce channels with square ends. Every contour starts with automatic tabs. Small automatic contours may get fewer or narrower tabs, with a warning. Intersecting channels may cut across tabs; the editor warns when another channel crosses a tab center. Inspect intricate overlaps before cutting. No outer sheet boundary is exported.

## Editing tabs

Choose **Edit tabs**, then select a tab in the preview or use the outline and tab selectors. The selected tab has a purple ring. You can remove it, change its width or position, or drag it along its outline. **Add tab** previews a location when you point near an outline; click to place it. **Add tab to this outline** places a tab in the largest interval between tab centers and is also available without a pointer.

The first individual edit makes that outline **Custom**, preserving all its tab positions and count. Automatic count and position controls continue to affect only automatic outlines. All tabs inherit **Default tab width** unless individually overridden; **Use default width** clears an override. Custom positions scale proportionally with artwork size, while widths stay in millimeters.

**Reset outline to automatic** and **Reset all to automatic** discard custom positions and width overrides and apply the current automatic settings. **Reset settings** restores settings and layouts together. Undo/Redo covers edits, resets, and settings; a slider gesture or drag is one undo step. Loading another SVG or sample starts a new layout and clears undo history. Edits are kept for the current session; the exported SVG contains the resulting cuts, not editable project state.

Use Tab to focus a preview tab, Enter/Space to select it, Delete/Backspace to remove it, and Left/Right arrows to move it by 0.1% of the outline (Shift for 1%). Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes outside form inputs. Escape cancels placement or an active drag. Selected-tab controls appear in a purple card above the canvas while editing. The empty selection prompt reserves the same space so selecting or deselecting a tab does not shift the canvas. The canvas has its own responsive height, so opening editing controls never shrinks the SVG. Width and position sit side by side on desktop and stack on phones.

Custom tabs are never automatically removed or repositioned. Overlapping tabs merge into a single uncut gap and produce a warning. Tabs too wide for an outline, or clipped at an open endpoint, show both requested and effective width. An outline can have zero tabs; closed outlines warn that the inner piece may come loose. Inspect warnings before cutting.

All uploaded artwork is processed locally in the browser and is not sent to a server. Geometry dependencies are vendored, with attribution, in `vendor/`. Fonts are self-hosted, with their licenses in `vendor/fonts/`. No remote services are needed at runtime.

## Verification

`npm test` checks channel and tab geometry, custom layouts, width inheritance, resizing, seam wrapping, overlaps, zero-tab outlines, open endpoints, intersection warnings, and SVG export dimensions. With the development server running, open `/tests/tab-editing.html` for browser interaction checks, `/tests/responsive.html` for mobile/tablet editing checks, and `/tests/import.html` for SVG import checks.

Built with Paper.js 0.12.18 for SVG geometry and Clipper 6.4.2 for polygon offsets and unions.
