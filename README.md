# Vennela Host

Self-hosted Minecraft Java server control panel with a responsive web UI and Node.js API.

## Implemented
- Password login with 12-hour bearer sessions and login rate limiting
- Start / stop / restart a single Java server process
- Live process status, uptime and recent console output
- Console command submission
- Upload, browse, download, edit supported text configs, create folders and delete files under the server directory\n- Download a ZIP backup of server files
- Docker deployment with persistent storage and automatic container restart
- 30-player target setting in the dashboard

## Important
This is a self-hosted single-server panel, not a public multi-customer hosting provider. GitHub Pages hosts only the static frontend; it does not run this backend or a Minecraft process. A separate always-on Linux VM with persistent storage and public game ports is required. The 30-slot value is a configured target, not a performance guarantee. Real capacity depends on CPU, RAM, storage, world size, plugins, view distance and network.

World ZIPs are uploaded as files; they are not automatically extracted. Stop the server before replacing worlds. Install Paper/Purpur as `server.jar`. Accept Mojang's EULA only if you agree, by creating `eula.txt` with `eula=true`.

For Java/Bedrock crossplay, install compatible Geyser and Floodgate plugins for your Minecraft version and configure Geyser to listen on UDP 19132. Docker publishes Java TCP 25565 and Bedrock UDP 19132; allow those game ports in your cloud firewall. Keep TCP 3000 private behind HTTPS. This panel does not auto-install plugins or configure network ports.

## Cloud VM deployment (Ubuntu)
1. Install Docker Engine and the Docker Compose plugin.
2. Clone this repository on an always-on Ubuntu VM.
3. Copy `.env.example` to `.env`; set a unique random `PANEL_PASSWORD` (at least 12 characters).
4. The default JVM heap is `-Xms2G -Xmx5G`, intended as a starting point on an 8 GB host. Adjust it to leave memory for Ubuntu, Node.js and filesystem cache. For a 30-player target, actual capacity still depends on CPU, world, plugins and network.
5. Run `docker compose up -d --build`.
6. Point a domain's DNS A record to the VM. Install Caddy on the VM, copy `Caddyfile.example` to your Caddy config, replace `panel.example.com` with your domain, then reload Caddy. Caddy will obtain HTTPS certificates automatically. The panel port is bound to localhost only; keep it that way.
7. Set `CORS_ORIGINS` to the exact website origin (default: `https://shivafamily146-chemistry.github.io`) and restart the container after changing it.
8. Open the GitHub Pages website. On first login, enter the backend's HTTPS URL when prompted; it is saved in that browser. Then sign in, upload Paper/Purpur as `server.jar`, and start the server.

Do not commit `.env` or expose the panel without HTTPS. Uploaded JARs/plugins and console commands execute code on the host. Restrict access to trusted administrators and keep backups.

## Android app (APK)
The `app/` directory contains an Android Studio WebView client for the control panel. It does not run the Minecraft server itself; it connects to a panel already running on a phone or cloud VM. Remote panel URLs must use HTTPS. For Termux on the same phone, use `http://127.0.0.1:3000`.

To get an APK, open the repository's **Actions** tab, select **Build Vennela Host Android APK**, and download the `Vennela-Host-Android-debug` artifact after the workflow succeeds. This is a debug APK, not a Play Store-signed release.

## Android Termux
Docker deployment above targets a Linux VM. Android use requires installing Termux, Java 25 compatible runtime and Node.js, then running `backend/server.js` directly with `SERVER_DIR` set to a writable folder. Android battery management and network changes can stop hosting; phone hosting cannot guarantee 24/7 uptime. Keep the device powered and disable battery optimization for Termux. Public reachability may need router port forwarding or a secure tunnel.

## API
- `POST /api/login` — `{ "password": "..." }`
- `GET /api/status`, `GET /api/logs`
- `POST /api/server/start`, `/stop`, `/restart`
- `POST /api/console` — `{ "command": "say Hello" }`
- `GET /api/backup` — download ZIP backup\n- `GET /api/files?path=plugins`
- `POST /api/files/upload` — multipart field `files`, optional `directory`
- `GET /api/files/download?path=plugins/example.jar`
- `DELETE /api/files?path=plugins/example.jar`\n- `POST /api/files/mkdir` — `{ "path": "plugins/new-folder" }`\n- `GET /api/files/text?path=server.properties` and `PUT /api/files/text` — edit supported text config files

All API routes except login and health require a bearer token.
