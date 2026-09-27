import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    addDoc, 
    onSnapshot, 
    serverTimestamp,
    query, 
    where 
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

let currentUser = null;
let currentBalance = 0.00;
let selectedProduct = null;

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `show ${type}`;
    setTimeout(() => { toast.className = ""; }, 3000);
}

// Control de pantallas Auth vs App
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const loginView = document.getElementById("loginForm");
const registerView = document.getElementById("registerForm");

const btnToRegister = document.getElementById("toRegister");
if (btnToRegister) {
    btnToRegister.addEventListener("click", (e) => {
        e.preventDefault();
        if (loginView) loginView.classList.add("hidden");
        if (registerView) registerView.classList.remove("hidden");
    });
}

const btnToLogin = document.getElementById("toLogin");
if (btnToLogin) {
    btnToLogin.addEventListener("click", (e) => {
        e.preventDefault();
        if (registerView) registerView.classList.add("hidden");
        if (loginView) loginView.classList.remove("hidden");
    });
}

// Registro
if (registerView) {
    registerView.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("regName").value;
        const email = document.getElementById("regEmail").value;
        const password = document.getElementById("regPassword").value;

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: name });
            
            await setDoc(doc(db, "usuarios", userCred.user.uid), {
                nombre: name,
                email: email,
                saldo: 0.00,
                creado: serverTimestamp()
            });

            showToast("¡Cuenta creada con éxito!");
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

// Login
if (loginView) {
    loginView.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value;
        const password = document.getElementById("loginPassword").value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("¡Bienvenido de nuevo!");
        } catch (err) {
            showToast("Correo o contraseña incorrectos", "error");
        }
    });
}

// Logout
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        showToast("Sesión cerrada");
    });
}

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        if (authScreen) authScreen.classList.add("hidden");
        if (appScreen) appScreen.classList.remove("hidden");
        
        const name = user.displayName || "Usuario";
        const userNameDisplay = document.getElementById("userNameDisplay");
        const userAvatar = document.getElementById("userAvatar");
        const dashBalance = document.getElementById("dashBalance");

        if (userNameDisplay) userNameDisplay.textContent = name;
        if (userAvatar) userAvatar.textContent = name.substring(0, 2).toUpperCase();
        if (dashBalance) dashBalance.textContent = "Cargando...";

        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                currentBalance = userDoc.data().saldo ?? 0.00;
            } else {
                currentBalance = 0.00;
            }
            updateBalanceUI();
        } catch(e) { 
            currentBalance = 0.00;
            updateBalanceUI();
        }

        cargarProductosTienda();
        cargarMovimientosUsuario(user.uid);
        verificarYCargarTarjeta(user, db); // Carga la tarjeta virtual del usuario

    } else {
        currentUser = null;
        if (appScreen) appScreen.classList.add("hidden");
        if (authScreen) authScreen.classList.remove("hidden");
    }
});

function updateBalanceUI() {
    const dashBalance = document.getElementById("dashBalance");
    if (!dashBalance) return;
    const formatted = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(currentBalance);
    dashBalance.textContent = formatted;
}

// Navegación de la barra lateral
const menuItems = document.querySelectorAll(".menu-item");
const sections = document.querySelectorAll(".section-view");
const pageTitle = document.getElementById("pageTitle");

menuItems.forEach(item => {
    item.addEventListener("click", () => {
        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        const targetId = item.getAttribute("data-target");
        sections.forEach(sec => {
            if (sec.id === targetId) { sec.classList.add("active"); } 
            else { sec.classList.remove("active"); }
        });

        if (pageTitle) pageTitle.textContent = item.textContent.trim();
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.remove("open");
    });
});

const mobileMenu = document.getElementById("mobileMenu");
if (mobileMenu) {
    mobileMenu.addEventListener("click", () => {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.toggle("open");
    });
}

