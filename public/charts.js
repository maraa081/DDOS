/**
 * charts.js — Graphiques temps réel avec Chart.js
 *
 * Affiche l'évolution des métriques :
 *   - Paquets/s (cyan)
 *   - Bande passante (vert)
 *   - Backlog (orange)
 *   - CPU (rouge)
 */

class LiveChart {
    constructor(canvasId) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');

        // Initialiser avec des données vides
        const labels = Array(60).fill('').map((_, i) => `-${59 - i}s`);
        const empty = Array(60).fill(0);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Paquets/s',
                        data: [...empty],
                        borderColor: '#00d2ff',
                        backgroundColor: 'rgba(0, 210, 255, 0.08)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Bande passante',
                        data: [...empty],
                        borderColor: '#00e676',
                        backgroundColor: 'rgba(0, 230, 118, 0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y1',
                    },
                    {
                        label: 'Backlog',
                        data: [...empty],
                        borderColor: '#ff9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y1',
                    },
                    {
                        label: 'CPU',
                        data: [...empty],
                        borderColor: '#e94560',
                        backgroundColor: 'rgba(233, 69, 96, 0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2235',
                        borderColor: '#2a3a5c',
                        borderWidth: 1,
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed.y;
                                if (context.datasetIndex === 0) return `Paquets/s: ${Math.round(val)}`;
                                if (context.datasetIndex === 1) return `Bande passante: ${(val * 100).toFixed(0)}%`;
                                if (context.datasetIndex === 2) return `Backlog: ${(val * 100).toFixed(0)}%`;
                                return `CPU: ${(val * 100).toFixed(0)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: 'rgba(42, 58, 92, 0.3)', drawBorder: false },
                        ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 8 },
                    },
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        grid: { color: 'rgba(42, 58, 92, 0.3)', drawBorder: false },
                        ticks: { color: '#00d2ff', font: { size: 10 }, maxTicksLimit: 5 },
                        title: {
                            display: true,
                            text: 'Paquets/s',
                            color: '#00d2ff',
                            font: { size: 10 },
                        },
                    },
                    y1: {
                        beginAtZero: true,
                        max: 1.0,
                        position: 'right',
                        grid: { display: false },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            maxTicksLimit: 4,
                            callback: (v) => `${(v * 100).toFixed(0)}%`,
                        },
                        title: {
                            display: true,
                            text: 'Utilisation',
                            color: '#64748b',
                            font: { size: 10 },
                        },
                    },
                },
            },
        });

        this.maxPoints = 60;
        this.dataIndex = 0;
    }

    pushData(packets, bandwidth, backlog, cpu) {
        const chart = this.chart;

        chart.data.datasets[0].data.push(packets);
        chart.data.datasets[1].data.push(bandwidth);
        chart.data.datasets[2].data.push(backlog);
        chart.data.datasets[3].data.push(cpu);

        // Garder seulement les N dernières valeurs
        if (chart.data.datasets[0].data.length > this.maxPoints) {
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
            chart.data.datasets[2].data.shift();
            chart.data.datasets[3].data.shift();
        }

        // Mettre à jour les labels
        chart.data.labels.push('');
        if (chart.data.labels.length > this.maxPoints) {
            chart.data.labels.shift();
        }

        chart.update('none');
    }

    loadHistory(history) {
        if (!history) return;

        const packets = history.packets.map(p => p.v) || [];
        const bandwidth = history.bandwidth.map(p => p.v) || [];
        const backlog = history.backlog.map(p => p.v) || [];
        const cpu = history.cpu.map(p => p.v) || [];

        // Prendre les 60 dernières valeurs
        const chart = this.chart;
        chart.data.datasets[0].data = packets.slice(-60);
        chart.data.datasets[1].data = bandwidth.slice(-60);
        chart.data.datasets[2].data = backlog.slice(-60);
        chart.data.datasets[3].data = cpu.slice(-60);
        chart.data.labels = Array(chart.data.datasets[0].data.length).fill('');
        chart.update('none');
    }
}

window.LiveChart = LiveChart;
