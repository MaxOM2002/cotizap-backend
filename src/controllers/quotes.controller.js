const { v4: uuid } = require('uuid');
const { db } = require('../database');
const pdfService = require('../services/pdf.service');

async function list(req, res) {
  const limit  = parseInt(req.query.limit)  || 50;
  const offset = parseInt(req.query.offset) || 0;
  const all    = await db.quotes.find({ clientId: req.clientId }).sort({ createdAt: -1 });
  const total  = all.length;
  const quotes = all.slice(offset, offset + limit);
  res.json({ quotes, total });
}

async function create(req, res) {
  try {
    const { customerName, customerPhone, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Se requiere al menos un producto' });

    const client = await db.clients.findOne({ id: req.clientId });
    if (client?.plan === 'basic') {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const count = await db.quotes.count({ clientId: req.clientId, createdAt: { $gte: start } });
      if (count >= 200) return res.status(403).json({ error: 'Límite de 200 cotizaciones mensuales. Actualiza a Pro.' });
    }

    const total = items.reduce((s, it) => s + (+it.price) * (+it.qty), 0);
    const id    = 'COT-' + Date.now().toString().slice(-6);
    const quote = { _id: id, id, clientId: req.clientId, customerName: customerName || 'Cliente', customerPhone: customerPhone || '', items, total, status: 'sent', createdAt: new Date() };
    await db.quotes.insert(quote);
    res.status(201).json(quote);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function generatePDF(req, res) {
  try {
    const quote = await db.quotes.findOne({ id: req.params.id, clientId: req.clientId });
    if (!quote) return res.status(404).json({ error: 'No encontrada' });
    const config = (await db.business.findOne({ clientId: req.clientId })) || {};
    const buf = await pdfService.generate({ quoteId: quote.id, clientName: quote.customerName, items: quote.items, total: quote.total, business: config });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.id}.pdf"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function remove(req, res) {
  const n = await db.quotes.remove({ id: req.params.id, clientId: req.clientId }, {});
  if (!n) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok: true });
}

module.exports = { list, create, generatePDF, remove };
