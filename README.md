# Stencil Studio

A browser-local editor that turns SVG outlines into narrow cut channels with uncut retaining tabs. Downloaded SVGs contain closed, filled cut paths at physical millimeter dimensions.

## Run

Requires Node.js 20 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. To build a static deployment, run `npm run build`; the finished app is in `dist/`. `npm run preview` serves that build. Set `PORT` to use a different port.

The development server watches `src/`, `index.html`, and vendored assets. CSS saves replace the stylesheet immediately without reloading the editor. JavaScript, HTML, and other asset changes reload the page automatically after saving the workspace. Build output and hidden files are ignored. `npm run preview` serves the build without file watching. After updating the server code itself, restart `npm run dev` once; subsequent app changes update automatically.

## Use

1. Upload or drop an SVG, or choose a sample.
2. Set the artwork width in millimeters; height scales proportionally. The output includes an 8 mm margin on each side (more if required for the channel).
3. Use **Edit outlines** to hide outlines or enable **Full cut-away** to remove the entire interior of a closed outline. Adjust channel width, default tab width, automatic tabs per outline, and automatic tab position. Black/purple areas are cut away. Gaps leave material intact. Use **Edit tabs** to customize the layout.
4. Inspect the stencil and cut-path previews, then download. Amber squares mark automatic tabs; teal circles mark custom tabs. Tab highlights and original-outline overlays are preview-only.
5. Import the file into your vinyl cutter's software, preserving its physical dimensions, and cut the edges of the filled shapes. Test a small sample for the material you use.

Paths, compound paths, standard shapes, and transforms are supported. Convert live text, masks, and clipping to plain paths first. Raster images are skipped. This follows every vector outline; it does not trace raster images or resolve overlapping filled artwork into a silhouette. Enable **Rounded tab ends** under Retaining tabs for round cut-channel caps beside each tab, in both the preview and downloaded SVG. The tab gap keeps its requested width. Very short cuts use shorter rounded caps to fit. Open path endpoints remain square. The option supports Undo/Redo, workspace recovery, and session export. Every contour starts with automatic tabs. Small automatic contours may get fewer or narrower tabs, with a warning. Intersecting channels may cut across tabs; the editor warns when another channel crosses a tab center. Inspect intricate overlaps before cutting. No outer sheet boundary is exported.

## Exporting a session

Choose **Export session** below **Download stencil** to save a readable `*-session.json` file. It includes the complete original SVG source, filename, settings, hidden outlines, full cut-aways, polygon width regions, custom tab layouts and width overrides, preview and editing state, selection, zoom, scroll position, and undo/redo history. Pending slider, drag, and number-field edits are committed before export. Session export works even when every outline is hidden and does not depend on browser storage being available.

The JSON uses the saved workspace schema (`version: 1`), with `format: "stencil-studio-session"` and an export timestamp. The embedded `source` field contains the SVG itself. **Download stencil** continues to export cutter-ready SVG geometry. Loading JSON session files through the editor is not currently supported.

## Hiding outlines

Choose **Edit outlines**, then select an outline in the preview or thumbnail list. Shift-click adds or removes outlines from the selection. Use **Hide selected**, **Show selected**, **Show only selected**, or **Show all outlines**. Each row also has a **Visible** checkbox. Hidden outlines appear as dashed guides only in outline editing mode; turn off **Show hidden outlines as dashed guides** to hide those guides too.

Hidden outlines contribute no channels, tabs, or geometry warnings, and are excluded from the downloaded SVG. Hiding preserves custom tabs, artwork scale, positions, and export dimensions. Inner contours of compound shapes can be hidden independently. Hiding everything disables download until you show an outline again. Settings and tab resets preserve visibility; loading new artwork starts with all outlines visible.

Undo/Redo includes visibility changes, with each bulk action recorded as one step. Outline visibility, custom tabs, the active editor, and undo history are saved locally and restored after reload. Workspaces saved before this feature start with all outlines visible. Use Tab to focus an outline or list row, Enter/Space to select it, and Delete/Backspace to hide the selection. The list checkboxes can always show hidden outlines again.

Each closed outline also has a **Full cut-away** checkbox beside **Visible**. Enable it to cut the original boundary once and remove the whole enclosed area, without channel width or retaining tabs. The preview fills the removed interior; the downloaded SVG uses that exact boundary. Overlapping removed areas merge. Open outlines cannot be full cut-aways because they do not enclose an area.

Cut-away outlines are excluded from tab editing and automatic placement. Switching back restores their saved tab layout. Visibility, settings resets, and tab resets preserve the cut-away choice; new artwork starts with ordinary channels. Choices support Undo/Redo, local workspace recovery, and session export, including undo history.

## Local channel widths

Choose **Edit regions**, then **Draw polygon**. Click around a tight detail to place corners; double-click to place the final corner and finish, or click the first corner, press Enter, or choose **Finish polygon** to close it. Set **Channel width** in millimeters and choose one outline or **All layers** in **Apply to**. Use **Select** beside **Apply to** to pick a visible outline directly in the preview; Escape cancels picking. The requested width applies throughout the polygon. Width changes taper smoothly outside its boundary into the surrounding width; farther away, the global channel width applies. Set **Taper length** per region from 0.1 to 50 mm using the slider or number field. Values display one decimal place. Older saved regions retain their automatic taper until edited. Regions affect both the stencil preview and downloaded SVG. They preserve retaining tabs and leave full cut-aways at their original boundary.

