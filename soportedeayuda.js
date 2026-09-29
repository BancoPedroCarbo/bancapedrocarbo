import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    updateDoc 
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

let currentChatId = null;
let timerInterval = null;
let warningSent = false;

// Manejo del formulario de Login de Soporte
const loginForm = document.getElementById("supportLoginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("supportLoginEmail").value;
        const password = document.getElementById("supportLoginPassword").value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            alert("Error: Correo o contraseña incorrectos.");
        }
    });
}

// Botón de Cerrar Sesión
const btnLogout = document.getElementById("btnSupportLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        window.location.reload();
    });
}

// Observador de estado de autenticación
onAuthStateChanged(auth, async (user) => {
    const authScreen = document.getElementById("supportAuthScreen");
    const appScreen = document.getElementById("supportAppScreen");

    if (!user) {
        authScreen.classList.remove("hidden");
        appScreen.classList.add("hidden");
        return;
    }

    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    const isSupportUser = user.email === "soporte@bancopedrocarbo.com";
    const subTitle = document.getElementById("userRoleSubtitle");
    const clientView = document.getElementById("clientSupportView");
    const agentView = document.getElementById("supportAgentView");

    if (isSupportUser) {
        subTitle.textContent = "Panel de Control Exclusivo - Soporte Humano";
        clientView.classList.add("hidden");
        agentView.classList.remove("hidden");
        initSupportAgentPanel();
    } else {
        subTitle.textContent = "Asistencia en línea con agentes autorizados";
        agentView.classList.add("hidden");
        clientView.classList.remove("hidden");
        initClientChat(user);
    }
});

// --- LÓGICA DEL CLIENTE ---
async function initClientChat(user) {
    currentChatId = user.uid; 
    const chatRef = doc(db, "chats_soporte", currentChatId);

    await setDoc(chatRef, {
        userId: user.uid,
        userName: user.displayName || user.email,
        status: "esperando",
        lastUpdated: serverTimestamp()
    }, { merge: true });

    const chatBody = document.getElementById("clientChatBody");
    const input = document.getElementById("clientInput");
    const sendBtn = document.getElementById("clientSendBtn");
    const statusIndicator = document.getElementById("chatStatusIndicator");
    const timerBox = document.getElementById("timerDisplay");

    // Mostrar mensaje de bienvenida inicial con los botones interactivos
    renderWelcomeMenu(chatBody, user);

    // Escuchar cambios en el estado del chat (cuando el agente se une)
    onSnapshot(chatRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === "activo") {
                statusIndicator.textContent = "🟢 Conectado con Asesor Humano";
                if(timerBox) timerBox.style.display = "block";
                
                if (!timerInterval && data.startTime) {
                    startClientTimer(data.startTime.toMillis());
                }
            } else {
                statusIndicator.textContent = "Asistente Virtual Activo";
            }
        }
    });

    // Escuchar mensajes en tiempo real
    const q = query(collection(db, "chats_soporte", currentChatId, "mensajes"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        // Mantener el menú de bienvenida y adjuntar los nuevos mensajes o interacciones
        let html = `
            <div class="wa-message incoming">
                <p><strong>HOLA BIENVENIDOS A BANCA PEDRO CARBO ¿QUÉ LE PODEMOS AYUDAR? ELIGE:</strong></p>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem;">
                    <button class="support-option-btn" data-option="agente" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-user-tie"></i> Consulta con un agente</button>
                    <button class="support-option-btn" data-option="deuda" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-file-invoice-dollar"></i> Consulta de saldo de deuda</button>
                    <button class="support-option-btn" data-option="problemas" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Problemas o errores</button>
                    <button class="support-option-btn" data-option="baneada" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-ban"></i> Cuenta baneada o robada</button>
                </div>
                <span class="wa-time">Ahora</span>
            </div>
        `;
        
        snapshot.forEach((docSnap) => {
            const m = docSnap.data();
            const isMe = m.senderId === user.uid;
            html += `
                <div class="wa-message ${isMe ? 'outgoing' : 'incoming'}">
                    <p><strong>${m.senderName}:</strong> ${m.text}</p>
                    <span class="wa-time">${m.timestamp ? new Date(m.timestamp.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ahora'}</span>
                </div>
            `;
        });
        chatBody.innerHTML = html;
        chatBody.scrollTop = chatBody.scrollHeight;

        // Reasignar eventos a los botones de opción cada vez que se renderice el chat
        document.querySelectorAll(".support-option-btn").forEach(button => {
            button.addEventListener("click", async (e) => {
                const option = e.currentTarget.getAttribute("data-option");
                await handleSupportOptionSelection(option, user);
            });
        });
    });

    async function sendMsg() {
        const text = input.value.trim();
        if (!text) return;
        input.value = "";

        await addDoc(collection(db, "chats_soporte", currentChatId, "mensajes"), {
            senderId: user.uid,
            senderName: user.displayName || "Cliente",
            text: text,
            timestamp: serverTimestamp()
        });
    }

    sendBtn.addEventListener("click", sendMsg);
    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMsg(); });
}

