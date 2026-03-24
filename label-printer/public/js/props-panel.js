// Painel de propriedades do elemento selecionado

function updatePropsPanel() {
  const section = document.getElementById('props-section');
  const el = state.elements.find(e => e.id === state.selectedId);

  if (!el) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // Esconde todos os grupos de tipo
  document.getElementById('props-text').classList.add('hidden');
  document.getElementById('props-barcode').classList.add('hidden');
  document.getElementById('props-qr').classList.add('hidden');

  // Mostra grupo do tipo atual e preenche valores
  switch (el.type) {
    case 'text':
      document.getElementById('props-text').classList.remove('hidden');
      document.getElementById('prop-text-value').value  = el.text || '';
      document.getElementById('prop-font-size').value   = el.fontSize || 24;
      document.getElementById('prop-font-family').value = el.fontFamily || 'Arial';
      document.getElementById('prop-bold').checked      = !!el.bold;
      document.getElementById('prop-italic').checked    = !!el.italic;
      document.getElementById('prop-text-align').value  = el.textAlign || 'left';
      document.getElementById('prop-color').value       = el.color || '#000000';
      break;

    case 'barcode':
      document.getElementById('props-barcode').classList.remove('hidden');
      document.getElementById('prop-barcode-value').value  = el.value || '';
      document.getElementById('prop-barcode-format').value = el.format || 'CODE128';
      document.getElementById('prop-barcode-text').checked = el.showText !== false;
      break;

    case 'qr':
      document.getElementById('props-qr').classList.remove('hidden');
      document.getElementById('prop-qr-value').value = el.value || '';
      document.getElementById('prop-qr-ec').value    = el.ec || 'M';
      break;
  }

  // Posição e tamanho (comum a todos)
  document.getElementById('prop-x').value = el.x;
  document.getElementById('prop-y').value = el.y;
  document.getElementById('prop-w').value = el.w;
  document.getElementById('prop-h').value = el.h;
}

function initPropsPanel() {
  // ── Texto ──
  bind('prop-text-value', 'input', (el, v) => { el.text = v; });
  bind('prop-font-size',  'input', (el, v) => { el.fontSize = parseInt(v) || 24; });
  bind('prop-font-family','change',(el, v) => { el.fontFamily = v; });
  bind('prop-bold',       'change',(el, _, e) => { el.bold = e.target.checked; });
  bind('prop-italic',     'change',(el, _, e) => { el.italic = e.target.checked; });
  bind('prop-text-align', 'change',(el, v) => { el.textAlign = v; });
  bind('prop-color',      'input', (el, v) => { el.color = v; });

  // ── Barcode ──
  bind('prop-barcode-value',  'input', (el, v) => { el.value = v; });
  bind('prop-barcode-format', 'change',(el, v) => { el.format = v; });
  bind('prop-barcode-text',   'change',(el, _, e) => { el.showText = e.target.checked; });

  // ── QR ──
  bind('prop-qr-value', 'input', (el, v) => {
    el.value = v;
    // Limpa cache QR para forçar re-renderização
    Object.keys(qrCache).forEach(k => delete qrCache[k]);
  });
  bind('prop-qr-ec', 'change', (el, v) => {
    el.ec = v;
    Object.keys(qrCache).forEach(k => delete qrCache[k]);
  });

  // ── Posição e tamanho ──
  bindNum('prop-x', (el, v) => { el.x = v; });
  bindNum('prop-y', (el, v) => { el.y = v; });
  bindNum('prop-w', (el, v) => { el.w = Math.max(10, v); });
  bindNum('prop-h', (el, v) => { el.h = Math.max(10, v); });

  // ── Controles de z-order ──
  document.getElementById('btn-bring-front').addEventListener('click', () => {
    const idx = state.elements.findIndex(e => e.id === state.selectedId);
    if (idx < state.elements.length - 1) {
      saveUndo();
      const [el] = state.elements.splice(idx, 1);
      state.elements.push(el);
      render();
    }
  });

  document.getElementById('btn-send-back').addEventListener('click', () => {
    const idx = state.elements.findIndex(e => e.id === state.selectedId);
    if (idx > 0) {
      saveUndo();
      const [el] = state.elements.splice(idx, 1);
      state.elements.unshift(el);
      render();
    }
  });

  // ── Remover elemento ──
  document.getElementById('btn-delete-el').addEventListener('click', () => {
    if (state.selectedId === null) return;
    saveUndo();
    state.elements = state.elements.filter(e => e.id !== state.selectedId);
    state.selectedId = null;
    render();
    updatePropsPanel();
  });
}

// Utilitário: bind de campo a propriedade do elemento selecionado
function bind(id, event, setter) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(event, (e) => {
    const selEl = state.elements.find(el => el.id === state.selectedId);
    if (!selEl) return;
    setter(selEl, e.target.value, e);
    render();
  });
}

function bindNum(id, setter) {
  bind(id, 'input', (el, v) => setter(el, parseInt(v) || 0));
}
