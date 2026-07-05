/**
 * Football panel geometry — icon-standard Telstar front view.
 *
 * One central black pentagon + five outer black caps with white hex gaps
 * between them. Reads clearly as a football at any size (unlike six
 * overlapping full pents, which collapse into a dark blob when spinning).
 */

type Point = [number, number];

const DEG = Math.PI / 180;
const CENTER: Point = [50, 50];

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function normalize([x, y]: Point): Point {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}

function scale([x, y]: Point, s: number): Point {
  return [x * s, y * s];
}

function pathFromPoints(points: Point[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
}

function pentagonVertices(
  center: Point,
  radius: number,
  rotation = -Math.PI / 2,
): Point[] {
  const [cx, cy] = center;
  return Array.from({ length: 5 }, (_, i) => {
    const angle = rotation + (i * 2 * Math.PI) / 5;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as Point;
  });
}

/** Point on the ball outline along a ray from centre. */
function rimPoint(origin: Point, direction: Point, radius: number): Point {
  return add(origin, scale(normalize(direction), radius));
}

export type FootballArtwork = {
  /** Filled black panels */
  panels: string[];
  /** Dark seam strokes */
  seams: string[];
  /** Light stitch lines on white hex areas */
  stitches: string[];
};

/**
 * Classic readable football: centre pent + five outer caps + white hex wedges.
 * Tuned for viewBox 0 0 100 100, clip radius 47.
 */
export function buildFootballArtwork(
  center: Point = CENTER,
  pentRadius = 11.2,
  clipRadius = 47,
): FootballArtwork {
  const verts = pentagonVertices(center, pentRadius);
  const panels: string[] = [pathFromPoints(verts)];
  const seams: string[] = [pathFromPoints(verts)];
  const stitches: string[] = [];

  for (let i = 0; i < 5; i += 1) {
    const v0 = verts[i]!;
    const v1 = verts[(i + 1) % 5]!;
    const edgeMid = lerp(v0, v1, 0.5);
    const outward = normalize([edgeMid[0] - center[0], edgeMid[1] - center[1]]);

    const wingA = add(v0, scale(outward, 14));
    const wingB = add(v1, scale(outward, 14));
    const capTip = rimPoint(center, outward, clipRadius * 0.94);

    panels.push(pathFromPoints([v0, v1, wingB, capTip, wingA]));
    seams.push(`M${v0[0].toFixed(2)} ${v0[1].toFixed(2)} L${capTip[0].toFixed(2)} ${capTip[1].toFixed(2)}`);
    seams.push(`M${v0[0].toFixed(2)} ${v0[1].toFixed(2)} L${v1[0].toFixed(2)} ${v1[1].toFixed(2)}`);

    const hexApex = add(edgeMid, scale(outward, 22));
    stitches.push(
      `M${wingA[0].toFixed(2)} ${wingA[1].toFixed(2)} L${hexApex[0].toFixed(2)} ${hexApex[1].toFixed(2)} L${wingB[0].toFixed(2)} ${wingB[1].toFixed(2)}`,
    );
  }

  for (const vertex of verts) {
    const seamEnd = lerp(center, vertex, 1.28);
    seams.push(
      `M${vertex[0].toFixed(2)} ${vertex[1].toFixed(2)} L${seamEnd[0].toFixed(2)} ${seamEnd[1].toFixed(2)}`,
    );
  }

  return { panels, seams, stitches };
}

export const FOOTBALL_CLIP_RADIUS = 47;
