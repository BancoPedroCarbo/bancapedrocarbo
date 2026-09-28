const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inicializa Firebase Admin (requiere tu archivo de credenciales de serviceAccountKey.json)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(express.json());
app.use(cors()); // Permite peticiones desde otros sitios web (comercios afiliados)

// ==========================================
// ENDPOINT: Procesar pago con Tarjeta de Débito
// ==========================================
app.post('/api/pagar-tarjeta', async (req, res) => {
    const { numeroTarjeta, cvv, expiracion, monto, comercio, referencial } = req.body;

    // Validación básica de campos
    if (!numeroTarjeta || !cvv || !expiracion || !monto || monto <= 0) {
        return res.status(400).json({ 
            success: false, 
            error: "Datos de tarjeta incompletos o monto inválido." 
        });
    }

    try {
        // 1. Buscar la tarjeta virtual en Firestore
        const tarjetasRef = db.collection('tarjetas_virtuales');
        const snapshot = await tarjetasRef.where('numero', '==', numeroTarjeta).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, error: "Tarjeta de débito no encontrada o inválida." });
        }

        let tarjetaDoc = null;
        let tarjetaData = null;
        snapshot.forEach(doc => {
            tarjetaDoc = doc;
            tarjetaData = doc.data();
        });

        // 2. Validar seguridad (CVV y Fecha de Expiración)
        if (tarjetaData.cvv !== cvv || tarjetaData.expiracion !== expiracion) {
            return res.status(401).json({ success: false, error: "Credenciales de tarjeta incorrectas (CVV o Expiración)." });
        }

        const userId = tarjetaData.userId; // ID del usuario dueño de la tarjeta

        // 3. Consultar el saldo del usuario asociado a la tarjeta
        const userRef = db.collection('usuarios').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ success: false, error: "El propietario de la tarjeta no existe." });
        }

        let saldoActual = userSnap.data().saldo ?? 0.00;

        // 4. Verificar fondos suficientes
        if (saldoActual < monto) {
            return res.status(400).json({ success: false, error: "Fondos insuficientes en la cuenta de débito." });
        }

        // 5. Ejecutar la transacción (Descontar saldo y registrar movimiento)
        const nuevoSaldo = saldoActual - monto;
        
        // Actualizar saldo del usuario
        await userRef.update({ saldo: nuevoSaldo });

        // Registrar en la colección principal de transacciones del banco
        await db.collection('transacciones').add({
            userId: userId,
            userEmail: userSnap.data().email,
            userName: userSnap.data().nombre,
            title: `Compra Tarjeta Débito: ${comercio || 'Comercio Online'}`,
            category: "Pagos Online",
            amount: -monto,
            date: new Date().toLocaleString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            estado: "Completado",
            referencial: referencial || "WEB-POS"
        });

        // Respuesta exitosa al sitio web externo
        return res.json({
            success: true,
            message: "Pago procesado exitosamente con Banco Pedro Carbo",
            transaccionId: "TX-" + Date.now(),
            nuevoSaldoRestante: nuevoSaldo
        });

    } catch (err) {
        console.error("Error en pasarela de pago:", err);
        return res.status(500).json({ success: false, error: "Error interno del servidor al procesar el pago." });
    }
});

// Iniciar servidor API en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API de Tarjetas Banco Pedro Carbo corriendo en el puerto ${PORT}`);
});
