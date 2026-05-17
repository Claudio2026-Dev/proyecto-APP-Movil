// ==========================================================================
// CORE DE DATOS: Inicialización y Consolidación con Historial de Planta
// ==========================================================================
let dbData = JSON.parse(localStorage.getItem('mantind_tree_data')) || [
    { id: "m1", type: "maquina", name: "Inyectora Plastico #1", timestamp: new Date().toISOString(), children: [
        { id: "ot1", type: "ot", name: "OT 4502", timestamp: new Date().toISOString(), children: [] }
    ]}
];
let logs = JSON.parse(localStorage.getItem('mantind_tree_logs')) || [];
let deletedLogsBuffer = [];
let selectedNodeId = null;
let lastWorkedOtId = "ot1"; 
let currentImgBase64 = null;
let voiceFlowStep = "IDLE"; 
let isSystemSpeaking = false; 

// Enlaces del DOM HUD
const txtOutput = document.getElementById('transcript-output');
const btnSave = document.getElementById('btn-save');
const btnClearGraphic = document.getElementById('btn-clear-graphic');
const btnMic = document.getElementById('btn-mic');
const statusDiv = document.getElementById('status');
const listRecords = document.getElementById('list-records');
const btnUndoAction = document.getElementById('btn-undo-action');
const tooltipHUD = document.getElementById('hud-tooltip');
const btnOpenExport = document.getElementById('btn-open-export');

// --- MOTOR AUDIO-EXPLICATIVO POR SOSTÉN CRONOMETRADO (2 SEGUNDOS) ---
let holdTimer = null;
let isHolding = false; 

