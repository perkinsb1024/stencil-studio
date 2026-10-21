import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { module: { exports: {} }, navigator: { userAgent: 'node' } };
vm.runInNewContext(readFileSync(new URL('../vendor/clipper.js', import.meta.url), 'utf8'), context);
globalThis.ClipperLib = context.module.exports;
const { composeMaterial, generateRegionBridges } = await import('../src/material-geometry.js');
const { measureContour } = await import('../src/geometry.js');

const rectangle = (x, y, width, height) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const shape = (index, points) => ({ ...measureContour(points, true), id: `outline-${index}`, regionId: `shape-${index}`, fillRule: 'nonzero' });
const contours = [shape(0, rectangle(10, 10, 80, 80)), shape(1, rectangle(20, 20, 12, 12)), shape(2, rectangle(68, 20, 12, 12)), shape(3, rectangle(44, 64, 12, 12))];
const options = { sheet: { width: 100, height: 100 }, artworkWidth: 80, padding: 10, bridgeWidth: 3, minimumMaterialWidth: 0.5,
  materialTreatments: { 'shape-0': 'cut', 'shape-1': 'keep', 'shape-2': 'keep', 'shape-3': 'keep' } };

// Capture the original search's choices when several pairs have equal scores.
// Skipping repeated pair work must preserve placement, direction, and order.
const expected = [
  { a: { x: 74, y: 20.02 }, b: { x: 74, y: 9.98 }, width: 3, automatic: true, id: 'bridge-auto-0', key: '0.800,-0.000:0.800,0.125' },
  { a: { x: 20.02, y: 26 }, b: { x: 9.98, y: 26 }, width: 3, automatic: true, id: 'bridge-auto-1', key: '-0.000,0.200:0.125,0.200' },
  { a: { x: 50, y: 90.02 }, b: { x: 50, y: 75.98 }, width: 3, automatic: true, id: 'bridge-auto-2', key: '0.500,0.825:0.500,1.000' },
];

function supported(shapes, settings, bridges) {
  const result = composeMaterial(shapes, [], { ...settings, regionBridges: bridges });
  assert.equal(result.unsupported.length, 0);
  assert.ok(result.regionBridges.every(b => b.valid));
}

test('bridge search preserves equal-score choices as successive islands join the sheet', () => {
  const bridges = generateRegionBridges(contours, [], options);
  assert.deepEqual(bridges, expected);
  supported(contours, options, bridges);
  const reinforced = generateRegionBridges(contours, [], { ...options, bridgeReinforcement: true });
  assert.deepEqual(reinforced.slice(0, 3), expected);
  assert.deepEqual(reinforced.slice(3).map(b => b.key), ['0.500,-0.000:0.500,0.675', '0.875,0.200:1.000,0.200', '0.200,-0.000:0.200,0.125']);
  supported(contours, options, reinforced);
  assert.deepEqual(generateRegionBridges(contours, [], options), expected);
});

test('bounded ray queries preserve diagonal connections across compound material holes', () => {
  const rotate = p => ({ x: 50 + (p.x - 50) * Math.cos(0.23) - (p.y - 50) * Math.sin(0.23), y: 50 + (p.x - 50) * Math.sin(0.23) + (p.y - 50) * Math.cos(0.23) });
  const rotated = contours.map((contour, i) => shape(i, contour.points.map(rotate)));
  const bridges = generateRegionBridges(rotated, [], options);
  assert.deepEqual(bridges.map(b => b.key), ['0.878,0.204:0.906,0.081', '0.081,0.094:0.204,0.122', '0.386,0.987:0.426,0.816']);
  supported(rotated, options, bridges);
});
