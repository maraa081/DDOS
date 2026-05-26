# NetSim DDoS Lab — Rapport Technique

**Projet :** Simulation interactive d'attaques DDoS avec visualisation temps réel  
**Auteur :** Projet pédagogique — Étude des attaques par déni de service distribué  
**Moteur :** Node.js + Socket.IO + Express  
**Date :** Mai 2026

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Architecture du simulateur](#2-architecture-du-simulateur)
3. [Attaques DDoS implémentées](#3-attaques-ddos-implementees)
   - [3.1 SYN Flood](#31-syn-flood)
   - [3.2 Port Scan](#32-port-scan)
   - [3.3 UDP Flood](#33-udp-flood)
   - [3.4 Amplification DNS](#34-amplification-dns)
   - [3.5 Attaque par fragmentation (Teardrop)](#35-attaque-par-fragmentation-teardrop)
   - [3.6 HTTP Flood](#36-http-flood)
4. [Detection des attaques DDoS](#4-detection-des-attaques-ddos)
5. [Conduite a tenir pour le RSSI](#5-conduite-a-tenir-pour-le-rssi)
6. [Impact de l'IA sur les attaques DDoS](#6-impact-de-lia-sur-les-attaques-ddos)
7. [Impact de l'IA sur la detection des DDoS](#7-impact-de-lia-sur-la-detection-des-ddos)
8. [References](#8-references)

---

## 1. Introduction

Une attaque par deni de service distribue (DDoS, Distributed Denial of Service) vise a rendre une ressource informatique (serveur, service, reseau) indisponible pour ses utilisateurs legitimes en la submergeant de trafic malveillant provenant de multiples sources.

Contrairement a une attaque DoS classique (mono-source), l'attaque DDoS exploite un botnet, c'est-a-dire un reseau d'ordinateurs, serveurs ou objets connectes compromis, pour generer un volume de requetes bien au-dela de ce qu'une seule machine pourrait produire.

Le present projet implemente un simulateur reseau interactif permettant de visualiser en temps reel le comportement de differentes attaques DDoS et leur impact sur l'infrastructure cible, a des fins pedagogiques.

### 1.1 Contexte et enjeux

Selon le CERT-FR (CERTFR-2026-CTI-002) et le guide de l'ANSSI sur les attaques DDoS, plusieurs constats s'imposent :

- Le volume des attaques DDoS ne cesse de croitre, depassant regulierement le Terabit par seconde.
- Les motivations sont variees : cybercriminalite (rancon), hacktivisme, destabilisation, testing.
- Le cout moyen d'une attaque DDoS pour une entreprise est estime entre 20 000 euros et plusieurs millions d'euros, incluant perte de chiffre d'affaires, rancon et couts de remediation.
- La France est l'un des pays les plus cibles en Europe.

---

## 2. Architecture du simulateur

Le simulateur NetSim DDoS Lab est construit autour d'un moteur de simulation reseau en JavaScript (Node.js) qui modelise une topologie simplifiee mais realiste.

### 2.1 Topologie simulee

Le reseau simule comprend les elements suivants :

- Des postes clients generant du trafic legitime (requetes HTTP, ARP, DNS).
- Un routeur faisant office de passerelle.
- Un serveur web constituant la cible.
- Un attaquant generant le trafic malveillant.

### 2.2 Metriques temps reel

Le moteur calcule et expose en continu les indicateurs suivants :

| Metrique | Description |
|---|---|
| packetsPerSec | Paquets totaux par seconde |
| synPerSec | Paquets SYN par seconde |
| udpPerSec | Datagrammes UDP par seconde |
| httpPerSec | Requetes HTTP par seconde |
| dnsPerSec | Requetes DNS par seconde |
| connectionBacklog | File d'attente de connexions (SYN backlog) |
| bandwidthPercent | Utilisation de la bande passante |
| cpuLoad | Charge CPU simulee du serveur |

### 2.3 Flux de donnees

Le systeme repose sur une architecture client-serveur temps reel :

- Les clients web (navigateurs) se connectent via Socket.IO.
- Le moteur de simulation (engine/network.js) gere la generation du trafic normal et d'attaque.
- Un systeme de backlog et de detection emet des alertes en fonction des seuils atteints.
- Les metriques sont transmises en continu aux clients pour affichage et animation.

---

## 3. Attaques DDoS implementees

### 3.1 SYN Flood

#### Fonctionnement technique

L'attaque SYN Flood exploite le mecanisme de la three-way handshake TCP.

Dans le fonctionnement normal du protocole TCP, l'etablissement d'une connexion se deroule en trois temps :

1. Le client envoie un paquet SYN (synchronize) au serveur.
2. Le serveur alloue une entree dans sa file de connexions en attente (SYN backlog) et repond par un paquet SYN-ACK.
3. Le client finalise par un ACK, la connexion est etablie et retiree du backlog.

En situation d'attaque SYN Flood, l'attaquant envoie une rafale de paquets SYN avec des adresses IP source forges (spoofing). Le serveur repond a chaque SYN par un SYN-ACK vers l'IP forgee, qui ne repondra jamais (ou repondra par un RST si l'hete existe). Les entrees restent dans le backlog jusqu'au timeout, generalement compris entre 30 et 120 secondes. Ce mecanisme finit par saturer la file d'attente.

**Consequence :** Aucune nouvelle connexion legitime ne peut etre etablie, ce qui provoque un deni de service.

Les systemes d'exploitation modernes implementent des mecanismes de protection, notamment les SYN cookies (RFC 4987) qui permettent de repondre aux SYN sans allouer d'entree dans le backlog tant que l'ACK n'est pas recu.

#### Detection

- Pic anormal de paquets SYN (plusieurs milliers par seconde).
- Desequilibre entre le nombre de SYN, SYN-ACK et ACK.
- Augmentation du SYN backlog au-dela des seuils normaux.
- Logs systeme mentionnant un possible SYN flooding ou un LISTEN overflow.

#### Prevention

Plusieurs methodes peuvent etre mises en oeuvre pour se premunir contre cette attaque :

- Activation des SYN cookies (sous Linux : `net.ipv4.tcp_syncookies=1`).
- Elargissement du backlog via `net.ipv4.tcp_max_syn_backlog` et `net.core.somaxconn`.
- Limitation du nombre de SYN par seconde par IP (iptables, nftables, reverse proxy).
- Utilisation d'un reverse proxy ou d'un CDN (Cloudflare, AWS Shield, Akamai).

---

### 3.2 Port Scan

#### Fonctionnement technique

Le port scan n'est pas une attaque DDoS en soi, mais une technique de reconnaissance souvent utilisee en amont pour identifier les services vulnerables avant de lancer l'attaque.

Les principaux types de scans sont les suivants :

- SYN scan (half-open) : envoie un SYN, analyse la reponse (SYN-ACK signifie port ouvert, RST signifie porte ferme), et ne complete jamais la handshake.
- Connect scan : etablit completement la connexion TCP.
- UDP scan : envoie un datagramme UDP et attend un ICMP Port Unreachable.
- FIN / NULL / Xmas scan : envoie des paquets avec des flags inhabituels pour contourner les pare-feux.

Dans le contexte des attaques DDoS, un port scan distribue (DPS) peut etre utilise pour cartographier les services exposes d'une infrastructure, identifier les ports vulnerables, contourner les detections en repartissant le scan sur plusieurs milliers de bots, ou masquer l'attaque reelle en noyant le bruit de fond.

#### Detection

- Analyse des connexions incompletes (beaucoup de SYN sans ACK final).
- Sequences de ports inhabituelles (scan aleatoire ou sequentiel).
- Trafic vers plusieurs ports depuis une meme IP en peu de temps.
- Outils : psad (Port Scan Attack Detector), Snort, Suricata.

#### Prevention

- Pare-feu restrictif bloquant tout port non necessaire en entree.
- Limitation du nombre de connexions par seconde et par source.
- Port knocking pour masquer les ports qui ne repondent qu'apres une sequence secrete.
- Fail2ban pour bannir temporairement les IP generant des echecs de connexion.

---

### 3.3 UDP Flood

#### Fonctionnement technique

L'attaque UDP Flood exploite le fait que le protocole UDP est sans etat : le serveur recoit un datagramme et doit allouer des ressources pour le traiter, sans pouvoir verifier au prealable la legitimite de la source.

Le deroulement est le suivant :

1. L'attaquant envoie un grand nombre de datagrammes UDP vers des ports aleatoires ou specifiques de la cible.
2. Pour chaque datagramme recu sur un port ferme, le serveur repond par un paquet ICMP Destination Unreachable.
3. Pour les ports ouverts, l'application doit traiter le datagramme, consommant du CPU et de la memoire.
4. Le volume de paquets sature la bande passante du serveur et/ou du reseau.

Une variante, la reflexion UDP, consiste a envoyer des datagrammes avec l'IP de la victime comme source vers des services UDP (NTP, CHARGEN, SSDP, Memcached) qui repondent avec un volume de donnees amplifie.

#### Detection

- Hausse brutale du trafic UDP (plusieurs centaines de Mbps ou Gbps).
- Ports aleatoires cibles.
- Equilibre entree/sortie desequilibre (beaucoup d'ICMP unreachable en sortie).
- Analyse des logs applicatifs et du monitoring reseau.

#### Prevention

- Filtrage UDP : bloquer tout trafic UDP non necessaire au niveau du pare-feu.
- Limitation du debit UDP par IP source.
- Seuils de trafic UDP anormal avec detection d'anomalies.
- Services cloud anti-DDoS pour absorber le trafic volumetrique.
- Routage Anycast pour distribuer le trafic sur plusieurs datacenters.

---

### 3.4 Amplification DNS

#### Fonctionnement technique

L'attaque par amplification DNS est une attaque de reflexion qui exploite le facteur d'amplification des serveurs DNS ouverts.

Le principe est le suivant :

1. L'attaquant envoie une petite requete DNS (type ANY) d'environ 40 a 60 octets vers un serveur DNS public recursif.
2. L'adresse IP source de la requete est forgee (spoofee) pour correspondre a celle de la victime.
3. Le serveur DNS repond a la victime avec une reponse volumineuse, pouvant atteindre 4000 octets ou plus avec DNSSEC.
4. Le facteur d'amplification peut atteindre 50 a 100 fois la taille de la requete initiale.
5. En multipliant par des milliers de serveurs DNS ouverts, on obtient un trafic gigantesque.

Les protocoles les plus couramment utilises pour l'amplification sont les suivants :

- DNS (port 53) : facteur d'amplification jusqu'a 50-100x avec une requete ANY et DNSSEC.
- NTP (port 123) : facteur jusqu'a 556x avec la commande monlist.
- SSDP (port 1900) : facteur jusqu'a 30x via la decouverte UPnP.
- Memcached (port 11211) : facteur jusqu'a 10 000-50 000x (aujourd'hui largement mitige).
- CHARGEN (port 19) : facteur jusqu'a 358x (protocole legacy).

Il est important de noter que l'amplification DNS est particulierement dangereuse car elle permet a un attaquant disposant de ressources modestes de generer un trafic considerable.

#### Detection

- Augmentation massive du trafic DNS en direction de la cible (plusieurs Gbps).
- Flot de reponses DNS sans requetes correspondantes de la part de la victime.
- Paquets DNS de grande taille (requetes ANY avec EDNS0).
- Monitoring des logs DNS du cote de l'infrastructure.

#### Prevention

- Fermeture des resolveurs ouverts : les serveurs DNS publics ne doivent repondre qu'aux clients autorises.
- Rate limiting des reponses DNS par source.
- Filtrage d'ingress (BCP38 / RFC 2827) pour empecher le spoofing IP au niveau du FAI.
- Response Rate Limiting (RRL) pour limiter le volume de reponses DNS identiques.
- Anycast DNS pour repartir les serveurs DNS et absorber les attaques.
- Limitation de la taille maximale des reponses EDNS0.

---

### 3.5 Attaque par fragmentation (Teardrop)

#### Fonctionnement technique

L'attaque Teardrop exploite des vulnerabilites dans le reassemblage des fragments IP. Bien qu'elle date des annees 1990, elle reste pertinente d'un point de vue pedagogique pour comprendre les attaques au niveau IP.

**Contexte technique :** Lorsqu'un paquet IP est plus grand que la MTU (Maximum Transmission Unit, generalement 1500 octets), il est fragmente en plusieurs morceaux. Chaque fragment contient un offset qui indique sa position dans le paquet original.

**Principe de l'attaque :**

1. L'attaquant envoie des fragments IP volontairement chevauches (overlapping) ou ordonnances de maniere incorrecte.
2. Par exemple, un premier fragment avec offset 0 et taille 800, suivi d'un second fragment avec offset 400 et taille 800. Le chevauchement de 400 octets peut provoquer un comportement inattendu du reassembleur.
3. Certains systemes d'exploitation (anciens noyaux Linux, Windows 95/NT, BSD) ne gereaient pas correctement ces chevauchements.
4. Le reassembleur pouvait planter (kernel panic), boucler infiniment, ou corrompre la memoire (buffer overflow).

Il convient de noter que les systemes d'exploitation modernes ne sont plus vulnerables a cette attaque specifique, les implementations de la pile IP ayant ete corrigees depuis longtemps.

#### Detection

- Paquets IP fragmentes avec offsets incoherents.
- Fragments qui ne s'assemblent jamais (ressource leak).
- Taux eleve de paquets fragmentes par rapport au trafic normal.
- Analyse des logs de pare-feu.

#### Prevention

- Mise a jour du systeme : les noyaux modernes (Linux superieur a 2.0.33, Windows superieur a XP SP2) ne sont plus vulnerables.
- Defragmentation normalisee conforme a la RFC 791.
- Filtrage des fragments anormaux au niveau du pare-feu.
- Inspection par un IPS ou NGFW (Next-Generation Firewall).
- Defragmentation au niveau du reverse proxy avant d'atteindre le serveur applicatif.

---

### 3.6 HTTP Flood

#### Fonctionnement technique

L'attaque HTTP Flood (ou Layer 7 DDoS) cible la couche application du modele OSI. Contrairement aux attaques volumetriques, elle vise a epuiser les ressources applicatives du serveur (CPU, memoire, connexions base de donnees).

Le deroulement est le suivant :

1. Des centaines ou milliers de bots envoient des requetes HTTP GET/POST legitimes en apparence.
2. Chaque requete declenche un traitement : lecture de fichier, requete base de donnees, generation de page.
3. Le serveur web epuise ses workers, sa memoire et ses connexions a la base de donnees.
4. Les utilisateurs legitimes recoivent des timeout ou des pages d'erreur 503.

Les variantes de cette attaque incluent :

- Slowloris : maintient des connexions HTTP ouvertes en envoyant des headers incomplets, epuisant les workers Apache.
- HTTP GET Flood : requetes GET sur des pages lourdes ou dynamiques.
- HTTP POST Flood : requetes POST avec de gros corps de donnees.
- Cache bypass : requetes aleatoires pour contourner les caches CDN.
- Pingback amplification via des CMS comme WordPress/XML-RPC.

La difficulte de detection de cette attaque reside dans le fait que chaque requete individuelle peut sembler legitime. C'est le volume agrege qui est anormal.

#### Detection

- Augmentation soudaine du nombre de requetes HTTP (facteur 10 a 100 par rapport a la normale).
- User-Agents identiques ou suspects.
- Patterns d'URL repetitifs (memes chemins, memes parametres).
- Taux d'erreur 5xx en hausse.
- Latence applicative anormale.
- Analyse comportementale : time-to-first-byte, duree des sessions.

#### Prevention

- Rate limiting : limiter le nombre de requetes par IP, par session, par URI.
- WAF (Web Application Firewall) : analyser le comportement HTTP, bloquer les patterns suspects.
- Challenge (CAPTCHA, JS) : forcer les clients a executer du JavaScript avant d'acceder a la ressource.
- Reverse proxy distribue : Cloudflare, AWS WAF, Imperva, Fastly.
- Mise en cache agressive pour reduire la charge sur le serveur applicatif (Redis, Varnish).
- Detection d'anomalies avec baselines de trafic et alertes automatiques.
- Auto-scaling horizontal (Kubernetes, AWS Auto Scaling).

---

## 4. Detection des attaques DDoS

### 4.1 Approche multi-couche

La detection efficace d'une attaque DDoS necessite une approche multi-niveaux :

- Au niveau reseau : analyse de trafic (NetFlow, sFlow, IPFIX) avec des outils tels que PRTG, Zabbix, ntopng ou Darktrace.
- Au niveau systeme : metriques CPU, memoire, backlog avec Nagios, Prometheus ou Grafana.
- Au niveau application : logs applicatifs, temps de reponse avec Datadog, New Relic ou la pile ELK.
- Au niveau pare-feu : regles de filtrage, logs de connexion avec iptables, nftables, pfSense ou Opnsense.
- Au niveau WAF : analyse HTTP, detection de patterns avec ModSecurity ou Cloudflare WAF.

### 4.2 Indicateurs de compromission

Les indicateurs suivants peuvent signaler une attaque DDoS en cours :

- Volume de trafic anormal (facteur 10 a 1000 par rapport a la baseline habituelle).
- Taux de paquets SYN superieur a 70% du trafic total (SYN Flood).
- Augmentation brutale du trafic UDP (UDP Flood).
- Reponses DNS sans requetes correspondantes (Amplification DNS).
- Taux d'erreur 5xx superieur a 10% (HTTP Flood).
- Latence reseau et applicative superieure a 5 fois la normale.
- Backlog de connexions proche de la saturation.

### 4.3 Automatisation de la detection

Les regles de detection peuvent etre automatisees sous forme d'alertes basees sur des seuils, par exemple :

- Si le nombre de paquets par seconde depasse un seuil defini, et que le nombre de SYN par seconde depasse un second seuil, et que le backlog de connexions est proche de la saturation, alors une alerte de type "SYN Flood probable" est declenchee.
- Si le nombre de datagrammes UDP par seconde depasse un seuil et que l'utilisation de la bande passante excede 95%, une alerte de type "UDP Flood probable" est declenchee.
- Si le nombre de requetes HTTP par seconde depasse un seuil et que le taux d'erreur 5xx est superieur a 10%, une alerte de type "HTTP Flood probable" est declenchee.

---

## 5. Conduite a tenir pour le RSSI

*References : CERTFR-2024-RFX-010-2 et CERTFR-2024-RFX-009-2*

### 5.1 Phase preparatoire

Avant toute attaque, le RSSI doit mettre en place les mesures suivantes :

- Cartographier le systeme d'information en identifiant les actifs critiques, les dependances externes et les FAI.
- Etablir une baseline du trafic normal (Mbps, requetes par seconde, connexions par seconde).
- Mettre en place des seuils d'alerte a 50%, 70% et 90% de saturation.
- Souscrire un service de mitigation anti-DDoS (Cloudflare, OVH, AWS Shield, Imperva).
- Rediger et tester un plan de continute d'activite (PCA) et un plan de reprise d'activite (PRA) incluant le scenario DDoS.
- Mettre en place de la redondance : Anycast, load balancing, auto-scaling, architecture distribuee.
- Preparer des templates de communication destines aux clients, partenaires, presse et autorites.

### 5.2 Phase de detection

Les premieres minutes sont cruciales. La procedure recommandee est la suivante :

1. Activer le plan de reponse sans paniquer, en suivant la procedure prevue.
2. Confirmer l'attaque en eliminant les fausses causes (montee de charge legitime, bug applicatif).
3. Caracteriser l'attaque : type (volumetrique, applicative, protocolaire), vecteur (SYN, UDP, DNS, HTTP, mixte), volume (Gbps, Mpps, req/s), source (distribution geographique, plages IP).
4. Contacter le FAI ou l'hebergeur car certaines mitigations (blackholing, flowspec) ne peuvent etre activees que par celui-ci.
5. Declencher le service anti-DDoS en basculant vers le service de mitigation (redirection DNS).
6. Proteger les services critiques en priorisant le trafic vers les services essentiels (QoS).
7. Communiquer en interne sur l'etat d'avancement, les decisions prises et les prochaines etapes.
8. Effectuer une declaration au CERT-FR (https://www.cert.ssi.gouv.fr/signaler/).

### 5.3 Phase de mitigation

Les actions de mitigation doivent etre declenchees dans les delais suivants :

- Activation du filtrage d'ingress : en quelques minutes.
- Rate limiting agressif : immediat.
- Blackholing / Null routing : si l'attaque est trop volumineuse pour etre filtree.
- Basculement DNS vers le service anti-DDoS : 5 a 15 minutes selon les TTL.
- Scale-up horizontal : auto-scaling.
- CAPTCHA / JS Challenge : pour filtrer les bots en cas de HTTP flood.

### 5.4 Phase post-attaque

Apres la fin de l'attaque, les actions suivantes sont recommandees :

- Analyser les logs et metriques pour comprendre le deroule complet de l'attaque.
- Identifier les vulnerabilites exploitees.
- Mettre a jour le plan de reponse en integrant les lecons apprises.
- Renforcer les mesures de protection.
- Transmettre les elements au CERT-FR si necessaire.
- Communiquer en externe aupres des clients, de la presse, des autorites et de l'assureur.
- Realiser un bilan et un chiffrage : cout de l'attaque, cout de la mitigation, retour sur investissement des mesures de protection.

---

## 6. Impact de l'IA sur les attaques DDoS

### 6.1 Automatisation intelligente des attaques

L'intelligence artificielle, en particulier le machine learning et les grands modeles de langage (LLM), transforme les attaques DDoS de plusieurs manieres.

**Attaques adaptatives :** Les botnets pilotes par IA peuvent ajuster dynamiquement leur strategie d'attaque. Ils analysent en temps reel l'efficacite de l'attaque, changent automatiquement de vecteur (passer de SYN a UDP a HTTP), contournent les defenses en ralentissant quand la detection s'intensifie et en accelerant quand elle faiblit, et evitent les blacklists par rotation des IP et modulation du trafic.

**Generation de trafic legitime :** Les LLM (GPT, Claude, DeepSeek, Llama) peuvent generer des requetes HTTP realistes imitant parfaitement le comportement humain, des User-Agents diversifies et a jour, des parcours de navigation credibles (plusieurs pages, temps de lecture), et contourner les CAPTCHA via des API de resolution.

**Ciblage precis :** L'IA permet l'analyse automatique des vulnerabilites de l'infrastructure cible, l'identification des goulots d'etranglement specifiques, et le ciblage des actifs les plus critiques (API, base de donnees, authentification).

### 6.2 Botnets nouvelle generation

L'evolution des botnets est marquee par plusieurs tendances :

- Le passage des botnets IoT aux botnets IA, ou les bots peuvent coordonner leurs actions de maniere intelligente.
- L'architecture P2P decentralisee, qui supprime le point de controle central a detruire (exemple : Hajime a succede a Mirai).
- L'apprentissage par renforcement pour l'optimisation continue de l'attaque.
- Les attaques multi-vecteurs synchronisees combinant SYN flood, UDP flood et HTTP flood de maniere coordonnee.

### 6.3 Attack-as-a-Service avec IA

Le marche illicite propose desormais des services DDoS integrant l'IA. Ces services incluent des booters et stressers nouvelle generation avec auto-optimisation, la personnalisation des attaques via prompt LLM, et une tarification dynamique basee sur la difficulte de la cible.

---

## 7. Impact de l'IA sur la detection des DDoS

### 7.1 Detection par machine learning

**Apprentissage supervise :** Le principe consiste a entrainer un modele sur des donnees labellisees (trafic normal vs trafic d'attaque). Les algorithmes couramment utilises sont Random Forest pour la classification, SVM pour la detection d'anomalies, XGBoost pour la prediction de l'etat d'attaque, et les reseaux de neurones pour la classification multi-classes (type d'attaque).

Cette approche offre une precision elevee sur les attaques connues et un faible taux de faux positifs. En revanche, elle ne detecte pas les attaques inconnues (zero-day) et necessite des jeux de donnees labellises.

**Apprentissage non supervise :** Le principe consiste a detecter des anomalies sans connaissance prealable des attaques. Les techniques utilisees incluent les auto-encodeurs (apprendre le comportement normal, signaler tout ecart), DBSCAN et Isolation Forest (clustering automatique des anomalies), et One-Class SVM (modeliser une seule classe normale, tout le reste est suspect).

Cette approche detecte les attaques inconnues, y compris les variantes zero-day, mais presente un taux de faux positifs plus eleve et necessite du calibrage.

**Deep Learning pour l'analyse temps reel :** Les architectures CNN (Convolutional Neural Networks) extraient les patterns spatiaux tandis que les LSTM (Long Short-Term Memory) analysent les patterns temporels. La combinaison des deux permet une analyse de flux reseau en temps reel avec une detection en moins de quelques secondes.

### 7.2 Approches hybrides

Les solutions les plus efficaces combinent plusieurs techniques :

1. Regles de seuil pour une detection rapide des attaques massives.
2. Machine learning supervise pour la classification precise des attaques connues.
3. Machine learning non supervise pour la detection des anomalies inconnues.
4. Analyse comportementale pour le profilage du trafic normal.
5. Correlation croisee entre sources multiples.

### 7.3 Defis de l'IA en detection DDoS

Plusieurs defis subsistent :

- Les faux positifs : un modele trop sensible genere des alertes inutiles et entraine une fatigue des equipes SOC.
- L'evolution rapide des techniques d'attaque necessite un reentrainement regulier des modeles.
- Le volume de donnees : le trafic reseau genere des teraoctets par jour, necessitant des infrastructures Big Data (Kafka, Spark, Flink).
- La latence : la detection doit etre en temps reel, en quelques secondes, pas en minutes.
- Les attaques adversariales : les attaquants peuvent generer du trafic concu pour tromper les modeles de machine learning.

### 7.4 Solutions du marche integrant l'IA

Plusieurs solutions commerciales integrent l'IA pour la detection DDoS :

- Cloudflare (AI-powered) : machine learning pour la classification automatique du trafic.
- AWS Shield Advanced : detection comportementale et regles heuristiques.
- Google Cloud Armor : Adaptive Protection base sur le machine learning.
- Darktrace : auto-encodeurs pour la detection d'anomalies.
- Radware : detection basee sur le comportement.
- Imperva DDoS Protection : machine learning, signatures et analyse comportementale.
- Akamai Prolexic : analyse predictive et auto-apprentissage.

### 7.5 La boucle IA versus IA

L'avenir de la lutte contre les DDoS s'apparente a une course aux armements entre attaquants et defenseurs utilisant tous deux l'intelligence artificielle. Les attaquants disposent de la generation de trafic adaptatif, du contournement des modeles de machine learning, des attaques adversariales visant a tromper les classifieurs, et du test automatique des defenses. Les defenseurs repondent par la detection en temps reel, la reponse automatique (auto-mitigation), le reentrainement continu des modeles et les honeypots intelligents.

---

## 8. References

### Guides officiels ANSSI / CERT-FR

| Reference | Titre |
|---|---|
| CERTFR-2026-CTI-002 | Menaces et tendances cyber 2026 |
| CERTFR-2024-RFX-010-2 | Recommandations pour la gestion de crise cyber |
| CERTFR-2024-RFX-009-2 | Guide de reponse aux incidents |
| ANSSI | Guide DDoS - Recommandations |
| Cybermalveillance.gouv.fr | Fiche reflexe DDoS |
| Akamai | What is DDoS - Glossaire |

### RFC et standards

- RFC 791 : Internet Protocol (fragmentation).
- RFC 9293 : Transmission Control Protocol (TCP).
- RFC 768 : User Datagram Protocol (UDP).
- RFC 1035 : Domain Names (DNS).
- RFC 2827 / BCP 38 : Network Ingress Filtering (anti-spoofing).
- RFC 4987 : TCP SYN Flooding Attacks and Common Mitigations.

### Lectures complementaires

- OWASP : DDoS Prevention Cheat Sheet.
- CISA : Understanding and Responding to DDoS Attacks.
- MITRE ATT and CK : TA0040 - Impact (DDoS techniques).
- NIST SP 800-61 Rev.2 : Computer Security Incident Handling Guide.

---

> Note : Ce projet est un outil pedagogique destine a l'apprentissage des mecanismes des attaques DDoS. Il ne doit pas etre utilise pour lancer des attaques reelles, ce qui est illegal dans la plupart des juridictions.