function systemSpeak(text, callback) {
    window.speechSynthesis.cancel();
    
    // Mute de seguridad: Detiene micrófono antes de hablar para evitar auto-grabación
    if (recognition && isRecordingActive) {
        isSystemSpeaking = true;
        recognition.stop();
        statusDiv.innerText = "AUDIO DESCRIPTIVO ACTIVADO";
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    utterance.rate = 1.0;
    
    utterance.onend = () => {
        isSystemSpeaking = false;
        // Si el mic estaba activo antes del audio, lo reenciende limpiamente
        if (recognition && !isRecordingActive) {
            recognition.start();
        }
        if(callback) callback();
    };
    window.speechSynthesis.speak(utterance);
}

function configureOverHoldEvents(element) {
    const triggerIn = (e) => {
        const infoText = element.getAttribute('data-info');
        if (!infoText) return;
        
        isHolding = false; 
        const rect = element.getBoundingClientRect();
        tooltipHUD.innerText = infoText.toUpperCase();
        tooltipHUD.style.left = `${rect.left + (rect.width/2) - 100}px`;
        tooltipHUD.style.top = `${rect.top - 55}px`;
        tooltipHUD.style.opacity = "1";

        // Ajuste Técnico Estricto: Requiere 2 segundos completos fijados en el botón
        holdTimer = setTimeout(() => {
            isHolding = true; 
            systemSpeak(infoText);
        }, 2000);
    };

    const triggerOut = () => {
        clearTimeout(holdTimer);
        tooltipHUD.style.opacity = "0";
    };

    const preventActionIfHolding = (e) => {
        if (isHolding) {
            e.preventDefault();
            e.stopPropagation();
            isHolding = false; 
        }
    };

    element.addEventListener('mouseenter', triggerIn);
    element.addEventListener('mouseleave', triggerOut);
    element.addEventListener('touchstart', triggerIn, {passive: true});
    element.addEventListener('touchend', triggerOut);
    element.addEventListener('click', preventActionIfHolding, true);
}
document.querySelectorAll('[data-info]').forEach(configureOverHoldEvents);

// --- MOTOR DE RECONOCIMIENTO POR VOZ PASIVA ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecordingActive = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'es-AR';
    recognition.interimResults = false;

    recognition.onstart = () => { isRecordingActive = true; btnMic.classList.add('recording'); statusDiv.innerText = "LISTEN MODE ACTIVE"; };
    recognition.onend = () => { isRecordingActive = false; btnMic.classList.remove('recording'); if (!isSystemSpeaking) statusDiv.innerText = "SYSTEM READY"; };
    
    recognition.onresult = (e) => {
        if (isSystemSpeaking) return; 
        
        const lastResultIndex = e.resultIndex;
        const rawText = e.results[lastResultIndex][0].transcript.trim().toLowerCase();

        // Interceptores de flujos conversacionales prioritarios (Aceptar / Cancelar)
        if (voiceFlowStep === "AWAITING_OT_CONFIRM") {
            if (rawText.includes("aceptar") || rawText.includes("sí") || rawText.includes("si") || rawText.includes("claro")) {
                selectedNodeId = lastWorkedOtId;
                systemSpeak("Nombre de la tarea", () => { voiceFlowStep = "AWAITING_TASK_NAME"; });
                return;
            } else if (rawText.includes("cancelar") || rawText.includes("no") || rawText.includes("rechazar")) {
                systemSpeak("Operación abortada."); voiceFlowStep = "IDLE"; statusDiv.classList.remove('command-mode');
                return;
            }
        }
        if (voiceFlowStep === "AWAITING_MACHINE_NAME") {
            if(rawText) { addElement('maquina', e.results[lastResultIndex][0].transcript); systemSpeak("Máquina creada."); voiceFlowStep = "IDLE"; statusDiv.classList.remove('command-mode'); }
            return;
        }
        if (voiceFlowStep === "AWAITING_OT_NAME") {
            if(rawText) { addElement('ot', e.results[lastResultIndex][0].transcript); systemSpeak("Orden guardada."); voiceFlowStep = "IDLE"; statusDiv.classList.remove('command-mode'); }
            return;
        }
        if (voiceFlowStep === "AWAITING_TASK_NAME") {
            if(rawText) { addElement('tarea', e.results[lastResultIndex][0].transcript); systemSpeak("Tarea vinculada."); voiceFlowStep = "IDLE"; statusDiv.classList.remove('command-mode'); }
            return;
        }

        // CONTROL EXCLUSIVO: Filtro rígido por la frase de activación obligatoria
        if (rawText.startsWith("activar gestor de comandos")) {
            statusDiv.classList.add('command-mode');
            let commandParsed = rawText.replace("activar gestor de comandos", "").trim();
            
            if (commandParsed.includes("ocultar panel")) {
                document.getElementById('sidebar-tree').style.display = 'none'; systemSpeak("Panel oculto.");
            } else if (commandParsed.includes("mostrar panel")) {
                document.getElementById('sidebar-tree').style.display = 'flex'; systemSpeak("Panel visible.");
            } else if (commandParsed.includes("ir al inicio")) {
                window.scrollTo({ top: 0, behavior: 'smooth' }); document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (commandParsed.includes("ir al final")) {
                const ts = document.body.scrollHeight || document.documentElement.scrollHeight;
                window.scrollTo({ top: ts, behavior: 'smooth' }); document.documentElement.scrollTo({ top: ts, behavior: 'smooth' });
            } else if (commandParsed.includes("deshacer")) {
                if (deletedLogsBuffer.length > 0) { btnUndoAction.click(); systemSpeak("Eliminación revertida."); } 
                else { systemSpeak("Nada para restaurar."); }
            } else if (commandParsed.includes("limpiar cuadro") || commandParsed.includes("borrar cuadro")) {
                btnClearGraphic.click(); systemSpeak("Cuadro limpio.");
            } else if (commandParsed.includes("guardar registro") || commandParsed.includes("guardar reporte")) {
                if (!selectedNodeId) { systemSpeak("Seleccione un componente."); } 
                else if (!txtOutput.value.trim() && !currentImgBase64) { systemSpeak("Cuadro vacío."); } 
                else { btnSave.click(); systemSpeak("Registro guardado."); }
            } else if (commandParsed.includes("exportar historial") || commandParsed.includes("exportar datos")) {
                if (!selectedNodeId) { systemSpeak("Seleccione elemento en el árbol."); } 
                else { btnOpenExport.click(); systemSpeak("Exportando reporte."); }
            } else if (commandParsed.includes("activar cámara") || commandParsed.includes("tomar foto")) {
                systemSpeak("Abriendo cámara.", () => camBtn.click());
            } else if (commandParsed.includes("crear máquina") || commandParsed.includes("crear maquina")) {
                voiceFlowStep = "AWAITING_MACHINE_NAME"; systemSpeak("Diga el nombre de la máquina.");
            } else if (commandParsed.includes("crear ot") || commandParsed.includes("crear orden")) {
                if (!selectedNodeId) { systemSpeak("Seleccione una máquina."); voiceFlowStep = "IDLE"; } 
                else { voiceFlowStep = "AWAITING_OT_NAME"; systemSpeak("Diga el número de orden."); }
            } else if (commandParsed.includes("crear tarea")) {
                if (lastWorkedOtId) { voiceFlowStep = "AWAITING_OT_CONFIRM"; systemSpeak("¿Crear tarea en la última orden abierta?"); } 
                else { systemSpeak("Seleccione una orden primero."); }
            } else {
                systemSpeak("Gestor encendido.");
            }
            return;
        }

        // Si no se invoca el comando, se procesa como texto libre directo para el informe técnico
        if (voiceFlowStep === "IDLE") {
            txtOutput.value = txtOutput.value ? txtOutput.value + " " + e.results[lastResultIndex][0].transcript : e.results[lastResultIndex][0].transcript;
            txtOutput.dispatchEvent(new Event('input')); 
        }
    };
}

btnMic.addEventListener('click', () => { if(!recognition) return; if(isRecordingActive) recognition.stop(); else recognition.start(); });
btnClearGraphic.addEventListener('click', () => { txtOutput.value = ""; currentImgBase64 = null; document.getElementById('btn-camera').classList.remove('active'); txtOutput.style.height = 'auto'; });

// --- LÓGICA ESTRUCTURAL DEL ÁRBOL DE PLANTA ---
function renderTree() { const r = document.getElementById('tree-root'); r.innerHTML = ''; dbData.forEach(m => r.appendChild(createNodeElement(m))); }
function createNodeElement(node) {
    const cDiv = document.createElement('div');
    const item = document.createElement('div'); item.className = `tree-item ${selectedNodeId === node.id ? 'selected' : ''}`;
    item.onclick = (e) => { e.stopPropagation(); selectNode(node); };
    let icon = node.type === 'maquina' ? '🏭' : node.type === 'ot' ? '📋' : '🔧';
    item.innerHTML = `<div class="node-label type-${node.type}"><span>${icon} ${node.name}</span></div><div class="node-actions"><button onclick="event.stopPropagation(); deleteNode('${node.id}')">❌</button></div>`;
    cDiv.appendChild(item);
    if (node.children && node.children.length > 0) {
        const sub = document.createElement('div'); sub.className = 'tree-node';
        node.children.forEach(c => sub.appendChild(createNodeElement(c)));
        cDiv.appendChild(sub);
    }
    return cDiv;
}

function selectNode(node) { 
    selectedNodeId = node.id; 
    if(node.type === 'ot') lastWorkedOtId = node.id; 
    document.getElementById('chat-target-info').innerText = `HUD // ID:: ${node.name.toUpperCase()}`; 
    renderTree(); renderLogs(); 
}

function addElement(type, name) {
    const newNode = { id: 'id_' + Date.now(), type: type, name: name, timestamp: new Date().toISOString(), children: [] };
    if (type === 'maquina') dbData.push(newNode);
    else { if(!selectedNodeId) return; function findAndAdd(nodes, targetId, newNode) {
        for (let n of nodes) { if (n.id === targetId) { n.children.push(newNode); return true; } if (n.children && findAndAdd(n.children, targetId, newNode)) return true; } return false;
    } findAndAdd(dbData, selectedNodeId, newNode); }
    if (type === 'ot') lastWorkedOtId = newNode.id;
    localStorage.setItem('mantind_tree_data', JSON.stringify(dbData)); renderTree();
}

function deleteNode(id) {
    if(!confirm("¿Eliminar de la planta?")) return;
    function remove(nodes) { for (let i = 0; i < nodes.length; i++) { if (nodes[i].id === id) { nodes.splice(i, 1); return true; } if (nodes[i].children && remove(nodes[i].children)) return true; } return false; }
    remove(dbData); if (selectedNodeId === id) selectedNodeId = null;
    localStorage.setItem('mantind_tree_data', JSON.stringify(dbData)); renderTree(); renderLogs();
}

document.getElementById('add-machine-btn').addEventListener('click', () => { let n = prompt("Nombre Máquina:"); if(n) addElement('maquina', n); });
document.getElementById('add-ot-btn').addEventListener('click', () => { let n = prompt("Número OT:"); if(n) addElement('ot', n); });
document.getElementById('add-task-btn').addEventListener('click', () => { let n = prompt("Tarea:"); if(n) addElement('tarea', n); });

// --- MÓDULO EXPORTADOR ---
btnOpenExport.addEventListener('click', () => {
    if(!selectedNodeId) { alert("Seleccioná un elemento del árbol para exportar."); return; }
    let logsFiltrados = logs.filter(l => l.nodeId === selectedNodeId);
    if (logsFiltrados.length === 0) { alert("No se encontraron registros."); return; }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logsFiltrados, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Reporte_MantInd_${selectedNodeId}_Completo.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click(); downloadAnchor.remove();
});

// --- PERSISTENCIA Y RENDERIZADO DE HISTORIAL ---
btnSave.addEventListener('click', () => {
    const text = txtOutput.value.trim(); if (!text && !currentImgBase64) return;
    if (!selectedNodeId) { alert("Seleccioná un nodo del árbol primero."); return; }
    
    const now = new Date();
    logs.push({
        id: Date.now(), nodeId: selectedNodeId,
        timeStr: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), 
        dateIso: now.toISOString().split('T')[0], text: text, image: currentImgBase64
    });
    
    localStorage.setItem('mantind_tree_logs', JSON.stringify(logs));
    txtOutput.value = ""; currentImgBase64 = null; document.getElementById('btn-camera').classList.remove('active');
    txtOutput.style.height = 'auto';
    renderLogs();
});

