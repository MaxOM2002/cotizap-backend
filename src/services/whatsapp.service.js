const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path  = require('path');
const fs    = require('fs');
const { db } = require('../database');
const aiService  = require('./ai.service');
const pdfService = require('./pdf.service');

// clientId → { client, status, phoneNumber, pairingCode }
const activeSessions = new Map();

let _io = null;
function setIO(io) { _io = io; }
function emit(clientId, event, data) {
  if (_io) _io.to(`client:${clientId}`).emit(event, data);
}

function findChrome() {
  // Variable de entorno tiene prioridad (Railway la setea)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const paths = [
    // Linux / Railway (nixpacks)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/nix/var/nix/profiles/default/bin/chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `C:\\Users\\${process.env.USERNAME || ''}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of paths) { try { if (fs.existsSync(p)) return p; } catch {} }

  // Intentar encontrarlo con `which`
  try {
    const { execSync } = require('child_process');
    const found = execSync('which chromium || which chromium-browser || which google-chrome', { encoding: 'utf8' }).trim().split('\n')[0];
    if (found) return found;
  } catch {}

  return null;
}

// ──────────────────────────────────────
// Crear sesión
// ──────────────────────────────────────
async function createSession(clientId, phoneNumber) {
  if (activeSessions.has(clientId)) {
    const s = activeSessions.get(clientId);
    if (s.status === 'open') return { alreadyConnected: true };
    try { s.client.destroy(); } catch {}
    activeSessions.delete(clientId);
  }

  const sessionsDir = path.resolve(process.env.SESSIONS_DIR || './sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const chromePath = findChrome();
  const waClient = new Client({
    authStrategy: new LocalAuth({
      clientId,
      dataPath: sessionsDir,
    }),
    puppeteer: {
      headless: true,
      executablePath: chromePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  });

  activeSessions.set(clientId, { client: waClient, phoneNumber, status: 'initializing', pairingCode: null });

  // ── Resolver la promesa del código de emparejamiento ──
  let _resolvePairing, _rejectPairing;
  const pairingPromise = new Promise((res, rej) => {
    _resolvePairing = res;
    _rejectPairing  = rej;
    setTimeout(() => _rejectPairing(new Error('Timeout: WhatsApp tardó demasiado en inicializar')), 60000);
  });

  // ── Evento QR — aquí se pide el código inmediatamente ──
  waClient.on('qr', async () => {
    activeSessions.get(clientId).status = 'qr_ready';

    if (!phoneNumber) return; // sin número, no pedimos código

    try {
      const clean = phoneNumber.replace(/\D/g, '');
      console.log(`📱 [${clientId}] QR listo, solicitando código para +${clean}...`);
      const code = await waClient.requestPairingCode(clean);
      activeSessions.get(clientId).pairingCode = code;
      console.log(`🔑 [${clientId}] Código generado: ${code}`);
      _resolvePairing(code);
      emit(clientId, 'wa:pairing-code', { code });
    } catch (e) {
      console.error(`❌ [${clientId}] Error en requestPairingCode:`, e.message);
      _rejectPairing(new Error('WhatsApp rechazó la solicitud. Verifica que el número sea correcto y vuelve a intentar.'));
    }
  });

  waClient.on('ready', async () => {
    const phone = waClient.info?.wid?.user || phoneNumber;
    activeSessions.get(clientId).status = 'open';

    const exists = await db.sessions.findOne({ clientId });
    if (exists) await db.sessions.update({ clientId }, { $set: { status: 'connected', phone, connectedAt: new Date(), updatedAt: new Date() } });
    else await db.sessions.insert({ clientId, status: 'connected', phone, connectedAt: new Date(), updatedAt: new Date() });

    emit(clientId, 'wa:status', { status: 'connected', phone });
    console.log(`✅ [${clientId}] WhatsApp conectado: +${phone}`);
  });

  waClient.on('auth_failure', () => {
    activeSessions.get(clientId).status = 'auth_failure';
    emit(clientId, 'wa:status', { status: 'auth_failure' });
  });

  waClient.on('disconnected', async () => {
    activeSessions.get(clientId).status = 'disconnected';
    await db.sessions.update({ clientId }, { $set: { status: 'disconnected', updatedAt: new Date() } });
    emit(clientId, 'wa:status', { status: 'disconnected' });
    console.log(`📵 [${clientId}] Desconectado`);
  });

  waClient.on('message', async (msg) => {
    if (msg.isGroupMsg || msg.fromMe) return;
    const text = msg.body?.trim() || '';
    if (!text) return;

    console.log(`💬 [${clientId}] De ${msg.from}: ${text}`);

    await db.messages.insert({ clientId, recipient: msg.from, body: text, direction: 'inbound', status: 'received', createdAt: new Date() });

    emit(clientId, 'wa:message', { from: msg.from, text, time: new Date().toISOString() });

    const products = await db.products.find({ clientId, status: 'active' });
    const config   = (await db.business.findOne({ clientId })) || {};

    let response;
    try { response = await aiService.process(text, msg.from, clientId, products, config); }
    catch (e) { console.error('Error IA:', e.message); return; }
    if (!response) return;

    if (response.text) {
      await msg.reply(response.text);
      db.prepare(`
        INSERT INTO messages (id, client_id, recipient, body, direction, status)
        VALUES (?, ?, ?, ?, 'outbound', 'sent')
      `).run(Date.now() + '_out', clientId, msg.from, response.text);
    }

    if (response.pdf && response.quoteId) {
      try {
        const media = new MessageMedia('application/pdf', response.pdf.toString('base64'), `Cotizacion_${response.quoteId}.pdf`);
        await waClient.sendMessage(msg.from, media, { caption: response.caption });

        const quote = {
          id: response.quoteId, client_id: clientId,
          customer_name: msg._data?.notifyName || msg.from.replace('@c.us',''),
          customer_phone: msg.from.replace('@c.us',''),
          items: JSON.stringify(response.items),
          total: response.total,
        };
        await db.quotes.insert(quote);

        emit(clientId, 'wa:quote', { ...quote, items: response.items });
        console.log(`📄 [${clientId}] PDF enviado: ${response.quoteId}`);
      } catch (e) { console.error('Error enviando PDF:', e.message); }
    }
  });

  // ── Inicializar (no bloqueante) ──
  waClient.initialize();

  // ── Si ya está conectado (sesión restaurada), retornar inmediatamente ──
  // Darle 2s para que dispare 'ready' si ya tiene sesión guardada
  const alreadyReady = await new Promise(res => {
    const t = setTimeout(() => res(false), 2000);
    waClient.once('ready', () => { clearTimeout(t); res(true); });
  });
  if (alreadyReady) return { alreadyConnected: true };

  // ── Esperar el código de emparejamiento ──
  const pairingCode = await pairingPromise;
  return { pairingCode };
}

// ──────────────────────────────────────
// Desconectar
// ──────────────────────────────────────
async function disconnectSession(clientId) {
  const s = activeSessions.get(clientId);
  if (!s) return;
  try { await s.client.logout(); } catch {}
  activeSessions.delete(clientId);
  await db.sessions.update({ clientId }, { $set: { status: 'disconnected', updatedAt: new Date() } });
  emit(clientId, 'wa:status', { status: 'disconnected' });
}

// ──────────────────────────────────────
// Enviar mensaje manual
// ──────────────────────────────────────
async function sendMessage(clientId, to, text) {
  const s = activeSessions.get(clientId);
  if (!s || s.status !== 'open') throw new Error('WhatsApp no conectado');
  const jid = to.includes('@') ? to : `${to.replace(/\D/g,'')}@c.us`;
  await s.client.sendMessage(jid, text);
  await db.messages.insert({ clientId, recipient: jid, body: text, direction: 'outbound', status: 'sent', createdAt: new Date() });
}

// ──────────────────────────────────────
// Estado
// ──────────────────────────────────────
async function getStatus(clientId) {
  const mem    = activeSessions.get(clientId);
  const db_row = await db.sessions.findOne({ clientId });
  return { status: mem?.status || db_row?.status || 'disconnected', phone: mem?.phoneNumber || db_row?.phone || null };
}

// ──────────────────────────────────────
// Restaurar sesiones al arrancar
// ──────────────────────────────────────
async function restoreAllSessions() {
  const rows = await db.sessions.find({ status: 'connected' });
  console.log(`🔁 Restaurando ${rows.length} sesión(es)...`);
  for (const row of rows) {
    try {
      await createSession(row.client_id, row.phone || '');
      console.log(`  ↳ [${row.client_id}] restaurada`);
    } catch (e) {
      console.error(`  ↳ [${row.client_id}] error: ${e.message}`);
    }
  }
}

module.exports = { setIO, createSession, disconnectSession, sendMessage, getStatus, restoreAllSessions };
