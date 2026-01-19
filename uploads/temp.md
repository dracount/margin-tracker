ubuntu@n8n-test:~/my-automation-stack$ docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
2026/01/19 16:55:15.800 INFO    using config from file  {"file": "/etc/caddy/Caddyfile"}
2026/01/19 16:55:15.803 INFO    adapted config to JSON  {"adapter": "caddyfile"}
2026/01/19 16:55:15.803 WARN    Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies    {"adapter": "caddyfile", "file": "/etc/caddy/Caddyfile", "line": 6}


ubuntu@n8n-test:~/my-automation-stack$ nano Caddyfile
ubuntu@n8n-test:~/my-automation-stack$ cd ~/my-automation-stack/
ubuntu@n8n-test:~/my-automation-stack$ docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
2026/01/19 16:53:32.753 INFO    using config from file  {"file": "/etc/caddy/Caddyfile"}
2026/01/19 16:53:32.756 INFO    adapted config to JSON  {"adapter": "caddyfile"}
2026/01/19 16:53:32.756 WARN    Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies    {"adapter": "caddyfile", "file": "/etc/caddy/Caddyfile", "line": 6}
ubuntu@n8n-test:~/my-automation-stack$ nano Caddyfile
ubuntu@n8n-test:~/my-automation-stack$ docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
2026/01/19 16:55:15.800 INFO    using config from file  {"file": "/etc/caddy/Caddyfile"}
2026/01/19 16:55:15.803 INFO    adapted config to JSON  {"adapter": "caddyfile"}
2026/01/19 16:55:15.803 WARN    Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies    {"adapter": "caddyfile", "file": "/etc/caddy/Caddyfile", "line": 6}
ubuntu@n8n-test:~/my-automation-stack$ ^C
ubuntu@n8n-test:~/my-automation-stack$ cat Caddyfile
#
# Simplified Caddyfile for Reverse Proxy ONLY
#

my-oracle-n8n.kozow.com {
    # Point to the n8n container to serve the traffic
    reverse_proxy n8n-main:5678
}

kotaemon.my-oracle-n8n.kozow.com {
    reverse_proxy kotaemon:7860
}

