export function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '--:--'
  const seconds = Math.floor(value)
  const minutes = Math.floor(seconds / 60)
  const tail = String(seconds % 60).padStart(2, '0')
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`
}
