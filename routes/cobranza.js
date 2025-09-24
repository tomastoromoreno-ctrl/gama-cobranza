const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const Factura = require('../models/Factura');

// Configuración de multer
const upload = multer({ dest: 'uploads/' });

// Función robusta para parsear fechas
function parseDate(dateStr) {
    try {
        if (!dateStr || dateStr === '') return null;
        
        if (dateStr instanceof Date) {
            const d = new Date(dateStr);
            d.setHours(0,0,0,0);
            return d;
        }

        if (typeof dateStr === 'number') {
            const date = new Date((dateStr - 25569) * 86400 * 1000);
            date.setHours(0,0,0,0);
            return isNaN(date.getTime()) ? null : date;
        }

        if (typeof dateStr === 'string') {
            let cleanStr = dateStr.replace(/[^\d\/\-]/g, '');
            
            if (cleanStr.includes('/') || cleanStr.includes('-')) {
                const parts = cleanStr.split(/[/\-]/);
                if (parts.length >= 2) {
                    let day, month, year;
                    
                    if (parts[0].length <= 2 && parts[1].length <= 2) {
                        day = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10) - 1;
                        year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
                        if (year < 100) year += 2000;
                    } else {
                        month = parseInt(parts[0], 10) - 1;
                        day = parseInt(parts[1], 10);
                        year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
                        if (year < 100) year += 2000;
                    }

                    const date = new Date(year, month, day);
                    date.setHours(0,0,0,0);
                    return isNaN(date.getTime()) ? null : date;
                }
            }
            
            const isoDate = new Date(dateStr);
            if (!isNaN(isoDate.getTime())) {
                isoDate.setHours(0,0,0,0);
                return isoDate;
            }
        }

        return null;
    } catch (err) {
        console.error('Error parsing date:', dateStr, err);
        return null;
    }
}

// Función para limpiar y extraer monto
function extractAmount(amountStr) {
    if (!amountStr) return 0;
    
    let str = amountStr.toString();
    str = str.replace(/[^\d\.,]/g, '');
    
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    
    const amount = Math.round(parseFloat(str) || 0);
    return amount;
}

