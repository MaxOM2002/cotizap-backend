require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');

const { init: initDB } = require('./database');
const waService = require('./services/whatsapp.service');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '20mb' }));
// Servir el dashboard desde su ubicación real
const dashboardPath = 'C:\\Users\\Max\\Desktop\\10 SKILLS ADRI Y JUANPE\\10 SKILLS ADRI Y JUANPE\\kit-web-scrolling';
app.use(express.static(dashboardPath));

// ── Rutas ──
app.use('/api/auth',      require('./routes/auth.routes'));
app.use('/api/whatsapp',  require('./routes/whatsapp.routes'));
app.use('/api/products',  require('./routes/products.routes'));
app.use('/api/quotes',    require('./routes/quotes.routes'));
app.use('/api/business',  require('./routes/business.routes'));

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Socket.io ──
io.on('connection', (socket) => {
  // El cliente se une a su sala privada con su token
  socket.on('join', ({ clientId }) => {
    if (clientId) {
      socket.join(`client:${clientId}`);
      // Enviar estado actual
      const status = waService.getStatus(clientId);
      socket.emit('wa:status', status);
    }
  });

  socket.on('disconnect', () => {});
});

waService.setIO(io);

// ── Iniciar ──
const PORT = process.env.PORT || 3000;

// Evitar que errores no capturados tiren el servidor
process.on('uncaughtException', (e) => console.error('⚠️  Error no capturado:', e.message));
process.on('unhandledRejection', (e) => console.error('⚠️  Promesa rechazada:', e?.message || e));

async function start() {
  await initDB();

  // Restaurar sesiones sin que un fallo tire el servidor
  try { await waService.restoreAllSessions(); }
  catch (e) { console.error('⚠️  Error restaurando sesiones (no crítico):', e.message); }

  server.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════╗');
    console.log(`║  CotiZap Backend  →  puerto ${PORT}    ║`);
    console.log('╚════════════════════════════════════╝\n');
    console.log('  Endpoints:');
    console.log('  POST /api/auth/register');
    console.log('  POST /api/auth/login');
    console.log('  POST /api/whatsapp/connect');
    console.log('  GET  /api/whatsapp/status\n');
  });
}

start().catch(e => { console.error('Error al iniciar:', e); process.exit(1); });
