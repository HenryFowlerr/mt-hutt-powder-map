// Minimal marching-squares iso-contour extraction. Produces closed
// polygons (in grid coordinates) around regions where the field exceeds a
// threshold. Used to turn the dense powder field into irregular
// terrain-following patches instead of grid blobs.

type Point = [number, number]

const EPSILON = 1e-9

function interpolate(a: number, b: number, threshold: number) {
  if (Math.abs(b - a) < EPSILON) return 0.5
  return (threshold - a) / (b - a)
}

// For each cell, marching squares emits 0-2 segments. We stitch segments
// into closed rings by walking shared endpoints.
export function extractContours(
  field: Float32Array,
  width: number,
  height: number,
  threshold: number,
): Point[][] {
  const segments: Array<[Point, Point]> = []

  const value = (x: number, y: number) => field[y * width + x]

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const tl = value(x, y)
      const tr = value(x + 1, y)
      const br = value(x + 1, y + 1)
      const bl = value(x, y + 1)

      let caseIndex = 0
      if (tl >= threshold) caseIndex |= 8
      if (tr >= threshold) caseIndex |= 4
      if (br >= threshold) caseIndex |= 2
      if (bl >= threshold) caseIndex |= 1
      if (caseIndex === 0 || caseIndex === 15) continue

      const top: Point = [x + interpolate(tl, tr, threshold), y]
      const right: Point = [x + 1, y + interpolate(tr, br, threshold)]
      const bottom: Point = [x + interpolate(bl, br, threshold), y + 1]
      const left: Point = [x, y + interpolate(tl, bl, threshold)]

      switch (caseIndex) {
        case 1:
          segments.push([left, bottom])
          break
        case 2:
          segments.push([bottom, right])
          break
        case 3:
          segments.push([left, right])
          break
        case 4:
          segments.push([right, top])
          break
        case 5: {
          const center = (tl + tr + br + bl) / 4
          if (center >= threshold) {
            segments.push([left, top])
            segments.push([bottom, right])
          } else {
            segments.push([left, bottom])
            segments.push([right, top])
          }
          break
        }
        case 6:
          segments.push([bottom, top])
          break
        case 7:
          segments.push([left, top])
          break
        case 8:
          segments.push([top, left])
          break
        case 9:
          segments.push([top, bottom])
          break
        case 10: {
          const center = (tl + tr + br + bl) / 4
          if (center >= threshold) {
            segments.push([top, right])
            segments.push([bottom, left])
          } else {
            segments.push([top, left])
            segments.push([bottom, right])
          }
          break
        }
        case 11:
          segments.push([top, right])
          break
        case 12:
          segments.push([right, left])
          break
        case 13:
          segments.push([right, bottom])
          break
        case 14:
          segments.push([bottom, left])
          break
      }
    }
  }

  return stitchSegments(segments)
}

function key(point: Point) {
  return `${point[0].toFixed(4)},${point[1].toFixed(4)}`
}

function stitchSegments(segments: Array<[Point, Point]>): Point[][] {
  const byStart = new Map<string, Array<[Point, Point]>>()
  for (const segment of segments) {
    const k = key(segment[0])
    const list = byStart.get(k)
    if (list) list.push(segment)
    else byStart.set(k, [segment])
  }

  const used = new Set<[Point, Point]>()
  const rings: Point[][] = []

  for (const segment of segments) {
    if (used.has(segment)) continue
    used.add(segment)
    const ring: Point[] = [segment[0], segment[1]]
    let guard = segments.length + 4

    while (guard > 0) {
      guard -= 1
      const tail = ring[ring.length - 1]
      const candidates = byStart.get(key(tail))
      let next: [Point, Point] | undefined
      if (candidates) {
        for (const candidate of candidates) {
          if (!used.has(candidate)) {
            next = candidate
            break
          }
        }
      }
      if (!next) break
      used.add(next)
      if (key(next[1]) === key(ring[0])) {
        // Closed the loop.
        break
      }
      ring.push(next[1])
    }

    if (ring.length >= 3) rings.push(ring)
  }

  return rings
}

// Ramer-Douglas-Peucker simplification in grid units.
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return ring

  const keep = new Array(ring.length).fill(false)
  keep[0] = true
  keep[ring.length - 1] = true

  const stack: Array<[number, number]> = [[0, ring.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number]
    let maxDistance = 0
    let maxIndex = start
    const [ax, ay] = ring[start]
    const [bx, by] = ring[end]
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy

    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = ring[i]
      let distance: number
      if (lengthSq === 0) {
        distance = Math.hypot(px - ax, py - ay)
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = i
      }
    }

    if (maxDistance > tolerance) {
      keep[maxIndex] = true
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }

  return ring.filter((_, index) => keep[index])
}

export function ringArea(ring: Point[]) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(area / 2)
}
