// The Star Engine's rules. Shared by the server (game.js) and the browser (for live previews),
// so what you see when hovering a socket is exactly what you get.
(function (root) {
  const ELEMENTS = {
    sun: { name: 'Sun', icon: '☀', color: '#f2c14e', rule: 'Boosts every rune it touches by 50%.' },
    moon: { name: 'Moon', icon: '☾', color: '#b9c6ff', rule: '+100% for each Sun rune it touches.' },
    tide: { name: 'Tide', icon: '≈', color: '#4fc3f7', rule: '+40% for each Tide rune it touches. Puts out Embers.' },
    ember: { name: 'Ember', icon: '♨', color: '#ff7a45', rule: 'Worth double, but fizzles to nothing if it touches a Tide rune.' },
    void: { name: 'Void', icon: '◉', color: '#b07cff', rule: 'Every other rune in its row ×1.5, but runes touching it lose half.' },
  };
  const ELEMENT_KEYS = Object.keys(ELEMENTS);
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const MAX_RANK = 8;
  const runePower = (rank) => Math.pow(2, rank - 1);

  // grid: array of size*size; each entry is null or { el, rank }. "Touching" = up/down/left/right.
  function score(grid, size) {
    const n = size * size;
    const mult = Array(n).fill(1);
    const at = (r, c) => (r >= 0 && r < size && c >= 0 && c < size ? r * size + c : -1);
    const touching = (i) => {
      const r = Math.floor(i / size), c = i % size;
      return [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)].filter((j) => j >= 0 && grid[j]);
    };
    for (let i = 0; i < n; i++) {
      const g = grid[i];
      if (!g) continue;
      const nb = touching(i);
      const count = (el) => nb.filter((j) => grid[j].el === el).length;
      if (g.el === 'sun') nb.forEach((j) => { mult[j] *= 1.5; });
      if (g.el === 'moon') mult[i] *= 1 + count('sun');
      if (g.el === 'tide') mult[i] *= 1 + 0.4 * count('tide');
      if (g.el === 'ember') mult[i] *= count('tide') ? 0 : 2;
      if (g.el === 'void') {
        const r = Math.floor(i / size);
        for (let c = 0; c < size; c++) { const j = r * size + c; if (j !== i && grid[j]) mult[j] *= 1.5; }
        nb.forEach((j) => { mult[j] *= 0.5; });
      }
    }
    const values = grid.map((g, i) => (g ? 10 * runePower(g.rank) * mult[i] : 0));
    return { total: Math.round(values.reduce((a, b) => a + b, 0)), values: values.map((v) => Math.round(v)) };
  }

  const api = { ELEMENTS, ELEMENT_KEYS, ROMAN, MAX_RANK, runePower, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);
