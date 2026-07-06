/**
 * Classic Telstar — full truncated icosahedron (12 black pents, 20 white hexes)
 * orthographically projected for a readable 2D broadcast ball.
 */

type Vec3 = readonly [number, number, number];
type Face = readonly number[];

const PHI = (1 + Math.sqrt(5)) / 2;
const E = 3 * PHI;
const F = 1 + 2 * PHI;
const G = 2 + PHI;
const H = 2 * PHI;

const CENTER = 50;
const RADIUS = 47;

/** Upper-left key light — matches overlay specular. */
const KEY_LIGHT = normalize([-0.38, 0.52, 0.76]);

function truncatedIcosahedronVertices(): Vec3[] {
  const a = 0;
  const b = 1;
  const c = 2;

  return [
    [a, b, E],
    [a, b, -E],
    [a, -b, E],
    [a, -b, -E],
    [b, E, a],
    [b, -E, a],
    [-b, E, a],
    [-b, -E, a],
    [E, a, b],
    [-E, a, b],
    [E, a, -b],
    [-E, a, -b],
    [c, F, PHI],
    [c, F, -PHI],
    [c, -F, PHI],
    [-c, F, PHI],
    [c, -F, -PHI],
    [-c, F, -PHI],
    [-c, -F, PHI],
    [-c, -F, -PHI],
    [F, PHI, c],
    [F, -PHI, c],
    [-F, PHI, c],
    [F, PHI, -c],
    [-F, -PHI, c],
    [F, -PHI, -c],
    [-F, PHI, -c],
    [-F, -PHI, -c],
    [PHI, c, F],
    [-PHI, c, F],
    [PHI, c, -F],
    [PHI, -c, F],
    [-PHI, c, -F],
    [-PHI, -c, F],
    [PHI, -c, -F],
    [-PHI, -c, -F],
    [b, G, H],
    [b, G, -H],
    [b, -G, H],
    [-b, G, H],
    [b, -G, -H],
    [-b, G, -H],
    [-b, -G, H],
    [-b, -G, -H],
    [G, H, b],
    [G, -H, b],
    [-G, H, b],
    [G, H, -b],
    [-G, -H, b],
    [G, -H, -b],
    [-G, H, -b],
    [-G, -H, -b],
    [H, b, G],
    [-H, b, G],
    [H, b, -G],
    [H, -b, G],
    [-H, b, -G],
    [-H, -b, G],
    [H, -b, -G],
    [-H, -b, -G],
  ];
}

const TRUNCATED_ICOSAHEDRON_FACES: Face[] = [
  [0, 28, 36, 39, 29],
  [1, 32, 41, 37, 30],
  [2, 33, 42, 38, 31],
  [3, 34, 40, 43, 35],
  [4, 12, 44, 47, 13],
  [5, 16, 49, 45, 14],
  [6, 17, 50, 46, 15],
  [7, 18, 48, 51, 19],
  [8, 20, 52, 55, 21],
  [9, 24, 57, 53, 22],
  [10, 25, 58, 54, 23],
  [11, 26, 56, 59, 27],
  [0, 2, 31, 55, 52, 28],
  [0, 29, 53, 57, 33, 2],
  [1, 3, 35, 59, 56, 32],
  [1, 30, 54, 58, 34, 3],
  [4, 6, 15, 39, 36, 12],
  [4, 13, 37, 41, 17, 6],
  [5, 7, 19, 43, 40, 16],
  [5, 14, 38, 42, 18, 7],
  [8, 10, 23, 47, 44, 20],
  [8, 21, 45, 49, 25, 10],
  [9, 11, 27, 51, 48, 24],
  [9, 22, 46, 50, 26, 11],
  [12, 36, 28, 52, 20, 44],
  [13, 47, 23, 54, 30, 37],
  [14, 45, 21, 55, 31, 38],
  [15, 46, 22, 53, 29, 39],
  [16, 40, 34, 58, 25, 49],
  [17, 41, 32, 56, 26, 50],
  [18, 42, 33, 57, 24, 48],
  [19, 51, 27, 59, 35, 43],
];

function normalize([x, y, z]: Vec3): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceNormal(vertices: Vec3[], face: Face): Vec3 {
  const a = vertices[face[0]!]!;
  const b = vertices[face[1]!]!;
  const c = vertices[face[2]!]!;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return normalize([
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  ]);
}

function faceCenter(vertices: Vec3[], face: Face): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const index of face) {
    const v = vertices[index]!;
    x += v[0];
    y += v[1];
    z += v[2];
  }
  const n = face.length;
  return [x / n, y / n, z / n];
}

function project([x, y, z]: Vec3): readonly [number, number] {
  const tiltY = 0.12;
  const tiltX = -0.08;
  const ry = y * Math.cos(tiltX) - z * Math.sin(tiltX);
  const rz = y * Math.sin(tiltX) + z * Math.cos(tiltX);
  const rx = x;
  const fy = ry * Math.cos(tiltY) - rx * Math.sin(tiltY);
  const fx = ry * Math.sin(tiltY) + rx * Math.cos(tiltY);
  return [CENTER + fx * RADIUS, CENTER - fy * RADIUS];
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function pathFromFace(vertices: Vec3[], face: Face): string {
  return face
    .map((index, i) => {
      const [x, y] = project(vertices[index]!);
      return `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
    })
    .join(" ")
    .concat(" Z");
}

function panelLighting(normal: Vec3, isPentagon: boolean): { fill: string; stroke: string } {
  const ndotl = Math.max(0.08, dot(normal, KEY_LIGHT));
  const rim = Math.max(0, dot(normal, normalize([0.2, -0.35, -0.92])));

  if (isPentagon) {
    const base = 10 + ndotl * 34 + rim * 6;
    const v = Math.round(Math.min(52, base));
    return {
      fill: `rgb(${v}, ${v}, ${v})`,
      stroke: `rgba(255,255,255,${(0.05 + ndotl * 0.09).toFixed(3)})`,
    };
  }

  const base = 218 + ndotl * 37 - rim * 18;
  const v = Math.round(Math.min(255, Math.max(196, base)));
  return {
    fill: `rgb(${v}, ${v}, ${v})`,
    stroke: `rgba(0,0,0,${(0.1 + (1 - ndotl) * 0.12).toFixed(3)})`,
  };
}

export type FootballPanel = {
  d: string;
  fill: string;
  stroke: string;
  depth: number;
};

export type FootballArtwork = {
  panels: readonly FootballPanel[];
};

export function buildFootballArtwork(): FootballArtwork {
  const raw = truncatedIcosahedronVertices();
  const vertices = raw.map((v) => normalize(v));

  const panels: FootballPanel[] = TRUNCATED_ICOSAHEDRON_FACES.map(
    (face, faceIndex) => {
      const normal = faceNormal(vertices, face);
      const center = faceCenter(vertices, face);
      const isPentagon = face.length === 5;
      const { fill, stroke } = panelLighting(normal, isPentagon);

      return {
        d: pathFromFace(vertices, face),
        fill,
        stroke,
        depth: center[2] + normal[2] * 0.15,
      };
    },
  );

  panels.sort((a, b) => a.depth - b.depth);
  return { panels };
}

export const FOOTBALL_CLIP_RADIUS = RADIUS;
