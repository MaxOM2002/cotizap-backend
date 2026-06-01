const { v4: uuid } = require('uuid');
const { db } = require('../database');

async function list(req, res) {
  const rows = await db.products.find({ clientId: req.clientId }).sort({ createdAt: -1 });
  res.json(rows);
}

async function create(req, res) {
  try {
    const { name, description, price, unit, category } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Nombre y precio obligatorios' });
    if (isNaN(+price) || +price < 0) return res.status(400).json({ error: 'Precio inválido' });

    const client = await db.clients.findOne({ id: req.clientId });
    if (client?.plan === 'basic') {
      const count = await db.products.count({ clientId: req.clientId, status: 'active' });
      if (count >= 50) return res.status(403).json({ error: 'Límite de 50 productos. Actualiza a Pro.' });
    }

    const id = uuid();
    const product = {
      _id: id, id, clientId: req.clientId,
      name, description: description || '',
      price: +price, unit: unit || 'Pieza',
      category: category || 'General',
      status: 'active', createdAt: new Date(),
    };
    await db.products.insert(product);
    res.status(201).json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function update(req, res) {
  try {
    const prod = await db.products.findOne({ id: req.params.id, clientId: req.clientId });
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    const { name, description, price, unit, category, status } = req.body;
    const upd = {};
    if (name)        upd.name        = name;
    if (description !== undefined) upd.description = description;
    if (price != null) upd.price     = +price;
    if (unit)        upd.unit        = unit;
    if (category)    upd.category    = category;
    if (status)      upd.status      = status;

    await db.products.update({ id: req.params.id, clientId: req.clientId }, { $set: upd });
    res.json({ ...prod, ...upd });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function remove(req, res) {
  const n = await db.products.remove({ id: req.params.id, clientId: req.clientId }, {});
  if (!n) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
}

module.exports = { list, create, update, remove };
