# 🛡️ NetSim DDoS Lab — Rapport Technique

> **Projet :** Simulation interactive d'attaques DDoS avec visualisation temps réel  
> **Auteur :** Projet pédagogique — Étude des attaques par déni de service distribué  
> **Moteur :** Node.js + Socket.IO + Express  
> **Date :** Mai 2026

---

## 📑 Table des matières

1. [Introduction](#1-introduction)
2. [Architecture du simulateur](#2-architecture-du-simulateur)
3. [Attaques DDoS implémentées](#3-attaques-ddos-implémentées)
   - [3.1 SYN Flood](#31-syn-flood)
   - [3.2 Port Scan](#32-port-scan)
   - [3.3 UDP Flood](#33-udp-flood)
   - [3.4 Amplification DNS](#34-amplification-dns)
   - [3.5 Attaque par fragmentation (Teardrop)](#35-attaque-par-fragmentation-teardrop)
   - [3.6 HTTP Flood](#36-http-flood)
4. [Détection des attaques DDoS](#4-détection-des-attaques-ddos)
5. [Conduite à tenir pour le RSSI](#5-conduite-à-tenir-pour-le-rssi)
6. [Impact de l'IA sur les attaques DDoS](#6-impact-de-lia-sur-les-attaques-ddos)
7. [Impact de l'IA sur la détection des DDoS](#7-impact-de-lia-sur-la-détection-des-ddos)
8. [Références](#8-références)

---

## 1. Introduction

Une attaque par **déni de service distribué (DDoS — Distributed Denial of Service)** vise à rendre une ressource informatique (serveur, service, réseau) indisponible pour ses utilisateurs légitimes en la submergeant de trafic malveillant provenant de multiples sources.

Contrairement à une attaque DoS classique (mono-source), l'attaque DDoS exploite un **botnet** — un réseau d'ordinateurs, serveurs ou objets connectés compromis — pour générer un volume de requêtes bien au-delà de ce qu'une seule machine pourrait produire.

Le présent projet implémente un **simulateur réseau interactif** permettant de visualiser en temps réel le comportement de différentes attaques DDoS et leur impact sur l'infrastructure cible, à des fins pédagogiques.

### 1.1 Contexte et enjeux

Selon le CERT-FR (CERTFR-2026-CTI-002) et le guide ANSSI sur les attaques DDoS :

- Le volume des attaques DDoS ne cesse de croître, dépassant régulièrement le **Terabit par seconde**
- Les motivations sont variées : cybercriminalité (rançon), hacktivisme, déstabilisation, testing
- Le coût moyen d'une attaque DDoS pour une entreprise est estimé entre **20 000 € et plusieurs millions d'euros** (perte de chiffre d'affaires, rançon, coûts de remédiation)
- La France est l'un des pays les plus ciblés en Europe

---

## 2. Architecture du simulateur

Le simulateur NetSim DDoS Lab est construit autour d'un **moteur de simulation réseau** en JavaScript (Node.js) qui modélise :

### 2.1 Topologie simulée

```
[PC 1] ──────┐
              ├── [Routeur] ──── [Serveur Web]
[PC 2] ──────┘
              │
[Attaquant] ──┘
```

- **Nœuds :** PCs clients (trafic légitime), routeur, serveur web, attaquant
- **Liens :** connexions logiques entre les nœuds
- **Trafic normal :** requêtes HTTP, ARP, DNS générées aléatoirement par les clients légitimes

### 2.2 Métriques temps réel

Le moteur calcule et expose en continu :

| Métrique | Description |
|---|---|
| `packetsPerSec` | Paquets totaux par seconde |
| `synPerSec` | Paquets SYN par seconde |
| `udpPerSec` | Datagrammes UDP par seconde |
| `httpPerSec` | Requêtes HTTP par seconde |
| `dnsPerSec` | Requêtes DNS par seconde |
| `connectionBacklog` | File d'attente de connexions (SYN backlog) |
| `bandwidthPercent` | Utilisation de la bande passante |
| `cpuLoad` | Charge CPU simulée du serveur |

### 2.3 Flux de données

```
Clients Web (navigateur)
        │
        ▼
 Socket.IO (temps réel)
        │
        ▼
 Moteur de simulation (engine/network.js)
        │
        ├── Générateur de trafic normal
        ├── Générateur de trafic d'attaque
        ├── Système de backlog / détection
        └── Système d'alertes et logs
```

---

## 3. Attaques DDoS implémentées

### 3.1 SYN Flood

#### 🔬 Fonctionnement technique

L'attaque **SYN Flood** exploite le mécanisme de la **three-way handshake** TCP :

```
Client légitime              Serveur
      │                        │
      ├── SYN ────────────────►│
      │◄── SYN-ACK ────────────┤
      ├── ACK ────────────────►│  ← Connexion établie
      ▼                        ▼
```

1. Le client envoie un paquet **SYN** (synchronize) au serveur
2. Le serveur alloue une entrée dans sa **file de connexions en attente** (SYN backlog) et répond par **SYN-ACK**
3. Le client finalise par un **ACK** → connexion établie
4. La connexion est retirée du backlog

**En cas d'attaque SYN Flood :**

```
Attaquant (IP forgées)        Serveur
      │                        │
      ├── SYN (spoofé) ──────►│  ← Entrée allouée dans le backlog
      ├── SYN (spoofé) ──────►│  ← Nouvelle entrée
      ├── SYN (spoofé) ──────►│  ← Nouvelle entrée
      │      ...              │
      │                        │  BACKLOG SATURÉ
      │                        │
Client légitime                │
      ├── SYN ────────────────►│  ✗ REFUSÉ (backlog plein)
      ▼                        ▼
```

L'attaquant envoie une rafale de paquets SYN avec des **adresses IP source forgées (spoofing)**. Le serveur répond à chaque SYN par un SYN-ACK vers l'IP forgée, qui ne répondra jamais (ou répondra par un RST si l'hôte existe). Les entrées restent dans le backlog jusqu'au timeout (généralement 30 à 120 secondes), ce qui finit par **saturer la file d'attente**.

**Conséquence :** Aucune nouvelle connexion légitime ne peut être établie → déni de service.

#### 🛡️ Détection

- **Pic anormal de paquets SYN** (plusieurs milliers par seconde)
- **Déséquilibre SYN / SYN-ACK / ACK** : beaucoup de SYN entrants, peu d'ACK en retour
- **Augmentation du SYN backlog** au-delà des seuils normaux
- **Logs système :** « possible SYN flooding », « LISTEN overflow »

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **SYN Cookies** | Activer les SYN cookies sur le noyau (Linux : `net.ipv4.tcp_syncookies=1`). Permet de répondre aux SYN sans allouer d'entrée dans le backlog tant que l'ACK n'est pas reçu. Très efficace. |
| **Backlog élargi** | Augmenter `net.ipv4.tcp_max_syn_backlog` et `net.core.somaxconn` |
| **Rate limiting** | Limiter le nombre de SYN par seconde par IP (iptables, nftables, reverse proxy) |
| **Reverse proxy / CDN** | Cloudflare, AWS Shield, Akamai — absorbent le trafic avant qu'il n'atteigne le serveur |
| **RST sur SYN-ACK** | Utiliser `tcp_synack_retries` pour libérer rapidement les connexions orphelines |

---

### 3.2 Port Scan

#### 🔬 Fonctionnement technique

Le **port scan** n'est pas une attaque DDoS en soi, mais une **technique de reconnaissance** souvent utilisée en amont pour identifier les services vulnérables avant de lancer l'attaque.

**Types de scans courants :**

| Type | Description | Détectabilité |
|---|---|---|
| **SYN scan (half-open)** | Envoie un SYN, analyse la réponse (SYN-ACK = ouvert, RST = fermé), ne complète jamais la handshake | Moyenne |
| **Connect scan** | Établit complètement la connexion TCP | Élevée (logs applicatifs) |
| **UDP scan** | Envoie un datagramme UDP, attend ICMP Port Unreachable | Faible (UDP sans état) |
| **FIN / NULL / Xmas scan** | Envoie des paquets avec des flags inhabituels pour contourner les pare-feux | Faible à moyenne |

**Dans le contexte des attaques DDoS**, un port scan distribué (DPS — Distributed Port Scan) peut être utilisé pour :

1. **Cartographier les services** exposés d'une infrastructure
2. **Identifier les ports vulnérables** avant une attaque ciblée
3. **Contourner les détections** en répartissant le scan sur plusieurs milliers de bots
4. **Masquer l'attaque réelle** en noyant le bruit de fond

#### 🛡️ Détection

- **Analyse des connexions incomplètes** (beaucoup de SYN sans ACK final)
- **Séquences de ports inhabituelles** (scan aléatoire ou séquentiel)
- **Trafic vers plusieurs ports depuis une même IP** en peu de temps
- Outils : `psad` (Port Scan Attack Detector), `snort`, `suricata`, `nmap -sS`

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **Pare-feu restrictif** | Bloquer tout port non nécessaire en entrée |
| **Rate limiting par IP** | Limiter le nombre de connexions par seconde et par source |
| **Port knocking** | Masquer les ports qui ne répondent qu'après une séquence secrète |
| **Fail2ban** | Bannir temporairement les IP qui génèrent des échecs de connexion |
| **Blacklist/whitelist** | N'autoriser que les IP légitimes connues |

---

### 3.3 UDP Flood

#### 🔬 Fonctionnement technique

L'attaque **UDP Flood** exploite le fait que le protocole UDP est **sans état** : le serveur reçoit un datagramme et doit allouer des ressources pour le traiter, sans pouvoir vérifier au préalable la légitimité de la source.

**Déroulement :**

1. L'attaquant envoie un grand nombre de **datagrammes UDP** vers des ports aléatoires ou spécifiques de la cible
2. Pour chaque datagramme reçu sur un port fermé, le serveur répond par un paquet **ICMP Destination Unreachable**
3. Pour les ports ouverts, l'application doit traiter le datagramme, consommant du CPU et de la mémoire
4. Le volume de paquets sature la **bande passante** du serveur et/ou du réseau

**Variante : réflexion UDP** — l'attaquant envoie des datagrammes avec l'IP de la victime comme source vers des services UDP (NTP, CHARGEN, SSDP, Memcached) qui répondent avec un volume de données amplifié.

#### 🛡️ Détection

- **Hausse brutale du trafic UDP** (plusieurs centaines de Mbps ou Gbps)
- **Ports aléatoires** ciblés
- **Équilibre entrée/sortie déséquilibré** (beaucoup d'ICMP unreachable en sortie)
- Analyse des logs applicatifs et du monitoring réseau

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **Filtrage UDP** | Bloquer tout trafic UDP non nécessaire au niveau du pare-feu |
| **Rate limiting** | Limiter le débit UDP par IP source |
| **Détection d'anomalies** | Seuils de trafic UDP anormal |
| **CDN / Anti-DDoS** | Services cloud qui absorbent le trafic volumétrique |
| **Anycast** | Distribuer le trafic sur plusieurs datacenters |

---

### 3.4 Amplification DNS

#### 🔬 Fonctionnement technique

L'attaque par **amplification DNS** est une attaque de **réflexion** qui exploite le **facteur d'amplification** des serveurs DNS ouverts.

**Principe :**

1. L'attaquant envoie une **petite requête DNS** (type `ANY`) d'environ 40-60 octets vers un serveur DNS public récursif
2. L'adresse IP source de la requête est **forgée** (spoofée) pour correspondre à celle de la **victime**
3. Le serveur DNS répond à la victime avec une réponse volumineuse (jusqu'à 4000+ octets en DNSSEC)
4. **Facteur d'amplification :** jusqu'à **50x à 100x** (60 o → 4000 o)
5. En multipliant par des milliers de serveurs DNS ouverts, on obtient un trafic gigantesque

```
Attaquant
   │
   ├─ DNS req "ANY isep.fr" (50 o) ──► Serveur DNS #1
   ├─ DNS req "ANY isep.fr" (50 o) ──► Serveur DNS #2
   ├─ DNS req "ANY isep.fr" (50 o) ──► Serveur DNS #3
   │   (IP source = victime)
   │
   │◄─── DNS resp (3500 o) ────────── Victime
   │◄─── DNS resp (3500 o) ────────── Victime
   │◄─── DNS resp (3500 o) ────────── Victime
   ▼
   Trafic amplifié × 60-70
```

**Types de requêtes amplificatrices :**

| Protocole | Port | Facteur max | Commentaire |
|---|---|---|---|
| **DNS** | 53 | ~50-100x | Requête `ANY` avec DNSSEC |
| **NTP** | 123 | ~556x | Commande `monlist` |
| **SSDP** | 1900 | ~30x | Découverte UPnP |
| **Memcached** | 11211 | ~10 000-50 000x | Aujourd'hui largement mitigé |
| **CHARGEN** | 19 | ~358x | Protocole legacy |

#### 🛡️ Détection

- **Augmentation massive du trafic DNS** en direction de la cible (plusieurs Gbps)
- **Flot de réponses DNS** sans requêtes correspondantes de la part de la victime
- **Paquets DNS de grande taille** (requêtes ANY avec EDNS0)
- Monitoring des logs DNS du côté de l'infrastructure

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **Fermeture des résolveurs ouverts** | Les serveurs DNS publics ne doivent répondre qu'aux clients autorisés |
| **Rate limiting côté DNS** | Limiter le nombre de réponses par source |
| **BCP38 (RFC 2827)** | Filtrage d'ingress pour empêcher le spoofing IP au niveau FAI |
| **Response Rate Limiting (RRL)** | Limiter le volume de réponses DNS identiques |
| **Anycast DNS** | Répartir les serveurs DNS pour absorber les attaques |
| **EDNS0 limité** | Réduire la taille maximale des réponses |

---

### 3.5 Attaque par fragmentation (Teardrop)

#### 🔬 Fonctionnement technique

L'attaque **Teardrop** exploite des **vulnérabilités dans la réassemblage des fragments IP**. Datant des années 1990, elle reste pertinente pédagogiquement pour comprendre les attaques au niveau IP.

**Contexte technique :**

Lorsqu'un paquet IP est plus grand que la MTU (Maximum Transmission Unit, généralement 1500 o), il est fragmenté en plusieurs morceaux. Chaque fragment contient un **offset** qui indique sa position dans le paquet original.

**Principe de l'attaque :**

1. L'attaquant envoie des fragments IP volontairement **chevauchés** (overlapping) ou **ordonnancés de manière incorrecte**
2. Exemple :
   - Fragment 1 : offset 0, taille 800
   - Fragment 2 : offset 400, taille 800
   - → Chevauchement de 400 octets

```
Fragment 1 : [0 ────────────────── 800 [
Fragment 2 :         [400 ───────────────── 1200 [
                     ↑ Overlap ! Le réassembleur plante
```

3. Certains systèmes d'exploitation (anciens noyaux Linux, Windows 95/NT, BSD) ne géraient pas correctement ces chevauchements
4. Le réassembleur pouvait :
   - Planter (kernel panic)
   - Boucler infiniment
   - Corrompre la mémoire (buffer overflow)

**Variante moderne :** Les attaques par **fragmentation** ou **fragmentation DNS** consistent à fragmenter des paquets DNS pour contourner les inspections superficielles des pare-feux.

#### 🛡️ Détection

- **Paquets IP fragmentés avec offsets incohérents**
- **Fragments qui ne s'assemblent jamais** (ressource leak)
- **Taux élevé de paquets fragmentés** par rapport au trafic normal
- Analyse des logs de pare-feu : `ip fw` / `nftables`

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **Mise à jour du système** | Les noyaux modernes (Linux >2.0.33, Windows >XP SP2) ne sont plus vulnérables |
| **Défragmentation normalisée** | RFC 791, implémentations robustes (Linux, FreeBSD) |
| **Filtrage fragmentation** | Bloquer les fragments anormaux au niveau du pare-feu |
| **IPS / NGFW** | Les pare-feux nouvelle génération réassemblent et inspectent |
| **Défragmentation au niveau du reverse proxy** | AVANT d'atteindre le serveur applicatif |

---

### 3.6 HTTP Flood

#### 🔬 Fonctionnement technique

L'attaque **HTTP Flood** (ou **Layer 7 DDoS**) cible la couche application du modèle OSI. Contrairement aux attaques volumétriques, elle vise à **épuiser les ressources applicatives** du serveur (CPU, mémoire, connexions base de données).

**Déroulement :**

1. Des centaines ou milliers de bots envoient des **requêtes HTTP GET/POST** légitimes en apparence
2. Chaque requête déclenche un traitement : lecture de fichier, requête base de données, génération de page
3. Le serveur web épuise ses **workers**, sa mémoire, ses connexions DB
4. Les utilisateurs légitimes reçoivent des **timeout** ou des pages d'erreur 503

**Variantes :**

| Variante | Description |
|---|---|
| **Slowloris** | Maintient des connexions HTTP ouvertes en envoyant des headers incomplets (un header par minute). Épuise les workers Apache. |
| **HTTP GET Flood** | Requêtes GET sur des pages lourdes ou dynamiques |
| **HTTP POST Flood** | Requêtes POST avec de gros corps de données |
| **Cache bypass** | Requêtes aléatoires pour contourner les caches CDN |
| **WordPress/XML-RPC** | Pingback amplification via des CMS |

**Difficulté de détection :** Chaque requête individuelle peut sembler légitime — c'est le **volume agrégé** qui est anormal.

#### 🛡️ Détection

- **Augmentation soudaine du nombre de requêtes HTTP** (x10, x100 par rapport à la normale)
- **User-Agents identiques ou suspects** (botnets)
- **Patterns d'URL répétitifs** (mêmes chemins, mêmes paramètres)
- **Taux d'erreur 5xx en hausse**
- **Latence applicative anormale**
- **Analyse comportementale** : time-to-first-byte, session duration

#### 🔒 Prévention

| Méthode | Description |
|---|---|
| **Rate limiting** | Limiter le nombre de requêtes par IP, par session, par URI |
| **WAF (Web Application Firewall)** | Analyser le comportement HTTP, bloquer les patterns suspects |
| **Challenge (CAPTCHA, JS)** | Forcer les clients à exécuter du JavaScript avant d'accéder à la ressource |
| **Reverse proxy distribué** | Cloudflare, AWS WAF, Imperva, Fastly |
| **Mise en cache agressive** | Réduire la charge sur le serveur applicatif (Redis, Varnish, Cloudflare CDN) |
| **Anomaly detection** | Baselines de trafic et alertes automatiques |
| **Resource scaling** | Auto-scaling horizontal (Kubernetes, AWS Auto Scaling) |

---

## 4. Détection des attaques DDoS

### 4.1 Approche multi-couche

La détection efficace d'une attaque DDoS nécessite une approche **multi-niveaux** :

| Niveau | Méthode | Outils |
|---|---|---|
| **Réseau** | Analyse de trafic (NetFlow, sFlow, IPFIX) | PRTG, Zabbix, ntopng, Darktrace |
| **Système** | Métriques CPU, mémoire, backlog | Nagios, Prometheus, Grafana |
| **Application** | Logs applicatifs, temps de réponse | Datadog, New Relic, ELK Stack |
| **Pare-feu** | Règles de filtrage, logs de connexion | iptables, nftables, pfSense, Opnsense |
| **WAF** | Analyse HTTP, détection de patterns | ModSecurity, Cloudflare WAF, AWS WAF |

### 4.2 Indicateurs de compromission (IOC)

- **Volume de trafic anormal** (×10 à ×1000 la baseline habituelle)
- **Taux de paquets SYN > 70% du trafic total** (SYN Flood)
- **Augmentation brutale du trafic UDP** (UDP Flood)
- **Réponses DNS sans requêtes correspondantes** (Amplification DNS)
- **Taux d'erreur 5xx > 10%** (HTTP Flood)
- **Latence réseau et applicative > 5× la normale**
- **Backlog de connexions proche de la saturation**

### 4.3 Automatisation de la détection

```python
# Pseudocode : Règle de détection simple
if metrics.packetsPerSec > THRESHOLD_PPS:
    if metrics.synPerSec > THRESHOLD_SYN:
        if metrics.connectionBacklog > THRESHOLD_BACKLOG:
            trigger_alert("SYN FLOOD PROBABLE", severity="critical")

if metrics.udpPerSec > THRESHOLD_UDP:
    if metrics.bandwidthPercent > 95:
        trigger_alert("UDP FLOOD PROBABLE", severity="critical")

if metrics.httpPerSec > THRESHOLD_HTTP:
    if error_rate_5xx > 10:
        trigger_alert("HTTP FLOOD PROBABLE", severity="warning")
```

---

## 5. Conduite à tenir pour le RSSI

*Références : CERTFR-2024-RFX-010-2 et CERTFR-2024-RFX-009-2*

### 5.1 Phase préparatoire (AVANT l'attaque)

| Action | Détails |
|---|---|
| **Cartographier le SI** | Identifier les actifs critiques, les dépendances externes, les FAI |
| **Établir une baseline** | Connaître le trafic normal (Mbps, req/s, connexions/s) |
| **Mettre en place des seuils** | Définir des alertes à 50%, 70%, 90% de saturation |
| **Contrat anti-DDoS** | Souscrire un service de mitigation (Cloudflare, OVH, AWS Shield, Imperva) |
| **Plan de réponse** | Rédiger et tester un PCA/PRA incluant le scénario DDoS |
| **Redondance** | Anycast, load balancing, auto-scaling, architecture distribuée |
| **Préparer la communication** | Templates de communication clients, partenaires, presse, autorités |

### 5.2 Phase de détection (PENDANT l'attaque)

**Les premières minutes sont cruciales :**

1. **Activer le plan de réponse** — Ne pas paniquer, suivre la procédure
2. **Confirmer l'attaque** — Éliminer les fausses causes (montée de charge légitime, bug applicatif)
3. **Caractériser l'attaque** :
   - Type : volumétrique, applicative, protocolaire ?
   - Vecteur : SYN, UDP, DNS, HTTP, mixte ?
   - Volume : Gbps, Mpps, req/s ?
   - Source : distribution géographique, plages IP ?
4. **Contacter le FAI/ hébergeur** — Certaines mitigations (blackholing, flowspec) ne peuvent être activées que par le FAI
5. **Déclencher le service anti-DDoS** — Basculer vers le service de mitigation (redirection DNS)
6. **Protéger les services critiques** — Prioriser le trafic vers les services essentiels (QoS)
7. **Communiquer en interne** — État d'avancement, décisions prises, prochaines étapes
8. **Déclaration au CERT-FR** — https://www.cert.ssi.gouv.fr/signaler/

### 5.3 Phase de mitigation

| Action | Délai |
|---|---|
| **Activation du filtrage d'ingress** | Quelques minutes |
| **Rate limiting agressif** | Immédiat |
| **Blackholing / Null routing** | Si l'attaque est trop volumineuse pour être filtrée |
| **Basculement DNS vers service anti-DDoS** | 5-15 minutes (selon TTL) |
| **Scale-up horizontal** | Auto-scaling |
| **CAPTCHA / JS Challenge** | Pour filtrer les bots (HTTP flood) |

### 5.4 Phase post-attaque (APRÈS)

1. **Analyser les logs et métriques** — Comprendre le déroulé complet
2. **Identifier les vulnérabilités exploitées**
3. **Mettre à jour le plan de réponse** — Leçons apprises
4. **Renforcer les mesures de protection**
5. **Transmettre les éléments au CERT-FR** si nécessaire
6. **Communication externe** — Clients, presse, autorités, assureur
7. **Bilan et chiffrage** — Coût de l'attaque, coût de la mitigation, ROI des investissements

---

## 6. Impact de l'IA sur les attaques DDoS

### 6.1 Automatisation intelligente des attaques

L'IA (en particulier le machine learning et les LLM) transforme les attaques DDoS de plusieurs manières :

#### 🤖 Attaques adaptatives

Les botnets pilotés par IA peuvent **ajuster dynamiquement** leur stratégie d'attaque :

- **Analyse en temps réel** de l'efficacité de l'attaque
- **Changement automatique de vecteur** (passer de SYN à UDP à HTTP)
- **Contournement des défenses** : ralentir quand la détection s'intensifie, accélérer quand elle faiblit
- **Évitement des blacklists** : rotation des IP, modulation du trafic

#### 🧠 Génération de trafic légitime

Les LLM (GPT, Claude, DeepSeek, Llama) peuvent générer :

- **Requêtes HTTP réalistes** imitant parfaitement le comportement humain
- **User-Agents diversifiés** et à jour
- **Parcours de navigation** crédibles (plusieurs pages, temps de lecture)
- **Contournement des CAPTCHA** via API de résolution IA

#### 🎯 Ciblage précis

- **Analyse automatique des vulnérabilités** de l'infrastructure cible
- **Identification des goulots d'étranglement** spécifiques
- **Ciblage des assets les plus critiques** (API, base de données, authentification)

### 6.2 Botnets nouvelle génération

| Évolution | Impact |
|---|---|
| **Botnets IoT** → **Botnets IA** | Les bots peuvent coordonner leurs actions de manière intelligente |
| **P2P décentralisé** | Plus de point de contrôle central à détruire (Mirai → Hajime) |
| **Apprentissage par renforcement** | Optimisation continue de l'attaque |
| **Attaques multi-vecteurs synchronisées** | SYN flood + UDP flood + HTTP flood combinés et coordonnés |

### 6.3 Attack-as-a-Service avec IA

Le marché illicite propose désormais des **services DDoS intégrant l'IA** :

- « Booters » et « Stressers » nouvelle génération avec auto-optimisation
- Personnalisation des attaques via prompt LLM
- Tarification dynamique basée sur la difficulté de la cible

---

## 7. Impact de l'IA sur la détection des DDoS

### 7.1 Détection par machine learning

#### 🔍 Apprentissage supervisé

**Principe :** Entraîner un modèle sur des données labellisées (trafic normal vs trafic d'attaque)

| Algorithme | Application |
|---|---|
| **Random Forest** | Classification trafic normal/attaquant |
| **SVM** | Détection d'anomalies dans le trafic réseau |
| **XGBoost** | Prédiction de l'état d'attaque (binaire) |
| **Réseaux de neurones** | Classification multi-classes (type d'attaque) |

**Avantages :** Précision élevée sur les attaques connues, faux positifs faibles  
**Inconvénients :** Ne détecte pas les attaques inconnues (zero-day), nécessite des datasets labellisés

#### 🔍 Apprentissage non supervisé

**Principe :** Détection d'anomalies sans connaissance préalable des attaques

- **Auto-encodeurs** : Apprendre le comportement normal, signaler tout écart
- **DBSCAN / Isolation Forest** : Clustering automatique des anomalies
- **One-Class SVM** : Modéliser une seule classe (normale), tout le reste est suspect

**Avantages :** Détecte les attaques inconnues, y compris les variantes zero-day  
**Inconvénients :** Taux de faux positifs plus élevé, nécessite du calibrage

#### 🔍 Deep Learning pour l'analyse temps réel

```python
# Architecture typique : CNN + LSTM pour la détection DDoS
# Les CNN extraient les patterns spatiaux, les LSTM les patterns temporels
model = Sequential([
    Conv1D(filters=64, kernel_size=3, activation='relu'),
    MaxPooling1D(pool_size=2),
    LSTM(units=50, return_sequences=True),
    LSTM(units=50),
    Dense(1, activation='sigmoid')
])
```

**Intérêt :** Analyse de flux réseau en temps réel, détection en moins de quelques secondes.

### 7.2 Approches hybrides

Les solutions les plus efficaces combinent **plusieurs techniques** :

1. **Règles de seuil** → Détection rapide des attaques massives
2. **ML supervisé** → Classification précise des attaques connues
3. **ML non supervisé** → Détection des anomalies inconnues
4. **Analyse comportementale** → Profilage du trafic normal
5. **Corrélation** → Cross-check entre sources multiples

### 7.3 Défis de l'IA en détection DDoS

| Défi | Description |
|---|---|
| **Faux positifs** | Un modèle trop sensible génère des alertes inutiles et une fatigue des équipes SOC |
| **Évolution rapide** | Les attaquants adaptent leurs techniques → les modèles doivent être réentraînés régulièrement |
| **Volume de données** | Le trafic réseau génère des téraoctets par jour → besoin d'infrastructures Big Data (Kafka, Spark, Flink) |
| **Latence** | La détection doit être en temps réel (secondes, pas minutes) |
| **Adversarial attacks** | Les attaquants peuvent générer du trafic conçu pour tromper les modèles ML |

### 7.4 Solutions du marché intégrant l'IA

| Solution | Technologie |
|---|---|
| **Cloudflare (AI-powered)** | ML pour la classification automatique du trafic |
| **AWS Shield Advanced** | Détection comportementale + règles heuristiques |
| **Google Cloud Armor** | Adaptive Protection (ML) |
| **Darktrace** | Auto-encodeurs pour la détection d'anomalies |
| **Radware** | Behavioral-based detection |
| **Imperva DDoS Protection** | ML + signatures + analyse comportementale |
| **Akamai Prolexic** | Analyse prédictive et auto-apprentissage |

### 7.5 La boucle IA vs IA

Le futur des DDoS est une **course aux armements** entre :

```
[Attaquants IA]                  [Défenseurs IA]
     │                                │
     ├─ Génération de trafic          ├─ Détection ML
     │   adaptatif                    │   temps réel
     ├─ Contournement                 ├─ Réponse automatique
     │   des modèles ML               │   (auto-mitigation)
     ├─ Attaques adversarial          ├─ Réentraînement
     │   (tromper les classifieurs)   │   continu des modèles
     ├─ Test automatique              ├─ Honeypots intelligents
     │   des défenses                 │
     ▼                                ▼
```

---

## 8. Références

### Guides officiels ANSSI / CERT-FR

| Référence | Titre |
|---|---|
| **CERTFR-2026-CTI-002** | [Menaces et tendances cyber 2026](https://www.cert.ssi.gouv.fr/uploads/CERTFR-2026-CTI-002.pdf) |
| **CERTFR-2024-RFX-010-2** | [Recommandations pour la gestion de crise cyber](https://cert.ssi.gouv.fr/uploads/CERTFR-2024-RFX-010-2.pdf) |
| **CERTFR-2024-RFX-009-2** | [Guide de réponse aux incidents](https://cert.ssi.gouv.fr/uploads/CERTFR-2024-RFX-009-2.pdf) |
| **ANSSI** | [Guide DDoS — Recommandations](https://messervices.cyber.gouv.fr/documents-guides/NP_Guide_DDoS.pdf) |
| **Cybermalveillance.gouv.fr** | [Fiche réflexe DDoS](https://www.cybermalveillance.gouv.fr/tous-nos-contenus/fiches-reflexes/attaque-en-deni-de-service-ddos) |
| **Akamai** | [What is DDoS — Glossaire](https://www.akamai.com/fr/glossary/what-is-ddos) |

### RFC et standards

- **RFC 791** — Internet Protocol (fragmentation)
- **RFC 9293** — Transmission Control Protocol (TCP)
- **RFC 768** — User Datagram Protocol (UDP)
- **RFC 1035** — Domain Names (DNS)
- **RFC 2827 / BCP 38** — Network Ingress Filtering (anti-spoofing)
- **RFC 4987** — TCP SYN Flooding Attacks and Common Mitigations

### Lectures complémentaires

- **OWASP** : [DDoS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- **CISA** : [Understanding and Responding to DDoS Attacks](https://www.cisa.gov/news-events/news/understanding-and-responding-ddos-attacks)
- **MITRE ATT&CK** : [TA0040 — Impact (DDoS techniques)](https://attack.mitre.org/tactics/TA0040/)
- **NIST SP 800-61 Rev.2** : Computer Security Incident Handling Guide

---

> **Note :** Ce projet est un outil **pédagogique** destiné à l'apprentissage des mécanismes des attaques DDoS. Il ne doit pas être utilisé pour lancer des attaques réelles, ce qui est illégal dans la plupart des juridictions.
