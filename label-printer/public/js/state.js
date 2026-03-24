// Estado global compartilhado por todos os módulos
const state = {
  elements: [],       // array de elementos na etiqueta
  selectedId: null,   // id do elemento selecionado
  canvas: null,       // referência ao <canvas>
  ctx: null,          // contexto 2D
  labelWidth: 812,    // largura da etiqueta em pixels (203dpi)
  labelHeight: 1218,  // altura da etiqueta em pixels (203dpi)
  paperSize: 'w4h6',  // código do tamanho de papel
  nextId: 1,          // contador de id de elemento
  zoom: 0.5,          // fator de escala visual
  undoStack: [],      // histórico de estados (máx 20)
  isDragging: false,
  isResizing: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  resizeHandle: null, // 'nw'|'ne'|'sw'|'se'
  resizeStartEl: null,
  resizeStartMouse: null,
};

// Tamanhos de papel (largura × altura em pixels @ 203dpi)
const PAPER_SIZES = {
  w2h4: { width: 406,  height: 812,  label: '2" × 4"' },
  w4h4: { width: 812,  height: 812,  label: '4" × 4"' },
  w4h6: { width: 812,  height: 1218, label: '4" × 6"' },
  custom: null, // calculado dinamicamente
};

// Gera id único para elementos
function nextId() {
  return state.nextId++;
}

// Salva snapshot no undo stack
function saveUndo() {
  const snap = JSON.stringify(state.elements.map(el => ({...el, _cache: undefined})));
  state.undoStack.push(snap);
  if (state.undoStack.length > 20) state.undoStack.shift();
}

// Desfaz última ação
function undo() {
  if (!state.undoStack.length) return;
  const snap = JSON.parse(state.undoStack.pop());
  state.elements = snap;
  state.selectedId = null;
  render();
  updatePropsPanel();
}
