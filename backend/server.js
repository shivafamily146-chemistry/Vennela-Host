import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";\nimport archiver from "archiver";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.PANEL_PASSWORD || "";
const SERVER_DIR = path.resolve(process.env.SERVER_DIR || "/data/server");
const SERVER_JAR = path.basename(process.env.SERVER_JAR || "server.jar");
const JAVA_ARGS = (process.env.JAVA_ARGS || "-Xms1G -Xmx3G").split(/\s+/).filter(Boolean);
const MAX_UPLOAD_MB = Math.max(1, Math.min(Number(process.env.MAX_UPLOAD_MB || 1024), 2048));
const sessions = new Map();
let minecraft = null;
let startedAt = null;
let logs = [];
let onlinePlayers = 0;
let reportedMaxPlayers = 30;

if (PASSWORD.length < 12) {
  console.error("PANEL_PASSWORD must be set to at least 12 characters.");
  process.exit(1);
}
fs.mkdirSync(SERVER_DIR, { recursive: true });
fs.mkdirSync(path.join(SERVER_DIR, ".incoming"), { recursive: true });

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.resolve("public")));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

function log(line) {
  const text = String(line);
  const match = text.match(/There are (\d+) of a max of (\d+) players online/i);
  if (match) {
    onlinePlayers = Number(match[1]);
    reportedMaxPlayers = Number(match[2]);
  }
  logs.push({ at: new Date().toISOString(), line: text.slice(0, 4000) });
  if (logs.length > 500) logs = logs.slice(-500);
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expires = sessions.get(token);
  if (!token || !expires || expires < Date.now()) {
    if (token) sessions.delete(token);
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
function insideRoot(real) {
  return real === SERVER_DIR || real.startsWith(SERVER_DIR + path.sep);
}
function assertParentContained(fullPath) {
  let parent = path.dirname(fullPath);
  while (!fs.existsSync(parent) && parent !== SERVER_DIR) parent = path.dirname(parent);
  const realParent = fs.realpathSync(parent);
  if (!insideRoot(realParent)) throw new Error("Parent path outside server directory");
}
function memoryUsage() {
  if (!minecraft?.pid) return null;
  try {
    const statusText = fs.readFileSync(`/proc/${minecraft.pid}/status`, "utf8");
    const match = statusText.match(/^VmRSS:\s+(\d+)\s+kB/m);
    return match ? Math.round(Number(match[1]) / 1024) : null;
  } catch { return null; }
}
function status() {
  const running = Boolean(minecraft && minecraft.exitCode === null);
  return {
    running,
    pid: running ? minecraft.pid : null,
    startedAt,
    uptimeSeconds: running && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    playersOnline: running ? onlinePlayers : 0,
    maxPlayers: 30,
    reportedMaxPlayers,
    memoryMb: running ? memoryUsage() : null,
    serverJar: SERVER_JAR,
    javaArgs: JAVA_ARGS.join(" ")
  };
}
function attachMinecraft(child) {
  minecraft = child;
  startedAt = Date.now();
  onlinePlayers = 0;
  child.stdout.on("data", data => log(data.toString()));
  child.stderr.on("data", data => log(data.toString()));
  child.on("error", error => log("Minecraft process error: " + error.message));
  child.on("exit", (code, signal) => {
    log(`Minecraft exited (code=${code}, signal=${signal})`);
    if (minecraft === child) {
      minecraft = null;
      startedAt = null;
      onlinePlayers = 0;
    }
  });
}
function launchMinecraft() {
  const jar = safePath(SERVER_JAR);
  if (!fs.existsSync(jar) || !fs.statSync(jar).isFile()) throw new Error(`Missing ${SERVER_JAR}. Upload Paper/Purpur as server.jar first.`);
  const propertiesPath = safePath("server.properties");
  let lines = fs.existsSync(propertiesPath) ? fs.readFileSync(propertiesPath, "utf8").split(/\r?\n/) : [];
  lines = lines.filter(line => !line.startsWith("max-players="));
  lines.push("max-players=30");
  fs.writeFileSync(propertiesPath, lines.join("\n") + "\n");
  const eulaPath = safePath("eula.txt");
  if (!fs.existsSync(eulaPath) || !/^(\s*)eula=true\s*$/m.test(fs.readFileSync(eulaPath, "utf8"))) {
    throw new Error("EULA not accepted. Read Minecraft EULA and create eula.txt with eula=true only if you agree.");
  }
  const child = spawn("java", [...JAVA_ARGS, "-jar", jar, "nogui"], { cwd: SERVER_DIR, stdio: ["pipe", "pipe", "pipe"] });
  attachMinecraft(child);
  log("Starting Minecraft process...");
}
app.post("/api/login", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), (req, res) => {
  const supplied = Buffer.from(String(req.body?.password || ""));
  const expected = Buffer.from(PASSWORD);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: "Incorrect password" });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  res.json({ token, expiresIn: 43200 });
});
app.post("/api/logout", auth, (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  sessions.delete(token);
  res.json({ loggedOut: true });
});
app.get("/api/status", auth, (_req, res) => res.json(status()));
app.get("/api/logs", auth, (_req, res) => res.json({ logs: logs.slice(-250) }));

