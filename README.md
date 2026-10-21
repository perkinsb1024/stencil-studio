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

1. **Your Artwork:** upload or drop an SVG, or choose a sample. High-confidence layer types are assigned automatically; uncertain layers stay Outline. **Review Layer Types** opens a queue with the current type, suggested type, and reason. Accept a suggestion, keep the current type, choose another type, or use Next to skip it for later. Decisions survive Undo/Redo and reload; reapplying automatic types preserves manual and reviewed choices.
2. **Shape Your Stencil:** set **Artwork Width** in millimeters; height scales proportionally. Use **Layers**, **Tabs**, **Bridges**, and **Width Regions** in the side inspector. Outline removes channels, Keep retains material, and Cut Away removes filled areas. Drag a list handle to reorder layers or width regions, or use its ordering menu. Top items have priority. Compound layers move as a unit. The desktop canvas stays in place while controls change; on phones the editing canvas appears above the controls.
3. **Review & Export:** inspect **Stencil** or **Cut Paths**, check sheet dimensions and material support, and follow issue links back to the appropriate tool. Unresolved type suggestions and support warnings remain nonblocking. **Download Stencil** exports cutter-ready SVG; **Export Session** saves the original SVG, settings, edits, and history as JSON. Session JSON cannot currently be reopened in the editor.

**Overlays** controls tab highlights, bridge highlights, and the original SVG independently. Amber squares mark automatic tabs; teal circles mark custom tabs. Guides and highlights are never exported. Artwork size excludes the sheet margin; the exported sheet normally includes an 8 mm margin on each side, or more when required by the channel. Import the SVG into your cutter software at its physical dimensions, cut the edges of its filled shapes, and test a small sample for your material.

Paths, compound paths, standard shapes, and transforms are supported. Convert masks and clipping to plain paths first. Live text alongside vectors and raster images are skipped with a notice. To cut lettering, convert it to paths first; text-only SVGs require this conversion before importing. This follows every vector outline; it does not trace raster images or resolve overlapping filled artwork into a silhouette. Choose **Rounded** under **Tab Ends** in Tabs → Advanced for round cut-channel caps beside each tab, in both the preview and downloaded SVG. The tab gap keeps its requested width. Very short cuts use shorter rounded caps to fit. Open path endpoints remain square. The option supports Undo/Redo, workspace recovery, and session export. Every contour starts with automatic tabs. Small automatic contours may get fewer or narrower tabs, with a warning. Intersecting channels may cut across tabs; the editor warns when another channel crosses a tab center. Inspect intricate overlaps before cutting. No outer sheet boundary is exported.

## Zooming and panning

In the live vector preview or Simplify SVG view, zoom above 100% and drag the artwork to pan. Mouse and single-finger touch drags move the view; the hand cursor shows when dragging will pan. In the live preview's editing modes, use **Pan** beside the zoom controls, hold **Space** while dragging, or drag with the middle mouse button. Normal editing gestures still select outlines, move tabs, draw regions, or select tabs with a rectangle when Pan is off. Toggle Pan off to return to those gestures.

**Fit** recenters the artwork and returns to 100%. Panning stays within the artwork's zoomed bounds. Escape or a cancelled touch gesture restores the starting position of a pan. Live preview offsets recover after reload and are included in session exports, without adding undo steps or changing cut geometry. Loading new artwork resets zoom and pan. Simplify also supports its existing scrollbars and trackpad scrolling.

## Simplifying SVG artwork

Choose **Simplify SVG** under Your Artwork to open a separate preview. All changes are local and start from the artwork present when the modal opens. Adjustments are in millimeters at the current artwork width:

- **Smooth Small Details** sets a rounding radius, filling small notches and smoothing protrusions. Tiny holes or islands may disappear.
- **Break Narrow Connections** separates necks narrower than the chosen width. It erodes the filled shapes, then expands the surviving pieces back. Thin slivers may disappear.
- **Reduce Nodes** reduces polygon vertices within the chosen tolerance. Higher values produce simpler, more angular outlines.

The preview shows before/after node and outline counts, with an optional original-outline comparison and **Show Nodes** overlay. Counts include the vertices used to approximate imported curves, rather than just the SVG's original curve commands. Zoom up to 800% and scroll to inspect details; **Fit** resets the preview. Sliders recalculate in a background worker. **Reset Adjustments** returns to the original and **Cancel** discards changes.

