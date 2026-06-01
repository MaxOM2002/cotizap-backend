const PDFDocument = require('pdfkit');

function generate({ quoteId, clientName, items, total, business = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const bufs = [];
    doc.on('data', b => bufs.push(b));
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const c1 = business.color1 || '#06b6d4';

    // Barra superior
    doc.rect(50, 45, 495, 4).fill(c1);

    // Logo (si existe) o nombre de empresa
    if (business.logoBase64) {
      try {
        const logoData = business.logoBase64.replace(/^data:image\/\w+;base64,/, '');
        const logoBuf = Buffer.from(logoData, 'base64');
        doc.image(logoBuf, 50, 55, { height: 45, fit: [160, 45] });
      } catch { /* si falla el logo, usar texto */ }
    }

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#0f172a')
      .text(business.name || 'Mi Empresa', 50, business.logoBase64 ? 105 : 62);
    let y = 90;
    if (business.email) { doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(business.email, 50, y); y += 14; }
    if (business.phone) { doc.fontSize(10).fillColor('#64748b').text(business.phone, 50, y); y += 14; }
    if (business.address) { doc.fontSize(10).fillColor('#64748b').text(business.address, 50, y); }

    // Info cotización (derecha)
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text('COTIZACIÓN', 350, 62, { align: 'right', width: 195 });
    doc.fontSize(12).font('Helvetica').fillColor('#64748b').text(quoteId, 350, 84, { align: 'right', width: 195 });
    doc.fontSize(10).fillColor('#94a3b8').text(
      new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
      350, 100, { align: 'right', width: 195 }
    );

    // Línea divisora
    doc.rect(50, 140, 495, 1).fill('#e2e8f0');

    // Cliente
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#94a3b8').text('PARA:', 50, 155);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text(clientName, 50, 169);

    // Cabecera tabla
    const tTop = 205;
    doc.rect(50, tTop, 495, 30).fill('#0f172a');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
    doc.text('PRODUCTO', 62, tTop + 11);
    doc.text('CANT.', 332, tTop + 11, { width: 50, align: 'center' });
    doc.text('PRECIO UNIT.', 387, tTop + 11, { width: 80, align: 'right' });
    doc.text('SUBTOTAL', 468, tTop + 11, { width: 67, align: 'right' });

    // Filas
    let ry = tTop + 30;
    items.forEach((it, i) => {
      const h = 36;
      doc.rect(50, ry, 495, h).fill(i % 2 === 0 ? '#ffffff' : '#f8fafc').stroke('#f1f5f9');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text(it.name, 62, ry + 8, { width: 265 });
      if (it.description) doc.fontSize(9).font('Helvetica').fillColor('#94a3b8').text(it.description, 62, ry + 22, { width: 265 });
      doc.fontSize(12).font('Helvetica').fillColor('#475569').text(String(it.qty), 332, ry + 12, { width: 50, align: 'center' });
      doc.text(`$${(+it.price).toLocaleString('es-MX',{minimumFractionDigits:2})}`, 387, ry + 12, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').fillColor('#0f172a')
        .text(`$${(it.price*it.qty).toLocaleString('es-MX',{minimumFractionDigits:2})}`, 468, ry + 12, { width: 67, align: 'right' });
      ry += h;
    });

    // Total
    ry += 12;
    doc.rect(50, ry, 495, 44).fill('#0f172a');
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#ffffff').text('TOTAL', 62, ry + 15);
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff')
      .text(`$${total.toLocaleString('es-MX',{minimumFractionDigits:2})}`, 350, ry + 11, { width: 185, align: 'right' });

    // Pie
    if (business.footer) {
      doc.rect(50, ry + 60, 495, 1).fill('#e2e8f0');
      doc.fontSize(9).font('Helvetica').fillColor('#94a3b8')
        .text(business.footer, 50, ry + 72, { align: 'center', width: 495 });
    }
    doc.fontSize(8).fillColor('#cbd5e1')
      .text('Generado automáticamente por CotiZap', 50, ry + 90, { align: 'center', width: 495 });

    doc.end();
  });
}

module.exports = { generate };
