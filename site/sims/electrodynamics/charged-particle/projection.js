// Orbit camera for the 3D scene: world Y is up, the camera yaws around Y
// (rotY) and pitches around X (rotX), then a simple perspective is applied.

const FOV = 700;

/**
 * Project a world point to screen coordinates.
 * cam = { rotX, rotY, cx, cy, scale }  (cx, cy = screen origin, scale = px per unit)
 * Returns { sx, sy, z, s } where s is the perspective factor.
 */
export function project(cam, x, y, z) {
  // Rotate around the Y axis (yaw)
  const cosY = Math.cos(cam.rotY), sinY = Math.sin(cam.rotY);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  // Rotate around the X axis (pitch); negative rotX tilts the view to see the floor
  const cosX = Math.cos(cam.rotX), sinX = Math.sin(cam.rotX);
  const y2 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  // Perspective
  const s = FOV / (FOV + z2 + 250);
  // Canvas y grows downward, so negate y2 to make world Y point up on screen
  return { sx: cam.cx + x1 * cam.scale * s, sy: cam.cy - y2 * cam.scale * s, z: z2, s };
}
