export function useHaptics() {
  const vibe = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  }
  return {
    tap: () => vibe(8),
    select: () => vibe(12),
    success: () => vibe([10, 40, 20]),
    warning: () => vibe([15, 50, 15]),
    error: () => vibe([30, 60, 30]),
    heavy: () => vibe(25),
  }
}