Select a region in the preview or dropdown to change its width, taper length or scope. Drag a corner to reshape it, or drag its interior to move the whole polygon. Focus a corner and use arrow keys to move it (Shift moves farther). **Remove region** deletes the selected region. During drawing, Backspace removes the last corner and Escape cancels; Escape also cancels a drag. Crossing polygon edges are rejected. Later regions in the list override earlier regions where they overlap, independently for each outline.

Region vertices scale with the artwork and follow it when sheet padding changes, while their channel widths and taper lengths stay in millimeters. Regions, unfinished polygons, editing state, and undo history recover after reload and are included in session exports. Each completed polygon, width/taper/scope change, drag, or deletion is one undo step. Settings and tab resets preserve regions; loading new artwork clears them. Region guides appear only in Edit regions and are excluded from SVG downloads.

## Editing tabs

Choose **Edit tabs**, then select a tab in the preview or use the outline and tab selectors. The selected tab has a bright pink ring. You can remove it, change its width or position, or drag it along its outline. **Add tab** previews a location when you point near an outline; click to place it. Keep clicking outlines to add more tabs until you choose **Done adding** or press Escape. Each placement is a separate undo step.

Drag empty space in the SVG to draw a rectangle and select the tab centers inside it. Under **Drag a rectangle to select tabs on:**, **Selected layer only** is the default: rectangle selection uses the outline chosen before the drag starts. Choose **All layers** to select tabs across outlines. Hold Shift to add a rectangle or another tab to the selection. Set **Width** to give all selected tabs the same requested width. The **Position (move group)** control shows the first selected tab’s position; changing it shifts every selected tab by the same percentage of its own outline. Dragging any selected tab also moves the group. Closed paths wrap around; groups containing open paths stop together at their endpoints to preserve spacing. **Remove selected tabs** and **Use default width** apply to the whole selection.

The first individual edit makes that outline **Custom**, preserving all its tab positions and count. Automatic count and position controls continue to affect only automatic outlines. All tabs inherit **Default tab width** unless individually overridden; **Use default width** clears an override. Custom positions scale proportionally with artwork size, while widths stay in millimeters.

**Reset outline to automatic** and **Reset all to automatic** discard custom positions and width overrides and apply the current automatic settings. **Reset settings** restores settings and layouts together. Undo/Redo covers edits, resets, and settings; a slider gesture or drag is one undo step. Loading another SVG or sample starts a new layout and clears undo history. The workspace is saved automatically in browser local storage, including the uploaded SVG, settings, custom tabs, selection, editing mode, preview options, zoom, scroll position, and undo/redo history. Reloading or reopening the same URL restores it. Pending slider, drag, and number-field edits are committed before a live reload. Storage belongs to the browser and site address: use the same host and port to return to the same workspace. If storage fills up, older undo history is trimmed first; a failed save is reported in the editor. The exported SVG contains the resulting cuts, not editable project state.

Use Tab to focus a preview tab, Enter/Space to select it, Delete/Backspace to remove the selected tabs even after focus leaves the preview (except while typing in a field), and Left/Right arrows to move it by 0.1% of the outline (Shift for 1%). Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes outside form inputs. Escape cancels placement or an active drag. Selected-tab controls and the editing hint appear in a purple card above the canvas while editing. A caret points to the active Edit/Done button. The empty selection prompt reserves the same space so selecting or deselecting a tab does not shift the canvas. The canvas has its own responsive height, so opening editing controls never shrinks the SVG. Width and position sit side by side on desktop and stack on phones.

Custom tabs are never automatically removed or repositioned. Overlapping tabs merge into a single uncut gap and produce a warning. Tabs too wide for an outline, or clipped at an open endpoint, show both requested and effective width. An outline can have zero tabs; closed outlines warn that the inner piece may come loose. Inspect warnings before cutting.

All uploaded artwork is processed locally in the browser and is not sent to a server. Geometry dependencies are vendored, with attribution, in `vendor/`. Fonts are self-hosted, with their licenses in `vendor/fonts/`. No remote services are needed at runtime.

## Verification

`npm test` checks development-server file watching, static preview isolation, workspace storage recovery, outline visibility, full cut-aways, polygon width overrides and layer scopes, channel and tab geometry, custom layouts, width inheritance, resizing, seam wrapping, overlaps, zero-tab outlines, open endpoints, intersection warnings, and SVG export dimensions. With the development server running, open `/tests/outline-editing.html` for visibility, export, persistence, keyboard and responsive checks, `/tests/region-editing.html` for polygon drawing, widths, layer scopes, dragging, export, persistence, and mobile checks, `/tests/tab-editing.html` for tab interactions, `/tests/responsive.html` for mobile/tablet editing checks, `/tests/workspace.html` for reload recovery, pending edits, undo/redo, and CSS swapping, and `/tests/import.html` for SVG import checks.

Built with Paper.js 0.12.18 for SVG geometry and Clipper 6.4.2 for polygon offsets and unions.
