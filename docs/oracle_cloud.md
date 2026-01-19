### **Guide: Self-Hosting AnythingLLM on Oracle Cloud with Docker and Caddy**

This document details the complete process for deploying AnythingLLM on an Oracle Cloud Free Tier instance, integrating it into an existing Docker Compose stack that uses Caddy as a reverse proxy for secure HTTPS access.

#### **Table of Contents**
1.  **System Overview & Goal**
2.  **Prerequisites**
3.  **Step 1: DNS Configuration (Subdomain)**
4.  **Step 2: Docker Compose Configuration (`docker-compose.yml`)**
5.  **Step 3: Caddy Reverse Proxy Configuration (`Caddyfile`)**
6.  **Step 4: Deployment and Verification**
7.  **Essential Maintenance Commands**
8.  **Comprehensive Troubleshooting Guide**
    *   A) Admin Password Reset (Definitive Method)
    *   B) Container is Crash-Looping or "Restarting"
    *   C) MCP Agent (GitHub Skill) Fails to Start
    *   D) Caddy Fails to Reload

---

### **1. System Overview & Goal**

The objective is to run a secure, publicly accessible AnythingLLM instance alongside other services (like n8n) on a single Oracle Cloud VM.

*   **Cloud Provider:** Oracle Cloud Free Tier (Ampere ARM instance).
*   **Containerization:** Docker and Docker Compose.
*   **Reverse Proxy:** Caddy for automatic HTTPS/SSL.
*   **Application:** AnythingLLM.
*   **DNS:** A custom domain managed by a provider like Dynu.

### **2. Prerequisites**

*   An active Oracle Cloud account with a running VM instance.
*   SSH access to the VM.
*   Docker and Docker Compose V2 (using the `docker compose` command with a space) installed on the VM.
*   An existing `docker-compose.yml` file and `Caddyfile` managing other services.
*   A custom domain name pointed to your VM's public IP address.

### **3. Step 1: DNS Configuration (Subdomain)**

To access AnythingLLM via a clean URL (e.g., `https://anythingllm.your-domain.com`), you must first create a DNS record.

1.  Log in to your DNS provider's control panel (e.g., Dynu).
2.  Navigate to the DNS management page for your main domain (e.g., `my-oracle-n8n.kozow.com`).
3.  Add a new **CNAME** record with the following details:
    *   **Hostname/Node:** `anythingllm` (or your desired subdomain name).
    *   **Type:** `CNAME`.
    *   **Value/Points To:** Your existing full domain name (e.g., `my-oracle-n8n.kozow.com`).

This tells the internet that `anythingllm.my-oracle-n8n.kozow.com` is an alias for your main domain and should resolve to the same IP address.

### **4. Step 2: Docker Compose Configuration (`docker-compose.yml`)**

Edit your `docker-compose.yml` file to add the AnythingLLM service.

1.  **Add the Service:** Add the following block under the `services:` key, at the same indentation level as your other services.

    ```yaml
    services:
      # ... your other services like n8n, caddy, etc.

      anythingllm:
        image: mintplexlabs/anythingllm:latest
        container_name: anythingllm
        restart: unless-stopped
        environment:
          # This variable is REQUIRED to prevent startup errors.
          - STORAGE_DIR=/app/server/storage
        volumes:
          # Persists all application data, documents, and settings.
          - anythingllm_storage:/app/server/storage
          # REQUIRED for MCP Agents (like GitHub) to be able to launch other Docker containers.
          - /var/run/docker.sock:/var/run/docker.sock
        networks:
          # Use the SAME network as your Caddy container.
          - waha-net
    ```

2.  **Define the Volume:** At the top level of the file (no indentation), add the new volume to your `volumes:` list.
    ```yaml
    volumes:
      n8n_data:
      caddy_data:
      anythingllm_storage: # <-- ADD THIS
    ```

### **5. Step 3: Caddy Reverse Proxy Configuration (`Caddyfile`)**

Edit your `Caddyfile` to tell Caddy how to handle requests for your new subdomain.

1.  Add a new block for the AnythingLLM subdomain. Caddy will automatically provision an SSL certificate for it.
    ```caddy
    # ... your existing Caddy configurations ...

    anythingllm.my-oracle-n8n.kozow.com {
        reverse_proxy anythingllm:3001
    }
    ```    This forwards all traffic from the public-facing subdomain to the `anythingllm` container on its internal port `3001`.

### **6. Step 4: Deployment and Verification**

1.  **Apply Docker Compose Changes:** Navigate to your project directory and run:
    ```bash
    docker compose up -d
    ```
    This will pull the AnythingLLM image and start the new container without interrupting your other running services.

2.  **Reload Caddy Configuration:** Apply the `Caddyfile` changes without downtime.
    ```bash
    docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
    ```

3.  **Access AnythingLLM:** Open your browser and navigate to `https://anythingllm.my-oracle-n8n.kozow.com`. You should see the initial setup wizard.

### **7. Essential Maintenance Commands**

*   **Restart a specific service:** `docker compose restart anythingllm`
*   **Stop a specific service:** `docker compose stop anythingllm`
*   **View logs for a service:** `docker compose logs -f anythingllm`
*   **Update AnythingLLM:**
    ```bash
    # Pull the latest image
    docker compose pull anythingllm
    # Recreate the container with the new image
    docker compose up -d
    ```

### **8. Comprehensive Troubleshooting Guide**

#### **A) Admin Password Reset (Definitive Method)**

If you lose your admin password and the built-in reset script is missing, you must manually delete the database to force the setup wizard to reappear.

1.  **Stop the container:**
    ```bash
    docker compose stop anythingllm
    ```
2.  **Identify the full volume name:** It is `[project_directory]_[volume_name]`. In this case, `my-automation-stack_anythingllm_storage`.
3.  **Delete the database file using a temporary helper container:**
    ```bash
    docker run --rm -v my-automation-stack_anythingllm_storage:/data alpine rm /data/anythingllm.db
    ```
4.  **Start the container:**
    ```bash
    docker compose start anythingllm
    ```
5.  Navigate to the URL in a private/incognito browser window to run the setup wizard again.

#### **B) Container is Crash-Looping or "Restarting"**

If `docker ps` shows the container is constantly restarting, check the logs first: `docker compose logs anythingllm`.

*   **Error: `WARNING: STORAGE_DIR environment variable is not set!`**
    *   **Cause:** The application requires this variable to know where to store data inside the container.
    *   **Solution:** Add the `environment` block to your `docker-compose.yml` as shown in Step 4.

#### **C) MCP Agent (GitHub Skill) Fails to Start**

*   **Error: `Failed to start MCP server: ... [ENOENT] spawn docker ENOENT`**
    *   **Cause:** The `anythingllm` container cannot communicate with the Docker engine on the host machine.
    *   **Solution:** Add the Docker socket volume mount to your `docker-compose.yml`: `- /var/run/docker.sock:/var/run/docker.sock`.

*   **Error: `Failed to start MCP server: ... [ERR_INVALID_URL]` or other startup issues.**
    *   **Cause:** You are using an incorrect format for the `anythingllm_mcp_servers.json` file.
    *   **Solution:** Ensure the file is placed in the volume at `/app/server/storage/plugins/`. Use the correct "dynamic runner" format that prompts for credentials in the UI, rather than a static format that hardcodes them.

#### **D) Caddy Fails to Reload**

*   **Error: `Error: no config file to load`**
    *   **Cause:** The `caddy reload` command needs to be told the path of the config file *inside the container*.
    *   **Solution:** Use the full command: `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.