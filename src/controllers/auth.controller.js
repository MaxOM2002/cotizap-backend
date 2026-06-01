const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { db } = require('../database');

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });

    const exists = await db.clients.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email ya registrado' });

    const id   = uuid();
    const hash = bcrypt.hashSync(password, 10);
    const client = { _id: id, id, name, email, password: hash, plan: 'basic', createdAt: new Date() };

    await db.clients.insert(client);
    await db.business.insert({ clientId: id, name, email, color1: '#06b6d4', color2: '#7c3aed', footer: 'Cotización válida por 15 días.', iaStyle: 'asistente', iaWelcome: '¡Hola! 👋 ¿En qué te puedo ayudar?' });

    const token = jwt.sign({ clientId: id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, client: { id, name, email, plan: 'basic' } });
  } catch (e) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: e.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const client = await db.clients.findOne({ email });
    if (!client || !bcrypt.compareSync(password, client.password))
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign({ clientId: client.id, email: client.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, client: { id: client.id, name: client.name, email: client.email, plan: client.plan } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function me(req, res) {
  const client = await db.clients.findOne({ id: req.clientId });
  if (!client) return res.status(404).json({ error: 'No encontrado' });
  res.json({ id: client.id, name: client.name, email: client.email, plan: client.plan, createdAt: client.createdAt });
}

async function updatePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const client = await db.clients.findOne({ id: req.clientId });
    if (!bcrypt.compareSync(currentPassword, client.password))
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Nueva contraseña mínimo 6 caracteres' });
    await db.clients.update({ id: req.clientId }, { $set: { password: bcrypt.hashSync(newPassword, 10) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { register, login, me, updatePassword };
