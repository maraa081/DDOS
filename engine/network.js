/**
 * engine/network.js — Moteur de simulation réseau
 * 
 * Simule un réseau miniature avec :
 *   - Nœuds (PCs, routeur, serveur, attaquant)
 *   - Trafic normal automatisé (HTTP, ARP, DNS)
 *   - Métriques en temps réel
 *   - File d'attente de connexion (SYN backlog)
 */

const EventEmitter = require('events');

class NetworkSimulation extends EventEmitter {
    constructor() {
        super();

        this.running = false;
        this.tickInterval = null;
        this.tickRate = 100; // ms between ticks
        this.tickCount = 0;

        // Topologie du réseau
        this.nodes = {
            pc1:      { id: 'pc1',      name: 'PC 1',         ip: '192.168.1.10', type: 'client', x: 0.1, y: 0.5, status: 'idle' },
            pc2:      { id: 'pc2',      name: 'PC 2',         ip: '192.168.1.20', type: 'client', x: 0.1, y: 0.7, status: 'idle' },
            router:   { id: 'router',   name: 'Routeur',      ip: '192.168.1.1',  type: 'router', x: 0.4, y: 0.5, status: 'idle' },
            server:   { id: 'server',   name: 'Serveur Web',  ip: '10.0.0.1',     type: 'server', x: 0.7, y: 0.5, status: 'idle' },
            attacker: { id: 'attacker', name: 'Attaquant',  ip: '192.168.1.100',type: 'attacker', x: 0.1, y: 0.3, status: 'idle' },
        };

        // Connexions entre nœuds
        this.links = [
            { from: 'pc1',      to: 'router', color: '#00d2ff' },
            { from: 'pc2',      to: 'router', color: '#00d2ff' },
            { from: 'attacker', to: 'router', color: '#00d2ff' },
            { from: 'router',   to: 'server', color: '#00e676' },
        ];

        // Paquets actifs (animations)
        this.packets = [];

        // Métriques
        this.metrics = {
            packetsPerSec:   0,
            synPerSec:       0,
            udpPerSec:       0,
            httpPerSec:      0,
            dnsPerSec:       0,
            connectionBacklog: 0,
            maxBacklog:      1000,
            bandwidthPercent: 5,
            bandwidthMax:    1000, // en Mbps
            cpuLoad:         5,
            totalPackets:    0,
            totalBytes:      0,
        };

        // Compteurs pour le calcul par seconde
        this.counters = {
            packets: 0,
            syn: 0,
            udp: 0,
            http: 0,
            dns: 0,
            lastReset: Date.now(),
        };

        // Logs
        this.logs = [];
        this.maxLogs = 200;

        // Attaque active
        this.activeAttack = null;
        this.attackIntensity = 0;
        this.attackStartTime = null;

        // Détection
        this.alerts = [];
        this.lastAlertTime = {};

        // Générateurs de trafic normal
        this.clientTrafficTimers = {};

        // Métriques historiques pour les graphiques
        this.history = {
            packets: [],
            bandwidth: [],
            backlog: [],
            cpu: [],
        };
        this.maxHistoryPoints = 60; // 60 secondes à 1 point/sec
    }

    // ─── DÉMARRAGE / ARRÊT ─────────────────────────────────

    start() {
        if (this.running) return;
        this.running = true;
        console.log('[NetworkSim] Démarrage de la simulation...');

        // Boucle principale
        this.tickInterval = setInterval(() => this.tick(), this.tickRate);

        // Réinitialisation des compteurs toutes les secondes
        this.statsInterval = setInterval(() => this.computeMetrics(), 1000);

        // Démarrage du trafic normal
        this.startNormalTraffic();

        // Log initial
        this.addLog('info', 'Simulation réseau démarrée');
        this.addLog('info', `Nœuds: ${Object.keys(this.nodes).length} | Liens: ${this.links.length}`);

        this.emit('update');
    }

    stop() {
        this.running = false;
        clearInterval(this.tickInterval);
        clearInterval(this.statsInterval);
        Object.values(this.clientTrafficTimers).forEach(t => clearTimeout(t));
        this.clientTrafficTimers = {};
        this.addLog('info', 'Simulation réseau arrêtée');
        this.emit('update');
    }

    // ─── BOUCLE PRINCIPALE ─────────────────────────────────

    tick() {
        if (!this.running) return;
        this.tickCount++;

        // Faire avancer les paquets animés
        this.updatePackets();

        // Si une attaque est active, générer les paquets d'attaque
        if (this.activeAttack) {
            this.generateAttackTraffic();
        }

        // Mettre à jour les logs de connexion
        this.updateBacklog();

        // Émettre les mises à jour vers les clients
        if (this.tickCount % 3 === 0) { // ~3 fois par tick d'animation
            this.emit('packets', this.getPacketsForClient());
        }
        if (this.tickCount % 10 === 0) { // ~1 fois par seconde
            this.emit('metrics', this.getMetrics());
            this.emit('nodes', this.getNodes());
        }
    }