// Renderizar Menú de Bienvenida Inicial
function renderWelcomeMenu(chatBody, user) {
    chatBody.innerHTML = `
        <div class="wa-message incoming">
            <p><strong>HOLA BIENVENIDOS A BANCA PEDRO CARBO ¿QUÉ LE PODEMOS AYUDAR? ELIGE:</strong></p>
            <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem;">
                <button class="support-option-btn" data-option="agente" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-user-tie"></i> Consulta con un agente</button>
                <button class="support-option-btn" data-option="deuda" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-file-invoice-dollar"></i> Consulta de saldo de deuda</button>
                <button class="support-option-btn" data-option="problemas" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Problemas o errores</button>
                <button class="support-option-btn" data-option="baneada" style="background: var(--primary); color: white; border: none; padding: 0.6rem; border-radius: 0.4rem; cursor: pointer; text-align: left; font-size: 0.85rem;"><i class="fa-solid fa-ban"></i> Cuenta baneada o robada</button>
            </div>
            <span class="wa-time">Ahora</span>
        </div>
    `;

    document.querySelectorAll(".support-option-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
            const option = e.currentTarget.getAttribute("data-option");
            await handleSupportOptionSelection(option, user);
        });
    });
}

// Manejar la respuesta automática según el botón presionado
async function handleSupportOptionSelection(option, user) {
    let responseText = "";

    if (option === "agente") {
        responseText = "TE ESTAMOS BUSCANDO UN AGENTE DISPONIBLE";
    } else if (option === "deuda") {
        try {
            const userDocRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userDocRef);
            let deudaVal = 0.00;
            if (userSnap.exists()) {
                deudaVal = userSnap.data().deuda || 0.00;
            }
            responseText = `TU SALDO DE DEUDA ES $${Number(deudaVal).toFixed(2)}`;
        } catch (err) {
            responseText = "TU SALDO DE DEUDA ES $0.00";
        }
    } else if (option === "problemas") {
        responseText = "EN BREVE TE CONTACTAREMOS CON UN AGENTE DE PROBLEMAS";
    } else if (option === "baneada") {
        responseText = "UN ESPECIALISTA TE ESTÁ REVISANDO EN BREVE TE RESPONDERÁ";
    }

    // Guardar la selección y la respuesta automática en Firebase
    await addDoc(collection(db, "chats_soporte", user.uid, "mensajes"), {
        senderId: "sistema_bot",
        senderName: "Asistente Virtual",
        text: responseText,
        timestamp: serverTimestamp()
    });
}

