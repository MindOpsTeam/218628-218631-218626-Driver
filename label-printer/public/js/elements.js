// Funções de renderização de cada tipo de elemento no canvas
// Usa offscreen canvas para barcode e QR para preservar qualidade

// ── Cache de imagens (para elementos de imagem) ──
const imageCache = {};

function getImage(src) {
  if (imageCache[src]) return imageCache[src];
  const img = new Image();
  img.src = src;
  img.onload = () => render();
  imageCache[src] = img;
  return img;
}

// ── Renderiza texto ──
function drawText(ctx, el) {
  ctx.save();
  const weight = el.bold ? 'bold' : 'normal';
  const style  = el.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${el.fontSize || 24}px ${el.fontFamily || 'Arial'}`;
  ctx.fillStyle = el.color || '#000000';
  ctx.textAlign = el.textAlign || 'left';
  ctx.textBaseline = 'top';

  const lines = (el.text || 'Texto').split('\n');
  const lineHeight = (el.fontSize || 24) * 1.3;

  let xPos = el.x;
  if (ctx.textAlign === 'center') xPos = el.x + el.w / 2;
  if (ctx.textAlign === 'right')  xPos = el.x + el.w;

  // Clip para não vazar do bounding box
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.w, el.h);
  ctx.clip();

  lines.forEach((line, i) => {
    ctx.fillText(line, xPos, el.y + i * lineHeight);
  });

  ctx.restore();
}

// ── Renderiza código de barras usando JsBarcode + offscreen canvas ──
function drawBarcode(ctx, el) {
  try {
    const offscreen = document.createElement('canvas');
    JsBarcode(offscreen, el.value || '123456789', {
      format:       el.format || 'CODE128',
      width:        2,
      height:       Math.max(20, el.h - (el.showText ? 30 : 10)),
      displayValue: el.showText !== false,
      margin:       4,
      background:   '#ffffff',
      lineColor:    '#000000',
      fontSize:     14,
    });
    ctx.drawImage(offscreen, el.x, el.y, el.w, el.h);
  } catch (err) {
    // Valor inválido para o formato — exibe placeholder
    ctx.save();
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = '#cc0000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Código inválido', el.x + el.w / 2, el.y + el.h / 2);
    ctx.restore();
  }
}

// ── Renderiza QR Code usando qrcode.js + offscreen canvas (assíncrono) ──
// Usa cache para manter render loop síncrono
const qrCache = {};

function drawQR(ctx, el) {
  const cacheKey = `${el.value}|${el.ec || 'M'}`;

  if (qrCache[cacheKey]) {
    ctx.drawImage(qrCache[cacheKey], el.x, el.y, el.w, el.h);
    return;
  }

  // Ainda não renderizado — preenche placeholder e dispara geração async
  ctx.save();
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(el.x, el.y, el.w, el.h);
  ctx.fillStyle = '#888';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QR...', el.x + el.w / 2, el.y + el.h / 2);
  ctx.restore();

  const offscreen = document.createElement('canvas');
  QRCode.toCanvas(offscreen, el.value || 'https://exemplo.com', {
    errorCorrectionLevel: el.ec || 'M',
    margin: 1,
    width: Math.min(el.w, el.h),
    color: { dark: '#000000', light: '#ffffff' },
  }).then(() => {
    qrCache[cacheKey] = offscreen;
    render();
  }).catch(() => {});
}

// Limpa cache de QR (quando valor muda)
function invalidateQrCache(el) {
  Object.keys(qrCache).forEach(k => {
    if (k.startsWith(el._lastValue || '\x00')) delete qrCache[k];
  });
}

// ── Renderiza imagem ──
function drawImageEl(ctx, el) {
  const img = getImage(el.src);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, el.x, el.y, el.w, el.h);
  } else {
    ctx.save();
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Imagem...', el.x + el.w / 2, el.y + el.h / 2);
    ctx.restore();
  }
}

// ── Desenha alças de resize ao redor do elemento selecionado ──
const HANDLE_SIZE = 8;

function drawHandles(ctx, el) {
  const handles = getHandleRects(el);
  ctx.save();
  ctx.fillStyle = '#e94560';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  handles.forEach(h => {
    ctx.fillRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
  });
  // Borda de seleção
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(el.x - 1, el.y - 1, el.w + 2, el.h + 2);
  ctx.restore();
}

function getHandleRects(el) {
  const hs = HANDLE_SIZE;
  return [
    { id: 'nw', x: el.x - hs/2,        y: el.y - hs/2        },
    { id: 'ne', x: el.x + el.w - hs/2, y: el.y - hs/2        },
    { id: 'sw', x: el.x - hs/2,        y: el.y + el.h - hs/2 },
    { id: 'se', x: el.x + el.w - hs/2, y: el.y + el.h - hs/2 },
  ];
}

// Retorna o id da alça sob as coordenadas (canvas px), ou null
function hitHandle(el, cx, cy) {
  const hs = HANDLE_SIZE;
  for (const h of getHandleRects(el)) {
    if (cx >= h.x && cx <= h.x + hs && cy >= h.y && cy <= h.y + hs) {
      return h.id;
    }
  }
  return null;
}

// Retorna true se (cx, cy) está dentro do bounding box do elemento
function hitElement(el, cx, cy) {
  return cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h;
}

// ── Dispatch de renderização por tipo ──
function drawElement(ctx, el) {
  switch (el.type) {
    case 'text':    drawText(ctx, el); break;
    case 'barcode': drawBarcode(ctx, el); break;
    case 'qr':      drawQR(ctx, el); break;
    case 'image':   drawImageEl(ctx, el); break;
  }
}

// ── Fábricas de elementos padrão ──
function makeText() {
  return {
    id: nextId(), type: 'text',
    x: 40, y: 40, w: 300, h: 60,
    text: 'Seu texto aqui',
    fontSize: 32, fontFamily: 'Arial',
    bold: false, italic: false,
    textAlign: 'left', color: '#000000',
  };
}
function makeBarcode() {
  return {
    id: nextId(), type: 'barcode',
    x: 40, y: 120, w: 400, h: 100,
    value: '123456789012', format: 'CODE128', showText: true,
  };
}
function makeQR() {
  return {
    id: nextId(), type: 'qr',
    x: 40, y: 250, w: 200, h: 200,
    value: 'https://exemplo.com', ec: 'M',
  };
}
function makeImage(src) {
  return {
    id: nextId(), type: 'image',
    x: 40, y: 40, w: 200, h: 150,
    src,
  };
}
