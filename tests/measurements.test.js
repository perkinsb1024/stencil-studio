import test from 'node:test';
import assert from 'node:assert/strict';
import { snapMeasurement, snapMeasurementPoint, measureSnapOptions, measurementSnapTargets } from '../src/measure-tool.js';
const size = { width: 100, height: 80 }, start = { x: 50, y: 40 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('angles snap only within five degrees in every quadrant', () => {
  for (const options of [{ axes: true }, { diagonal: true }, { axes: true, diagonal: true }]) {
    const angles = options.axes && options.diagonal ? [0,45,90,135,180,225,270,315] : options.axes ? [0,90,180,270] : [45,135,225,315];
    for (const angle of angles) for (const offset of [-6,-5,-3,3,5,6]) {
      const r = (angle + offset) * Math.PI / 180, point = { x: start.x + 20 * Math.cos(r), y: start.y + 20 * Math.sin(r) };
      const result = snapMeasurement(start, point, options, size);
      if (Math.abs(offset) > 5) { near(result.x, point.x); near(result.y, point.y); }
      else { const target = angle * Math.PI / 180; near((result.x-start.x)*Math.sin(target)-(result.y-start.y)*Math.cos(target), 0); }
    }
  }
});
test('sheet clipping preserves a snapped angle and disabled snapping preserves the pointer', () => {
  const end = snapMeasurement({x:95,y:70}, {x:120,y:94}, {diagonal:true}, size);
  near(end.x,100); near(end.y,75);
  const pointer = {x:75,y:42};
  assert.deepEqual(snapMeasurement(start,pointer,{axes:true,disabled:true},size),pointer);
});
test('independent angle checkboxes combine and migrate legacy preferences', () => {
  assert.deepEqual(measureSnapOptions('auto'), { axes: true, diagonal: true, objects: false });
  const p = { x: 75, y: 62 };
  near(snapMeasurement(start, {x:75,y:42}, { axes: true }, size).y, 40);
  near(snapMeasurement(start, { x: 51, y: 65 }, { axes: true }, size).x, 50);
  const diagonal = snapMeasurement(start, p, { diagonal: true }, size);
  near(diagonal.x - 50, diagonal.y - 40);
  assert.deepEqual(snapMeasurement(start, p, {}, size), p);
});
test('object snapping prioritizes feature centers, projects onto lines, and respects tolerance', () => {
  const targets = { points: [{ x: 20, y: 20 }], lines: [{ a: { x: 0, y: 21 }, b: { x: 100, y: 21 } }] };
  const snap = p => snapMeasurementPoint(null, p, { objects: true }, size, targets, 3);
  assert.deepEqual(snap({ x: 21, y: 21 }).point, { x: 20, y: 20 });
  assert.deepEqual(snap({ x: 60, y: 22 }).point, { x: 60, y: 21 });
  assert.equal(snap({ x: 60, y: 30 }).snapped, false);
  assert.equal(snapMeasurementPoint(null, { x: 21, y: 21 }, {}, size, targets, 3).snapped, false);
});
test('combined object and angle snapping uses intersections without violating the angle', () => {
  const targets = { points: [{ x: 72, y: 43 }], lines: [{ a: { x: 75, y: 10 }, b: { x: 75, y: 70 } }] };
  const snap = snapMeasurementPoint(start, { x: 74, y: 42 }, { axes: true, objects: true }, size, targets, 4);
  assert.equal(snap.snapped, true); assert.deepEqual(snap.point, { x: 75, y: 40 });
  const diagonal = snapMeasurementPoint(start, { x: 74, y: 64 }, { diagonal: true, objects: true }, size, targets, 4);
  near(diagonal.point.x, 75); near(diagonal.point.y, 65);
});
test('targets include tab centers, SVG segments, and straight and curved bridge features', () => {
  const a = { x: 10, y: 20 }, b = { x: 50, y: 20 }, control = { x: 30, y: 40 };
  const targets = measurementSnapTargets({ scaled: { contours: [
    { id: 'visible', points: [a, b], closed: false },
    { id: 'hidden', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false }
  ] }, hiddenContours: ['hidden'], result: { bridges: [{ point: { x: 80, y: 70 } }], paths: [], regionBridges: [
    { a, b, polygon: [a, b, { x: 50, y: 22 }] }, { a, b, control, polygon: [] }
  ] } });
  assert.ok(targets.points.some(p => p.x === 80 && p.y === 70));
  assert.ok(targets.points.some(p => p.x === 10 && p.y === 20));
  assert.ok(targets.points.some(p => p.x === 30 && p.y === 20));
  assert.ok(targets.points.some(p => p.x === 30 && p.y === 30));
  assert.ok(targets.lines.some(l => l.a === a && l.b === b));
  assert.ok(!targets.lines.some(l => l.a.x === 0 && l.a.y === 0));
});

test('Alt override bypasses both angle and object snapping', () => {
  const pointer={x:74,y:42},targets={points:[{x:75,y:40}],lines:[]};
  const result=snapMeasurementPoint(start,pointer,{axes:true,objects:true,disabled:true},size,targets,5);
  assert.deepEqual(result,{point:pointer,snapped:false});
});