app.post("/api/server/start", auth, (_req, res) => {
  if (minecraft && minecraft.exitCode === null) return res.status(409).json({ error: "Server already running" });
  try { launchMinecraft(); res.json({ accepted: true, status: status() }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/server/stop", auth, (_req, res) => {
  const child = minecraft;
  if (!child || child.exitCode !== null) return res.status(409).json({ error: "Server is not running" });
  child.stdin.write("stop\n");
  setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  }, 30_000).unref();
  res.json({ accepted: true, message: "Stop command sent" });
});
app.post("/api/server/restart", auth, (_req, res) => {
  const child = minecraft;
  if (!child || child.exitCode !== null) return res.status(409).json({ error: "Server is not running" });
  child.once("exit", () => {
    try { launchMinecraft(); }
    catch (error) { log("Restart failed: " + error.message); }
  });
  child.stdin.write("stop\n");
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
  const moved = [];
  try {
    const targetDir = safePath(req.body?.directory || "");
    assertParentContained(targetDir);
    fs.mkdirSync(targetDir, { recursive: true });
    if (!insideRoot(fs.realpathSync(targetDir))) throw new Error("Invalid destination directory");
    for (const file of req.files || []) {
      const name = path.basename(file.originalname.replaceAll("\\", "/")).replace(/[\r\n]/g, "_");
      if (!name || name.startsWith(".") || name === ".incoming") { fs.unlinkSync(file.path); continue; }
      const dest = path.join(targetDir, name);
      if (!insideRoot(path.resolve(dest))) { fs.unlinkSync(file.path); continue; }
      fs.renameSync(file.path, dest);
      moved.push(dest);
    }
    res.json({ uploaded: moved.map(file => path.basename(file)) });
  } catch (error) {
    for (const file of req.files || []) if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(400).json({ error: error.message });
  }
});
app.get("/api/files", auth, (req, res) => {
  try {
    const dir = safePath(req.query.path || "");
    const real = fs.realpathSync(dir);
    if (!insideRoot(real)) throw new Error("Path outside server directory");
    const entries = fs.readdirSync(real, { withFileTypes: true }).flatMap(entry => {
      if (entry.isSymbolicLink() || entry.name === ".incoming") return [];
      const full = path.join(real, entry.name);
      const stat = fs.statSync(full);
      return [{ name: entry.name, directory: stat.isDirectory(), size: stat.size }];
    });
    res.json({ path: req.query.path || "", entries });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get("/api/files/download", auth, (req, res) => {
  try {
    const file = safePath(req.query.path || "");
    const real = fs.realpathSync(file);
    if (!insideRoot(real) || !fs.statSync(real).isFile()) return res.status(404).json({ error: "File not found" });
    res.download(real);
  } catch (error) { res.status(404).json({ error: "File not found" }); }
});
app.delete("/api/files", auth, (req, res) => {
  try {
    const file = safePath(req.query.path || "");
    if (file === SERVER_DIR) return res.status(400).json({ error: "Cannot delete server root" });
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return res.status(400).json({ error: "Refusing to delete symbolic links" });
    const real = fs.realpathSync(file);
    if (!insideRoot(real)) throw new Error("Path outside server directory");
    fs.rmSync(real, { recursive: true, force: false });
    res.json({ deleted: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/files/mkdir", auth, (req, res) => {
  try {
    const dir = safePath(req.body?.path || "");
    if (dir === SERVER_DIR) return res.status(400).json({ error: "Folder path required" });
    assertParentContained(dir);
    fs.mkdirSync(dir);
    res.json({ created: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get("/api/files/text", auth, (req, res) => {
  try {
    const file = safePath(req.query.path || "");
    const allowed = /\\.(yml|yaml|properties|json|txt|cfg|conf|toml|md)$/i;
    if (!allowed.test(file)) return res.status(400).json({ error: "Unsupported text file" });
    const real = fs.realpathSync(file);
    if (!insideRoot(real) || !fs.statSync(real).isFile() || fs.statSync(real).size > 1024 * 1024) return res.status(400).json({ error: "File too large or invalid" });
    res.json({ content: fs.readFileSync(real, "utf8") });
  } catch (error) { res.status(404).json({ error: "File not found" }); }
});
app.put("/api/files/text", auth, (req, res) => {
  try {
    const file = safePath(req.body?.path || "");
    const allowed = /\.(yml|yaml|properties|json|txt|cfg|conf|toml|md)$/i;
    const content = String(req.body?.content ?? "");
    if (!allowed.test(file) || Buffer.byteLength(content, "utf8") > 1024 * 1024) return res.status(400).json({ error: "Only text config files up to 1 MB can be edited" });
    if (file === SERVER_DIR || (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())) return res.status(400).json({ error: "Invalid file" });
    assertParentContained(file);
    fs.writeFileSync(file, content, { encoding: "utf8", flag: "w" });
    res.json({ saved: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get("/api/backup", auth, (_req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="vennela-backup-${stamp}.zip"`);
  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", error => {
    log("Backup failed: " + error.message);
    if (!res.headersSent) res.status(500).end("Backup failed");
    else res.destroy(error);
  });
  archive.pipe(res);
  archive.directory(SERVER_DIR, false, entry => {
    if (entry.name.startsWith(".incoming/") || entry.name === ".incoming") return false;
    return entry;
  });
  archive.finalize();
});
\napp.get("/api/health", (_req, res) => res.json({ ok: true, service: "Vennela Host API" }));
app.use((error, _req, res, _next) => {
  log("API error: " + error.message);
  res.status(error instanceof multer.MulterError ? 413 : 500).json({ error: error instanceof multer.MulterError ? "Upload limit exceeded" : "Internal server error" });
});
app.listen(PORT, "0.0.0.0", () => console.log(`Vennela Host API listening on ${PORT}`));
process.on("SIGTERM", () => {
  if (minecraft && minecraft.exitCode === null) {
    minecraft.stdin.write("stop\n");
    setTimeout(() => process.exit(0), 5000).unref();
  } else process.exit(0);
});