function startClientTimer(startTimeMs) {
    if (timerInterval) return;
    const durationMs = 10 * 60 * 1000; 

    timerInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTimeMs;
        const remaining = durationMs - elapsed;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            document.getElementById("timeLeft").textContent = "00:00";
            document.getElementById("chatStatusIndicator").textContent = "🔴 Chat Finalizado (Tiempo Agotado)";
            document.getElementById("clientInput").disabled = true;
            document.getElementById("clientSendBtn").disabled = true;
            return;
        }

        if (remaining <= 60000 && !warningSent) {
            warningSent = true;
            appendSystemWarningMessage("⚠️ ATENCIÓN: Este chat de soporte finalizará automáticamente en 1 minuto.");
        }

        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const timeLeftEl = document.getElementById("timeLeft");
        if(timeLeftEl) timeLeftEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function appendSystemWarningMessage(text) {
    const chatBody = document.getElementById("clientChatBody");
    if(!chatBody) return;
    chatBody.innerHTML += `
        <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--danger); padding: 0.5rem; border-radius: 0.5rem; text-align: center; font-size: 0.8rem; color: #fca5a5; margin: 0.5rem 0;">
            ${text}
        </div>
    `;
    chatBody.scrollTop = chatBody.scrollHeight;
}


// --- LÓGICA DEL AGENTE DE SOPORTE EXCLUSIVO ---
function initSupportAgentPanel() {
    const queueList = document.getElementById("waitingQueueList");
    const agentInput = document.getElementById("agentInput");
    const agentSendBtn = document.getElementById("agentSendBtn");
    const activeClientName = document.getElementById("activeClientName");
    const agentChatBody = document.getElementById("agentChatBody");

    let activeListener = null;

    onSnapshot(collection(db, "chats_soporte"), (snapshot) => {
        let html = "";
        if (snapshot.empty) {
            queueList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No hay solicitudes pendientes.</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const chat = docSnap.data();
            html += `
                <div class="agent-queue-item" data-id="${chat.userId}" data-name="${chat.userName}" style="background: var(--bg-dark); border: 1px solid var(--border); padding: 0.75rem; border-radius: 0.5rem; cursor: pointer;">
                    <h4 style="font-size: 0.9rem; margin-bottom: 0.2rem;">👤 ${chat.userName}</h4>
                    <span style="font-size: 0.75rem; color: ${chat.status === 'activo' ? 'var(--success)' : 'var(--danger)'};">Estado: ${chat.status}</span>
                </div>
            `;
        });

        queueList.innerHTML = html;

        document.querySelectorAll(".agent-queue-item").forEach(item => {
            item.addEventListener("click", async () => {
                currentChatId = item.getAttribute("data-id");
                const clientName = item.getAttribute("data-name");
                activeClientName.textContent = `Chat con: ${clientName}`;

                agentInput.disabled = false;
                agentSendBtn.disabled = false;

                const chatRef = doc(db, "chats_soporte", currentChatId);
                await updateDoc(chatRef, {
                    status: "activo",
                    startTime: serverTimestamp()
                });

                if (activeListener) activeListener(); 
                
                const q = query(collection(db, "chats_soporte", currentChatId, "mensajes"), orderBy("timestamp", "asc"));
                activeListener = onSnapshot(q, (msgSnap) => {
                    let msgHtml = "";
                    msgSnap.forEach((mDoc) => {
                        const m = mDoc.data();
                        const isAgent = m.senderId === auth.currentUser.uid;
                        msgHtml += `
                            <div class="wa-message ${isAgent ? 'outgoing' : 'incoming'}">
                                <p><strong>${m.senderName}:</strong> ${m.text}</p>
                            </div>
                        `;
                    });
                    agentChatBody.innerHTML = msgHtml || '<p style="color:var(--text-muted)">Sin mensajes previos.</p>';
                    agentChatBody.scrollTop = agentChatBody.scrollHeight;
                });
            });
        });
    });

    async function sendAgentMsg() {
        const text = agentInput.value.trim();
        if (!text || !currentChatId) return;
        agentInput.value = "";

        await addDoc(collection(db, "chats_soporte", currentChatId, "mensajes"), {
            senderId: auth.currentUser.uid,
            senderName: "Asesor (Soporte)",
            text: text,
            timestamp: serverTimestamp()
        });
    }

    agentSendBtn.addEventListener("click", sendAgentMsg);
    agentInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendAgentMsg(); });
}
