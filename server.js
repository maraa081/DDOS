const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const NetworkSimulation = require('./engine/network');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

const PORT = 3031;

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Route API pour le healthcheck
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        simulation: sim.running,
        activeAttack: sim.activeAttack,
        metrics: sim.getMetrics(),
    });
});

// Initialiser la simulation
const sim = new NetworkSimulation();

// ─── SOCKET.IO — Communication temps réel ─────────────────

io.on('connection', (socket) => {
    console.log(`[Socket] Client connecté: ${socket.id}`);

    // Envoyer l'état initial
    socket.emit('init', {
        nodes: sim.getNodes(),
        logs: sim.getLogs(),
        alerts: sim.getAlerts(),
        metrics: sim.getMetrics(),
        history: sim.getHistory(),
        links: sim.links,
    });

    // Démarrer la simulation
    if (!sim.running) {
        sim.start();
    }

    // Lancer une attaque
    socket.on('attack_start', (data) => {
        const result = sim.startAttack(data.type, data.intensity);
        socket.emit('attack_status', result);
        io.emit('attack_start', { type: data.type, intensity: data.intensity });
    });

    // Arrêter l'attaque
    socket.on('attack_stop', () => {
        sim.stopAttack();
        io.emit('attack_stop');
    });

    // Changer l'intensité
    socket.on('attack_intensity', (data) => {
        if (sim.activeAttack) {
            sim.attackIntensity = Math.max(1, Math.min(100, data.intensity));
            socket.emit('attack_status', { type: sim.activeAttack, intensity: sim.attackIntensity });
        }
    });

    // Reset la simulation
    socket.on('sim_reset', () => {
        sim.stop();
        setTimeout(() => {
            // Réinitialiser les métriques
            Object.assign(sim.metrics, {
                packetsPerSec: 0, synPerSec: 0, udpPerSec: 0,
                httpPerSec: 0, dnsPerSec: 0, connectionBacklog: 0,
                bandwidthPercent: 5, cpuLoad: 5, totalPackets: 0, totalBytes: 0,
            });
            sim.history = { packets: [], bandwidth: [], backlog: [], cpu: [] };
            sim.alerts = [];
            sim.logs = [];
            sim.start();
            socket.emit('sim_reset_done');
        }, 500);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client déconnecté: ${socket.id}`);
    });
});

// ─── RELAY des événements de la simulation vers Socket.IO ──

sim.on('packets', (data) => {
    io.emit('packets', data);
});

sim.on('metrics', (data) => {
    io.emit('metrics', data);
});

sim.on('nodes', (data) => {
    io.emit('nodes', data);
});

sim.on('log', (data) => {
    io.emit('log', data);
});

sim.on('alert', (data) => {
    io.emit('alert', data);
});

// ─── DÉMARRAGE ────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
    console.log(`NetSim DDoS Lab démarré sur http://127.0.0.1:${PORT}`);
    console.log(`Socket.IO actif, en attente de connexions...`);
    sim.start();
});

// Gestion de l'arrêt
process.on('SIGINT', () => {
    console.log('\nArrêt de la simulation...');
    sim.stop();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    sim.stop();
    server.close();
    process.exit(0);
});
