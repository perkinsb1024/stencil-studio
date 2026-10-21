// Keep interface structure separate from geometry and editing gestures.
export function workspaceView(icon, bridgePanel) {
  return `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Stencil Studio Home">stencil<span class="brand-light">studio</span><span class="brand-dot">.</span></a>
    <div class="header-right"><span id="save-status" class="save-status" role="status"></span><button class="text-button" id="help">${icon('help')} Help</button></div>
  </header>
  <main>
    <nav class="workflow" aria-label="Stencil Workflow">
      <button data-step="1" aria-current="step"><span class="step">1</span><span>Your Artwork</span></button>
      <span class="workflow-line" aria-hidden="true"></span>
      <button data-step="2"><span class="step">2</span><span>Shape Your Stencil</span></button>
      <span class="workflow-line" aria-hidden="true"></span>
      <button data-step="3"><span class="step">3</span><span>Review & Export</span></button>
    </nav>
    <div class="document-bar"><div class="document-title">${icon('file')}<strong id="document-name">Bloom.svg</strong><span id="sample-badge" class="badge">Sample</span></div><div class="history-actions"><button id="undo" class="small-button" aria-label="Undo Last Change" title="Undo (⌘/Ctrl Z)" disabled>Undo</button><button id="redo" class="small-button" aria-label="Redo Last Change" title="Redo (⌘/Ctrl Shift Z)" disabled>Redo</button></div></div>
    <div class="workspace" data-workflow-step="1">
      <aside class="inspector" aria-label="Stencil Settings">
        <div class="inspector-body">
          <section class="control-section source-section" id="artwork-step">
            <div class="section-heading"><h1>Your Artwork</h1><span class="format-tag">SVG</span></div>
            <p class="panel-description">Start with an SVG or explore a sample.</p>
            <input type="file" id="file-input" accept=".svg,image/svg+xml" hidden />
            <button class="upload-zone" id="upload">${icon('upload')}<strong>Drop your SVG here</strong><span>or click to browse files</span><small>Maximum 3 MB</small></button>
            <details class="sample-options"><summary>Try a Sample</summary><div class="examples"><button data-example="bloom" class="active">Bloom</button><button data-example="orbit">Orbit</button><button data-example="arch">Arch</button><button data-example="football">Football</button></div></details>
            <div class="current-file">${icon('file')}<div><strong id="filename">Bloom.svg</strong><span id="source-info"></span></div></div>
            <p class="control-hint" id="replace-note" hidden>Replacing artwork starts a new session and clears its edits.</p>
            <div id="import-issues" class="inline-issues" hidden></div>
            <div class="detection-summary"><strong>Layer-Type Detection</strong><p id="detection-summary"></p><button class="small-button" data-review-types>Review Layer Types</button></div>
            <button id="simplify-artwork" class="small-button simplify-launch" aria-haspopup="dialog" aria-controls="simplify-dialog">Simplify SVG ${icon('arrow')}</button>
            <p class="privacy-note">Your files stay on your device.</p>
          </section>
          <section id="shape-step" hidden>
            <div class="control-section size-section"><div class="section-heading"><h1>Shape Your Stencil</h1><button class="small-button" popovertarget="stencil-settings">Stencil Settings</button></div><div class="control-label"><label for="artworkWidth">Artwork Width</label><div class="number-unit"><input id="artworkWidth" type="number" min="10" max="1000" step="1" value="150" /><span>mm</span></div></div><p class="control-hint" id="artwork-height">Height scales proportionally.</p></div>
            <div class="tab-edit-toolbar" role="group" aria-label="Editing Tool">
              <button id="edit-outlines" data-description="Choose what to cut" aria-pressed="false" aria-controls="outline-inspector">Layers</button>
              <button id="edit-tabs" data-description="Leave small gaps" aria-pressed="false" aria-controls="tab-inspector">Tabs</button>
              <button id="edit-bridges" data-description="Connect material" aria-pressed="false" aria-controls="bridge-inspector">Bridges</button>
              <button id="edit-regions" data-description="Adjust channel widths" aria-pressed="false" aria-controls="region-inspector">Width Regions</button>
            </div>
            <button id="toggle-controls" class="text-button mobile-only" aria-expanded="true">Inspect Canvas</button>
            <div id="tool-controls">
              <section class="outline-inspector editing-panel" id="outline-inspector" aria-label="Layer Editor" hidden>
                <div class="tab-inspector-heading"><h2>Layers</h2><span id="outline-count"></span></div>
                <div class="layer-toolbar"><button class="small-button" popovertarget="layer-actions">Layer Actions</button><button class="text-button" popovertarget="type-guide">Layer Type Guide</button></div>
                <section id="layer-selection-controls" class="layer-selection-controls" aria-label="Selected Layers" hidden>
                  <strong id="selected-layer-count" role="status"></strong>
                  <label class="field" for="selected-layer-treatment">Change Layer Type<select id="selected-layer-treatment" aria-describedby="selected-layer-type-hint"><option value="" disabled>Mixed Types — Choose a Type</option><option value="outline">Outline</option><option value="keep">Keep</option><option value="cut">Cut Away</option></select></label>
                  <p class="control-hint" id="selected-layer-type-hint">Applies immediately to every selected layer.</p>
                </section>
                <p class="control-hint layer-list-hint">Select layers here or on the canvas. Drag the grip to reorder.</p>
                <div class="type-review-entry"><button id="review-areas" class="small-button">Review Layer Types</button><span id="review-count" class="badge"></span></div>
                <section id="type-review" class="type-review" aria-label="Review Layer Types" hidden>
                  <div class="tab-inspector-heading"><h3>Review Layer Types</h3><button id="close-type-review" class="icon-button" aria-label="Close Review">${icon('close')}</button></div>
                  <p class="control-hint">Reviewing a layer does not change it until you choose an action.</p>
                  <strong id="review-layer-name"></strong><div id="review-thumbnail"></div>
                  <dl class="review-types"><div><dt>Current Type</dt><dd id="review-current"></dd></div><div><dt>Suggested Type</dt><dd id="review-suggested"></dd></div></dl>
                  <p id="area-review-hint" class="edit-hint"></p><span id="review-progress" class="badge" role="status"></span>
                  <div class="review-decisions"><button id="accept-area-suggestion" class="primary-button">Use Suggested Type</button><button id="keep-area-type" class="small-button">Keep Current Type</button></div>
                  <label class="field">Choose Another Type<select id="review-treatment"><option value="outline">Outline</option><option value="keep">Keep</option><option value="cut">Cut Away</option></select></label>
                  <div class="review-navigation"><button id="previous-area" class="small-button">Previous</button><button id="next-area" class="small-button">Next</button></div><p class="control-hint">Next skips this layer for now.</p>
                </section>
                <div class="layer-filters"><label class="sr-only" for="layer-search">Find Layers</label><input id="layer-search" type="search" placeholder="Find layers…" /><label class="sr-only" for="layer-filter">Filter Layers</label><select id="layer-filter"><option value="all">All Layers</option><option value="selected">Selected</option><option value="review">Needs Review</option></select></div>
                <p class="control-hint" id="layer-reorder-hint" hidden>Show all layers to reorder. <button class="text-button" id="clear-layer-filter">Clear Filters</button></p>
                <div id="outline-list" class="outline-list" role="list" aria-label="Layers"></div>
                <div id="type-guide" class="action-popover" popover><h3>Layer Type Guide</h3><dl class="treatment-guide"><dt>Outline</dt><dd>Remove a narrow channel. Tabs hold the pieces together.</dd><dt>Keep</dt><dd>Keep material inside this shape.</dd><dt>Cut Away</dt><dd>Remove material inside this shape.</dd></dl></div>
                <div id="layer-actions" class="action-popover" popover><h3>Layer Actions</h3><section class="layer-visibility-controls" aria-label="Layer Visibility">
                  <strong>Layer Visibility</strong>
                  <div class="layer-visibility-grid"><div class="outline-actions" id="layer-selection-actions" hidden><button id="hide-outlines" class="small-button" disabled>Hide Selected</button><button id="show-outlines" class="small-button" disabled>Show Selected</button><button id="keep-only-outlines" class="small-button" disabled>Hide Other Layers</button></div>
                  <button id="show-all-outlines" class="small-button" disabled>Show All Layers</button></div>
                  <p class="control-hint">Hidden layers are excluded from the stencil. Show All reveals every layer. Undo restores the previous visibility.</p>
                </section><button id="apply-area-suggestions" class="small-button">Reapply Automatic Types</button><p class="control-hint">Recheck artwork and update automatic types. Reviewed and manual choices stay in place.</p><button id="use-all-outlines" class="small-button">Set All Layers to Outline</button><p class="control-hint">Also shows hidden layers and marks every type as a manual choice. Undo is available.</p></div>
              </section>
              <section class="tab-inspector editing-panel" id="tab-inspector" aria-label="Tab Editor" hidden>
                <div class="tab-inspector-heading"><h2>Tabs</h2><span id="outline-mode" class="mode-badge"></span></div><p class="panel-description">Tabs leave small uncut gaps along Outline channels.</p>
                <div id="tabs-unavailable" class="empty-state" hidden><p>Tabs require an Outline layer. Change a layer’s type to Outline to add tabs.</p><button class="small-button" data-open-tool="layers">Edit Layers</button></div>
                <div id="tabs-available">
                  <details class="automatic-settings" open><summary>Automatic Placement</summary>
                    <div class="control"><div class="control-label"><label for="tabWidth">Default Tab Width</label><div class="number-unit"><input id="tabWidth" type="number" min="0.5" max="15" step="0.1" value="3" /><span>mm</span></div></div><input type="range" id="tabWidth-range" aria-label="Default Tab Width Slider" min="0.5" max="15" step="0.1" value="3" /></div>
                    <div class="control"><div class="control-label"><label for="tabCount">Tabs per Layer</label><div class="stepper"><button id="tabs-minus" aria-label="Fewer Tabs">${icon('minus')}</button><input id="tabCount" type="number" min="1" max="24" step="1" value="4" /><button id="tabs-plus" aria-label="More Tabs">${icon('plus')}</button></div></div></div>
                    <div class="control"><div class="control-label"><label for="tabOffset">Tab Position</label><output id="offset-value">0%</output></div><input type="range" id="tabOffset" min="0" max="100" step="1" value="0" aria-label="Tab Position" /></div><p class="control-hint" id="automatic-scope"></p>
                  </details>
                  <button id="add-tab" class="primary-button" aria-pressed="false">Add Tabs</button><p id="edit-hint" class="edit-hint" role="status" hidden></p>
                  <div class="tab-inspector-heading"><strong id="selected-outline-label">Tab Selection</strong></div>
                  <div class="tab-pickers"><label>Layer<select id="outline-picker" aria-label="Select Layer"></select></label><label>Tab<select id="tab-picker" aria-label="Select Tab"></select></label></div>
                  <fieldset class="selection-scope"><legend>Select Tabs On</legend><div class="selection-scope-options"><label><input type="radio" name="rectangle-selection-scope" id="selected-layer-only" value="selected" checked /><span>Current Layer</span></label><label><input type="radio" name="rectangle-selection-scope" id="all-layers" value="all" /><span>All Layers</span></label></div></fieldset>
                  <div class="tab-selection-area"><div id="tab-empty-state" class="empty-state">Select a tab in the canvas or choose one above.</div><div id="selected-tab-controls" hidden>
                    <div class="control"><div class="control-label"><label for="selected-tab-width">Tab Width</label><div class="number-unit"><input id="selected-tab-width" type="number" min="0.5" max="15" step="0.1" /><span>mm</span></div></div><input id="selected-tab-width-range" type="range" min="0.5" max="15" step="0.1" aria-label="Selected Tab Width Slider" /><p id="tab-width-status" class="control-hint"></p></div>
                    <div class="control"><div class="control-label"><label for="selected-tab-position">Position</label><div class="number-unit"><input id="selected-tab-position" type="number" min="0" max="100" step="0.1" /><span>%</span></div></div><input id="selected-tab-position-range" type="range" min="0" max="100" step="0.1" aria-label="Selected Tab Position Slider" /></div>
                  </div></div>
                  <div id="selected-tab-actions" class="outline-actions" hidden><button id="inherit-tab-width" class="small-button" disabled>Use Default Width</button><button id="remove-tab" class="small-button danger" disabled>Remove Tab</button></div><p class="control-hint" id="outline-mode-hint"></p>
                </div>
                <details class="panel-details"><summary>Advanced</summary><div class="control-label"><span id="tab-ends-label">Tab Ends</span><div class="view-switch" role="group" aria-labelledby="tab-ends-label"><button data-shape-setting="roundedTabs" data-rounded="true" aria-pressed="false">Rounded</button><button data-shape-setting="roundedTabs" data-rounded="false" aria-pressed="true">Sharp</button></div></div><p class="control-hint">Shape the cuts beside tabs without changing the gap.</p><button id="reset-outline" class="small-button">Reset Layer to Automatic</button><button id="reset-all-tabs" class="small-button" disabled>Reset All Tabs to Automatic</button></details>
              </section>
              <section class="region-inspector editing-panel" id="region-inspector" aria-label="Channel Width Regions" hidden>
                <div class="tab-inspector-heading"><h2>Channel Width Regions</h2><span id="region-count"></span></div><p class="panel-description">Use a different channel width in a specific area.</p>
                <div id="region-channel-settings"><button class="text-button" data-open-tool="tabs" id="region-channel-summary">Default channel width: 1.5 mm</button><div id="channel-settings"><h3>Outline Channels</h3><div class="control"><div class="control-label"><label for="channelWidth">Channel Width</label><div class="number-unit"><input id="channelWidth" type="number" min="0.2" max="12" step="0.1" value="1.5" /><span>mm</span></div></div><input type="range" id="channelWidth-range" aria-label="Channel Width Slider" min="0.2" max="12" step="0.1" value="1.5" /></div><div class="control control-label"><span id="channel-corners-label">Channel Corners</span><div class="view-switch" role="group" aria-labelledby="channel-corners-label"><button data-shape-setting="roundedChannelCorners" data-rounded="true" aria-pressed="true">Rounded</button><button data-shape-setting="roundedChannelCorners" data-rounded="false" aria-pressed="false">Sharp</button></div></div><p class="control-hint">Applies to all visible Outline layers, including those without tabs. Width Regions can override channel width locally. Keep and Cut Away use exact boundaries.</p></div></div>
                <div class="region-actions"><button id="draw-region" class="primary-button" aria-pressed="false">Draw Regions</button><button id="finish-region" class="primary-button" hidden>Finish Region</button><button id="cancel-region" class="small-button" hidden>Cancel</button></div><p class="edit-hint" id="region-hint" role="status"></p>
                <div id="region-list" class="ordered-list" role="list" aria-label="Width Region Priority"></div><p class="control-hint">Top regions take priority where they overlap.</p>
                <div class="region-fields"><label class="region-picker-field">Region<select id="region-picker" aria-label="Select Region"></select></label>
                  <label class="region-scope-field">Apply To<div class="region-scope-picker"><select id="region-scope" aria-label="Region Layers"></select><button id="select-region-layer" class="small-button" aria-pressed="false">Pick Layer</button></div></label>
                  <div class="control"><label for="region-width">Region Width (mm)</label><input id="region-width" type="number" min="0.2" max="12" step="0.1" value="0.8" /><input id="region-width-range" type="range" min="0.2" max="12" step="0.1" value="0.8" aria-label="Region Width Slider" /></div>
                  <div class="control"><label for="region-taper-length">Taper Length (mm)</label><input id="region-taper-length" type="number" min="0.1" max="50" step="0.1" value="5" aria-describedby="region-taper-hint" /><input id="region-taper-length-range" type="range" min="0.1" max="50" step="0.1" aria-label="Region Taper Length Slider" /></div>
                </div><p id="region-taper-hint" class="control-hint">Distance over which this width blends into the surrounding channel.</p><button id="remove-region" class="small-button danger" disabled>Remove Region</button>
              </section>
              ${bridgePanel}
            </div>
            <div id="stencil-settings" class="action-popover" popover><h3>Reset Settings</h3><button id="reset" class="small-button">Reset Settings & Tabs</button><p class="control-hint">Restores size, channel and tab settings. Layer treatments, bridges, visibility, and width regions stay in place. Undo is available.</p></div>
          </section>
          <section class="control-section output-section" id="export-step" hidden>
            <div class="section-heading"><h1>Review & Export</h1></div><p class="panel-description">Check the result before sending it to your cutter.</p>
            <dl id="export-dimensions" class="export-dimensions"></dl><div id="review-support" class="support-summary"></div>
            <div id="review-issues"></div><p id="download-reason" class="control-hint" hidden></p>
            <button id="download" class="download-button">${icon('download')}<span>Download Stencil</span><span class="download-type">SVG</span></button><p class="control-hint">Keep the sheet dimensions when importing into your cutter software. The outer sheet edge is not a cut.</p>
            <button id="export-session" class="small-button session-export">${icon('download')}<span>Export Session</span><span class="session-type">JSON</span></button><p class="control-hint">Includes SVG, settings, edits, and undo history. Importing JSON sessions is not supported.</p>
          </section>
        </div>
        <footer class="inspector-footer"><button id="step-back" class="small-button" hidden>Back</button><button id="step-next" class="primary-button">Continue</button></footer>
      </aside>
      <section class="preview-panel" aria-label="Stencil Preview">
        <div class="preview-toolbar"><div class="view-switch" role="group" aria-label="Preview Mode"><button id="material-view" aria-pressed="true" class="active">Stencil</button><button id="cut-view" aria-pressed="false">Cut Paths</button></div><button id="overlay-toggle" class="small-button" popovertarget="preview-options">${icon('eye')} Overlays</button><div id="preview-options" class="preview-options" popover><h3>Preview Overlays</h3><label class="check-label"><input type="checkbox" id="show-tabs" checked /><span>Highlight Tabs</span></label><label class="check-label"><input type="checkbox" id="show-bridges" checked /><span>Highlight Bridges</span></label><label class="check-label"><input type="checkbox" id="show-original" /><span>Show Original SVG</span></label><label class="check-label"><input type="checkbox" id="show-hidden-outlines" checked /><span>Show Hidden Layer Guides</span></label><p class="control-hint">Guides and highlights are not exported.</p></div></div>
        <p id="move-view-hint" class="move-view-hint">Zoom in to move around the canvas. Tap Space to toggle Pan, or hold Space and drag while editing.</p><div class="canvas-area" id="canvas-area"><div id="preview-busy" class="preview-busy" hidden><div class="preview-busy-card"><span class="busy-spinner" aria-hidden="true"></span><p role="status" aria-live="polite">Updating stencil…</p><button id="cancel-generation" class="small-button">Cancel</button></div></div><div class="canvas-viewport" id="canvas-viewport"><div class="sheet-wrap" id="sheet-wrap"><svg id="preview-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Generated Stencil"></svg><div class="dimension-width" id="dimension-width"></div><div class="dimension-height" id="dimension-height"></div></div></div><div class="canvas-bottom-bar"><span id="canvas-context" class="canvas-context"></span><div class="zoom-controls"><button id="pan-preview" aria-label="Pan Canvas" aria-describedby="move-view-hint" aria-pressed="false" title="Toggle between dragging to pan and editing artwork" disabled>Pan</button><button id="zoom-out" aria-label="Zoom Out">${icon('minus')}</button><span id="zoom-label">100%</span><button id="zoom-in" aria-label="Zoom In">${icon('plus')}</button><button id="zoom-fit" title="Fit and Recenter" aria-label="Fit to View">Fit</button></div></div></div>
        <div class="preview-footer"><div class="legend" id="preview-legend"></div><div id="cut-count" class="count-pills"></div></div>
        <div class="preview-status"><div id="notice" class="notice" role="status" hidden></div><div id="geometry-issues" hidden><details><summary id="geometry-issue-summary">Review Issues</summary><ul id="geometry-issue-list"></ul></details></div><p id="material-status" class="outlines-empty" hidden></p><div id="outlines-empty" class="empty-state" hidden>All layers are hidden. <button class="text-button" id="recover-layers">Show All Layers</button></div><p id="no-cuts" hidden>No cut paths. Choose a layer treatment to create cuts.</p></div>
      </section>
    </div>
    <div id="announcements" class="sr-only" role="status" aria-live="polite"></div>
  </main>
  <dialog id="help-dialog" aria-labelledby="help-title"><button id="close-help" class="icon-button dialog-close" aria-label="Close Help">${icon('close')}</button><h2 id="help-title">How It Works</h2><ol><li><strong>Your Artwork</strong><p>Upload an SVG or choose a sample. Convert live text, masks, and clipping to paths first.</p></li><li><strong>Shape Your Stencil</strong><p>Choose layer types, then refine tabs, bridges, and channel widths. Changes apply automatically.</p></li><li><strong>Review & Export</strong><p>Inspect the cut paths and issues, then download at the displayed sheet dimensions.</p></li></ol><details open><summary>Layer Types</summary><p>Outline removes a narrow channel. Keep retains material. Cut Away removes the filled shape. Automatic detection proposes types; Review Layer Types lets you accept, keep, or skip each uncertain choice.</p></details><details><summary>Tabs and Bridges</summary><p>Tabs are small uncut gaps along Outline channels. Bridges connect separate pieces of retained material to the sheet. Purple material is removed; the light sheet stays. Amber squares mark automatic tabs and teal circles mark custom tabs. Bridge highlights are a separate overlay.</p></details><details><summary>Cutting and Export</summary><p>Inspect support and narrow details and test-cut a sample for your material. Connectivity does not guarantee material strength. The SVG contains final cut boundaries, without the sheet edge or preview guides. Export Session saves the original SVG and edits as JSON; session import is not supported.</p></details><details><summary>Shortcuts</summary><p>Undo: ⌘/Ctrl Z. Redo: ⌘/Ctrl Shift Z. Tap Space to toggle Pan. Hold Space or use the middle mouse button to pan while editing. Shift adds to selections. Delete removes selected tabs or bridges, or hides selected layers. Escape cancels placement or a drag. Arrow keys move focused handles; Shift moves farther. For regions, Enter finishes and Backspace removes the last corner.</p></details><button id="got-it" class="primary-button">Got It</button></dialog>`;
}