**Download Simplified SVG** saves the current simplified preview as `*-simplified.svg` at the selected artwork width in millimeters, with proportional height. It includes the simplified outlines and credit metadata. Node markers, comparison guides, stencil channels, and retaining tabs are excluded. Download leaves the workspace intact and keeps the modal open. Both Download and Apply are disabled while recalculating and for an empty result.

**Apply Simplification** replaces the source SVG and closes the modal. It retains the artwork's coordinate frame and physical size, including when small islands disappear, and keeps stencil settings. Because outlines can split or merge, it clears tab layouts, visibility, Keep/Cut Away treatments, material bridges, and width regions. Undo restores the complete previous SVG and edits; redo, workspace recovery, and session exports include the replacement and its history. An empty result cannot be applied.

Simplification uses all outlines, including hidden ones. Closed outlines use an even/odd silhouette (nested contours become holes); overlapping closed artwork can therefore change its fill interpretation. Open paths only use node reduction and retain their endpoints. The Great Lakes sample at `svgs/GreatLakes_nounProject.svg` can be imported directly: its live-text credits are skipped in the cutting geometry and preserved as metadata in the simplified source. At 150 mm width, try 0.2 mm smoothing, 0.8 mm narrow connections, and 0.12 mm node reduction as a starting point.

## Exporting a session

Choose **Export Session** below **Download Stencil** to save a readable `*-session.json` file. It includes the complete original SVG source, filename, settings, hidden outlines, Keep/Cut Away treatments and layer order, straight/curved material bridges and exclusions, polygon width regions, custom tab layouts and width overrides, preview and editing state, selection, zoom, pan offsets, scroll position, and undo/redo history. Pending slider, drag, and number-field edits are committed before export. Session export works even when every outline is hidden and does not depend on browser storage being available.

The JSON uses the saved workspace schema (`version: 1`, with optional `materialVersion: 1` document fields), with `format: "stencil-studio-session"` and an export timestamp. The embedded `source` field contains the SVG itself. **Download Stencil** continues to export cutter-ready SVG geometry. Loading JSON session files through the editor is not currently supported.

## Hiding outlines

Choose **Layers**, then select an outline in the preview or thumbnail list. Shift-click adds or removes outlines from the selection. Use **Hide Selected**, **Show Selected**, **Show Only Selected**, or **Show All Layers**. Each row also has a **Visible** checkbox. Hidden outlines appear as dashed guides only in outline editing mode; turn off **Show Hidden Guides** to hide those guides too.

Hidden outlines contribute no channels, tabs, or geometry warnings, and are excluded from the downloaded SVG. Hiding preserves custom tabs, artwork scale, positions, and export dimensions. Inner contours of compound shapes can be hidden independently. Hiding everything disables download until you show an outline again. Settings and tab resets preserve visibility; loading new artwork starts with all outlines visible.

Undo/Redo includes visibility changes, with each bulk action recorded as one step. Outline visibility, custom tabs, the active editor, and undo history are saved locally and restored after reload. Workspaces saved before this feature start with all outlines visible. Use Tab to focus an outline or list row, Enter/Space to select it, and Delete/Backspace to hide the selection. The list checkboxes can always show hidden outlines again.

## Keep, Cut Away, and material bridges

In **Layers**, each row has a treatment selector. **Outline** keeps the existing channel workflow. **Cut Away** removes a filled area; **Keep** restores material inside an underlying Cut Away area. Both use exact boundaries without channel-width offsets. Compound-path contours share a treatment and preserve their SVG fill rule. Open paths support Outline only. The list runs from front to back: top layers control overlaps. **Move Up**, **Move Down**, **Move to Top**, and **Move to Bottom** in each ordering menu provide alternatives to dragging. Visibility is separate.

Overlapping Keep areas merge into retained material. A Keep area touching the surrounding sheet over a usable width already has support. Cutting every original Keep perimeter would detach the pieces, so exports contain only the final resolved cut boundaries, without duplicate internal cuts. Channel cuts are added after Keep/Cut Away composition. Material bridges take priority over the final combined cuts.

