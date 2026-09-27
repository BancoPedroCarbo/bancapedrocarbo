import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    getDocs, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAQ4f1wD8W3WOoZANRO5KvOJW2gfP_wwE",
    authDomain: "bancomovil-421ff.firebaseapp.com",
    projectId: "bancomovil-421ff",
    storageBucket: "bancomovil-421ff.firebasestorage.app",
    messagingSenderId: "280973267975",
    appId: "1:280973267975:web:6be8cbf4d2ece640e346a2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// CANDADO DE SEGURIDAD EXCLUSIVO PARA EL ADMIN
onAuthStateChanged(auth, (user) => {
    if (!user || user.email !== "adminbanco@pc.com") {
        alert("Acceso denegado. Esta área es exclusiva para el administrador (adminbanco@pc.com).");
        window.location.href = "index.html";
    } else {
        cargarUsuariosSelect();
        cargarTransaccionesAdmin();
        cargarTransferenciasPendientes();
    }
});

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `show ${type}`;
    setTimeout(() => { toast.className = ""; }, 3000);
}

// Cargar lista de usuarios en el selector del panel admin
async function cargarUsuariosSelect() {
    const select = document.getElementById("adminSelectUser");
    if (!select) return;
    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let options = '<option value="">Seleccione un usuario...</option>';
        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            options += `<option value="${docSnap.id}">${user.nombre} (${user.email}) - Saldo: $${(user.saldo ?? 0).toFixed(2)}</option>`;
        });
        select.innerHTML = options;
    } catch (e) {
        select.innerHTML = '<option value="">Error al cargar usuarios</option>';
    }
}

// Modificar saldo de usuario (Agregar o Quitar dinero)
document.getElementById("adminBalanceForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("adminSelectUser").value;
    const action = document.getElementById("adminActionType").value;
    const amount = parseFloat(document.getElementById("adminBalanceAmount").value);
    const reason = document.getElementById("adminBalanceReason").value;

    if (!userId) {
        showToast("Por favor selecciona un usuario", "error");
        return;
    }
    if (amount <= 0) {
        showToast("Ingresa un monto válido mayor a 0", "error");
        return;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            showToast("El usuario no existe", "error");
            return;
        }

        let currentSaldo = userSnap.data().saldo ?? 0.00;
        let finalAmount = action === "add" ? amount : -amount;

        if (action === "subtract" && amount > currentSaldo) {
            showToast("El usuario no tiene suficiente saldo para este retiro", "error");
            return;
        }

        let nuevoSaldo = currentSaldo + finalAmount;

        await setDoc(userRef, { saldo: nuevoSaldo }, { merge: true });

        await addDoc(collection(db, "transacciones"), {
            userId: userId,
            userEmail: userSnap.data().email,
            userName: userSnap.data().nombre,
            title: action === "add" ? `Depósito Admin: ${reason}` : `Ajuste Admin: ${reason}`,
            category: "Gestión Administrativa",
            amount: finalAmount,
            date: new Date().toLocaleString(),
            timestamp: serverTimestamp()
        });

        showToast("¡Saldo actualizado y movimiento registrado con éxito!");
        e.target.reset();
        cargarUsuariosSelect();
    } catch (err) {
        showToast("Error al procesar la operación", "error");
    }
});

// Registrar nuevo producto en la tienda
document.getElementById("adminAddProductForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("adminProdName").value;
    const price = parseFloat(document.getElementById("adminProdPrice").value);
    const type = document.getElementById("adminProdType").value;

    try {
        await addDoc(collection(db, "productos_tienda"), {
            name: name,
            price: price,
            type: type,
            creado: serverTimestamp()
        });
        showToast("¡Producto agregado a la tienda con éxito!");
        e.target.reset();
    } catch (err) {
        showToast("Error al guardar el producto", "error");
    }
});

// Cargar transferencias pendientes de verificación humana
function cargarTransferenciasPendientes() {
    const container = document.getElementById("adminPendingTransfers");
    if (!container) return;

    const q = query(collection(db, "transacciones"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        let html = "";
        let count = 0;

        snapshot.forEach((docSnap) => {
            const tx = docSnap.data();
            if (tx.estado === "Pendiente de verificación humana") {
                count++;
                html += `
                    <div style="background: var(--bg-dark); padding: 0.85rem; border-radius: 0.5rem; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border);">
                        <div>
                            <strong style="color: var(--primary);">${tx.userName || tx.userEmail || 'Usuario'}</strong><br>
                            <span>${tx.title}</span><br>
                            <span style="color: var(--text-muted);">${tx.category} • ${tx.date}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: bold; color: var(--danger);">-$${Math.abs(tx.amount).toFixed(2)}</span><br>
                            <button class="btn aprobar-tx-btn" data-id="${docSnap.id}" style="margin-top: 0.4rem; padding: 0.3rem 0.8rem; font-size: 0.75rem; width: auto;">Aprobar / Completar</button>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html || "<p style='color:var(--text-muted); text-align:center;'>No hay transferencias pendientes de verificación.</p>";

        // Vincular botones de aprobación
        document.querySelectorAll(".aprobar-tx-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const txId = btn.getAttribute("data-id");
                try {
                    await updateDoc(doc(db, "transacciones", txId), {
                        estado: "Completado",
                        title: "Transferencia Externa Completada"
                    });
                    showToast("¡Transferencia aprobada exitosamente!");
                } catch (err) {
                    showToast("Error al aprobar la transferencia", "error");
                }
            });
        });
    });
}

// Escuchar transacciones y movimientos reales en tiempo real
function cargarTransaccionesAdmin() {
    const container = document.getElementById("adminLiveTransactions");
    if (!container) return;

    const q = query(collection(db, "transacciones"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        let html = "";
        snapshot.forEach((docSnap) => {
            const tx = docSnap.data();
            const isPositive = tx.amount > 0;
            html += `
                <div class="transaction-item" style="background: var(--bg-dark); padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: var(--primary);">${tx.userName || 'Usuario'}</strong> (${tx.userEmail})<br>
                        <span>${tx.title}</span><br>
                        <small style="color: var(--text-muted);">${tx.category} • ${tx.date} • Estado: <b>${tx.estado || 'Completado'}</b></small>
                    </div>
                    <div class="tx-amount ${isPositive ? 'positive' : 'negative'}" style="color: ${isPositive ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                        ${isPositive ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html || "<p style='color:var(--text-muted); text-align:center;'>No hay movimientos registrados aún.</p>";
    });
}
