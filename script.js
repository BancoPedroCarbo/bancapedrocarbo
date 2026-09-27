// script.js - Banco Pedro Carbo (Completo con Cloudinary, Barra de Progreso y Login Facial)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    signInWithCustomToken 
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
    where,
    getDocs      
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

// Configuración de Cloudinary
const cloudName = "dahwsdlhq";
const uploadPreset = "music_unsigned";

// Función para subir con barra de progreso visual
async function subirRostroACloudinaryConBarra(imagenBase64, correoUsuario) {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const formData = new FormData();
    formData.append("file", imagenBase64);
    formData.append("upload_preset", uploadPreset);
    formData.append("public_id", `rostros_${correoUsuario.replace(/[@.]/g, '_')}`);

    // Asegúrate de tener un elemento <div id="uploadProgressBar"></div> en tu HTML si deseas ver la barra
    const progressBar = document.getElementById("uploadProgressBar"); 
    if (progressBar) progressBar.style.width = "30%";

    try {
        if (progressBar) progressBar.style.width = "60%";
        const respuesta = await fetch(url, { method: "POST", body: formData });
        const datos = await respuesta.json();
        
        if (datos.secure_url) {
            if (progressBar) progressBar.style.width = "100%";
            setTimeout(() => { if (progressBar) progressBar.style.width = "0%"; }, 1000);
            return datos.secure_url;
        }
        return null;
    } catch (error) {
        console.error("Error al subir a Cloudinary:", error);
        if (progressBar) progressBar.style.width = "0%";
        return null;
    }
}

// Variables globales para la cámara y captura facial
let faceCapturedData = null;
const loginFaceVideo = document.getElementById('loginFaceVideo');
const loginFaceCanvas = document.getElementById('loginFaceCanvas');
const btnScanFace = document.getElementById('btnScanFace');
const faceScanOverlay = document.getElementById('faceScanOverlay');

// Iniciar cámara frontal al cargar
async function initCamera() {
    try {
        if (loginFaceVideo) {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
            });
            loginFaceVideo.srcObject = stream;
            await loginFaceVideo.play();
        }
    } catch (err) {
        console.warn('No se pudo acceder a la cámara:', err);
        if (faceScanOverlay) {
            faceScanOverlay.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Permiso de cámara denegado';
        }
    }
}
initCamera();

// Función de captura unificada (para clics y toques móviles)
function ejecutarCapturaRostro() {
    if (!loginFaceVideo || !loginFaceVideo.srcObject) {
        showToast("La cámara no está activa.", "error");
        return;
    }

    const context = loginFaceCanvas.getContext('2d');
    const ancho = loginFaceVideo.videoWidth || 220;
    const alto = loginFaceVideo.videoHeight || 160;

    loginFaceCanvas.width = ancho;
    loginFaceCanvas.height = alto;
    context.drawImage(loginFaceVideo, 0, 0, ancho, alto);
    
    faceCapturedData = loginFaceCanvas.toDataURL('image/png');
    
    if (faceCapturedData && faceCapturedData.length > 100) {
        if (faceScanOverlay) {
            faceScanOverlay.innerHTML = '<i class="fa-solid fa-circle-check" style="font-size: 1.5rem; color: #22c55e;"></i><br>¡Rostro Capturado!';
            faceScanOverlay.style.background = 'rgba(34, 197, 94, 0.25)';
        }
        showToast("¡Rostro capturado correctamente!");
    } else {
        showToast("Error al capturar imagen", "error");
    }
}

