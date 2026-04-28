export function fmtTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return hrs > 0 ? `${hrs}h${String(m).padStart(2, '0')}m` : `${mins}m`
}

export function fmtTimePrecise(seconds) {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function fmtAbsTime(s) {
  const m = s.match(/(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : s
}

export function fmtReward(r) {
  return (r / 1000).toFixed(0) + 'k'
}
