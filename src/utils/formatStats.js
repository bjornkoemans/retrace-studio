export function fmtDur(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '\u2014'
  if (sec < 1) return (sec * 1000).toFixed(0) + ' ms'
  if (sec < 60) return sec.toFixed(1) + ' s'
  if (sec < 3600) return (sec / 60).toFixed(1) + ' min'
  if (sec < 86400) return (sec / 3600).toFixed(2) + ' hr'
  return (sec / 86400).toFixed(1) + ' d'
}

export function fmtPct(val) {
  if (val === undefined || val === null || isNaN(val)) return '\u2014'
  return val.toFixed(1) + '%'
}

export function fmtNum(val, decimals = 1) {
  if (val === undefined || val === null || isNaN(val)) return '\u2014'
  return val.toFixed(decimals)
}
