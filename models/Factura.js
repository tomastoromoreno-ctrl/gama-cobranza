const mongoose = require('mongoose');

const facturaSchema = new mongoose.Schema({
    numeroFactura: { type: String, required: true, unique: false }, // No unique porque usamos soft delete
    razonSocial: { type: String, required: true },
    fechaFactura: { type: Date, required: true },
    fechaVencimiento: { type: Date, required: true },
    monto: { type: Number, required: true },
    estado: { type: String, enum: ['Pendiente', 'Pagado', 'Vencido'], default: 'Pendiente' },
    fechaPago: { type: Date },
    notas: { type: String },
    prioridad: { type: String, enum: ['Alta', 'Media', 'Baja'], default: 'Baja' },
    proximaLlamada: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date }, // Para soft delete
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
});

// Índice compuesto para evitar duplicados de facturas activas
facturaSchema.index({ numeroFactura: 1, deletedAt: 1 });

module.exports = mongoose.model('Factura', facturaSchema);