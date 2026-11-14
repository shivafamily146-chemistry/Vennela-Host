#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. In Termux run: pkg install nodejs-lts"
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "Java is missing. Install a Java runtime compatible with your Minecraft server."
  exit 1
fi

read -r -s -p "Create panel password (minimum 12 characters): " PANEL_PASSWORD
echo
if [ "${#PANEL_PASSWORD}" -lt 12 ]; then
  echo "Password must be at least 12 characters."
  exit 1
fi

export PANEL_PASSWORD
export SERVER_DIR="${SERVER_DIR:-$HOME/vennela-server}"
export SERVER_JAR="${SERVER_JAR:-server.jar}"
export JAVA_ARGS="${JAVA_ARGS:--Xms1G -Xmx3G}"
export PORT="${PORT:-3000}"

mkdir -p "$SERVER_DIR" "$ROOT/backend/public"
cp "$ROOT/index.html" "$ROOT/style.css" "$ROOT/app.js" "$ROOT/manifest.json" "$ROOT/service-worker.js" "$ROOT/backend/public/"
cd "$ROOT/backend"
npm install --omit=dev
echo
echo "Vennela Host panel: http://127.0.0.1:$PORT"
echo "Minecraft Java port: 25565/TCP (configure your network separately)"
echo "Bedrock port: 19132/UDP (requires Geyser/Floodgate plugin setup)"
echo "Server files folder: $SERVER_DIR"
exec node server.js
