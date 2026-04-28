export const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9A6324', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#e6beff', '#1abc9c', '#e74c3c',
  '#3498db', '#9b59b6', '#2ecc71', '#e67e22', '#1f618d',
  '#c0392b', '#27ae60', '#8e44ad', '#f39c12', '#2980b9',
]

export function caseColor(id) {
  return PALETTE[id % PALETTE.length]
}