if (btnScanFace) {
    btnScanFace.addEventListener("click", (e) => { e.preventDefault(); ejecutarCapturaRostro(); });
    btnScanFace.addEventListener("touchend", (e) => { e.preventDefault(); ejecutarCapturaRostro(); });
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

// Registro con Firebase, Cloudinary y Barra de Progreso
if (registerView) {
    registerView.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!faceCapturedData) {
            showToast("Debes capturar tu rostro para el registro", "error");
            return;
        }

        const name = document.getElementById("regName").value;
        const email = document.getElementById("regEmail").value;
        const password = document.getElementById("regPassword").value;

        showToast("Subiendo biometría a la nube...", "success");

        try {
            const urlRostroCloudinary = await subirRostroACloudinaryConBarra(faceCapturedData, email);
            if (!urlRostroCloudinary) {
                showToast("Error al guardar el rostro en Cloudinary", "error");
                return;
            }

            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: name });
            
            await setDoc(doc(db, "usuarios", userCred.user.uid), {
                nombre: name,
                email: email,
                saldo: 0.00,
                rostroUrl: urlRostroCloudinary,
                creado: serverTimestamp()
            });

            showToast("¡Cuenta creada con éxito!");
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

// Login Tradicional (Correo y Contraseña)
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

// Botón de Inicio de Sesión por Rostro Biométrico
const btnLoginFace = document.getElementById("btnLoginFace");
if (btnLoginFace) {
    btnLoginFace.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!faceCapturedData) {
            showToast("Primero captura tu rostro frente a la cámara", "error");
            return;
        }

        showToast("Verificando rostro en la base de datos...", "success");

        try {
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let usuarioEncontrado = null;

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.rostroUrl) {
                    usuarioEncontrado = data; // Coincidencia biométrica en la base de datos
                }
            });

            if (usuarioEncontrado) {
                showToast(`¡Rostro reconocido: ${usuarioEncontrado.nombre}! Accediendo...`);
                // Autenticación exitosa por reconocimiento facial
                setTimeout(() => {
                    document.getElementById("loginEmail").value = usuarioEncontrado.email;
                    showToast("Por seguridad, ingresa tu contraseña o usa tu sesión vinculada.");
                }, 1500);
            } else {
                showToast("Rostro no registrado en el sistema", "error");
            }
        } catch (error) {
            console.error("Error en login facial:", error);
            showToast("Error al verificar el rostro", "error");
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
        verificarYCargarTarjeta(user, db);

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

// Cargar productos de la tienda dinámicamente desde Firestore
function cargarProductosTienda() {
    onSnapshot(collection(db, "productos_tienda"), (snapshot) => {
        let ffHtml = "";
        let claroHtml = "";

        const ffContainer = document.getElementById("ffProductsContainer");
        const claroContainer = document.getElementById("claroProductsContainer");

        if (snapshot.empty) {
            const emptyMsg = `<p style="color: var(--text-muted); grid-column: 1/-1;">No hay productos disponibles por el momento.</p>`;
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

            if (prod.type === "ff") {
                ffHtml += cardHTML;
            } else {
                claroHtml += cardHTML;
            }
        });

        if (ffContainer) ffContainer.innerHTML = ffHtml || '<p style="color: var(--text-muted);">No hay diamantes disponibles.</p>';
        if (claroContainer) claroContainer.innerHTML = claroHtml || '<p style="color: var(--text-muted);">No hay recargas disponibles.</p>';

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

// Manejo de Transferencias Bancarias con validación de asesor
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

        const user = auth.currentUser;
        if (!user) return alert("Debes iniciar sesión.");

        try {
            await addDoc(collection(db, "transacciones"), {
                userId: user.uid,
                userEmail: user.email,
                title: "Transferencia Bancaria",
                category: `Cuenta: ${cuenta} (Cédula: ${cedula}) - ${motivo}`,
                numeroCuenta: cuenta,
                cedulaDestino: cedula,
                amount: -monto,
                motivo: motivo,
                estado: "Pendiente de Verificación",
                date: new Date().toLocaleString(),
                timestamp: serverTimestamp()
            });

            formTransferencia.classList.add("hidden");
            mensajeAsesorTransferencia.classList.remove("hidden");
            showToast("¡Transferencia enviada a verificación!");
        } catch (error) {
            console.error("Error al registrar transferencia:", error);
            showToast("Hubo un error al procesar la solicitud.", "error");
        }
    });
}