Choose **Bridges** to see unsupported material highlighted and generate connecting bridges. Automatic placement favors extending existing elongated features and matching their widths, or continuing a recognizable curved ribbon. It falls back to connections between nearby boundaries when a suitable feature continuation is unavailable. **Bridge Width** controls manually added bridges and automatic fallback widths; disable **Match Artwork Features** to use it throughout. Automatic search is deterministic and bounded, and may leave areas unsupported when it cannot find a valid connection. The support status always reflects the resulting geometry. **Add Reinforcement** requests additional separated support where available.

**Add Bridge** lets you place two anchors inside white material, including the surrounding sheet. Select a bridge from the preview or picker, change its width, or drag either endpoint. Drag a rectangle around bridge centers to select several; hold Shift to add bridges to the selection. Width, Curved Bridge, and Remove apply to all selected bridges. Enable **Curved Bridge** to add a bend handle; drag that handle to follow the artwork's curvature. Arrow keys move a focused handle by 0.1 mm, or 1 mm with Shift. Enter/Space selects a focused bridge; Delete removes it; Escape cancels placement or a drag. Straight and quadratic curved bridges retain their physical widths along the generated centerline. Amber marks automatic bridges, teal custom bridges, and red invalid anchors.

Manual edits make a bridge custom. Generate preserves custom bridges and replaces automatic ones. Removing an automatic bridge excludes that connection from regeneration; **Allow Removed Connections** clears those exclusions. Changes to treatments, size, and visibility validate existing bridges without silently moving them. Invalid anchors and material thinner than **Minimum Material Width** produce warnings. Connections are checked geometrically; material strength and cutter kerf are not modeled. Visually review intricate artwork. Automatic curve recognition currently handles narrow circular arcs; arbitrary curves can be shaped manually with the bend handle.

Try **Football**, whose sample has explicit Keep/Cut Away assignments. Its white bands already join the sheet; the central laces require a bridge. Other new artwork starts with Outline treatments; automatic treatment inference remains deferred.

Treatments, layer order, straight/curved bridges, exclusions, and bridge settings support Undo/Redo, local recovery, and session export. Bridge coordinates scale with artwork while widths stay in millimeters. Settings and tab resets preserve treatments and bridges; loading new artwork clears them. Legacy Full cut-away sessions retain their original independent-contour geometry. Applying simplification clears treatments and bridges because it replaces topology; Undo restores the complete previous document.

## Local channel widths

Choose **Width Regions**, then **Draw Region**. Click around a tight detail to place corners; double-click to place the final corner and finish, or click the first corner, press Enter, or choose **Finish Region** to close it. Set **Channel Width** in millimeters and choose one outline or **All Layers** in **Apply To**. Use **Pick Layer** beside **Apply To** to pick a visible outline directly in the preview; Escape cancels picking. The requested width applies throughout the polygon. Width changes taper smoothly outside its boundary into the surrounding width; farther away, the global channel width applies. Set **Taper Length** per region from 0.1 to 50 mm using the slider or number field. Values display one decimal place. Older saved regions retain their automatic taper until edited. Regions affect both the stencil preview and downloaded SVG. They preserve retaining tabs and leave full cut-aways at their original boundary.

Select a region in the preview or dropdown to change its width, taper length or scope. Drag a corner to reshape it, or drag its interior to move the whole polygon. Focus a corner and use arrow keys to move it (Shift moves farther). **Remove Region** deletes the selected region. During drawing, Backspace removes the last corner and Escape cancels; Escape also cancels a drag. Crossing polygon edges are rejected. Top regions in the list override regions below them where they overlap, independently for each outline. Drag the handle or use the ordering menu to change priority; each completed move is one undo step.

Region vertices scale with the artwork and follow it when sheet padding changes, while their channel widths and taper lengths stay in millimeters. Regions, unfinished polygons, editing state, and undo history recover after reload and are included in session exports. Each completed polygon, width/taper/scope change, drag, or deletion is one undo step. Settings and tab resets preserve regions; loading new artwork clears them. Region guides appear only in Width Regions and are excluded from SVG downloads.

## Editing tabs

Choose **Tabs**, then select a tab in the preview or use the outline and tab selectors. The selected tab has a bright pink ring. You can remove it, change its width or position, or drag it along its outline. **Add Tab** previews a location when you point near an outline; click to place it. Keep clicking outlines to add more tabs until you choose **Finish Adding** or press Escape. Each placement is a separate undo step.

