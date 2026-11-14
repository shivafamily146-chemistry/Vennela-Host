import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.PANEL_PASSWORD || "";
const SERVER_DIR = path.resolve(process.env.SERVER_DIR || "/data/server");
const SERVER_JAR = process.env.SERVER_JAR || "server.jar";
const JAVA_ARGS = (process.env.JAVA_ARGS || "-Xms1G -Xmx3G").split(/\s+/).filter(Boolean);
const MAX_UPLOAD_MB = Math.min(Number(process.env.MAX_UPLOAD_MB || 1024), 2048);
const sessions = new Map();
let minecraft = null;
let startedAt = null;
let logs = [];
let stopping = false;

if (PASSWORD.length < 12) {
  console.error("PANEL_PASSWORD must be set to at least 12 characters.");
  process.exit(1);
}
fs.mkdirSync(SERVER_DIR, { recursive: true });
fs.mkdirSync(path.join(SERVER_DIR, ".incoming"), { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.resolve("public")));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

function log(line) {
  logs.push({ at: new Date().toISOString(), line: String(line).slice(0, 4000) });
  if (logs.length > 500) logs = logs.slice(-500);
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expires = sessions.get(token);
  if (!token || !expires || expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Login required" });
  }
  next();
}
function safePath(input = "") {
  const decoded = String(input).replaceAll("\\", "/");
  if (decoded.includes("\0") || path.posix.isAbsolute(decoded)) throw new Error("Invalid path");
  const full = path.resolve(SERVER_DIR, decoded);
  if (full !== SERVER_DIR && !full.startsWith(SERVER_DIR + path.sep)) throw new Error("Path outside server directory");
  return full;
}
function status() {
  return {
    running: Boolean(minecraft && minecraft.exitCode === null),
    pid: minecraft?.pid || null,
    startedAt,
    uptimeSeconds: startedAt && minecraft?.exitCode === null ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    maxPlayers: 30,
    serverJar: SERVER_JAR,
    javaArgs: JAVA_ARGS.join(" ")
  };
}
app.post("/api/login", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), (req, res) => {
  const supplied = String(req.body?.password || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Incorrect password" });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  res.json({ token, expiresIn: 43200 });
});
app.get("/api/status", auth, (_req, res) => res.json(status()));
app.get("/api/logs", auth, (_req, res) => res.json({ logs: logs.slice(-250) }));

app.post("/api/server/start", auth, (_req, res) => {
  if (minecraft && minecraft.exitCode === null) return res.status(409).json({ error: "Server already running" });
  const propertiesPath = safePath("server.properties");
  if (fs.existsSync(propertiesPath)) {
    const lines = fs.readFileSync(propertiesPath, "utf8").split(/\r?\n/).filter(line => !line.startsWith("max-players="));
    lines.push("max-players=30");
    fs.writeFileSync(propertiesPath, lines.join("\n") + "\n");
  } else {
    fs.writeFileSync(propertiesPath, "max-players=30\n");
  }
  const jar = safePath(SERVER_JAR);
  if (!fs.existsSync(jar)) return res.status(400).json({ error: `Missing ${SERVER_JAR}. Upload your Paper/Purpur JAR first.` });
  stopping = false;
  minecraft = spawn("java", [...JAVA_ARGS, "-jar", jar, "nogui"], { cwd: SERVER_DIR, stdio: ["pipe", "pipe", "pipe"] });
  startedAt = Date.now();
  minecraft.stdout.on("data", d => log(d.toString()));
  minecraft.stderr.on("data", d => log(d.toString()));
  minecraft.on("error", e => log("Process error: " + e.message));
  minecraft.on("exit", (code, signal) => {
    log(`Minecraft exited (code=${code}, signal=${signal})`);
    startedAt = null;
    minecraft = null;
  });
  log("Starting Minecraft process...");
  res.json({ accepted: true, status: status() });
});
app.post("/api/server/stop", auth, (_req, res) => {
  if (!minecraft || minecraft.exitCode !== null) return res.status(409).json({ error: "Server is not running" });
  stopping = true;
  minecraft.stdin.write("stop\n");
  setTimeout(() => {
    if (minecraft && minecraft.exitCode === null) minecraft.kill("SIGTERM");
  }, 30_000).unref();
  res.json({ accepted: true, message: "Stop command sent" });
});
app.post("/api/server/restart", auth, (_req, res) => {
  if (!minecraft || minecraft.exitCode !== null) return res.status(409).json({ error: "Server is not running; start it instead" });
  minecraft.stdin.write("stop\n");
  const child = minecraft;
  child.once("exit", () => {
    if (stopping) return;
    const jar = safePath(SERVER_JAR);
    minecraft = spawn("java", [...JAVA_ARGS, "-jar", jar, "nogui"], { cwd: SERVER_DIR, stdio: ["pipe", "pipe", "pipe"] });
    startedAt = Date.now();
    minecraft.stdout.on("data", d => log(d.toString()));
    minecraft.stderr.on("data", d => log(d.toString()));
    minecraft.on("exit", (code, signal) => { log(`Minecraft exited (code=${code}, signal=${signal})`); startedAt = null; minecraft = null; });
    log("Minecraft restarted.");
  });
  res.json({ accepted: true, message: "Restart requested" });
});
app.post("/api/console", auth, (req, res) => {
  const command = String(req.body?.command || "").trim();
  if (!command || command.length > 500 || /[\r\n\0]/.test(command)) return res.status(400).json({ error: "Invalid command" });
  if (!minecraft || minecraft.exitCode !== null) return res.status(409).json({ error: "Server is offline" });
  minecraft.stdin.write(command + "\n");
  log("> " + command);
  res.json({ sent: true });
});

const upload = multer({
  dest: path.join(SERVER_DIR, ".incoming"),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 10 }
});
app.post("/api/files/upload", auth, upload.array("files", 10), (req, res) => {
  const targetDir = safePath(req.body?.directory || "");
  fs.mkdirSync(targetDir, { recursive: true });
  const saved = [];
  for (const file of req.files || []) {
    const name = path.basename(file.originalname).replace(/[\r\n]/g, "_");
    if (!name || name.startsWith(".")) { fs.unlinkSync(file.path); continue; }
    const dest = path.join(targetDir, name);
    if (dest === SERVER_DIR || !dest.startsWith(SERVER_DIR + path.sep)) { fs.unlinkSync(file.path); continue; }
    fs.renameSync(file.path, dest);
    saved.push(name);
  }
  res.json({ uploaded: saved });
});
app.get("/api/files", auth, (req, res) => {
  try {
    const dir = safePath(req.query.path || "");
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map(e => {
      const p = path.join(dir, e.name);
      const s = fs.statSync(p);
      return { name: e.name, directory: e.isDirectory(), size: s.size };
    });
    res.json({ path: req.query.path || "", entries });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/files/download", auth, (req, res) => {
  try {
    const file = safePath(req.query.path || "");
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).json({ error: "File not found" });
    res.download(file);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/files", auth, (req, res) => {
  try {
    const file = safePath(req.query.path || "");
    if (file === SERVER_DIR) return res.status(400).json({ error: "Cannot delete server root" });
    fs.rmSync(file, { recursive: true, force: false });
    res.json({ deleted: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Vennela Host API" }));
app.listen(PORT, "0.0.0.0", () => console.log(`Vennela Host API listening on ${PORT}`));
process.on("SIGTERM", () => {
  if (minecraft && minecraft.exitCode === null) minecraft.kill("SIGTERM");
  process.exit(0);
});
