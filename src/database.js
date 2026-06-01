const Datastore = require('nedb-promises');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = {
  clients:  Datastore.create({ filename: path.join(DATA_DIR, 'clients.db'),  autoload: true }),
  sessions: Datastore.create({ filename: path.join(DATA_DIR, 'sessions.db'), autoload: true }),
  products: Datastore.create({ filename: path.join(DATA_DIR, 'products.db'), autoload: true }),
  quotes:   Datastore.create({ filename: path.join(DATA_DIR, 'quotes.db'),   autoload: true }),
  messages: Datastore.create({ filename: path.join(DATA_DIR, 'messages.db'), autoload: true }),
  business: Datastore.create({ filename: path.join(DATA_DIR, 'business.db'), autoload: true }),
};

async function init() {
  // Índices únicos
  await db.clients.ensureIndex({ fieldName: 'email', unique: true });
  await db.sessions.ensureIndex({ fieldName: 'clientId', unique: true });
  await db.products.ensureIndex({ fieldName: '_id' });
  await db.quotes.ensureIndex({ fieldName: 'createdAt' });
  await db.messages.ensureIndex({ fieldName: 'createdAt' });
  await db.business.ensureIndex({ fieldName: 'clientId', unique: true });
  console.log('✅ Base de datos lista (nedb)');
}

module.exports = { db, init };
