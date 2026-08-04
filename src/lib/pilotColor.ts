// The morning reading's color language. Each slider carries five anchor
// colors, one per notch, and positions between notches blend the neighbours,
// so the color is continuous under the finger even though the value snaps.
//
// Energy runs dusk slate to bright gold: light arriving. Anxiety runs calm
// teal to ember: heat building. Both are designed on the app's dark base and
// deliberately avoid signal red; ember is honest without shouting. The
// anchors live here as one editable block, same maintenance path as the
// pilot's other constant tables.

export const ENERGY_ANCHORS = ['#46536e', '#5e6a85', '#8b8577', '#c2975a', '#f0b34e']
export const ANXIETY_ANCHORS = ['#4fae9b', '#62a996', '#b3925f', '#cc7a52', '#d95c4f']

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Blend a position t (0..1) along an anchor strip. Piecewise linear between
 * adjacent anchors, so every notch shows its designed color exactly and the
 * spaces between glide.
 */
export function blendAnchors(anchors: string[], t: number, alpha = 1): string {
  const clamped = Math.min(1, Math.max(0, t))
  const span = anchors.length - 1
  const pos = clamped * span
  const i = Math.min(span - 1, Math.floor(pos))
  const local = pos - i
  const [r1, g1, b1] = hexToRgb(anchors[i])
  const [r2, g2, b2] = hexToRgb(anchors[i + 1])
  const r = Math.round(lerp(r1, r2, local))
  const g = Math.round(lerp(g1, g2, local))
  const b = Math.round(lerp(b1, b2, local))
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const energyColor = (t: number, alpha = 1) => blendAnchors(ENERGY_ANCHORS, t, alpha)
export const anxietyColor = (t: number, alpha = 1) => blendAnchors(ANXIETY_ANCHORS, t, alpha)
