/**
 * network-canvas.js — Animation du réseau en temps réel
 *
 * Dessine la topologie réseau sur un Canvas :
 *   - Nœuds (PCs, routeur, serveur, attaquant)
 *   - Liens entre nœuds
 *   - Paquets animés circulant sur les liens
 *   - États des nœuds (normal, attaqué, critique)
 */

class NetworkCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.links = [];
        this.packets = [];
        this.animFrame = null;
        this.dpr = window.devicePixelRatio || 1;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    setNodes(nodes) {
        this.nodes = nodes.map(n => ({
            ...n,
            // Calculer les positions en pixels
            px: n.x * this.width,
            py: n.y * this.height,
            radius: n.type === 'router' ? 35 : n.type === 'server' ? 40 : 30,
        }));
    }

    setLinks(links) {
        this.links = links;
    }

    updatePackets(packets) {
        this.packets = packets;
    }

    getNodePosition(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background grid dots
        this.drawGrid();

        // Links
        this.drawLinks();

        // Packets
        this.drawPackets();

        // Nodes
        this.drawNodes();

        this.animFrame = requestAnimationFrame(() => this.draw());
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a2235';
        ctx.fillRect(0, 0, this.width, this.height);
    }

    drawLinks() {
        const ctx = this.ctx;

        for (const link of this.links) {
            const from = this.getNodePosition(link.from);
            const to = this.getNodePosition(link.to);
            if (!from || !to) continue;

            ctx.beginPath();
            ctx.moveTo(from.px, from.py);
            ctx.lineTo(to.px, to.py);
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Lueur
            ctx.beginPath();
            ctx.moveTo(from.px, from.py);
            ctx.lineTo(to.px, to.py);
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.05)';
            ctx.lineWidth = 6;
            ctx.stroke();
        }
    }

    drawPackets() {
        const ctx = this.ctx;

        for (const pkt of this.packets) {
            const from = this.getNodePosition(pkt.from);
            const to = this.getNodePosition(pkt.to);
            if (!from || !to) continue;

            const x = from.px + (to.px - from.px) * pkt.progress;
            const y = from.py + (to.py - from.py) * pkt.progress;

            // Couleur selon le protocole
            let color, size;
            switch (pkt.protocol) {
                case 'syn':
                    color = '#e94560'; size = 6;
                    break;
                case 'udp':
                    color = '#ff9800'; size = 5;
                    break;
                case 'dns':
                    color = '#9c27b0'; size = 4;
                    break;
                case 'http':
                    color = '#00d2ff'; size = 5;
                    break;
                case 'arp':
                    color = '#64748b'; size = 3;
                    break;
                default:
                    color = '#00e676'; size = 4;
            }

            // Lueur
            const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
            glow.addColorStop(0, color + '80');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, size * 3, 0, Math.PI * 2);
            ctx.fill();

            // Point
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawNodes() {
        const ctx = this.ctx;

        for (const node of this.nodes) {
            const x = node.px;
            const y = node.py;
            const r = node.radius;

            // Glow selon le statut
            let glowColor, borderColor, textColor;
            switch (node.status) {
                case 'critical':
                    glowColor = 'rgba(233, 69, 96, 0.3)';
                    borderColor = '#e94560';
                    textColor = '#e94560';
                    break;
                case 'attacking':
                    glowColor = 'rgba(255, 152, 0, 0.3)';
                    borderColor = '#ff9800';
                    textColor = '#ff9800';
                    break;
                case 'warning':
                    glowColor = 'rgba(255, 152, 0, 0.2)';
                    borderColor = '#ff9800';
                    textColor = '#ff9800';
                    break;
                default:
                    glowColor = 'rgba(0, 210, 255, 0.15)';
                    borderColor = '#2a3a5c';
                    textColor = '#94a3b8';
            }

            // Glow
            const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
            glow.addColorStop(0, glowColor);
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Background circle
            ctx.fillStyle = node.status === 'critical' ? '#2a1520' :
                            node.status === 'attacking' ? '#2a2215' : '#111827';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            // Border
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();

            // Lettre au centre
            ctx.font = `bold ${r * 0.5}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let letter = 'C';
            if (node.type === 'router') letter = 'R';
            else if (node.type === 'server') letter = 'S';
            else if (node.type === 'attacker') letter = 'A';

            ctx.fillStyle = borderColor;
            ctx.fillText(letter, x, y);

            // Nom sous le nœud
            ctx.font = '11px Inter, sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(node.name, x, y + r + 6);

            // IP
            ctx.font = '9px monospace';
            ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.fillText(node.ip, x, y + r + 20);
        }
    }

    stop() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
        }
    }
}

// Exporter pour utilisation dans app.js
window.NetworkCanvas = NetworkCanvas;
