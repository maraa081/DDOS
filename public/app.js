/**
 * app.js — Logique principale de l'interface NetSim DDoS Lab
 */

let socket = null;
let networkCanvas = null;
let liveChart = null;
let currentAttack = null;
let connected = false;

// ─── FORMATAGE ───────────────────────────────────────

function formatTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toString();
}

// ─── CONNEXION SOCKET ────────────────────────────────

function connectSocket() {
    if (socket && socket.connected) return;

    const basePath = window.location.pathname.replace(/\/+$/, '');
    const SOCKET_PATH = basePath + '/socket.io';

    socket = io({
        path: SOCKET_PATH,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
        console.log('[NetSim] Connecte');
        connected = true;
        document.getElementById('sim-status').textContent = 'Simulation active';
        document.getElementById('sim-status').className = 'badge badge-ok';
    });

    socket.on('disconnect', () => {
        console.log('[NetSim] Deconnecte');
        connected = false;
        document.getElementById('sim-status').textContent = 'Deconnecte';
        document.getElementById('sim-status').className = 'badge badge-idle';
        showAlert('warning', 'Connexion au serveur perdue. Reconnexion...');
    });

    socket.on('connect_error', (err) => {
        console.log('[NetSim] Erreur connexion:', err.message);
        connected = false;
    });

    socket.on('init', (data) => {
        if (networkCanvas) {
            networkCanvas.stop();
        }
        networkCanvas = new NetworkCanvas('network-canvas');
        networkCanvas.setNodes(data.nodes);
        networkCanvas.setLinks(data.links);
        networkCanvas.draw();

        if (!liveChart) {
            liveChart = new LiveChart('live-chart');
        }
        liveChart.loadHistory(data.history);

        const logContainer = document.getElementById('logs-container');
        logContainer.innerHTML = '';
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => addLogEntry(log));
        }

        if (data.alerts && data.alerts.length > 0) {
            const lastAlert = data.alerts[data.alerts.length - 1];
            showAlert(lastAlert.severity, lastAlert.message);
        }

        if (data.metrics) {
            updateMetrics(data.metrics);
        }
    });

    socket.on('packets', (packets) => {
        if (networkCanvas) {
            networkCanvas.updatePackets(packets);
        }
    });

    socket.on('nodes', (nodes) => {
        if (networkCanvas) {
            networkCanvas.setNodes(nodes);
        }
    });

    socket.on('metrics', (metrics) => {
        updateMetrics(metrics);
        if (liveChart) {
            liveChart.pushData(
                metrics.packetsPerSec,
                metrics.bandwidthPercent / 100,
                metrics.connectionBacklog / metrics.maxBacklog,
                metrics.cpuLoad / 100
            );
        }
    });

    socket.on('log', (log) => {
        addLogEntry(log);
    });

    socket.on('alert', (alert) => {
        showAlert(alert.severity, alert.message);
    });

    socket.on('attack_start', (data) => {
        currentAttack = data.type;
        document.getElementById('attack-status').className = 'badge badge-attack';
        document.getElementById('attack-status').textContent = 'Attaque ' + getAttackName(data.type) + ' (' + data.intensity + '%)';

        document.querySelectorAll('.attack-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.attack === data.type);
        });

        document.getElementById('attack-controls').classList.remove('hidden');
    });

    socket.on('attack_stop', () => {
        currentAttack = null;
        document.getElementById('attack-status').className = 'badge badge-idle';
        document.getElementById('attack-status').textContent = 'Aucune attaque';

        document.querySelectorAll('.attack-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.getElementById('attack-controls').classList.add('hidden');
        dismissAlert();
    });

    socket.on('sim_reset_done', () => {
        document.getElementById('logs-container').innerHTML = '<div class="log-empty">Simulation reinitialisee</div>';
        document.getElementById('attack-status').className = 'badge badge-idle';
        document.getElementById('attack-status').textContent = 'Aucune attaque';
        document.querySelectorAll('.attack-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('attack-controls').classList.add('hidden');
        dismissAlert();
    });
}

// ─── MÉTRIQUES ───────────────────────────────────────

function updateMetrics(m) {
    document.getElementById('val-packets').textContent = formatNumber(m.packetsPerSec);
    document.getElementById('val-bandwidth').textContent = m.bandwidthPercent + '%';
    document.getElementById('val-cpu').textContent = m.cpuLoad + '%';
    document.getElementById('val-backlog').textContent = formatNumber(m.connectionBacklog);

    const boxes = {
        backlog: document.getElementById('metric-backlog'),
        bandwidth: document.getElementById('metric-bandwidth'),
        cpu: document.getElementById('metric-cpu'),
    };

    boxes.backlog.className = 'metric-box';
    if (m.connectionBacklog > m.maxBacklog * 0.9) {
        boxes.backlog.classList.add('critical');
    } else if (m.connectionBacklog > m.maxBacklog * 0.7) {
        boxes.backlog.classList.add('warning');
    }

    boxes.bandwidth.className = 'metric-box';
    if (m.bandwidthPercent > 90) {
        boxes.bandwidth.classList.add('critical');
    } else if (m.bandwidthPercent > 70) {
        boxes.bandwidth.classList.add('warning');
    }

    boxes.cpu.className = 'metric-box';
    if (m.cpuLoad > 90) {
        boxes.cpu.classList.add('critical');
    } else if (m.cpuLoad > 70) {
        boxes.cpu.classList.add('warning');
    }
}

// ─── LOGS ────────────────────────────────────────────

function addLogEntry(log) {
    const container = document.getElementById('logs-container');
    const empty = container.querySelector('.log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry log-' + log.type;
    entry.innerHTML = '<span class="log-time">[' + formatTime(log.time) + ']</span> <span class="log-msg">' + escapeHtml(log.message) + '</span>';
    container.appendChild(entry);

    while (container.children.length > 150) {
        container.removeChild(container.firstChild);
    }

    container.scrollTop = container.scrollHeight;
}

function clearLogs() {
    document.getElementById('logs-container').innerHTML = '<div class="log-empty">Logs effaces</div>';
}

// ─── ALERTES ─────────────────────────────────────────

let alertTimeout = null;

function showAlert(severity, message) {
    const banner = document.getElementById('alert-banner');
    const text = document.getElementById('alert-text');
    banner.className = 'alert-banner ' + severity;
    text.textContent = message;
    banner.classList.remove('hidden');

    if (alertTimeout) clearTimeout(alertTimeout);
    if (severity !== 'critical') {
        alertTimeout = setTimeout(dismissAlert, 8000);
    }
}

function dismissAlert() {
    document.getElementById('alert-banner').classList.add('hidden');
    if (alertTimeout) clearTimeout(alertTimeout);
}

// ─── ACTIONS ─────────────────────────────────────────

function startAttack(type) {
    if (!connected) {
        showAlert('warning', 'Pas de connexion au serveur. Attendez...');
        return;
    }
    if (currentAttack === type) {
        stopAttack();
        return;
    }
    const intensity = parseInt(document.getElementById('intensity-slider').value);
    socket.emit('attack_start', { type, intensity });
}

function stopAttack() {
    if (!connected) return;
    socket.emit('attack_stop');
}

function changeIntensity(value) {
    document.getElementById('intensity-value').textContent = value + '%';
    if (currentAttack && connected) {
        socket.emit('attack_intensity', { intensity: parseInt(value) });
    }
}

function resetSim() {
    if (!connected) {
        showAlert('warning', 'Pas de connexion au serveur.');
        return;
    }
    socket.emit('sim_reset');
}

function getAttackName(type) {
    const names = {
        syn_flood: 'SYN Flood',
        udp_flood: 'UDP Flood',
        dns_amplification: 'DNS Amplification',
        http_flood: 'HTTP Flood',
    };
    return names[type] || type;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── HORLOGE ─────────────────────────────────────────

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('fr-FR');
}
setInterval(updateClock, 1000);
updateClock();

// ─── DÉMARRAGE ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    connectSocket();
    console.log('[NetSim] Interface chargee');
});
