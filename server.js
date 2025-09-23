const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno
dotenv.config();

// Inicializar Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
const authRoutes = require('./routes/auth');
const cobranzaRoutes = require('./routes/cobranza');

app.use('/api/auth', authRoutes);
app.use('/api/cobranza', cobranzaRoutes);

// Ruta para servir la página de login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Conectado a MongoDB');

        // Importar modelos
        const User = require('./models/User');

        // Crear usuarios por defecto si no existen
        const admin = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (!admin) {
            const hashedPassword = require('bcryptjs').hashSync(process.env.ADMIN_PASSWORD, 8);
            await User.create({
                email: process.env.ADMIN_EMAIL,
                password: hashedPassword,
                role: 'admin'
            });
            console.log('✅ Usuario admin creado');
        }

        const ecarrasco = await User.findOne({ email: process.env.ECARRASCO_EMAIL });
        if (!ecarrasco) {
            const hashedPassword = require('bcryptjs').hashSync(process.env.ECARRASCO_PASSWORD, 8);
            await User.create({
                email: process.env.ECARRASCO_EMAIL,
                password: hashedPassword,
                role: 'user'
            });
            console.log('✅ Usuario ecarrasco creado');
        }

        // Iniciar servidor
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
            console.log(`🔑 Accede a http://localhost:${PORT} para iniciar sesión`);
        });
    })
    .catch(err => {
        console.error('❌ Error al conectar a MongoDB:', err);
    });