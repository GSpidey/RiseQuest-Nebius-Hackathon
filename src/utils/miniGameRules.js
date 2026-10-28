// Pure rules shared by the interactive games and their regression tests.
function getPossibleMoves(empty, size) {
  const row = Math.floor(empty / size), col = empty % size;
  return [row > 0 ? empty - size : -1, row < size - 1 ? empty + size : -1,
    col > 0 ? empty - 1 : -1, col < size - 1 ? empty + 1 : -1].filter(i => i >= 0);
}
function moveTile(tiles, index, size) {
  const empty = tiles.indexOf(0);
  if (!getPossibleMoves(empty, size).includes(index)) return null;
  const next = [...tiles];
  [next[empty], next[index]] = [next[index], next[empty]];
  return next;
}
function samePattern(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((row, i) => Array.isArray(b[i]) && row.length === b[i].length && row.every((cell, j) => cell === b[i][j]));
}
module.exports = { getPossibleMoves, moveTile, samePattern };
