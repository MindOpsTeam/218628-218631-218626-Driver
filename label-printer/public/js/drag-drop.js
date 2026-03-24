// Interação de arrastar e redimensionar elementos no canvas

const MIN_SIZE = 20;

function initDragDrop() {
  const canvas = state.canvas;
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);
  canvas.addEventListener('dblclick', onDblClick);
}

function onMouseDown(e) {
  e.preventDefault();
  const { x, y } = clientToCanvas(state.canvas, e.clientX, e.clientY);
  const elements = state.elements;

  // Hit test em ordem inversa (elemento do topo primeiro)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];

    // Verifica alças de resize (apenas se já selecionado)
    if (el.id === state.selectedId) {
      const handle = hitHandle(el, x, y);
      if (handle) {
        saveUndo();
        state.isResizing   = true;
        state.resizeHandle = handle;
        state.resizeStartEl    = { ...el };
        state.resizeStartMouse = { x, y };
        return;
      }
    }

    // Verifica corpo do elemento
    if (hitElement(el, x, y)) {
      selectElement(el.id);
      saveUndo();
      state.isDragging    = true;
      state.dragOffsetX   = x - el.x;
      state.dragOffsetY   = y - el.y;
      return;
    }
  }

  // Clique no fundo — desseleciona
  selectElement(null);
}

function onMouseMove(e) {
  if (!state.isDragging && !state.isResizing) return;
  e.preventDefault();
  const { x, y } = clientToCanvas(state.canvas, e.clientX, e.clientY);

  if (state.isDragging) {
    const el = state.elements.find(e => e.id === state.selectedId);
    if (!el) return;
    el.x = Math.round(clamp(x - state.dragOffsetX, 0, state.labelWidth  - el.w));
    el.y = Math.round(clamp(y - state.dragOffsetY, 0, state.labelHeight - el.h));
    render();
    syncPropPosition();
  }

  if (state.isResizing) {
    const el = state.elements.find(e => e.id === state.selectedId);
    if (!el) return;
    const dx = x - state.resizeStartMouse.x;
    const dy = y - state.resizeStartMouse.y;
    const start = state.resizeStartEl;

    switch (state.resizeHandle) {
      case 'se':
        el.w = Math.max(MIN_SIZE, start.w + dx);
        el.h = Math.max(MIN_SIZE, start.h + dy);
        break;
      case 'sw':
        el.w = Math.max(MIN_SIZE, start.w - dx);
        el.x = start.x + (start.w - el.w);
        el.h = Math.max(MIN_SIZE, start.h + dy);
        break;
      case 'ne':
        el.w = Math.max(MIN_SIZE, start.w + dx);
        el.h = Math.max(MIN_SIZE, start.h - dy);
        el.y = start.y + (start.h - el.h);
        break;
      case 'nw':
        el.w = Math.max(MIN_SIZE, start.w - dx);
        el.x = start.x + (start.w - el.w);
        el.h = Math.max(MIN_SIZE, start.h - dy);
        el.y = start.y + (start.h - el.h);
        break;
    }
    el.x = Math.round(el.x);
    el.y = Math.round(el.y);
    el.w = Math.round(el.w);
    el.h = Math.round(el.h);
    render();
    syncPropPosition();
  }
}

function onMouseUp() {
  state.isDragging    = false;
  state.isResizing    = false;
  state.resizeHandle  = null;
  state.resizeStartEl = null;
}

// Duplo clique: seleciona e foca primeiro input de texto do painel
function onDblClick(e) {
  const { x, y } = clientToCanvas(state.canvas, e.clientX, e.clientY);
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (hitElement(el, x, y)) {
      selectElement(el.id);
      const input = document.querySelector('#props-section input, #props-section textarea');
      if (input) { input.focus(); input.select && input.select(); }
      return;
    }
  }
}

// ── Atalhos de teclado ──
function initKeyboard() {
  document.addEventListener('keydown', e => {
    // Ignora quando foco está em input/textarea/select
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === 'Escape') {
      selectElement(null);
      return;
    }

    if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
      undo();
      return;
    }

    const el = state.elements.find(el => el.id === state.selectedId);
    if (!el) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      saveUndo();
      state.elements = state.elements.filter(el => el.id !== state.selectedId);
      state.selectedId = null;
      render();
      updatePropsPanel();
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    let moved = false;
    if (e.key === 'ArrowLeft')  { el.x -= step; moved = true; }
    if (e.key === 'ArrowRight') { el.x += step; moved = true; }
    if (e.key === 'ArrowUp')    { el.y -= step; moved = true; }
    if (e.key === 'ArrowDown')  { el.y += step; moved = true; }

    if (moved) {
      e.preventDefault();
      render();
      syncPropPosition();
    }
  });
}

// ── Utilitários ──
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Sincroniza campos X/Y/W/H do painel com posição atual do elemento
function syncPropPosition() {
  const el = state.elements.find(el => el.id === state.selectedId);
  if (!el) return;
  const $x = document.getElementById('prop-x');
  const $y = document.getElementById('prop-y');
  const $w = document.getElementById('prop-w');
  const $h = document.getElementById('prop-h');
  if ($x) $x.value = el.x;
  if ($y) $y.value = el.y;
  if ($w) $w.value = el.w;
  if ($h) $h.value = el.h;
}