// Cargar productos de la tienda
function cargarProductosTienda() {
    onSnapshot(collection(db, "productos_tienda"), (snapshot) => {
        let ffHtml = "";
        let claroHtml = "";

        const ffContainer = document.getElementById("ffProductsContainer");
        const claroContainer = document.getElementById("claroProductsContainer");

        if (snapshot.empty) {
            const emptyMsg = `<p style="color: var(--text-muted); grid-column: 1/-1;">No hay productos disponibles.</p>`;
            if (ffContainer) ffContainer.innerHTML = emptyMsg;
            if (claroContainer) claroContainer.innerHTML = emptyMsg;
            return;
        }

        snapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            const cardHTML = `
                <div class="product-card" style="background: var(--bg-card); border: 1px solid var(--border); padding: 1.25rem; border-radius: 1rem; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">${prod.type === 'ff' ? '💎' : '📱'}</div>
                        <h4 style="margin-bottom: 0.25rem;">${prod.name}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">${prod.type === 'ff' ? 'Recarga directa por ID' : 'Acreditación instantánea'}</p>
                    </div>
                    <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 1.1rem; font-weight: bold; color: var(--primary);">$${Number(prod.price).toFixed(2)}</div>
                        <button class="btn open-store-modal" style="width: auto; padding: 0.5rem 1rem; font-size: 0.85rem;" data-product="${prod.name}" data-price="${prod.price}" data-type="${prod.type}">Comprar</button>
                    </div>
                </div>
            `;

            if (prod.type === "ff") { ffHtml += cardHTML; } 
            else { claroHtml += cardHTML; }
        });

        if (ffContainer) ffContainer.innerHTML = ffHtml || '<p style="color: var(--text-muted);">No hay diamantes.</p>';
        if (claroContainer) claroContainer.innerHTML = claroHtml || '<p style="color: var(--text-muted);">No hay recargas.</p>';

        vincularBotonesTienda();
    });
}

function vincularBotonesTienda() {
    document.querySelectorAll(".open-store-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            selectedProduct = {
                name: btn.getAttribute("data-product"),
                price: parseFloat(btn.getAttribute("data-price")),
                type: btn.getAttribute("data-type")
            };

            const modalName = document.getElementById("modalProductName");
            const modalPrice = document.getElementById("modalProductPrice");
            if (modalName) modalName.textContent = selectedProduct.name;
            if (modalPrice) modalPrice.textContent = `$${selectedProduct.price.toFixed(2)}`;

            const group = document.getElementById("dynamicInputGroup");
            if (group) {
                if (selectedProduct.type === "ff") {
                    group.innerHTML = `
                        <label>ID de Jugador de Free Fire</label>
                        <input type="text" id="storeTargetInput" class="form-control" placeholder="Ej. 148293910" required>
                    `;
                } else {
                    group.innerHTML = `
                        <label>Número de Teléfono Claro</label>
                        <input type="tel" id="storeTargetInput" class="form-control" placeholder="Ej. 0991234567" required>
                    `;
                }
            }

            const storeModal = document.getElementById("storeModal");
            if (storeModal) storeModal.classList.remove("hidden");
        });
    });
}

// Manejo de Transferencias Bancarias con aviso de asesor
const formTransferencia = document.getElementById("formTransferencia");
const mensajeAsesorTransferencia = document.getElementById("mensajeAsesorTransferencia");
const nuevaTransferenciaBtn = document.getElementById("nuevaTransferenciaBtn");

if (formTransferencia) {
    formTransferencia.addEventListener("submit", async (e) => {
        e.preventDefault();

        const cuenta = document.getElementById("txCuenta").value;
        const cedula = document.getElementById("txCedula").value;
        const monto = parseFloat(document.getElementById("txMonto").value);
        const motivo = document.getElementById("txMotivo").value;

        if (monto <= 0) { showToast("Monto inválido", "error"); return; }
        if (monto > currentBalance) { showToast("Fondos insuficientes en la cuenta", "error"); return; }

        currentBalance -= monto;
        updateBalanceUI();

        try {
            await setDoc(doc(db, "usuarios", currentUser.uid), { saldo: currentBalance }, { merge: true });
            
            await addDoc(collection(db, "transacciones"), {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                userName: currentUser.displayName || "Usuario",
                title: "Transferencia Bancaria",
                category: `Cuenta: ${cuenta} | Cédula: ${cedula} | Motivo: ${motivo}`,
                amount: -monto,
                date: new Date().toLocaleString(),
                timestamp: serverTimestamp(),
                estado: "Pendiente de Verificación"
            });

            formTransferencia.classList.add("hidden");
            if (mensajeAsesorTransferencia) mensajeAsesorTransferencia.classList.remove("hidden");

        } catch (err) {
            showToast("Error al procesar la transferencia", "error");
        }
    });
}

