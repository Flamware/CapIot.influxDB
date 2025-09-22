
# 📝 Documentation du Simulateur STM32

Ce projet est un simulateur de dispositifs **STM32** conçu pour interagir avec un écosystème de surveillance. Il simule le comportement d'un appareil doté de capteurs et d'actionneurs, en publiant des données de télémétrie sur un **broker MQTT** et en envoyant des mesures vers une base de données **InfluxDB**.

## 🚀 Fonctionnalités

  - **Simulation de multiples appareils** : Crée plusieurs simulateurs STM32 indépendants.
  - **Communication MQTT** : Établit une connexion avec un broker MQTT pour la communication bidirectionnelle.
  - **Envoi de données de capteurs** : Génère et publie des données de capteurs (température, humidité) vers une API InfluxDB.
  - **Surveillance de la consommation** : Simule et envoie les mesures de tension, courant et puissance.
  - **Gestion des alertes** : Déclenche des alertes en cas de valeurs de capteurs hors-normes ou de dépassement d'heures de fonctionnement.
  - **Gestion des commandes** : Reçoit et exécute des commandes via MQTT (démarrage, arrêt, configuration).
  - **Planification des opérations** : Permet de suivre un programme d'exécution récurrent.
  - **Logging** : Enregistre les événements importants dans un fichier de log dédié à chaque simulateur.

## 🛠️ Configuration et Installation

### Prérequis

  - Node.js (version 14 ou supérieure)
  - Un broker MQTT (par exemple, Mosquitto)
  - Une base de données InfluxDB et son API d'ingestion de données
  - Les dépendances du projet (`moment`, `winston`, `mqtt`, `axios`)

### Installation

1.  Clonez ce dépôt.
2.  Installez les dépendances :
    ```bash
    npm install
    ```
3.  Assurez-vous que le broker MQTT (sur le port `1883`) et l'API InfluxDB (sur le port `8000`) sont en cours d'exécution.

### Démarrage

Pour lancer le simulateur, exécutez le script principal :

```bash
node main.js
```

Par défaut, le script crée un simulateur unique. Vous pouvez modifier la boucle dans `main.js` pour en créer davantage.

## 💬 Flux de Communication et Topics MQTT

Le simulateur utilise MQTT pour la majorité de ses interactions. Les topics sont structurés de manière logique pour une gestion efficace.

### Topics de publication (simulateur vers le broker)

| Topic | Description | Exemple de payload |
| :--- | :--- | :--- |
| `devices/availability/deviceID` | Signale la disponibilité de l'appareil et ses composants. | `{ "device_id": "STM32-Simulator-001", "status": "online", ... }` |
| `devices/status/deviceID` | Met à jour le statut opérationnel (`online`, `running`, `offline`). | `{ "device_id": "STM32-Simulator-001", "status": "running" }` |
| `devices/heartbeat/deviceID` | Message de pulsation régulier pour indiquer que le simulateur est actif. | `{ "device_id": "STM32-Simulator-001", "status": "online" }` |
| `devices/running_hours/deviceID` | Met à jour le temps de fonctionnement d'un composant. | `{ "device_id": "...", "component_id": "...", "running_hours": 123.45 }` |
| `devices/alert/deviceID` | Alerte le système de valeurs hors-normes ou de dépassement de seuils. | `{ "device_id": "...", "component_id": "...", "alert": "...", "value": 95 }` |
| `devices/consumption/deviceID` | Mesures de la consommation électrique (tension, courant, puissance). | `{ "device_id": "...", "voltage": 220.5, "current": 1.2, "power": 264.6 }` |

### Topics de souscription (broker vers le simulateur)

Le simulateur écoute ces topics pour recevoir des commandes et des configurations :

| Topic | Description | Exemple de commande (payload) |
| :--- | :--- | :--- |
| `devices/config/deviceID` | Configure les propriétés d'un composant (seuils, statut, etc.). | `{ "component_id": "...", "min_threshold": 15, "max_threshold": 30 }` |
| `devices/commands/deviceID` | Envoie des commandes de contrôle à l'appareil. | `{ "command": "Start", "location_id": "loc-A" }` |
| `devices/schedules/deviceID` | Définit le programme d'exécution du simulateur. | `{ "schedules": [{ "device_id": "...", "start_time": "...", "end_time": "..." }] }` |

## ⚙️ Les composants simulés

Chaque simulateur est équipé de plusieurs composants :

  - **`temp-sim-001`** : Un capteur de température (`component_type: sensor`).
  - **`hum-sim-001`** : Un capteur d'humidité (`component_type: sensor`).
  - **`fan-sim-001`** : Un actionneur de ventilateur (`component_type: actuator`).
  - **`led-sim-001`** : Un indicateur LED (`component_type: indicator`).

Les données de ces composants sont générées de manière aléatoire et envoyées au système de surveillance en continu lorsque le simulateur est en marche.