// Subir Excel
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        const facturasNuevas = [];
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            
            if (typeof row[0] === 'string' && row[0].includes('SEPT')) continue;
            if (row[0] === 'Fecha') continue;

            const fechaFacturaRaw = row[0];
            const numeroFactura = row[1]?.toString().trim();
            const razonSocial = row[2]?.toString().trim();
            const montoRaw = row[3];

            if (!numeroFactura || !razonSocial || !montoRaw) {
                console.warn(`Fila ${i+1}: Datos incompletos, saltando...`);
                continue;
            }

            const fechaFactura = parseDate(fechaFacturaRaw);
            const monto = extractAmount(montoRaw);

            let estado = 'Pendiente';
            if (fechaFactura < hoy) {
                estado = 'Vencido';
            }

            let prioridad = 'Baja';
            let proximaLlamada = null;
            if (estado === 'Vencido') {
                prioridad = 'Alta';
                proximaLlamada = new Date(hoy.getTime() + 86400000);
            } else if (estado === 'Pendiente') {
                const diasHastaVencimiento = Math.ceil((new Date(fechaFactura.getTime() + 30 * 24 * 60 * 60 * 1000) - hoy) / (1000 * 60 * 60 * 24));
                if (diasHastaVencimiento <= 3) {
                    prioridad = 'Media';
                    proximaLlamada = new Date(hoy.getTime() + 86400000);
                }
            }

            facturasNuevas.push({
                numeroFactura,
                razonSocial,
                fechaFactura,
                monto,
                estado,
                notas: '',
                prioridad,
                proximaLlamada,
                createdBy: req.user?.id || null
            });
        }

        if (facturasNuevas.length === 0) {
            return res.status(400).json({ error: 'No se pudieron procesar facturas válidas del archivo' });
        }

        const resultados = {
            actualizadas: 0,
            creadas: 0,
            errores: 0
        };

        for (const factura of facturasNuevas) {
            try {
                const facturaExistente = await Factura.findOne({
                    numeroFactura: factura.numeroFactura,
                    deletedAt: { $exists: false }
                });

                if (facturaExistente) {
                    await Factura.findByIdAndUpdate(facturaExistente._id, {
                        razonSocial: factura.razonSocial,
                        fechaFactura: factura.fechaFactura,
                        monto: factura.monto,
                        estado: factura.estado,
                        prioridad: factura.prioridad,
                        proximaLlamada: factura.proximaLlamada,
                        updatedAt: new Date()
                    });
                    resultados.actualizadas++;
                } else {
                    await Factura.create(factura);
                    resultados.creadas++;
                }
            } catch (err) {
                console.error('Error procesando factura:', factura.numeroFactura, err);
                resultados.errores++;
            }
        }

        res.json({ 
            message: `✅ Archivo procesado correctamente`,
            estadisticas: {
                totalProcesadas: facturasNuevas.length,
                actualizadas: resultados.actualizadas,
                creadas: resultados.creadas,
                errores: resultados.errores
            }
        });

    } catch (err) {
        console.error('Error detallado al cargar el archivo:', err);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

// Obtener todas las facturas
router.get('/', async (req, res) => {
    try {
        const facturas = await Factura.find({
            deletedAt: { $exists: false }
        }).sort({ razonSocial: 1, monto: -1 });
        res.json(facturas);
    } catch (err) {
        console.error('Error al obtener facturas:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar factura
router.put('/:id', async (req, res) => {
    try {
        const { estado, prioridad, proximaLlamada, fechaPago, notas } = req.body;

        if (!estado && !prioridad && !proximaLlamada && !fechaPago && !notas) {
            return res.status(400).json({ error: 'Debe proporcionar al menos un campo para actualizar' });
        }

        if (estado && !['Pendiente', 'Pagado', 'Vencido'].includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido. Valores permitidos: Pendiente, Pagado, Vencido' });
        }

        if (prioridad && !['Alta', 'Media', 'Baja'].includes(prioridad)) {
            return res.status(400).json({ error: 'Prioridad inválida. Valores permitidos: Alta, Media, Baja' });
        }

        if (proximaLlamada) {
            const date = new Date(proximaLlamada);
            if (isNaN(date.getTime())) {
                return res.status(400).json({ error: 'Fecha de próxima llamada inválida' });
            }
        }

        if (fechaPago) {
            const date = new Date(fechaPago);
            if (isNaN(date.getTime())) {
                return res.status(400).json({ error: 'Fecha de pago inválida' });
            }
        }

        const factura = await Factura.findByIdAndUpdate(
            req.params.id,
            {
                estado,
                prioridad,
                proximaLlamada: proximaLlamada ? new Date(proximaLlamada) : null,
                fechaPago: fechaPago ? new Date(fechaPago) : null,
                notas,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!factura) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        res.json(factura);
    } catch (err) {
        console.error('Error al actualizar factura:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar factura (solo admin)
router.delete('/:id', async (req, res) => {
    try {
        // Verificar si el usuario es admin
        if (req.user?.email !== 'admin@admin.com') {
            return res.status(403).json({ error: 'Solo el administrador puede eliminar facturas' });
        }

        const factura = await Factura.findByIdAndUpdate(req.params.id, {
            deletedAt: new Date(),
            deletedBy: req.user?.id || null
        });
        
        if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
        res.json({ message: 'Factura eliminada' });
    } catch (err) {
        console.error('Error al eliminar factura:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Descargar Excel
router.get('/download', async (req, res) => {
    try {
        const facturas = await Factura.find({
            deletedAt: { $exists: false }
        });
        
        const data = facturas.map(f => [
            f.fechaFactura ? f.fechaFactura.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
            f.numeroFactura,
            f.razonSocial,
            f.monto,
            f.estado,
            f.fechaPago ? f.fechaPago.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
            f.notas,
            f.prioridad,
            f.proximaLlamada ? f.proximaLlamada.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
        ]);

        const ws = xlsx.utils.aoa_to_sheet([
            ['Fecha de factura', 'Numero de Factura', 'Razón social', 'Monto', 'Estado', 'Fecha de Pago', 'Notas', 'Prioridad', 'Próxima Llamada'],
            ...data
        ]);

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Cobranza");
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="gama_seguridad_cobranza.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error('Error al descargar Excel:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;