    // ─── TRAFIC NORMAL ─────────────────────────────────────

    startNormalTraffic() {
        this.scheduleClientTraffic('pc1');
        this.scheduleClientTraffic('pc2');
        this.scheduleBackgroundNoise();
    }

    scheduleClientTraffic(clientId) {
        if (!this.running) return;

        const delay = 1000 + Math.random() * 3000; // entre 1 et 4 secondes

        this.clientTrafficTimers[clientId] = setTimeout(() => {
            if (!this.running) return;

            // Le client envoie une requête HTTP
            this.createPacket(clientId, 'server', 'http', 64 + Math.random() * 400, {
                type: 'HTTP GET /index.html',
                port: 80,
            });

            // Réponse du serveur
            setTimeout(() => {
                if (!this.running) return;
                this.createPacket('server', clientId, 'http', 512 + Math.random() * 1024, {
                    type: 'HTTP 200 OK',
                    port: 80,
                });
            }, 20 + Math.random() * 50);

            this.counters.http++;
            this.counters.packets++;

            this.scheduleClientTraffic(clientId);
        }, delay);
    }

    scheduleBackgroundNoise() {
        if (!this.running) return;

        const delay = 2000 + Math.random() * 5000;

        this.bgNoiseTimer = setTimeout(() => {
            if (!this.running) return;

            const noiseType = Math.random();

            if (noiseType < 0.4) {
                // ARP
                this.createPacket('pc1', 'router', 'arp', 42, { type: 'ARP Who has 192.168.1.1?' });
                this.createPacket('pc2', 'router', 'arp', 42, { type: 'ARP Who has 192.168.1.1?' });
            } else if (noiseType < 0.7) {
                // DNS query
                this.createPacket('pc1', 'server', 'dns', 48, { type: 'DNS query google.com' });
                setTimeout(() => {
                    if (!this.running) return;
                    this.createPacket('server', 'pc1', 'dns', 120 + Math.random() * 200, { type: 'DNS response A 142.250.74.14' });
                }, 10);
                this.counters.dns++;
            }

            this.counters.packets += 2;
            this.scheduleBackgroundNoise();
        }, delay);
    }

    // ─── SYSTÈME DE PAQUETS ────────────────────────────────

    createPacket(fromId, toId, protocol, size, meta = {}) {
        const from = this.nodes[fromId];
        const to = this.nodes[toId];
        if (!from || !to) return null;

        const packet = {
            id: `pkt_${this.tickCount}_${Math.random().toString(36).substr(2, 6)}`,
            from: fromId,
            to: toId,
            protocol: protocol,
            size: Math.round(size),
            progress: 0,
            speed: 0.02 + Math.random() * 0.03,
            meta: meta,
            createdAt: Date.now(),
        };

        this.packets.push(packet);

        // Limiter le nombre de paquets animés
        if (this.packets.length > 100) {
            this.packets.shift();
        }

        // Compteurs
        this.counters.packets++;
        if (protocol === 'syn') this.counters.syn++;
        if (protocol === 'udp') this.counters.udp++;
        this.metrics.totalPackets++;
        this.metrics.totalBytes += size;

        return packet;
    }

    updatePackets() {
        // Faire progresser les paquets
        for (let i = this.packets.length - 1; i >= 0; i--) {
            this.packets[i].progress += this.packets[i].speed;
            if (this.packets[i].progress >= 1) {
                this.packets.splice(i, 1);
            }
        }
    }

    getPacketsForClient() {
        return this.packets.map(p => ({
            id: p.id,
            from: p.from,
            to: p.to,
            protocol: p.protocol,
            progress: p.progress,
            meta: p.meta,
        }));
    }

    // ─── SYSTÈME D'ATTAQUE ─────────────────────────────────

    startAttack(type, intensity = 50) {
        this.activeAttack = type;
        this.attackIntensity = intensity;
        this.attackStartTime = Date.now();

        const attackNames = {
            syn_flood: 'SYN Flood',
            udp_flood: 'UDP Flood',
            dns_amplification: 'DNS Amplification',
            http_flood: 'HTTP Flood',
        };

        this.addLog('warning', `Attaque ${attackNames[type] || type} lancee (intensite: ${intensity}%)`);
        this.emit('attack_start', { type, intensity });

        return { success: true, type, intensity };
    }

