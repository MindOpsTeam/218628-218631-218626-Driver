// Sistema de Templates — armazenado em localStorage

const STORAGE_KEY = 't271u-templates';

// ── Persistência ──

function getTemplates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTemplatesStorage(templates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Armazenamento cheio. Remova alguns templates antes de salvar.');
    }
    return false;
  }
}

// ── Gera thumbnail do canvas atual (JPEG pequeno para economizar espaço) ──
function generateThumbnail() {
  const maxW = 160;
  const maxH = 200;
  const ratio = Math.min(maxW / state.labelWidth, maxH / state.labelHeight);
  const tw = Math.round(state.labelWidth  * ratio);
  const th = Math.round(state.labelHeight * ratio);

  const thumb = document.createElement('canvas');
  thumb.width  = tw;
  thumb.height = th;
  const tCtx = thumb.getContext('2d');

  // Fundo branco
  tCtx.fillStyle = '#fff';
  tCtx.fillRect(0, 0, tw, th);
  tCtx.drawImage(state.canvas, 0, 0, tw, th);

  return thumb.toDataURL('image/jpeg', 0.75);
}

// ── CRUD ──

function templateSave(name) {
  if (!name || !name.trim()) return null;
  const templates = getTemplates();

  const template = {
    id:          Date.now().toString(),
    name:        name.trim(),
    createdAt:   new Date().toISOString(),
    thumbnail:   generateThumbnail(),
    paperSize:   state.paperSize,
    labelWidth:  state.labelWidth,
    labelHeight: state.labelHeight,
    elements:    state.elements.map(el => ({ ...el })), // cópia rasa (sem _cache)
  };

  templates.unshift(template); // mais recente primeiro
  const ok = saveTemplatesStorage(templates);
  return ok ? template : null;
}

function templateLoad(id) {
  const templates = getTemplates();
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;

  saveUndo();

  // Restaura tamanho do papel
  state.paperSize   = tpl.paperSize;
  state.labelWidth  = tpl.labelWidth;
  state.labelHeight = tpl.labelHeight;

  const canvas = state.canvas;
  canvas.width  = tpl.labelWidth;
  canvas.height = tpl.labelHeight;

  // Sincroniza select de papel na UI
  const selPaper = document.getElementById('sel-paper');
  if (selPaper) selPaper.value = tpl.paperSize;
  document.getElementById('custom-size').classList.toggle('hidden', tpl.paperSize !== 'custom');

  applyZoom();

  // Restaura elementos (cópia nova de cada objeto)
  state.elements   = tpl.elements.map(el => ({ ...el }));
  state.selectedId = null;

  // Limpa cache de QR para forçar re-renderização
  Object.keys(qrCache).forEach(k => delete qrCache[k]);

  render();
  updatePropsPanel();
}

function templateDelete(id) {
  const templates = getTemplates().filter(t => t.id !== id);
  saveTemplatesStorage(templates);
}

function templateRename(id, newName) {
  if (!newName || !newName.trim()) return;
  const templates = getTemplates().map(t =>
    t.id === id ? { ...t, name: newName.trim() } : t
  );
  saveTemplatesStorage(templates);
}

// ── UI do Modal ──

function openTemplatesModal() {
  const modal = document.getElementById('templates-modal');
  renderTemplateGrid();
  modal.classList.add('open');
}

function closeTemplatesModal() {
  document.getElementById('templates-modal').classList.remove('open');
}

function renderTemplateGrid() {
  const grid = document.getElementById('template-grid');
  const templates = getTemplates();
  grid.innerHTML = '';

  if (templates.length === 0) {
    grid.innerHTML = '<div class="tpl-empty">Nenhum template salvo ainda.<br>Crie uma etiqueta e clique em <strong>Salvar Template</strong>.</div>';
    return;
  }

  templates.forEach(tpl => {
    const card = document.createElement('div');
    card.className = 'tpl-card';
    card.dataset.id = tpl.id;

    const date = new Date(tpl.createdAt).toLocaleDateString('pt-BR');

    card.innerHTML = `
      <div class="tpl-thumb-wrap">
        <img class="tpl-thumb" src="${tpl.thumbnail}" alt="${tpl.name}" />
      </div>
      <div class="tpl-info">
        <div class="tpl-name" title="${tpl.name}">${tpl.name}</div>
        <div class="tpl-meta">${tpl.paperSize} · ${date}</div>
      </div>
      <div class="tpl-actions">
        <button class="btn btn-tpl-load" data-id="${tpl.id}">Carregar</button>
        <button class="btn btn-tpl-rename" data-id="${tpl.id}" title="Renomear">✏️</button>
        <button class="btn btn-tpl-delete" data-id="${tpl.id}" title="Excluir">🗑</button>
      </div>
    `;

    grid.appendChild(card);
  });

  // Eventos dos botões dos cards
  grid.querySelectorAll('.btn-tpl-load').forEach(btn => {
    btn.addEventListener('click', () => {
      templateLoad(btn.dataset.id);
      closeTemplatesModal();
    });
  });

  grid.querySelectorAll('.btn-tpl-rename').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = getTemplates().find(t => t.id === btn.dataset.id);
      const newName = prompt('Novo nome:', tpl?.name || '');
      if (newName) {
        templateRename(btn.dataset.id, newName);
        renderTemplateGrid();
      }
    });
  });

  grid.querySelectorAll('.btn-tpl-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este template?')) return;
      templateDelete(btn.dataset.id);
      renderTemplateGrid();
    });
  });
}

// ── Inicialização ──

function initTemplates() {
  // Botão "Salvar Template"
  document.getElementById('btn-save-template').addEventListener('click', () => {
    const name = prompt('Nome do template:', 'Minha Etiqueta');
    if (!name) return;
    const tpl = templateSave(name);
    if (tpl) {
      showToast(`Template "${tpl.name}" salvo!`);
    }
  });

  // Botão "Ver Templates"
  document.getElementById('btn-open-templates').addEventListener('click', openTemplatesModal);

  // Fechar modal
  document.getElementById('btn-close-modal').addEventListener('click', closeTemplatesModal);
  document.getElementById('templates-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTemplatesModal();
  });

  // Esc fecha modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTemplatesModal();
  });
}

// ── Toast de notificação ──
function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}
