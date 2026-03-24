// ── Configuração ──
const API_URL = 'https://vmphvlvmhpasfmyvpwyb.supabase.co/functions/v1/check-in';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtcGh2bHZtaHBhc2ZteXZwd3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU4NjQsImV4cCI6MjA4NDU5MTg2NH0.JpcfCM-Bv7gmkdxe55tFzZvBxb4sLzcJ3waIDHF9_Bg';
const COOLDOWN_MS = 3000;

// 60mm × 40mm @ 203dpi  →  px = mm * (203 / 25.4)
const MM_TO_PX = 203 / 25.4;
const LABEL_W = Math.round(60 * MM_TO_PX); // 480
const LABEL_H = Math.round(40 * MM_TO_PX); // 320

// ── Estado ──
let isProcessing = false;
let lastCode = null;
let lastCodeTime = 0;
let checkinCount = parseInt(localStorage.getItem('checkinCount') || '0', 10);
let html5QrCode = null;
let currentCameraIdx = 0;
let cameras = [];
let cameraOpen = false;
let lastCheckinData = null;

// ── Elementos do DOM ──
const startSection = document.getElementById('start-section');
const scannerSection = document.getElementById('scanner-section');
const resultSection = document.getElementById('result-section');
const resultCard = document.getElementById('result-card');
const resultIcon = document.getElementById('result-icon');
const resultStatus = document.getElementById('result-status');
const resultName = document.getElementById('result-name');
const resultDetails = document.getElementById('result-details');
const resultTime = document.getElementById('result-time');
const checkinCountEl = document.getElementById('checkin-count');
const manualCodeInput = document.getElementById('manual-code');
const btnPrintLabel = document.getElementById('btn-print-label');
const printStatus = document.getElementById('print-status');
const btnToggleCamera = document.getElementById('btn-toggle-camera');
const labelCanvas = document.getElementById('label-canvas');

checkinCountEl.textContent = checkinCount;

// ── Sons de feedback ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(frequency, duration, type) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function soundSuccess() {
  playTone(880, 0.15, 'sine');
  setTimeout(() => playTone(1175, 0.25, 'sine'), 150);
}

function soundWarning() {
  playTone(440, 0.2, 'triangle');
  setTimeout(() => playTone(440, 0.2, 'triangle'), 250);
}

function soundError() {
  playTone(220, 0.4, 'square');
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ── Proteção contra leituras duplicadas ──
function shouldProcess(code) {
  if (isProcessing) return false;
  if (code === lastCode && (Date.now() - lastCodeTime) < COOLDOWN_MS) return false;
  return true;
}

// ── Chamada à API ──
async function doCheckin(ticketCode) {
  if (!shouldProcess(ticketCode)) return;

  isProcessing = true;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({ ticket_code: ticketCode }),
    });

    const data = await response.json();

    if (response.ok && data.success && data.status === 'checked_in') {
      lastCheckinData = data;
      showResult('success', data);
      checkinCount++;
      localStorage.setItem('checkinCount', String(checkinCount));
      checkinCountEl.textContent = checkinCount;
      soundSuccess();
      vibrate([100, 50, 100]);
    } else if (data.status === 'already_used') {
      lastCheckinData = data;
      showResult('warning', data);
      soundWarning();
      vibrate([200, 100, 200]);
    } else if (response.status === 404 || data.status === 'not_found') {
      lastCheckinData = null;
      showResult('error', data);
      soundError();
      vibrate([500]);
    } else {
      lastCheckinData = null;
      showResult('error', { error: data.error || 'Erro desconhecido' });
      soundError();
      vibrate([500]);
    }
  } catch (err) {
    lastCheckinData = null;
    showResult('error', { error: 'Erro de conexão. Verifique sua internet.' });
    soundError();
    vibrate([500]);
  } finally {
    isProcessing = false;
    lastCode = ticketCode;
    lastCodeTime = Date.now();
  }
}

// ── Exibir resultado ──
function showResult(type, data) {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.pause(true);
  }

  startSection.classList.add('hidden');
  scannerSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  resultCard.className = 'result-card ' + type;
  printStatus.classList.add('hidden');

  if (type === 'success') {
    resultIcon.textContent = '✅';
    resultStatus.textContent = 'Check-in realizado';
    resultName.textContent = data.participant_name || '';
    resultDetails.textContent = data.participant_company || '';
    resultTime.textContent = data.checked_in_at ? formatTime(data.checked_in_at) : '';
    btnPrintLabel.classList.remove('hidden');
  } else if (type === 'warning') {
    resultIcon.textContent = '⚠️';
    resultStatus.textContent = 'Ingresso já utilizado';
    resultName.textContent = data.participant_name || '';
    resultDetails.textContent = data.participant_company || '';
    resultTime.textContent = data.checked_in_at
      ? 'Entrada em: ' + formatTime(data.checked_in_at)
      : '';
    btnPrintLabel.classList.remove('hidden');
  } else {
    resultIcon.textContent = '❌';
    resultStatus.textContent = 'Ingresso inválido';
    resultName.textContent = '';
    resultDetails.textContent = data.error || 'Ingresso não encontrado';
    resultTime.textContent = '';
    btnPrintLabel.classList.add('hidden');
  }
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
    ' — ' + d.toLocaleDateString('pt-BR');
}

