import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
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
    currentChatId = user.uid; // Un chat único por usuario
    const chatRef = doc(db, "chats_soporte", currentChatId);

    // Crear o asegurar que el chat existe en estado de espera
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

    // Escuchar cambios en el estado del chat (cuando el agente se une)
    onSnapshot(chatRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === "activo") {
                statusIndicator.textContent = "🟢 Conectado con Asesor Humano";
                timerBox.style.display = "block";
                
                // Iniciar temporizador de 10 minutos si cuenta con hora de inicio
                if (!timerInterval && data.startTime) {
                    startClientTimer(data.startTime.toMillis());
                }
            } else {
                statusIndicator.textContent = "⏳ Buscando agente disponible...";
            }
        }
    });

    // Escuchar mensajes en tiempo real
    const q = query(collection(db, "chats_soporte", currentChatId, "mensajes"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        let html = `<div class="wa-message incoming"><p>Hola ${user.displayName || 'Cliente'}, un asesor humano se unirá a tu solicitud en breve.</p></div>`;
        
        snapshot.forEach((docSnap) => {
            const m = docSnap.data();
            const isMe = m.senderId === user.uid;
            html += `
                <div class="wa-message ${isMe ? 'outgoing' : 'incoming'}">
                    <p><strong>${m.senderName}:</strong> ${m.text}</p>
                    <span class="wa-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        });
        chatBody.innerHTML = html;
        chatBody.scrollTop = chatBody.scrollHeight;
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

function startClientTimer(startTimeMs) {
    if (timerInterval) return;
    const durationMs = 10 * 60 * 1000; // 10 minutos en milisegundos

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

        // Alerta automática en el minuto 9 (cuando quedan 60 segundos o menos)
        if (remaining <= 60000 && !warningSent) {
            warningSent = true;
            appendSystemWarningMessage("⚠️ ATENCIÓN: Este chat de soporte finalizará automáticamente en 1 minuto.");
        }

        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        document.getElementById("timeLeft").textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

    // Escuchar todas las solicitudes de chat en tiempo real
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

        // Unirse automáticamente al hacer clic en cualquier solicitud de la lista
        document.querySelectorAll(".agent-queue-item").forEach(item => {
            item.addEventListener("click", async () => {
                currentChatId = item.getAttribute("data-id");
                const clientName = item.getAttribute("data-name");
                activeClientName.textContent = `Chat con: ${clientName}`;

                agentInput.disabled = false;
                agentSendBtn.disabled = false;

                // Cambiar estado a activo y registrar tiempo de inicio si es la primera vez
                const chatRef = doc(db, "chats_soporte", currentChatId);
                await updateDoc(chatRef, {
                    status: "activo",
                    startTime: serverTimestamp()
                });

                // Cargar mensajes anteriores del usuario y mantener escucha en tiempo real
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