Drag empty space in the SVG to draw a rectangle and select the tab centers inside it. Under **Drag a rectangle to select tabs on:**, **Current Layer** is the default: rectangle selection uses the outline chosen before the drag starts. Choose **All Layers** to select tabs across outlines. Hold Shift to add a rectangle or another tab to the selection. Set **Width** to give all selected tabs the same requested width. The **Position (move group)** control shows the first selected tab’s position; changing it shifts every selected tab by the same percentage of its own outline. Dragging any selected tab also moves the group. Closed paths wrap around; groups containing open paths stop together at their endpoints to preserve spacing. **Remove Selected Tabs** and **Use Default Width** apply to the whole selection.

The first individual edit makes that outline **Custom**, preserving all its tab positions and count. Automatic count and position controls continue to affect only automatic outlines. All tabs inherit **Default Tab Width** unless individually overridden; **Use Default Width** clears an override. Custom positions scale proportionally with artwork size, while widths stay in millimeters.

**Reset Layer to Automatic** and **Reset All Tabs to Automatic** discard custom positions and width overrides and apply the current automatic settings. **Reset Settings & Tabs** restores settings and layouts together. Undo/Redo covers edits, resets, and settings; a slider gesture or drag is one undo step. Loading another SVG or sample starts a new layout and clears undo history. The workspace is saved automatically in browser local storage, including the uploaded SVG, settings, custom tabs, selection, editing mode, preview options, zoom, scroll position, and undo/redo history. Reloading or reopening the same URL restores it. Pending slider, drag, and number-field edits are committed before a live reload. Storage belongs to the browser and site address: use the same host and port to return to the same workspace. If storage fills up, older undo history is trimmed first; a failed save is reported in the editor. The exported SVG contains the resulting cuts, not editable project state.

Use Tab to focus a preview tab, Enter/Space to select it, Delete/Backspace to remove the selected tabs even after focus leaves the preview (except while typing in a field), and Left/Right arrows to move it by 0.1% of the outline (Shift for 1%). Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes outside form inputs. Escape cancels placement or an active drag. Selected-tab controls appear in the side inspector. Tool labels stay stable, and the active tool is highlighted. Selecting or deselecting a tab changes the inspector without moving the desktop canvas. On phones, Inspect Canvas collapses the tool controls and Show Controls restores them.

Custom tabs are never automatically removed or repositioned. Overlapping tabs merge into a single uncut gap and produce a warning. Tabs too wide for an outline, or clipped at an open endpoint, show both requested and effective width. An outline can have zero tabs; closed outlines warn that the inner piece may come loose. Inspect warnings before cutting.

All uploaded artwork is processed locally in the browser and is not sent to a server. Geometry dependencies are vendored, with attribution, in `vendor/`. Fonts are self-hosted, with their licenses in `vendor/fonts/`. No remote services are needed at runtime.

## Verification

`npm test` also checks review decisions, protected type choices, list ordering against actual material and width geometry, and backward-compatible workflow recovery. Open `/tests/ui-workflow.html` for the guided workflow, type-review queue, touch ordering, undo/reload, review support, independent overlays, and 320–768 px layouts.

`npm test` checks simplification geometry (neck splitting, hole preservation, smoothing, physical thresholds, and open endpoints), development-server file watching, static preview isolation, workspace storage recovery, outline visibility, full cut-aways, polygon width overrides and layer scopes, channel and tab geometry, custom layouts, width inheritance, resizing, seam wrapping, overlaps, zero-tab outlines, open endpoints, intersection warnings, and SVG export dimensions. With the development server running, open `/tests/material-editing.html` for Keep/Cut Away composition, feature-aware bridges, manual curved handles, recovery, export and narrow layouts; open `/tests/panning.html` for mouse/touch panning, editing gestures, bounds, Fit, and reload recovery; open `/tests/simplification.html` for the Great Lakes preview, sliders, node overlays, cancellation, replacement, undo/redo, reload recovery, empty results, and mobile layout; open `/tests/outline-editing.html` for visibility, export, persistence, keyboard and responsive checks, `/tests/region-editing.html` for polygon drawing, widths, layer scopes, dragging, export, persistence, and mobile checks, `/tests/tab-editing.html` for tab interactions, `/tests/responsive.html` for mobile/tablet editing checks, `/tests/workspace.html` for reload recovery, pending edits, undo/redo, and CSS swapping, and `/tests/import.html` for SVG import checks.

Built with Paper.js 0.12.18 for SVG geometry and Clipper 6.4.2 for polygon offsets and unions.
