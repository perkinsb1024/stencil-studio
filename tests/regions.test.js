import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleRegions, validPolygon, containsPoint, channelWidthAt, createChannelWidthProfile } from '../src/regions.js';
const points = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.5 }, { x: 0.1, y: 0.5 }];
test('region vertices follow artwork resizing and padding while widths stay in millimeters', () => {
  const regions = [{ id: 'region-one', width: 0.8, taperLength: 12, contourId: null, points }];
  const original = structuredClone(regions);
  const scaled = scaleRegions(regions, 200, 8)[0];
  assert.deepEqual(scaled.points[0], { x: 28, y: 48 });
  assert.deepEqual(scaled.points[2], { x: 88, y: 108 });
  assert.equal(scaled.width, 0.8);
  assert.equal(scaled.taperLength, 12);
  assert.deepEqual(scaleRegions(regions, 100, 20)[0].points[0], { x: 30, y: 40 });
  assert.deepEqual(regions, original);
});
test('polygons accept concave boundaries and reject crossings, repeats and degenerate shapes', () => {
  assert.ok(validPolygon(points));
  assert.ok(validPolygon([...points].reverse()));
  assert.ok(validPolygon([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }]));
  for (const shape of [[], points.slice(0, 2), [points[0], points[2], points[1], points[3]], [...points, points[0]], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], [{ x: NaN, y: 1 }, ...points], [...points, null]]) assert.equal(validPolygon(shape), false);
});
test('point containment includes edges and regional width follows layer and overlap priority', () => {
  assert.equal(containsPoint(points, { x: 0.1, y: 0.3 }), true);
  assert.equal(containsPoint(points, { x: 0.09, y: 0.3 }), false);
  const options = { channelWidth: 5, regions: [{ points, width: 1, contourId: null }, { points, width: 2, contourId: 'outline-0' }] };
  assert.equal(channelWidthAt({ x: 0.2, y: 0.3 }, 'outline-0', options), 2);
  assert.equal(channelWidthAt({ x: 0.2, y: 0.3 }, 'outline-1', options), 1);
  assert.equal(channelWidthAt({ x: -10, y: 0.3 }, 'outline-0', options), 5);
});

test('each region uses its own taper length outside its boundary, respecting scope and overlap priority', () => {
  const square = (x, width, taperLength, contourId = null) => ({ points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }], width, taperLength, contourId });
  const options = { channelWidth: 8, regions: [square(20, 2, 4), square(60, 4, 12, 'outline-0')] };
  const widthAt = (x, id = 'outline-0') => channelWidthAt({ x, y: 5 }, id, options);
  assert.equal(widthAt(20), 2);
  assert.equal(widthAt(18), 5);
  assert.equal(widthAt(16), 8);
  assert.equal(widthAt(60), 4);
  assert.equal(widthAt(54), 6);
  assert.equal(widthAt(48), 8);
  assert.equal(widthAt(54, 'outline-1'), 8);
  const overlap = { channelWidth: 8, regions: [square(20, 2, 4), square(20, 4, 12)] };
  assert.equal(channelWidthAt({ x: 20, y: 5 }, 'outline-0', overlap), 4);
  assert.equal(channelWidthAt({ x: 14, y: 5 }, 'outline-0', overlap), 6);
});

test('regional styles inherit independently and honor polygon boundaries, object scope and priority', () => {
  const base = { points, width: 2, taperLength: 5, contourId: null };
  const options = { channelWidth: 2, roundedTabs: false, roundedChannelCorners: true, regions: [
    { ...base, roundedTabs: true, roundedChannelCorners: false },
    { ...base, contourId: 'outline-0', roundedChannelCorners: true },
  ] };
  const profile = createChannelWidthProfile('outline-0', options);
  assert.equal(profile.shapeAt({ x: 0.2, y: 0.3 }, 'roundedTabs'), true);
  assert.equal(profile.shapeAt({ x: 0.2, y: 0.3 }, 'roundedChannelCorners'), true);
  assert.equal(createChannelWidthProfile('outline-1', options).shapeAt({ x: 0.2, y: 0.3 }, 'roundedChannelCorners'), false);
  assert.equal(profile.shapeAt({ x: 0.09, y: 0.3 }, 'roundedTabs'), false);
  assert.equal(profile.shapeAt({ x: 0.1, y: 0.3 }, 'roundedTabs'), true);
});