if (nuevaTransferenciaBtn) {
    nuevaTransferenciaBtn.addEventListener("click", () => {
        formTransferencia.reset();
        formTransferencia.classList.remove("hidden");
        if (mensajeAsesorTransferencia) mensajeAsesorTransferencia.classList.add("hidden");
    });
}

// Tarjeta Virtual con Botón de Solicitud Inicial
async function verificarYCargarTarjeta(user, dbRef) {
    const dynamicArea = document.getElementById("tarjetaDynamicArea");
    if (!dynamicArea) return;

    const tarjetaRef = doc(dbRef, "tarjetas_virtuales", user.uid);
    const tarjetaSnap = await getDoc(tarjetaRef);

    if (tarjetaSnap.exists()) {
        const tData = tarjetaSnap.data();
        renderizarTarjetaHTML(tData, dynamicArea, user, dbRef);
    } else {
        dynamicArea.innerHTML = `
            <div style="padding: 2rem; background: rgba(255,255,255,0.03); border: 2px dashed var(--border); border-radius: 1rem; margin-bottom: 1.5rem; text-align: center;">
                <i class="fa-solid fa-id-card" style="font-size: 3rem; color: var(--primary); margin-bottom: 1rem;"></i>
                <p style="margin-bottom: 1rem; font-size: 0.95rem;">Aún no cuentas con una tarjeta de débito virtual activa.</p>
                <button id="btnSolicitarTarjeta" class="btn" style="max-width: 250px; margin: 0 auto;">
                    <i class="fa-solid fa-plus-circle"></i> Solicitar Tarjeta Virtual
                </button>
            </div>
        `;

        const btnSolicitar = document.getElementById("btnSolicitarTarjeta");
        if (btnSolicitar) {
            btnSolicitar.addEventListener("click", async () => {
                const randomNum1 = Math.floor(1000 + Math.random() * 9000);
                const randomNum2 = Math.floor(1000 + Math.random() * 9000);
                const randomNum3 = Math.floor(1000 + Math.random() * 9000);
                const numeroCompleto = `4829 ${randomNum1} ${randomNum2} ${randomNum3}`;
                
                const cvvAleatorio = Math.floor(100 + Math.random() * 900).toString();
                const mesExp = String(Math.floor(1 + Math.random() * 12)).padStart(2, '0');
                const anioExp = String(new Date().getFullYear() + 4).slice(-2);

                const nuevaTarjeta = {
                    numero: numeroCompleto,
                    titular: user.displayName || "CLIENTE BANCO PEDRO CARBO",
                    cvv: cvvAleatorio,
                    expiracion: `${mesExp}/${anioExp}`,
                    bloqueada: false
                };

                await setDoc(tarjetaRef, nuevaTarjeta);
                renderizarTarjetaHTML(nuevaTarjeta, dynamicArea, user, dbRef);
                showToast("¡Tarjeta virtual creada con éxito!");
            });
        }
    }
}

function renderizarTarjetaHTML(tData, container, user, dbRef) {
    container.innerHTML = `
        <div class="card-preview" style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; text-align: left; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <span style="font-weight: 700; font-size: 0.9rem; letter-spacing: 1px;">P. CARBO VIRTUAL</span>
                <i class="fa-brands fa-cc-visa" style="font-size: 2rem; color: #60a5fa;"></i>
            </div>
            <div style="font-family: monospace; font-size: 1.2rem; letter-spacing: 2px; margin-bottom: 1.5rem;">
                ${tData.numero}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                <div>
                    <p style="font-size: 0.65rem; text-transform: uppercase;">Titular</p>
                    <p style="color: white; font-weight: 600;">${tData.titular}</p>
                </div>
                <div>
                    <p style="font-size: 0.65rem; text-transform: uppercase;">CVV / Exp</p>
                    <p style="color: white; font-weight: 600;">${tData.cvv} / ${tData.expiracion}</p>
                </div>
            </div>
        </div>
        <p style="color: var(--success, #22c55e); font-size: 0.85rem; margin-top: 1rem; text-align: center;"><i class="fa-solid fa-check-circle"></i> Tu tarjeta virtual está activa y lista para usarse.</p>
    `;
}

// Modales de tienda e historial
const closeStoreModal = document.getElementById("closeStoreModal");
if (closeStoreModal) {
    closeStoreModal.addEventListener("click", () => {
        const storeModal = document.getElementById("storeModal");
        if (storeModal) storeModal.classList.add("hidden");
    });
}