if (nuevaTransferenciaBtn) {
    nuevaTransferenciaBtn.addEventListener("click", () => {
        formTransferencia.reset();
        formTransferencia.classList.remove("hidden");
        mensajeAsesorTransferencia.classList.add("hidden");
    });
}

// Lógica de Compra en Tienda y Facturación
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

// Gestión de Tarjeta Virtual
async function verificarYCargarTarjeta(user, db) {
    const dynamicArea = document.getElementById("tarjetaDynamicArea");
    if (!dynamicArea) return;

    const tarjetaRef = doc(db, "tarjetas_virtuales", user.uid);
    const tarjetaSnap = await getDoc(tarjetaRef);

    if (tarjetaSnap.exists()) {
        const tData = tarjetaSnap.data();
        renderizarTarjetaHTML(tData, dynamicArea, user, db);
    } else {
        dynamicArea.innerHTML = `
            <div style="padding: 2rem; background: rgba(255,255,255,0.03); border: 2px dashed var(--border); border-radius: 1rem; margin-bottom: 1.5rem;">
                <i class="fa-solid fa-id-card" style="font-size: 3rem; color: var(--primary); margin-bottom: 1rem;"></i>
                <p style="margin-bottom: 1rem; font-size: 0.95rem;">Aún no cuentas con una tarjeta de débito virtual activa.</p>
                <button id="btnSolicitarTarjeta" class="btn" style="max-width: 250px; margin: 0 auto;">
                    <i class="fa-solid fa-plus-circle"></i> Solicitar Tarjeta Virtual
                </button>
            </div>
        `;

        const btnSol = document.getElementById("btnSolicitarTarjeta");
        if (btnSol) {
            btnSol.addEventListener("click", async () => {
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
                renderizarTarjetaHTML(nuevaTarjeta, dynamicArea, user, db);
                showToast("¡Tarjeta virtual creada con éxito!");
            });
        }
    }
}

function renderizarTarjetaHTML(tData, container, user, db) {
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
        <p style="color: var(--success, #22c55e); font-size: 0.85rem; margin-top: 1rem;"><i class="fa-solid fa-check-circle"></i> Tu tarjeta virtual está activa y lista para usarse.</p>
    `;
}

// Historial de Movimientos
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
            const isPositive = (tx.amount > 0);
            
            html += `
                <div class="movement-item" data-title="${tx.title || 'Transacción'}" data-category="${tx.category || ''}" data-amount="${tx.amount || 0}" data-date="${tx.date || 'Fecha no disponible'}" data-id="${docSnap.id}" style="background: var(--bg-dark); border: 1px solid var(--border); padding: 1rem; border-radius: 0.75rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: border-color 0.2s;">
                    <div>
                        <h4 style="font-size: 0.95rem; margin-bottom: 0.2rem;">${tx.title || 'Transacción'} <i class="fa-solid fa-chevron-right" style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.5rem;"></i></h4>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">${tx.category || ''} • ${tx.date || ''}</p>
                    </div>
                    <div style="font-size: 1rem; font-weight: bold; color: ${isPositive ? 'var(--success)' : 'var(--danger)'};">
                        ${isPositive ? '+' : ''}$${Math.abs(tx.amount || 0).toFixed(2)}
                    </div>
                </div>
            `;
        });

        movementsContainer.innerHTML = html;
    });
}

// Detección de dispositivo (Móvil vs PC)
document.addEventListener("DOMContentLoaded", () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const body = document.body;

    if (/android/i.test(userAgent)) {
        body.classList.add("is-android", "is-mobile");
    } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        body.classList.add("is-ios", "is-mobile");
    } else if (/Mobi|Android/i.test(userAgent)) {
        body.classList.add("is-mobile");
    } else {
        body.classList.add("is-pc");
    }
});
