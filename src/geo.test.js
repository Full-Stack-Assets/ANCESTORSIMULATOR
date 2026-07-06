import { describe, expect, it } from 'vitest';
import { projectWaypoints } from './geo.js';

describe('projectWaypoints', () => {
  it('places the first waypoint at the origin', () => {
    const result = projectWaypoints([{ lat: 40.0, lng: -75.0 }]);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(0);
    expect(result[0].z).toBe(0);
    expect(result[0].segmentKm).toBe(0);
  });

  it('keeps short local hops near true scale', () => {
    const result = projectWaypoints([
      { lat: 40.0, lng: -75.0 },
      { lat: 40.001, lng: -75.0 },
    ]);
    const dist = Math.hypot(result[1].x - result[0].x, result[1].z - result[0].z);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(200);
  });

  it('compresses long segments on a log curve', () => {
    const local = projectWaypoints([
      { lat: 40.0, lng: -75.0 },
      { lat: 40.001, lng: -75.0 },
    ]);
    const ocean = projectWaypoints([
      { lat: 53.0, lng: -8.0 },
      { lat: 40.0, lng: -75.0 },
    ]);
    const localDist = Math.hypot(local[1].x, local[1].z);
    const oceanDist = Math.hypot(ocean[1].x, ocean[1].z);
    expect(oceanDist).toBeGreaterThan(localDist);
    expect(ocean[1].segmentKm).toBeGreaterThan(1000);
    expect(oceanDist).toBeLessThan(1000);
  });

  it('preserves bearing when compressing distance', () => {
    const east = projectWaypoints([
      { lat: 40.0, lng: -75.0 },
      { lat: 40.0, lng: -74.0 },
    ]);
    const north = projectWaypoints([
      { lat: 40.0, lng: -75.0 },
      { lat: 41.0, lng: -75.0 },
    ]);
    expect(east[1].x).toBeGreaterThan(0);
    expect(Math.abs(east[1].z)).toBeLessThan(east[1].x * 0.1);
    expect(north[1].z).toBeLessThan(0);
    expect(Math.abs(north[1].x)).toBeLessThan(Math.abs(north[1].z) * 0.1);
  });

  it('nudges revisits apart so markers do not overlap', () => {
    const result = projectWaypoints([
      { lat: 40.0, lng: -75.0 },
      { lat: 40.1, lng: -74.9 },
      { lat: 40.0, lng: -75.0 },
    ]);
    const dist = Math.hypot(result[2].x - result[0].x, result[2].z - result[0].z);
    expect(dist).toBeGreaterThanOrEqual(20);
  });
});
