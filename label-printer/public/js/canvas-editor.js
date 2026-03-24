// Motor de renderização do canvas

let rafPending = false;

// Inicializa o canvas para o tamanho de papel atual
function initCanvas(paperSizeKey, customW, customH) {
  const canvas = document.getElementById('label-canvas');
  state.canvas = canvas;
  state.ctx = canvas.getContext('2d');

  let w, h;
  if (paperSizeKey === 'custom') {
    // mm → pixels @ 203dpi: px = mm * (203/25.4)
    const mmToPx = 203 / 25.4;
    w = Math.round((customW || 100) * mmToPx);
    h = Math.round((customH || 150) * mmToPx);
  } else {
    const size = PAPER_SIZES[paperSizeKey];
    w = size.width;
    h = size.height;
  }

  state.labelWidth  = w;
  state.labelHeight = h;
  state.paperSize   = paperSizeKey;

  canvas.width  = w;
  canvas.height = h;

  applyZoom();
  render();
}

// Aplica zoom via CSS (não altera resolução do canvas)
function applyZoom() {
  const canvas = state.canvas;
  if (!canvas) return;
  canvas.style.width  = Math.round(state.labelWidth  * state.zoom) + 'px';
  canvas.style.height = Math.round(state.labelHeight * state.zoom) + 'px';
}

// Loop de renderização principal
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(_doRender);
}

function _doRender() {
  rafPending = false;
  const { ctx, canvas, labelWidth, labelHeight, elements, selectedId } = state;
  if (!ctx) return;

  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, labelWidth, labelHeight);

  // Desenha todos os elementos em ordem z
  elements.forEach(el => {
    drawElement(ctx, el);
  });

  // Desenha alças no elemento selecionado
  if (selectedId !== null) {
    const sel = elements.find(e => e.id === selectedId);
    if (sel) drawHandles(ctx, sel);
  }
}

// Converte coordenadas de mouse (CSS pixels) para coordenadas do canvas (canvas pixels)
function clientToCanvas(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top)  * scaleY,
  };
}

// Seleciona elemento pelo id e dispara update do painel de propriedades
function selectElement(id) {
  state.selectedId = id;
  render();
  updatePropsPanel();
}

// Exporta o canvas como PNG para download
function exportPNG() {
  const canvas = state.canvas;
  const link = document.createElement('a');
  link.download = 'etiqueta.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
