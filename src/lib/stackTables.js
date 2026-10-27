// On phones, tables marked className="stack" turn into cards (see styles.css).
// Each cell needs its column name as a label; this copies it from the header row
// so the page markup stays simple.
function labelTable(table) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  for (const tr of table.querySelectorAll('tbody tr')) {
    let col = 0;
    for (const td of tr.children) {
      const label = heads[col] || '';
      if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
      col += td.colSpan || 1;
    }
  }
}

export function startStackTables() {
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll('table.stack').forEach(labelTable);
  };
  const obs = new MutationObserver(() => {
    if (!queued) { queued = true; requestAnimationFrame(run); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  run();
}
