import '../vendor/clipper.js';
import { simplifyArtwork } from './simplify-svg.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, artwork: simplifyArtwork(data.artwork, data.options) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
