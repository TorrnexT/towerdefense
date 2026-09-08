import type { Point3 } from './index';

/** Earliest contact during a tick, including moving targets and high-speed crossings. */
export function sweptSphere(
  from: Point3,
  to: Point3,
  targetFrom: Point3,
  targetTo: Point3,
  radius: number,
): number | null {
  const x = from.x - targetFrom.x,
    y = from.y - targetFrom.y,
    z = from.z - targetFrom.z;
  const dx = to.x - targetTo.x - x,
    dy = to.y - targetTo.y - y,
    dz = to.z - targetTo.z - z;
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (x * dx + y * dy + z * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  return time >= 0 && time <= 1 ? time : null;
}

export function lerpPoint(a: Point3, b: Point3, t: number): Point3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
