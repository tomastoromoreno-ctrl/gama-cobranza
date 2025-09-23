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
        
        // Si ya es objeto Date
        if (dateStr instanceof Date) {
            const d = new Date(dateStr);
            d.setHours(0,0,0,0);
            return d;
        }

        // Si es número (formato Excel)
        if (typeof dateStr === 'number') {
            const date = new Date((dateStr - 25569) * 86400 * 1000);
            date.setHours(0,0,0,0);
            return isNaN(date.getTime()) ? null : date;
        }

        // Si es string en formato DD/MM/YY o DD-MM-YY
        if (typeof dateStr === 'string') {
            // Limpiar caracteres no numéricos excepto / y -
            let cleanStr = dateStr.replace(/[^\d\/\-]/g, '');
            
            if (cleanStr.includes('/') || cleanStr.includes('-')) {
                const parts = cleanStr.split(/[/\-]/);
                if (parts.length >= 2) {
                    let day, month, year;
                    
                    // Formato DD/MM/YY
                    if (parts[0].length <= 2 && parts[1].length <= 2) {
                        day = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10) - 1;
                        year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
                        if (year < 100) year += 2000;
                    } 
                    // Formato MM/DD/YY
                    else {
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
            
            // Intentar parsear como ISO
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
    
    // Convertir a string si no lo es
    let str = amountStr.toString();
    
    // Eliminar caracteres no numéricos excepto comas y puntos
    str = str.replace(/[^\d\.,]/g, '');
    
    // Si tiene comas y puntos, asumir formato chileno (puntos como separadores de miles, comas como decimales)
    if (str.includes(',') && str.includes('.')) {
        // Eliminar puntos (separadores de miles) y reemplazar coma por punto
        str = str.replace(/\./g, '').replace(',', '.');
    } 
    // Si solo tiene comas, reemplazar por puntos
    else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    
    // Convertir a número y redondear
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

        // Procesar las filas de datos
        const facturasNuevas = [];
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue; // Saltar filas vacías
            
            // Saltar filas que parecen encabezados o títulos
            if (typeof row[0] === 'string' && row[0].includes('SEPT')) continue;
            if (row[0] === 'Fecha') continue;

            // Extraer datos según el formato del archivo Cobranza Sept25.xlsx
            // Columna 0: Fecha
            // Columna 1: Número de Factura
            // Columna 2: Razón Social
            // Columna 3: Monto
            const fechaFacturaRaw = row[0];
            const numeroFactura = row[1]?.toString().trim();
            const razonSocial = row[2]?.toString().trim();
            const montoRaw = row[3];

            // Validar campos obligatorios
            if (!numeroFactura || !razonSocial || !montoRaw) {
                console.warn(`Fila ${i+1}: Datos incompletos, saltando...`);
                continue;
            }

            // Parsear fechas
            const fechaFactura = parseDate(fechaFacturaRaw);
            let fechaVencimiento = null;

            // Calcular fecha de vencimiento (30 días después de la factura)
            if (fechaFactura) {
                fechaVencimiento = new Date(fechaFactura.getTime() + 30 * 24 * 60 * 60 * 1000);
            } else {
                // Si no hay fecha de factura, usar hoy + 30 días
                fechaFactura = new Date();
                fechaVencimiento = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
            }

            // Extraer monto
            const monto = extractAmount(montoRaw);

            // Determinar estado
            let estado = 'Pendiente';
            if (fechaVencimiento < hoy) {
                estado = 'Vencido';
            }

            // Prioridad y próxima llamada
            let prioridad = 'Baja';
            let proximaLlamada = null;
            if (estado === 'Vencido') {
                prioridad = 'Alta';
                proximaLlamada = new Date(hoy.getTime() + 86400000); // Mañana
            } else if (estado === 'Pendiente') {
                const diasHastaVencimiento = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));
                if (diasHastaVencimiento <= 3) {
                    prioridad = 'Media';
                    proximaLlamada = new Date(hoy.getTime() + 86400000); // Mañana
                }
            }

            facturasNuevas.push({
                numeroFactura,
                razonSocial,
                fechaFactura,
                fechaVencimiento,
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

        // Procesar cada factura: actualizar si existe, crear si no
        const resultados = {
            actualizadas: 0,
            creadas: 0,
            errores: 0
        };

        for (const factura of facturasNuevas) {
            try {
                // Buscar factura existente (solo facturas que no han sido eliminadas manualmente)
                const facturaExistente = await Factura.findOne({
                    numeroFactura: factura.numeroFactura,
                    deletedAt: { $exists: false } // Solo facturas no eliminadas
                });

                if (facturaExistente) {
                    // Actualizar factura existente
                    await Factura.findByIdAndUpdate(facturaExistente._id, {
                        razonSocial: factura.razonSocial,
                        fechaFactura: factura.fechaFactura,
                        fechaVencimiento: factura.fechaVencimiento,
                        monto: factura.monto,
                        estado: factura.estado,
                        prioridad: factura.prioridad,
                        proximaLlamada: factura.proximaLlamada,
                        updatedAt: new Date()
                    });
                    resultados.actualizadas++;
                } else {
                    // Crear nueva factura
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

// Obtener todas las facturas (solo las no eliminadas)
router.get('/', async (req, res) => {
    try {
        const facturas = await Factura.find({
            deletedAt: { $exists: false } // Solo facturas no eliminadas
        }).sort({ fechaVencimiento: 1 });
        res.json(facturas);
    } catch (err) {
        console.error('Error al obtener facturas:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar factura (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        // Marcar como eliminada en lugar de borrarla
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
            deletedAt: { $exists: false } // Solo facturas no eliminadas
        });
        
        const data = facturas.map(f => [
            f.fechaFactura ? f.fechaFactura.toLocaleDateString('en-US', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '',
            f.numeroFactura,
            f.razonSocial,
            f.monto,
            f.fechaVencimiento ? f.fechaVencimiento.toLocaleDateString('en-US', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '',
            f.estado,
            f.fechaPago ? f.fechaPago.toLocaleDateString('en-US', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '',
            f.notas,
            f.prioridad,
            f.proximaLlamada ? f.proximaLlamada.toLocaleDateString('en-US', { year: '2-digit', month: 'numeric', day: 'numeric' }) : ''
        ]);

        // Crear hoja con encabezados
        const ws = xlsx.utils.aoa_to_sheet([
            ['Fecha de factura', 'Numero de Factura', 'Razón social', 'Monto', 'Fecha de vencimiento', 'Estado', 'Fecha de Pago', 'Notas', 'Prioridad', 'Próxima Llamada'],
            ...data
        ]);

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Cobranza");
        
        // Generar buffer
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