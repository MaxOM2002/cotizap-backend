const waService = require('../services/whatsapp.service');
const { db } = require('../database');

async function connect(req, res) {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Número de teléfono requerido' });

  let clean = phone.replace(/\D/g, '');
  if (clean.length < 10) return res.status(400).json({ error: 'Número inválido' });

  // Normalizar a formato internacional completo
  // Si son 10 dígitos → agregar código de país 52 (México)
  if (clean.length === 10) clean = '52' + clean;
  // Si son 11 y empieza con 1 → quitar el 1 y agregar 52
  if (clean.length === 11 && clean.startsWith('1')) clean = '52' + clean.slice(1);
  // Si no empieza con 52, agregar
  if (!clean.startsWith('52')) clean = '52' + clean;

  console.log(`📱 Número normalizado: +${clean}`);

  try {
    const result = await waService.createSession(req.clientId, clean);

    if (result.alreadyConnected) {
      return res.json({ status: 'already_connected', message: 'WhatsApp ya está conectado' });
    }

    if (result.pairingCode) {
      return res.json({ pairingCode: result.pairingCode, phone: clean });
    }

    res.json({ status: 'restoring', message: 'Sesión existente restaurándose' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function status(req, res) {
  const s = await waService.getStatus(req.clientId);
  res.json(s);
}

async function disconnect(req, res) {
  try {
    await waService.disconnectSession(req.clientId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function send(req, res) {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to y message son requeridos' });

  try {
    await waService.sendMessage(req.clientId, to, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getMessages(req, res) {
  const msgs = await db.messages.find({ clientId: req.clientId }).sort({ createdAt: -1 }).limit(100);
  res.json(msgs);
}

module.exports = { connect, status, disconnect, send, getMessages };