function renderLogs() {
    listRecords.innerHTML = ""; 
    let filtered = logs.filter(l => l.nodeId === selectedNodeId).sort((a,b) => a.id - b.id);
    if (filtered.length === 0) { listRecords.innerHTML = "<li style='text-align:center; color:#6b7280; font-size:12px; padding-top:20px;'>[SIN REGISTROS]</li>"; return; }
    
    filtered.forEach(r => {
        const li = document.createElement('li'); li.className = "log-item";
        li.setAttribute('onclick', `openTextViewer(${r.id})`);
        let imgTag = r.image ? `<img src="${r.image}" style="max-width:100%; height:auto; margin-top:10px; border-radius:6px; border:1px solid #cbd5e1;" />` : "";
        li.innerHTML = `<button class="btn-delete-log" onclick="event.stopPropagation(); deleteLogItem(${r.id})">❌</button><div class="log-meta"><span>LOG_ID: ${r.id}</span><span>⏱️ ${r.timeStr}</span></div><div class="text-result">${r.text}</div>${imgTag}`;
        listRecords.appendChild(li);
    });
}

// Único disparador del botón Deshacer
function deleteLogItem(logId) {
    const idx = logs.findIndex(l => l.id === logId); if (idx === -1) return;
    deletedLogsBuffer.push(logs.splice(idx, 1)[0]);
    localStorage.setItem('mantind_tree_logs', JSON.stringify(logs)); 
    renderLogs();
    btnUndoAction.style.display = "block"; // Emerge estrictamente acá
}

