# Vennela Host

Self-hosted Minecraft Java server control panel with a responsive web UI and Node.js API.

## Implemented
- Password login with 12-hour bearer sessions and login rate limiting
- Start / stop / restart a single Java server process
- Live process status, uptime and recent console output
- Console command submission
- Upload, browse, download and delete files under the server directory
- Docker deployment with persistent storage and automatic container restart
- 30-player target setting in the dashboard

## Important
This is a self-hosted single-server panel, not a public multi-customer hosting provider. The 30-slot value is a configured target, not a performance guarantee. Real capacity depends on CPU, RAM, storage, world size, plugins, view distance and network.

World ZIPs are uploaded as files; they are not automatically extracted. Stop the server before replacing worlds. Install Paper/Purpur as `server.jar`. Accept Mojang's EULA only if you agree, by creating `eula.txt` with `eula=true`.

For Java/Bedrock crossplay, install compatible Geyser and Floodgate plugins for your Minecraft version and configure UDP 19132 in your host firewall. This panel does not auto-install plugins or configure network ports.

## Cloud VM deployment (Ubuntu)
1. Install Docker Engine and the Docker Compose plugin.
2. Clone this repository on an always-on Ubuntu VM.
3. Copy `.env.example` to `.env`; set a unique random `PANEL_PASSWORD` (at least 12 characters).
4. Choose `JAVA_ARGS` based on VM memory. For a 30-player target, consider a VM with 6–8 GB RAM or more; actual needs vary.
5. Run `docker compose up -d --build`.
6. Put the panel behind HTTPS using Caddy or Nginx. Bind public access through a reverse proxy and firewall port 3000 from the internet.
7. Open the HTTPS URL, sign in, upload Paper/Purpur as `server.jar`, then start the server.

Do not commit `.env` or expose the panel without HTTPS. Uploaded JARs/plugins and console commands execute code on the host. Restrict access to trusted administrators and keep backups.

## Android Termux
Docker deployment above targets a Linux VM. Android use requires installing Termux, Java 25 compatible runtime and Node.js, then running `backend/server.js` directly with `SERVER_DIR` set to a writable folder. Android battery management and network changes can stop hosting; phone hosting cannot guarantee 24/7 uptime. Keep the device powered and disable battery optimization for Termux. Public reachability may need router port forwarding or a secure tunnel.

## API
- `POST /api/login` — `{ "password": "..." }`
- `GET /api/status`, `GET /api/logs`
- `POST /api/server/start`, `/stop`, `/restart`
- `POST /api/console` — `{ "command": "say Hello" }`
- `GET /api/files?path=plugins`
- `POST /api/files/upload` — multipart field `files`, optional `directory`
- `GET /api/files/download?path=plugins/example.jar`
- `DELETE /api/files?path=plugins/example.jar`

All API routes except login and health require a bearer token.