    stopAttack() {
        if (!this.activeAttack) return;

        const attackNames = {
            syn_flood: 'SYN Flood',
            udp_flood: 'UDP Flood',
            dns_amplification: 'DNS Amplification',
            http_flood: 'HTTP Flood',
        };

        this.addLog('info', `Attaque ${attackNames[this.activeAttack] || this.activeAttack} arretee`);
        this.activeAttack = null;
        this.attackIntensity = 0;
        this.attackStartTime = null;

        // Réinitialiser les métriques progressivement
        this.emit('attack_stop');
    }

    generateAttackTraffic() {
        if (!this.activeAttack || this.attackIntensity <= 0) return;

        const intensity = this.attackIntensity / 100;
        const packetsPerTick = Math.floor(intensity * 8);

        switch (this.activeAttack) {
            case 'syn_flood':
                this.generateSYNFlood(packetsPerTick);
                break;
            case 'udp_flood':
                this.generateUDPFlood(packetsPerTick);
                break;
            case 'dns_amplification':
                this.generateDNSAmplification(Math.ceil(packetsPerTick / 3));
                break;
            case 'http_flood':
                this.generateHTTPFlood(packetsPerTick);
                break;
        }
    }

    generateSYNFlood(count) {
        const spoofedIPs = ['10.0.0.2', '10.0.0.3', '192.168.2.10', '172.16.0.5', '203.0.113.50'];
        for (let i = 0; i < count; i++) {
            const spoofed = spoofedIPs[Math.floor(Math.random() * spoofedIPs.length)];
            this.createPacket('attacker', 'server', 'syn', 40, {
                type: 'SYN',
                srcIp: spoofed,
                port: 80,
                flags: 'SYN',
            });
        }
        this.addLog('attack', `[SYN] ${count} paquets SYN envoyés (IP source: ${spoofedIPs[Math.floor(Math.random() * spoofedIPs.length) ]})`);
    }

    generateUDPFlood(count) {
        const ports = [53, 123, 161, 500, 80, 443, 8080];
        for (let i = 0; i < count; i++) {
            const port = ports[Math.floor(Math.random() * ports.length)];
            this.createPacket('attacker', 'server', 'udp', 128 + Math.random() * 1024, {
                type: 'UDP datagram',
                port: port,
                size: Math.round(128 + Math.random() * 1024),
            });
        }
        this.addLog('attack', `[UDP] ${count} datagrammes UDP envoyés (port cible: ${ports[Math.floor(Math.random() * ports.length)]})`);
    }

    generateDNSAmplification(count) {
        for (let i = 0; i < count; i++) {
            // Petite requête DNS avec spoofing (victime = server)
            this.createPacket('attacker', 'server', 'dns', 42 + Math.random() * 20, {
                type: 'DNS query ANY isep.fr',
                spoofedFor: 'server',
                amplification: Math.floor(50 + Math.random() * 50),
            });
        }
        this.addLog('attack', `[DNS] ${count} requêtes DNS forgées (facteur d'amplification estimé: ${50 + Math.floor(Math.random() * 50)}x)`);
    }

    generateHTTPFlood(count) {
        const paths = ['/', '/index.html', '/login', '/api/data', '/search?q=test', '/images/logo.png'];
        for (let i = 0; i < count; i++) {
            const path = paths[Math.floor(Math.random() * paths.length)];
            this.createPacket('attacker', 'server', 'http', 128 + Math.random() * 256, {
                type: `HTTP GET ${path}`,
                port: 80,
                userAgent: 'Mozilla/5.0',
            });
        }
        this.addLog('attack', `[HTTP] ${count} requêtes HTTP envoyées`);
    }

    // ─── SIMULATION DU BACKLOG ─────────────────────────────

    updateBacklog() {
        const backlog = this.metrics.connectionBacklog;

        if (this.activeAttack === 'syn_flood') {
            // Le backlog monte rapidement avec un SYN flood
            const increase = (this.attackIntensity / 100) * 15;
            this.metrics.connectionBacklog = Math.min(
                this.metrics.maxBacklog,
                backlog + increase
            );
        } else if (this.activeAttack) {
            // Autres attaques : le backlog monte plus lentement
            const increase = (this.attackIntensity / 100) * 3;
            this.metrics.connectionBacklog = Math.min(
                this.metrics.maxBacklog,
                backlog + increase
            );
        } else {
            // Pas d'attaque : le backlog diminue (connexions fermées)
            const drain = backlog > 50 ? 5 : Math.max(1, backlog * 0.3);
            this.metrics.connectionBacklog = Math.max(0, backlog - drain);
        }

        // Alerte si le backlog est trop haut
        if (this.metrics.connectionBacklog > this.metrics.maxBacklog * 0.9) {
            this.triggerAlert('critical', 'Backlog saturé à 90% - Risque de déni de service imminent');
        } else if (this.metrics.connectionBacklog > this.metrics.maxBacklog * 0.7) {
            this.triggerAlert('warning', `Backlog à ${Math.round(this.metrics.connectionBacklog / this.metrics.maxBacklog * 100)}% - Charge anormale`);
        }
    }