btnUndoAction.addEventListener('click', () => { 
    if(deletedLogsBuffer.length) { 
        logs.push(deletedLogsBuffer.pop()); 
        localStorage.setItem('mantind_tree_logs', JSON.stringify(logs)); 
        renderLogs(); 
        btnUndoAction.style.display = deletedLogsBuffer.length ? "block" : "none"; 
    } 
});

function openTextViewer(id) {
    const item = logs.find(l => l.id === id); if(!item) return; window.speechSynthesis.cancel();
    document.getElementById('viewer-meta').innerText = `REGISTRO: ${item.timeStr}`;
    document.getElementById('viewer-text-content').innerText = item.text;
    document.getElementById('text-viewer-modal').style.display = "flex";
    document.getElementById('btn-trigger-speech').onclick = () => systemSpeak(item.text);
}
document.getElementById('btn-close-text-viewer').addEventListener('click', () => { window.speechSynthesis.cancel(); document.getElementById('text-viewer-modal').style.display = "none"; });

// --- RECEPTOR MULTIMEDIA DE CÁMARA ---
const camBtn = document.getElementById('btn-camera'); const camInput = document.getElementById('camera-input');
camBtn.addEventListener('click', () => camInput.click());
camInput.addEventListener('change', (e) => { 
    const file = e.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onloadend = () => { currentImgBase64 = reader.result; camBtn.classList.add('active'); }; 
    reader.readAsDataURL(file); 
});

// Auto-crecimiento reactivo del campo terminal
txtOutput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });

document.getElementById('btn-toggle-tree').addEventListener('click', () => { const s = document.getElementById('sidebar-tree'); s.style.display = s.style.display === 'none' ? 'flex' : 'none'; });

// --- REGISTRO SEGURO DE SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then((reg) => console.log('PWA: Service Worker Activo:', reg.scope))
            .catch((err) => console.error('PWA Fail:', err));
    });
}

window.onload = () => { renderTree(); if(recognition) recognition.start(); };