margintracker.my-oracle-n8n.kozow.com {                                                                                                         reverse_proxy margin_frontend:80
   handle_path /api/* {                                                                                                  
       reverse_proxy margin_pocketbase:8090
   }

   handle_path /_/* {
       reverse_proxy margin_pocketbase:8090
   }
}
ubuntu@n8n-test:~/my-automation-stack$ cat docker-compose.yml
#
# FINAL docker-compose.yml that uses the build command
#
services:
  caddy:
    # THE FIX: Use the official Caddy image. No more building.
    #image: caddy:latest
    build: ./caddy
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

  n8n:
    image: n8nio/n8n:latest
    container_name: n8n-main
    restart: always
    command: "start"
    environment:
      - N8N_SECURE_COOKIE=false
      - TZ=Africa/Johannesburg
      - N8N_HOST=0.0.0.0
      - WEBHOOK_URL=https://my-oracle-n8n.kozow.com/
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=YOUR_STRONG_PASSWORD
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
      - redis

  qdrant:
    image: qdrant/qdrant:latest  # This will automatically pull the right image for your CPU (x86 or ARM)
    container_name: qdrant_db
    restart: always
    ports:
      # Exposes Qdrant's gRPC port to the host
      - "6333:6333"
      # Exposes Qdrant's REST API port to the host
      - "6334:6334"
    volumes:
      # This creates a named volume to persist your data even if the container is removed
      - qdrant_storage:/qdrant/storage

  postgres:
    image: postgres:latest
    platform: linux/arm64
    container_name: postgres
    restart: always
    environment:
      - POSTGRES_DB=n8n
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:latest
    platform: linux/arm64
    container_name: redis
    restart: always
    volumes:
      - redis_data:/data

  kotaemon:
    # Using the -full image to support a wider range of document types.
    image: ghcr.io/cinnamon/kotaemon:main-full
    container_name: kotaemon
    restart: unless-stopped
    # This tells Docker Compose to load the variables from the .env file.
    env_file:
      - ./.env
    environment:
      # Sets the Gradio server to be accessible from other containers.
      - GRADIO_SERVER_NAME=0.0.0.0
      - GRADIO_SERVER_PORT=7860
    volumes:
      # Persists all application data, documents, and settings.
      - kotaemon_data:/app/ktem_app_data

  waha:
    image: devlikeapro/waha:arm
    container_name: waha
    restart: always
    environment:
      - WHATSAPP_SWAGGER_ENABLED=true
      - WHATSAPP_API_KEY=dt@WP12345
      - WHA_WEBHOOK_URL=https://n8n:5678/webhook/whatsapp
    depends_on:
      - n8n

  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest
    platform: linux/arm64
    container_name: whisper
    restart: always
    environment:
      - ASR_ENGINE=openai_whisper
      - ASR_MODEL=tiny
      - ASR_MODEL_PATH=/data/models
    volumes:
      - ./whisper_cache:/data/models

volumes:
  n8n_data:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:
  qdrant_storage:
  kotaemon_data:
ubuntu@n8n-test:~/my-automation-stack$

ubuntu@n8n-test:~/my-automation-stack$ cd ~/michael/
ubuntu@n8n-test:~/michael$ cd margin-tracker/
ubuntu@n8n-test:~/michael/margin-tracker$ ls
Caddyfile                      docker-compose.prod.yml  oracle-add-to-docker-compose.yml  tsconfig.node.json
Caddyfile.prod                 docker-compose.yml       package-lock.json                 uploads
Dockerfile                     docs                     package.json                      vite.config.ts
Margin_Tracker.code-workspace  index.html               scripts
README.md                      nginx.conf               src
docker-compose.oracle.yml      oracle-add-to-caddyfile  tsconfig.json


ubuntu@n8n-test:~/michael/margin-tracker$ docker ps
CONTAINER ID   IMAGE                                            COMMAND                  CREATED        STATUS                  PORTS                                                                                                                             NAMES
e50fe29e9c07   adrianmusante/pocketbase:latest                  "/opt/pocketbase/scr…"   3 hours ago    Up 3 hours              0.0.0.0:8090->8090/tcp, [::]:8090->8090/tcp                                                                                       pb_margins
68a7772d38e9   margin-tracker-frontend                          "/docker-entrypoint.…"   3 hours ago    Up 3 hours              80/tcp                                                                                                                            margin_frontend
6888623950ea   ghcr.io/cinnamon/kotaemon:main-full              "sh /app/launch.sh"      2 months ago   Up 2 months                                                                                                                                               kotaemon
dc872e008cb1   mcp/filesystem                                   "node /app/dist/inde…"   2 months ago   Up 2 months                                                                                                                                               filesystem_mcp_server
d59789b08a61   devlikeapro/waha:arm                             "/usr/bin/tini -- /e…"   2 months ago   Up 2 months             3000/tcp                                                                                                                          waha
0ebb05e55af7   n8nio/n8n:latest                                 "tini -- /docker-ent…"   2 months ago   Up 2 months             5678/tcp                                                                                                                          n8n-main
6d7d8981465a   onerahmet/openai-whisper-asr-webservice:latest   "whisper-asr-webserv…"   2 months ago   Up 2 months             9000/tcp                                                                                                                          whisper
38ec2aab2bfe   qdrant/qdrant:latest                             "./entrypoint.sh"        2 months ago   Up 2 months             0.0.0.0:6333-6334->6333-6334/tcp, [::]:6333-6334->6333-6334/tcp                                                                   qdrant_db
66e13b77597e   redis:latest                                     "docker-entrypoint.s…"   2 months ago   Up 2 months             6379/tcp                                                                                                                          redis
dc3bec8b7f34   postgres:latest                                  "docker-entrypoint.s…"   2 months ago   Up 2 months             5432/tcp                                                                                                                          postgres
516821c6173d   my-automation-stack-caddy                        "caddy run --config …"   2 months ago   Up 2 months             0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 0.0.0.0:443->443/udp, [::]:443->443/udp, 2019/tcp   caddy
a3435db229ef   my-automation-stack-anythingllm                  "/bin/bash /usr/loca…"   2 months ago   Up 2 months (healthy)                                                                                                                                     anythingllm
ubuntu@n8n-test:~/michael/margin-tracker$
