import '../vendor/clipper.js';
import { simplifyArtwork } from './simplify-svg.js';
import { generateStencil } from './geometry.js';
import { scaleArtwork } from './artwork-scale.js';
import { scaleRegions } from './regions.js';
import { generateRegionBridges, snapRegionBridge, scaleBridges } from './material-geometry.js';
import { suggestAreas, applyAreaSuggestions } from './area-suggestions.js';

self.onmessage = ({ data }) => {
  try {
    let result;
    const { task, settings, artwork } = data;
    if (task === 'simplify') result = simplifyArtwork(artwork, data.options);
    else if (task === 'bridges') result = generateRegionBridges(data.contours, data.channelCuts, settings);
    else if (task === 'snap') result = snapRegionBridge(data.contours, data.channelCuts, settings, data.bridge);
    else {
      const padding = Math.max(settings.margin, Math.max(settings.channelWidth, ...settings.regions.map(r => r.width)) / 2 + 2);
      const scaled = { ...scaleArtwork(artwork, settings.artworkWidth, padding), padding, regions: scaleRegions(settings.regions, settings.artworkWidth, padding) };
      let suggestions;
      const options = () => ({ ...settings, padding, sheet: scaled, regions: scaled.regions, regionBridges: scaleBridges(settings.regionBridges, settings.artworkWidth, padding) });
      if (data.detectAreas) {
        suggestions = suggestAreas(artwork, options());
        applyAreaSuggestions(settings, artwork, suggestions);
      }
      result = { scaled, stencil: generateStencil(scaled.contours, options()), suggestions,
        materialTreatments: settings.materialTreatments, hiddenContours: settings.hiddenContours, cutawayContours: settings.cutawayContours };
    }
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message }); }
};
