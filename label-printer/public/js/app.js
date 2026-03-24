// Ponto de entrada — inicializa o app após carregamento do DOM

document.addEventListener('DOMContentLoaded', () => {
  // ── Inicializa canvas ──
  initCanvas('w4h6');

  // ── Inicializa interações ──
  initDragDrop();
  initKeyboard();
  initPropsPanel();
  initTemplates();

  // ── Carrega impressoras do backend ──
  loadPrinters();

  // ── Seletor de tamanho de papel ──
  const selPaper = document.getElementById('sel-paper');
  const customSizeDiv = document.getElementById('custom-size');

  selPaper.addEventListener('change', () => {
    if (selPaper.value === 'custom') {
      customSizeDiv.classList.remove('hidden');
    } else {
      customSizeDiv.classList.add('hidden');
      initCanvas(selPaper.value);
    }
  });

  document.getElementById('btn-apply-custom').addEventListener('click', () => {
    const w = parseFloat(document.getElementById('custom-w').value);
    const h = parseFloat(document.getElementById('custom-h').value);
    if (w > 0 && h > 0) initCanvas('custom', w, h);
  });

  // ── Adicionar elementos ──
  document.getElementById('btn-add-text').addEventListener('click', () => {
    saveUndo();
    state.elements.push(makeText());
    selectElement(state.elements[state.elements.length - 1].id);
    render();
  });

  document.getElementById('btn-add-barcode').addEventListener('click', () => {
    saveUndo();
    state.elements.push(makeBarcode());
    selectElement(state.elements[state.elements.length - 1].id);
    render();
  });

  document.getElementById('btn-add-qr').addEventListener('click', () => {
    saveUndo();
    state.elements.push(makeQR());
    selectElement(state.elements[state.elements.length - 1].id);
    render();
  });

  document.getElementById('btn-add-image').addEventListener('click', () => {
    document.getElementById('input-image').click();
  });

  document.getElementById('input-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      saveUndo();
      state.elements.push(makeImage(ev.target.result));
      selectElement(state.elements[state.elements.length - 1].id);
      render();
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset para permitir selecionar o mesmo arquivo novamente
  });

  // ── Zoom ──
  document.getElementById('zoom-slider').addEventListener('input', (e) => {
    state.zoom = parseInt(e.target.value) / 100;
    applyZoom();
  });

  // ── Exportar PNG ──
  document.getElementById('btn-export').addEventListener('click', exportPNG);

  // ── Limpar tudo ──
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (state.elements.length === 0) return;
    if (!confirm('Remover todos os elementos?')) return;
    saveUndo();
    state.elements = [];
    state.selectedId = null;
    render();
    updatePropsPanel();
  });

  // ── Sliders do painel de impressão ──
  document.getElementById('sel-darkness').addEventListener('input', (e) => {
    document.getElementById('darkness-val').textContent = e.target.value;
  });
  document.getElementById('sel-speed').addEventListener('input', (e) => {
    document.getElementById('speed-val').textContent = e.target.value;
  });
  document.getElementById('sel-gaps').addEventListener('input', (e) => {
    document.getElementById('gaps-val').textContent = e.target.value;
  });

  // ── Botão Imprimir ──
  document.getElementById('btn-print').addEventListener('click', async () => {
    const btn = document.getElementById('btn-print');
    const resultEl = document.getElementById('print-result');

    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';
    resultEl.className = 'print-result hidden';

    try {
      const imageBase64 = state.canvas.toDataURL('image/png');

      // Determina pageSize para CUPS
      let pageSize = state.paperSize;
      if (state.paperSize === 'custom') {
        pageSize = 'custom'; // backend converte px → pt
      }

      const options = {
        printer:    document.getElementById('sel-printer').value,
        pageSize,
        customWidth:  state.labelWidth,
        customHeight: state.labelHeight,
        darkness:   document.getElementById('sel-darkness').value,
        speed:      document.getElementById('sel-speed').value,
        paperType:  document.getElementById('sel-paper-type').value,
        postAction: document.getElementById('sel-post-action').value,
        gapsHeight: document.getElementById('sel-gaps').value,
        copies:     document.getElementById('sel-copies').value,
      };

      const result = await apiPrint(imageBase64, options);

      resultEl.className = 'print-result success';
      resultEl.textContent = result.jobId
        ? `✅ Job enviado: ${result.jobId}`
        : '✅ Job enviado com sucesso';
      resultEl.classList.remove('hidden');

    } catch (err) {
      resultEl.className = 'print-result error';
      resultEl.textContent = '❌ ' + err.message;
      resultEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = '🖨️ Imprimir';
    }
  });
});
