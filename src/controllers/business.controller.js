const { db } = require('../database');

async function get(req, res) {
  const config = await db.business.findOne({ clientId: req.clientId });
  res.json(config || {});
}

async function update(req, res) {
  try {
    const { name, phone, email, address, footer, color1, color2, iaName, iaStyle, iaWelcome, logoBase64 } = req.body;
    const upd = { name, phone, email, address, footer, color1, color2, iaName, iaStyle, iaWelcome, logoBase64 };
    Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]);

    const exists = await db.business.findOne({ clientId: req.clientId });
    if (exists) await db.business.update({ clientId: req.clientId }, { $set: upd });
    else await db.business.insert({ clientId: req.clientId, ...upd });

    if (name) await db.clients.update({ id: req.clientId }, { $set: { name } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { get, update };
