import { measureContour } from './geometry.js';

export function scaleArtwork(artwork, width, padding) {
  const { bounds } = artwork;
  const scale = width / (bounds.maxX - bounds.minX);
  return {
    contours: artwork.contours.map(c => ({ ...c, ...measureContour(c.points.map(p => ({ x: (p.x - bounds.minX) * scale + padding, y: (p.y - bounds.minY) * scale + padding })), c.closed) })),
    width: width + 2 * padding,
    height: (bounds.maxY - bounds.minY) * scale + 2 * padding,
    artworkHeight: (bounds.maxY - bounds.minY) * scale,
  };
}
