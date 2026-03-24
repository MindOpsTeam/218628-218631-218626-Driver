const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('[aviso] sharp não disponível — DPI será ajustado via sips');
}

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// Utilitários
// ──────────────────────────────────────────────

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Código de saída: ${code}`));
    });
    proc.on('error', reject);
  });
}

// Valida nome de impressora (apenas letras, números, _ e -)
function validPrinterName(name) {
  return /^[\w_-]+$/.test(name);
}

// Ajusta DPI do PNG para 203 usando sharp (ou sips como fallback)
async function setDpi(filePath) {
  if (sharp) {
    const tmp = filePath + '.tmp.png';
    await sharp(filePath)
      .withMetadata({ density: 203 })
      .toFile(tmp);
    fs.renameSync(tmp, filePath);
  } else {
    // fallback macOS
    await run('sips', [
      '-s', 'dpiWidth', '203',
      '-s', 'dpiHeight', '203',
      filePath,
    ]);
  }
}

// ──────────────────────────────────────────────
// Rotas
// ──────────────────────────────────────────────

// GET /printers — lista filas CUPS disponíveis
app.get('/printers', async (req, res) => {
  try {
    const output = await run('lpstat', ['-a']);
    const printers = output
      .split('\n')
      .filter(l => l.trim())
      .map(l => l.split(' ')[0])
      .filter(Boolean);
    res.json({ printers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /printer-options/:name — opções da impressora
app.get('/printer-options/:name', async (req, res) => {
  const { name } = req.params;
  if (!validPrinterName(name)) {
    return res.status(400).json({ error: 'Nome de impressora inválido' });
  }
  try {
    const raw = await run('lpoptions', ['-p', name, '-l']);
    // Parse: "Darkness/Brightness: 0 *7 15" → { key, label, values: [{value, default}] }
    const parsed = {};
    raw.split('\n').forEach(line => {
      const match = line.match(/^(\w+)\/([^:]+):\s+(.+)$/);
      if (!match) return;
      const [, key, label, valStr] = match;
      parsed[key] = {
        label,
        values: valStr.split(/\s+/).map(v => ({
          value: v.replace(/^\*/, ''),
          default: v.startsWith('*'),
        })),
      };
    });
    res.json({ raw, parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /print — recebe PNG em base64 e imprime
app.post('/print', async (req, res) => {
  const { imageBase64, options = {} } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 é obrigatório' });
  }

  const {
    printer = 'Xprinter_XP_T271U_4',
    pageSize = 'w4h6',
    darkness = '7',
    speed = '5',
    paperType = 'LabelGaps',
    postAction = 'TearOff',
    gapsHeight = '1',
    copies = 1,
    customWidth,
    customHeight,
  } = options;

  if (!validPrinterName(printer)) {
    return res.status(400).json({ error: 'Nome de impressora inválido' });
  }

  // Validações numéricas
  const dark = Math.max(0, Math.min(15, parseInt(darkness, 10) || 7));
  const gaps = Math.max(0, Math.min(10, parseInt(gapsHeight, 10) || 1));
  const numCopies = Math.max(1, Math.min(99, parseInt(copies, 10) || 1));

  // Remove prefixo data URL se presente
  const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '');

  // Calcula PageSize
  let pageSizeOption = pageSize;
  if (pageSize === 'custom' && customWidth && customHeight) {
    // Converte pixels@203dpi → pontos PostScript (1pt = 1/72in)
    const wPt = Math.round((parseInt(customWidth) / 203) * 72);
    const hPt = Math.round((parseInt(customHeight) / 203) * 72);
    pageSizeOption = `Custom.${wPt}x${hPt}`;
  }

  const tmpFile = path.join(os.tmpdir(), `label-${uuidv4()}.png`);

  try {
    // Salva PNG
    fs.writeFileSync(tmpFile, Buffer.from(base64Data, 'base64'));

    // Ajusta DPI para 203
    await setDpi(tmpFile);

    // Monta argumentos do lp (spawn — sem interpolação de shell)
    const lpArgs = [
      '-d', printer,
      '-n', String(numCopies),
      '-o', `PageSize=${pageSizeOption}`,
      '-o', `Darkness=${dark}`,
      '-o', `PrintSpeed=${speed}`,
      '-o', `PaperType=${paperType}`,
      '-o', `PostAction=${postAction}`,
      '-o', `GapsHeight=${gaps}`,
      '-o', 'fit-to-page',
      tmpFile,
    ];

    const output = await run('lp', lpArgs);

    // Extrai job ID do output ("request id is Xprinter-123")
    const jobMatch = output.match(/request id is ([\w-]+)/i);
    const jobId = jobMatch ? jobMatch[1] : null;

    res.json({ success: true, jobId, message: output.trim() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Remove arquivo temporário
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ──────────────────────────────────────────────
// Inicia servidor
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) ips.push(cfg.address);
    }
  }
  console.log(`\n✅ Servidor rodando em:`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   Check-in: http://localhost:${PORT}/checkin.html`);
  if (ips.length) {
    console.log(`\n📱 Acesso na rede (celular):`);
    ips.forEach(ip => console.log(`   http://${ip}:${PORT}/checkin.html`));
  }
  console.log();
});
