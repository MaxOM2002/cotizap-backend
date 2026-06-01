const pdfService = require('./pdf.service');

// Estado de conversación por número de teléfono
const conversations = new Map();

const GREETINGS = ['hola', 'buenas', 'buenos', 'hi', 'ola', 'saludos', 'buen dia', 'buen día'];
const CATALOG_WORDS = ['catalogo', 'catálogo', 'productos', 'que vendes', 'qué vendes', 'lista', 'que tienes'];
const THANKS = ['gracias', 'ok gracias', 'muchas gracias', 'perfecto', 'listo', 'excelente'];
const QUOTE_WORDS = ['cotiz', 'precio', 'cuanto', 'cuánto', 'costo', 'presupuest', 'quiero', 'necesito', 'dame'];
const WORD_NUMS = { un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,doce:12,quince:15,veinte:20 };

function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w\s]/g,' ');
}

function extractItems(text) {
  const n = norm(text);
  const found = [];

  // "N producto"
  const re = /(\d+)\s+([a-z][a-z\s]{2,25})(?=\s*[,y]|\s*$)/g;
  let m;
  while ((m = re.exec(n)) !== null) found.push({ qty: +m[1], term: m[2].trim() });

  // "palabra-número producto"
  for (const [w, v] of Object.entries(WORD_NUMS)) {
    const r = new RegExp(`\\b${w}\\s+([a-z][a-z\\s]{2,25})(?=\\s*[,y]|\\s*$)`,'g');
    while ((m = r.exec(n)) !== null) found.push({ qty: v, term: m[1].trim() });
  }

  if (found.length === 0) found.push({ qty: 1, term: n.trim() });
  return found;
}

function bestMatch(term, products) {
  let top = null, score = 0;
  for (const p of products) {
    const pn = norm(p.name);
    const tn = norm(term);
    if (pn === tn) return p;
    const words = pn.split(' ').filter(w=>w.length>2);
    const twords = tn.split(' ').filter(w=>w.length>2);
    const hits = twords.filter(tw => words.some(pw=>pw.includes(tw)||tw.includes(pw))).length;
    const s = twords.length ? hits/twords.length : 0;
    if (s > 0.4 && s > score) { top = p; score = s; }
    if (pn.includes(tn) || tn.includes(pn.split(' ')[0])) { top = p; score = 1; }
  }
  return score > 0 ? top : null;
}

async function process(text, from, clientId, products, config) {
  const n = norm(text);
  const state = conversations.get(from) || { step: 'idle' };
  const company = config.name || 'la empresa';
  const iaName = config.ia_style === 'persona' && config.ia_name ? config.ia_name : `asistente de ${company}`;

  // Gracias / despedida
  if (THANKS.some(t => n.includes(t)) && text.split(' ').length < 5) {
    conversations.set(from, { step: 'idle' });
    return { text: `¡Con gusto! 😊 Si necesitas otra cotización estoy aquí. ¡Hasta pronto!` };
  }

  // Catálogo
  if (CATALOG_WORDS.some(t => n.includes(t))) {
    if (!products.length) return { text: `El catálogo está vacío por el momento. Escríbenos más tarde.` };
    const list = products.map(p => `• *${p.name}* — $${(+p.price).toLocaleString('es-MX',{minimumFractionDigits:2})} por ${p.unit}`).join('\n');
    conversations.set(from, { step: 'greeted' });
    return { text: `📦 *Catálogo de ${company}*\n\n${list}\n\n¿Te hago una cotización? Solo dime qué necesitas y cuántas unidades. 😊` };
  }

  // Saludo simple
  const isGreeting = GREETINGS.some(g => n.includes(g));
  const hasNum = /\d+/.test(text) || Object.keys(WORD_NUMS).some(w => n.includes(w));
  const isQuoteReq = QUOTE_WORDS.some(q => n.includes(q));

  if (isGreeting && !isQuoteReq && !hasNum && text.split(' ').length <= 4) {
    const welcomeTemplate = config.iaWelcome || config.ia_welcome || `¡Hola! 👋 Soy el {asistente}. ¿Qué productos te gustaría cotizar hoy?`;
    const welcome = welcomeTemplate
      .replace(/\{empresa\}/g, company)
      .replace(/\{asistente\}/g, iaName)
      .replace(/\{nombre\}/g, config.iaName || 'asistente');
    conversations.set(from, { step: 'greeted' });
    return { text: welcome };
  }

  // Espera de cantidad para producto concreto
  if (state.step === 'awaiting_qty' && state.product) {
    const qty = parseInt(n.match(/\d+/)?.[0]) || Object.entries(WORD_NUMS).find(([w])=>n.includes(w))?.[1] || 1;
    const items = [{ ...state.product, qty }];
    conversations.set(from, { step: 'idle' });
    return buildQuote(items, clientId, config);
  }

  // Extraer productos de la petición
  const requests = extractItems(text);
  const matched = [];
  const missing = [];

  for (const req of requests) {
    const p = bestMatch(req.term, products);
    if (p) matched.push({ ...p, qty: req.qty });
    else if (req.term.length > 3) missing.push(req.term);
  }

  if (matched.length > 0) {
    conversations.set(from, { step: 'idle' });
    return buildQuote(matched, clientId, config);
  }

  // Precio de un producto específico
  if (isQuoteReq || state.step === 'greeted') {
    for (const p of products) {
      const words = norm(p.name).split(' ').filter(w=>w.length>3);
      if (words.some(w => n.includes(w))) {
        conversations.set(from, { step: 'awaiting_qty', product: p });
        return { text: `💼 *${p.name}*\n💰 $${(+p.price).toLocaleString('es-MX',{minimumFractionDigits:2})} por ${p.unit}\n\n¿Cuántas unidades necesitas?` };
      }
    }
  }

  // Producto no encontrado
  if (missing.length > 0) {
    conversations.set(from, { step: 'greeted' });
    return { text: `No encontré _"${missing[0]}"_ en el catálogo 🤔\n\nEscribe *catálogo* para ver los productos disponibles.` };
  }

  // Default
  conversations.set(from, { step: 'greeted' });
  return { text: `¡Hola! 👋 Soy el ${iaName}.\n\nPuedo ayudarte con:\n• Ver precios de productos\n• Enviarte una cotización en PDF\n\nEscribe *catálogo* para ver todo. 😊` };
}

async function buildQuote(items, clientId, config) {
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  const quoteId = 'COT-' + Date.now().toString().slice(-6);
  const list = items.map(it => `• ${it.name} x${it.qty} → $${(it.price*it.qty).toLocaleString('es-MX',{minimumFractionDigits:2})}`).join('\n');

  let pdf = null;
  try {
    pdf = await pdfService.generate({ quoteId, clientName: 'Cliente', items, total, business: config });
  } catch {}

  return {
    text: `✅ *Cotización ${quoteId}*\n\n${list}\n\n💰 *TOTAL: $${total.toLocaleString('es-MX',{minimumFractionDigits:2})}*`,
    pdf,
    caption: `📄 Cotización ${quoteId}`,
    quoteId,
    items,
    total,
  };
}

module.exports = { process };