const storeForm = document.getElementById("storeForm");
if (storeForm) {
    storeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const targetInput = document.getElementById("storeTargetInput");
        const targetValue = targetInput ? targetInput.value : "";

        if (selectedProduct.price > currentBalance) {
            showToast("Saldo insuficiente para completar la compra", "error");
            return;
        }

        currentBalance -= selectedProduct.price;
        updateBalanceUI();

        const txDate = new Date().toLocaleString();
        const txRandomId = "BPC-" + Math.floor(100000 + Math.random() * 900000);

        try {
            await setDoc(doc(db, "usuarios", currentUser.uid), { saldo: currentBalance }, { merge: true });

            await addDoc(collection(db, "transacciones"), {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                userName: currentUser.displayName || "Usuario",
                title: `Compra: ${selectedProduct.name}`,
                category: selectedProduct.type === "ff" ? "Free Fire (ID: " + targetValue + ")" : "Recarga Claro (" + targetValue + ")",
                amount: -selectedProduct.price,
                date: txDate,
                timestamp: serverTimestamp()
            });

            showToast("¡Compra procesada con éxito!");
        } catch (err) {
            showToast("Error al registrar la transacción", "error");
        }

        const storeModal = document.getElementById("storeModal");
        if (storeModal) storeModal.classList.add("hidden");
    });
}

const btnCloseInvoice = document.getElementById("btnCloseInvoice");
if (btnCloseInvoice) {
    btnCloseInvoice.addEventListener("click", () => {
        const invoiceModal = document.getElementById("invoiceModal");
        if (invoiceModal) invoiceModal.classList.add("hidden");
    });
}

const btnPrintInvoice = document.getElementById("btnPrintInvoice");
if (btnPrintInvoice) {
    btnPrintInvoice.addEventListener("click", () => { window.print(); });
}

// Cargar movimientos del usuario
function cargarMovimientosUsuario(userId) {
    const movementsContainer = document.getElementById("userMovementsList");
    if (!movementsContainer) return;

    const q = query(collection(db, "transacciones"), where("userId", "==", userId));

    onSnapshot(q, (snapshot) => {
        let html = "";

        if (snapshot.empty) {
            movementsContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No tienes movimientos registrados todavía.</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const tx = docSnap.data();
            const isPositive = tx.amount > 0;
            
            html += `
                <div class="movement-item" data-title="${tx.title}" data-category="${tx.category}" data-amount="${tx.amount}" data-date="${tx.date}" data-id="${docSnap.id}" style="background: var(--bg-dark); border: 1px solid var(--border); padding: 1rem; border-radius: 0.75rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: border-color 0.2s;">
                    <div>
                        <h4 style="font-size: 0.95rem; margin-bottom: 0.2rem;">${tx.title}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">${tx.category} • ${tx.date}</p>
                    </div>
                    <div style="font-size: 1rem; font-weight: bold; color: ${isPositive ? 'var(--success)' : 'var(--danger)'};">
                        ${isPositive ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}
                    </div>
                </div>
            `;
        });

        movementsContainer.innerHTML = html;

        document.querySelectorAll(".movement-item").forEach(item => {
            item.addEventListener("click", () => {
                mostrarFacturaMovimiento({
                    title: item.getAttribute("data-title"),
                    category: item.getAttribute("data-category"),
                    amount: parseFloat(item.getAttribute("data-amount")),
                    date: item.getAttribute("data-date"),
                    id: "BPC-" + item.getAttribute("data-id").substring(0, 8).toUpperCase()
                });
            });
        });
    });
}

function mostrarFacturaMovimiento(tx) {
    const invDate = document.getElementById("invDate");
    const invId = document.getElementById("invId");
    const invClient = document.getElementById("invClient");
    const invProduct = document.getElementById("invProduct");
    const invTarget = document.getElementById("invTarget");
    const invTotal = document.getElementById("invTotal");

    if (invDate) invDate.textContent = tx.date;
    if (invId) invId.textContent = tx.id;
    if (invClient) invClient.textContent = currentUser ? (currentUser.displayName || "Cliente") : "Pedro Carbo";
    if (invProduct) invProduct.textContent = tx.title;
    if (invTarget) invTarget.textContent = tx.category;
    if (invTotal) invTotal.textContent = Math.abs(tx.amount).toFixed(2);

    const invoiceModal = document.getElementById("invoiceModal");
    if (invoiceModal) invoiceModal.classList.remove("hidden");
}
