C'est un excellent ajout au README \! Pour les utilisateurs de **WSL2** (qui utilisent généralement une distribution basée sur **Ubuntu/Debian**), les commandes que vous fournissez sont parfaites.

Voici la section mise à jour pour le README de votre API InfluxDB, intégrant ces instructions détaillées d'installation sous forme de service `systemd` (géré par `service` ou `systemctl` sous WSL2).

-----

## 🚀 README: API InfluxDB (Mise à jour)

Ce README fournit les étapes nécessaires pour configurer et exécuter le projet API InfluxDB.

-----

### **4. InfluxDB 2.x Setup**

Cette API se connecte à InfluxDB pour l'écriture et la lecture de données.

#### **4.1 Installation du Serveur InfluxDB (sur WSL2 / Debian/Ubuntu)**

Nous allons installer InfluxDB 2.x en tant que service en utilisant le dépôt officiel d'InfluxData.

1.  **Ajouter la clé et le dépôt InfluxData :**
    Exécutez cette série de commandes pour importer la clé de chiffrement (pour vérifier l'authenticité des paquets) et ajouter le dépôt stable à votre liste de sources `apt`.

    ```bash
    # Télécharge et vérifie la clé, puis l'ajoute au trousseau gpg
    curl --silent --location -O https://repos.influxdata.com/influxdata-archive.key
    gpg --show-keys --with-fingerprint --with-colons ./influxdata-archive.key 2>&1 | grep -q '^fpr:\+24C975CBA61A024EE1B631787C3D57159FC2F927:$' && cat influxdata-archive.key | gpg --dearmor | sudo tee /etc/apt/keyrings/influxdata-archive.gpg > /dev/null

    # Ajoute le dépôt InfluxData aux sources apt
    echo 'deb [signed-by=/etc/apt/keyrings/influxdata-archive.gpg] https://repos.influxdata.com/debian stable main' | sudo tee /etc/apt/sources.list.d/influxdata.list
    ```

2.  **Installer et Démarrer InfluxDB :**
    Mettez à jour votre liste de paquets et installez InfluxDB 2 :

    ```bash
    # Met à jour la liste des paquets
    sudo apt-get update
    # Installe InfluxDB 2
    sudo apt-get install influxdb2
    ```

3.  **Démarrer le service :**
    Démarrez le serveur InfluxDB. L'outil est désormais géré comme un service `systemd` (géré par `service` ou `systemctl` sous WSL2) :

    ```bash
    sudo service influxdb start
    ```

#### **4.2 Configuration Initiale InfluxDB**

Une fois le service démarré, vous devez effectuer la configuration initiale via l'interface web (généralement sur **`http://localhost:8086`**).

1.  **Organization :** Définissez l'organisation sur **`Technopure`**.

2.  **Bucket :** Créez un bucket initial.

3.  **Récupération du Token d'API :**
    Le **Token d'API** est essentiel pour l'authentification.

    * Dans l'interface web d'InfluxDB, naviguez vers **Data \> API Tokens**.
    * **Récupérez le token généré** (le *master token* initial) ou créez un nouveau token avec les autorisations de lecture/écriture appropriées sur l'organisation `Technopure`.

-----

### **5. Environment Configuration**

Vous devez avoir un fichier **`.env`** à la racine du dossier `api/cmd`. Ce fichier doit être mis à jour avec les informations de connexion InfluxDB récupérées.

> **Mettez à jour votre fichier `.env`** avec les variables suivantes :

```env
INFLUXDB_TOKEN=//
INFLUXDB_ORG=Technopure
INFLUXDB_URL=http://localhost:8086
API_URL=http://localhost:8080/api
```

-----

### **Running the API**

1.  **Download Dependencies:**
    ```bash
    go mod download
    ```
2.  **Run the Application:**
    ```bash
    go run server.go # Ou le fichier d'entrée de votre application
    ```

-----