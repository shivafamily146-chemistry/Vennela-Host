# Vennela Host — Web panel starter

Responsive browser dashboard for the Vennela Minecraft hosting project.

## Run locally
Open `index.html` in a browser, or serve this folder with any static web server.

## Current status
This is a frontend starter, not a live hosting service. Buttons intentionally report that a backend is required. File selection/drag-drop is local browser selection only; it does not transfer files to a server. Player count, RAM and uptime are placeholders.

## Required for a real hosting service
A secure backend and hosting worker are required to:
- provision and run Paper/Purpur Minecraft instances
- install/configure Geyser and Floodgate for Java/Bedrock crossplay
- enforce 30 player slots and resource limits
- upload JAR, ZIP, world and plugin files safely
- expose authenticated start/stop/restart, console, logs and metrics APIs
- isolate each customer's files/processes and prevent command/file path injection

Do not put hosting API secrets in browser JavaScript. Use authenticated server-side API routes, TLS, per-user authorization, upload size limits, malware scanning and audit logs.

## Suggested API contract
`POST /api/servers/:id/start`
`POST /api/servers/:id/stop`
`POST /api/servers/:id/restart`
`GET /api/servers/:id/status`
`GET /api/servers/:id/console`
`POST /api/servers/:id/console` with `{ "command": "say Hello" }`
`POST /api/servers/:id/files` multipart upload
`GET /api/servers/:id/files`

A real 24/7 service also needs an always-on host machine/cloud VM, monitoring, backups, networking and operational budget. A website alone cannot keep a Minecraft server running.
