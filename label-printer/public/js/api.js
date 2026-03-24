// Comunicação com o backend

async function apiGetPrinters() {
  const res = await fetch('/printers');
  if (!res.ok) throw new Error('Erro ao buscar impressoras');
  return res.json();
}

async function apiPrint(imageBase64, options) {
  const res = await fetch('/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, options }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao imprimir');
  return data;
}

// Inicializa a lista de impressoras no select
async function loadPrinters() {
  const statusEl = document.getElementById('status-bar');
  try {
    const { printers } = await apiGetPrinters();
    const sel = document.getElementById('sel-printer');
    sel.innerHTML = '';
    printers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      if (p === 'Xprinter_XP_T271U_4') opt.selected = true;
      sel.appendChild(opt);
    });
    statusEl.textContent = `${printers.length} impressora(s) disponível(is)`;
    statusEl.className = 'header-status ok';
  } catch (err) {
    statusEl.textContent = 'Erro ao conectar com o servidor';
    statusEl.className = 'header-status err';
  }
}