// ── Gerar etiqueta 60×40mm no canvas ──
function renderLabel(data) {
  const canvas = labelCanvas;
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const ctx = canvas.getContext('2d');

  // Fundo branco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  const cx = LABEL_W / 2;

  // Nome em negrito (em cima)
  const name = (data.participant_name || '').toUpperCase();
  ctx.font = 'bold 48px Arial';
  const nameLines = wrapText(ctx, name, LABEL_W - 40);

  // Calcula posição vertical centralizada
  const nameLineH = 56;
  const companyH = 40;
  const gap = 20;
  const totalH = (nameLines.length * nameLineH) + gap + companyH;
  let y = (LABEL_H - totalH) / 2 + nameLineH;

  // Desenha nome
  nameLines.forEach(line => {
    ctx.fillText(line, cx, y);
    y += nameLineH;
  });

  // Empresa embaixo
  const company = data.participant_company || '';
  if (company) {
    y += gap;
    ctx.font = '36px Arial';
    ctx.fillStyle = '#333333';
    ctx.fillText(company, cx, y);
  }

  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  words.forEach(word => {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// ── Imprimir usando a mesma rota /print do app ──
async function printLabel() {
  if (!lastCheckinData) return;

  btnPrintLabel.classList.add('loading');
  printStatus.classList.remove('hidden');
  printStatus.textContent = 'Gerando etiqueta...';
  printStatus.className = 'print-status';

  try {
    const imageBase64 = renderLabel(lastCheckinData);

    printStatus.textContent = 'Enviando para impressora...';

    const res = await fetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        options: {
          pageSize: 'custom',
          customWidth: LABEL_W,
          customHeight: LABEL_H,
          copies: 1,
        },
      }),
    });

    const result = await res.json();

    if (result.success) {
      printStatus.textContent = 'Etiqueta enviada!';
      printStatus.className = 'print-status print-ok';
    } else {
      printStatus.textContent = 'Erro: ' + (result.error || 'falha na impressão');
      printStatus.className = 'print-status print-err';
    }
  } catch (err) {
    printStatus.textContent = 'Erro de conexão com a impressora';
    printStatus.className = 'print-status print-err';
  } finally {
    btnPrintLabel.classList.remove('loading');
  }
}

// ── Abrir câmera ──
document.getElementById('btn-open-camera').addEventListener('click', async () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();

  startSection.classList.add('hidden');
  scannerSection.classList.remove('hidden');
  btnToggleCamera.classList.remove('hidden');

  if (!cameraOpen) {
    await initScanner();
    cameraOpen = true;
  } else if (html5QrCode && !html5QrCode.isScanning) {
    if (cameras.length > 0) {
      await startScanner(cameras[currentCameraIdx].id);
    } else {
      await startScannerWithFacing();
    }
  }
});

// ── Fechar câmera ──
document.getElementById('btn-close-camera').addEventListener('click', async () => {
  if (html5QrCode && html5QrCode.isScanning) {
    await html5QrCode.stop();
  }
  scannerSection.classList.add('hidden');
  btnToggleCamera.classList.add('hidden');
  startSection.classList.remove('hidden');
});

// ── Voltar para tela inicial ──
document.getElementById('btn-next').addEventListener('click', async () => {
  resultSection.classList.add('hidden');
  lastCheckinData = null;

  if (cameraOpen && html5QrCode) {
    scannerSection.classList.remove('hidden');
    btnToggleCamera.classList.remove('hidden');
    if (html5QrCode.isScanning) {
      html5QrCode.resume();
    } else {
      if (cameras.length > 0) {
        await startScanner(cameras[currentCameraIdx].id);
      } else {
        await startScannerWithFacing();
      }
    }
  } else {
    startSection.classList.remove('hidden');
  }
});

// ── Input manual ──
document.getElementById('btn-submit-manual').addEventListener('click', () => {
  const code = manualCodeInput.value.trim();
  if (code) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    doCheckin(code);
    manualCodeInput.value = '';
  }
});

manualCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const code = manualCodeInput.value.trim();
    if (code) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      doCheckin(code);
      manualCodeInput.value = '';
    }
  }
});

// ── Imprimir etiqueta ──
btnPrintLabel.addEventListener('click', printLabel);

// ── Alternar câmera ──
btnToggleCamera.addEventListener('click', async () => {
  if (cameras.length < 2) return;
  currentCameraIdx = (currentCameraIdx + 1) % cameras.length;
  await restartScanner(cameras[currentCameraIdx].id);
});

// ── Scanner ──
async function initScanner() {
  html5QrCode = new Html5Qrcode('reader');

  try {
    cameras = await Html5Qrcode.getCameras();
  } catch (err) {
    console.warn('Não foi possível listar câmeras:', err);
    cameras = [];
  }

  if (cameras.length > 0) {
    const backCamera = cameras.find(c =>
      /back|rear|environment/i.test(c.label)
    );
    currentCameraIdx = backCamera ? cameras.indexOf(backCamera) : cameras.length - 1;
    await startScanner(cameras[currentCameraIdx].id);
  } else {
    await startScannerWithFacing();
  }
}

async function startScanner(cameraId) {
  try {
    await html5QrCode.start(
      cameraId,
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      onScanSuccess
    );
  } catch (err) {
    console.error('Erro ao iniciar scanner:', err);
    document.querySelector('.scanner-hint').textContent =
      'Não foi possível acessar a câmera. Use o modo manual.';
  }
}

async function startScannerWithFacing() {
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      onScanSuccess
    );
  } catch (err) {
    console.error('Erro ao iniciar scanner:', err);
    document.querySelector('.scanner-hint').textContent =
      'Não foi possível acessar a câmera. Use o modo manual.';
  }
}

async function restartScanner(cameraId) {
  if (html5QrCode.isScanning) {
    await html5QrCode.stop();
  }
  await startScanner(cameraId);
}

function onScanSuccess(decodedText) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  doCheckin(decodedText);
}