    // ─── MÉTRIQUES ─────────────────────────────────────────

    computeMetrics() {
        const now = Date.now();
        const elapsed = (now - this.counters.lastReset) / 1000;

        if (elapsed > 0) {
            this.metrics.packetsPerSec = Math.round(this.counters.packets / elapsed);
            this.metrics.synPerSec = Math.round(this.counters.syn / elapsed);
            this.metrics.udpPerSec = Math.round(this.counters.udp / elapsed);
            this.metrics.httpPerSec = Math.round(this.counters.http / elapsed);
            this.metrics.dnsPerSec = Math.round(this.counters.dns / elapsed);
        }

        // Bande passante (simulée)
        if (this.activeAttack && this.attackIntensity > 0) {
            const targetBW = (this.attackIntensity / 100) * 95;
            this.metrics.bandwidthPercent += (targetBW - this.metrics.bandwidthPercent) * 0.3;
            this.metrics.bandwidthPercent = Math.round(Math.min(100, this.metrics.bandwidthPercent));
        } else {
            this.metrics.bandwidthPercent = Math.max(5, this.metrics.bandwidthPercent - 5);
        }

        // CPU (simulé)
        const targetCPU = this.activeAttack 
            ? Math.min(98, 10 + (this.attackIntensity / 100) * 80)
            : 5 + Math.random() * 10;
        this.metrics.cpuLoad += (targetCPU - this.metrics.cpuLoad) * 0.2;
        this.metrics.cpuLoad = Math.round(this.metrics.cpuLoad);

        // Réinitialiser les compteurs
        this.counters.packets = 0;
        this.counters.syn = 0;
        this.counters.udp = 0;
        this.counters.http = 0;
        this.counters.dns = 0;
        this.counters.lastReset = now;

        // Historique
        this.history.packets.push({ t: now, v: this.metrics.packetsPerSec });
        this.history.bandwidth.push({ t: now, v: this.metrics.bandwidthPercent / 100 });
        this.history.backlog.push({ t: now, v: this.metrics.connectionBacklog / this.metrics.maxBacklog });
        this.history.cpu.push({ t: now, v: this.metrics.cpuLoad / 100 });

        // Maintenir la taille max
        Object.values(this.history).forEach(arr => {
            if (arr.length > this.maxHistoryPoints) arr.shift();
        });

        this.emit('metrics', this.getMetrics());
    }

    getMetrics() {
        return { ...this.metrics };
    }

    getNodes() {
        // Mettre à jour le statut des nœuds
        if (this.activeAttack === 'syn_flood' && this.metrics.connectionBacklog > this.metrics.maxBacklog * 0.7) {
            this.nodes.server.status = 'critical';
            this.nodes.attacker.status = 'attacking';
        } else if (this.activeAttack) {
            this.nodes.server.status = 'warning';
            this.nodes.attacker.status = 'attacking';
        } else {
            this.nodes.server.status = 'idle';
            this.nodes.attacker.status = 'idle';
        }

        return Object.values(this.nodes).map(n => ({ ...n }));
    }

    getHistory() {
        return this.history;
    }

    // ─── LOGS ──────────────────────────────────────────────

    addLog(type, message) {
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            type: type,        // 'info', 'warning', 'attack', 'critical', 'success'
            message: message,
            time: Date.now(),
        };
        this.logs.push(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('log', entry);
    }

    getLogs(count = 50) {
        return this.logs.slice(-count);
    }

    // ─── ALERTES / DÉTECTION ──────────────────────────────

    triggerAlert(severity, message) {
        const now = Date.now();
        // Anti-spam : pas plus d'une alerte toutes les 5 secondes
        if (this.lastAlertTime[message] && now - this.lastAlertTime[message] < 5000) return;

        this.lastAlertTime[message] = now;

        const alert = {
            id: `alert_${now}`,
            severity: severity,
            message: message,
            time: now,
        };

        this.alerts.push(alert);
        this.addLog(severity === 'critical' ? 'critical' : 'warning', message);
        this.emit('alert', alert);

        console.log(`[ALERTE ${severity.toUpperCase()}] ${message}`);
    }

    getAlerts() {
        return this.alerts.slice(-20);
    }
}

module.exports = NetworkSimulation;
