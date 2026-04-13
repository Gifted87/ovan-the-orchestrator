import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite DB
const dbFile = path.join(process.cwd(), "ovan.sqlite");
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

// Setup DB Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT, -- 'idle', 'running', 'completed', 'aborted'
    startTime INTEGER,
    lastActivityTime INTEGER,
    task TEXT,
    pathOverride TEXT
  );
  
  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    phase_order INTEGER,
    name TEXT,
    status TEXT -- 'pending', 'running', 'completed'
  );
  
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    timestamp INTEGER,
    message TEXT
  );
  
  CREATE TABLE IF NOT EXISTS sitreps (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    timestamp INTEGER,
    message TEXT
  );
`);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// In-Memory state tracking for the active job process
let activeProcess = null;
let activeJobId = null;
let logClients = [];
let pollingInterval = null;

const DEFAULT_PHASES = [
  "ACN Genesis (Code Generation)",
  "Architecture Breakdown & Compilation",
  "Unit Testing Suite",
  "Readme & Specifications Document"
];

function ensureIdleState() {
  const current = db.prepare("SELECT id FROM jobs WHERE status = 'running'").get();
  if (current) {
    db.prepare("UPDATE jobs SET status = 'aborted' WHERE id = ?").run(current.id);
  }
}
ensureIdleState();

function broadcastStateUpdate() {
  if (!activeJobId) return;
  const state = getJobState(activeJobId);
  logClients.forEach((client) => {
    client.write(`data: ${JSON.stringify({ type: "state_update", state })}\n\n`);
  });
}

function broadcastLog(log) {
  if (!activeJobId) return;
  db.prepare('UPDATE jobs SET lastActivityTime = ? WHERE id = ?').run(Date.now(), activeJobId);
  db.prepare('INSERT INTO logs (job_id, timestamp, message) VALUES (?, ?, ?)').run(activeJobId, Date.now(), log);
  
  logClients.forEach((client) => {
    client.write(`data: ${JSON.stringify({ log })}\n\n`);
  });
}

function stopJobProcess() {
  if (activeJobId && activeProcess) {
    db.prepare("UPDATE jobs SET status = 'aborted' WHERE id = ?").run(activeJobId);
    activeProcess.kill("SIGTERM");
    activeProcess = null;
  }
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (activeJobId) {
    broadcastStateUpdate();
    activeJobId = null;
  }
}

async function startSitrepsPolling(jobId) {
  const generateSitrep = async () => {
    if (!activeJobId || activeJobId !== jobId) return;
    
    const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 500').all(jobId);
    const logText = logs.reverse().map(l => l.message).join("\n");
    if (!logText.trim()) return;

    const previousSitreps = db.prepare('SELECT message FROM sitreps WHERE job_id = ? ORDER BY timestamp ASC').all(jobId);
    
    let historyContext = "";
    if (previousSitreps.length > 0) {
      historyContext = "Previous Updates:\n" + previousSitreps.map((s, i) => `Update ${i+1}: ${s.message}`).join("\n\n") + "\n\n";
    }

    const lastSitrep = db.prepare('SELECT timestamp FROM sitreps WHERE job_id = ? ORDER BY timestamp DESC LIMIT 1').get(jobId);
    const lastTimestamp = lastSitrep ? lastSitrep.timestamp : 0;
    const newLogs = db.prepare('SELECT COUNT(*) as c FROM logs WHERE job_id = ? AND timestamp > ?').get(jobId, lastTimestamp);
    
    if (newLogs.c === 0 && lastTimestamp > 0) return;

    const prompt = `You are the strict fact-reporting AI for the Ovan Orchestrator. 
Your goal is to inform the user about the current status of their software generation/refinement task in a concise SITREP (Situation Report) update.

${historyContext}
Here are the most recent Raw Terminal Logs from the background process:
"""
${logText.substring(0, 30000)}
"""

Based STRICTLY AND ONLY on these exact logs, write a clinical, precise update (1 paragraph max) detailing:
1. Exactly what the agent is currently doing.
2. Any real errors or milestones visible in the raw text.

CRITICAL INSTRUCTIONS: 
- DO NOT hallucinate, fabricate, or assume any progress that is not explicitly written in the logs. 
- DO NOT invent PIDs, node IDs, success messages, or milestones. 
- Be extremely clinical and honest.
`;

    try {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });
      const response = await model.generateContent(prompt);
      const newUpdate = response.response.text();
      
      db.prepare('INSERT INTO sitreps (id, job_id, timestamp, message) VALUES (?, ?, ?, ?)').run(uuidv4(), jobId, Date.now(), newUpdate);
      broadcastStateUpdate();
    } catch (e) {
      console.error("LLM Error:", e.message);
    }
  };

  pollingInterval = setInterval(generateSitrep, 180000);
  setTimeout(generateSitrep, 15000);
}

function scanArtifacts(dir) {
  const artifacts = [];
  const IGNORE_DIRS = [".git", "node_modules", ".venv", "__pycache__", "dist", ".gemini", ".next"];
  const IGNORE_FILES = ["ovan.sqlite", "ovan.sqlite-wal", "ovan.sqlite-shm", ".DS_Store", "package-lock.json"];
  const TEXT_EXTS = [".txt", ".md", ".py", ".js", ".ts", ".tsx", ".html", ".css", ".json", ".yaml", ".yml", ".sh"];

  try {
    if (!fs.existsSync(dir)) return [];
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        if (IGNORE_DIRS.includes(item.name)) continue;
        // Search one level deep for now to avoid massive traversal
        const subItems = fs.readdirSync(path.join(dir, item.name), { withFileTypes: true });
        for (const sub of subItems) {
           if (sub.isFile() && !IGNORE_FILES.includes(sub.name)) {
             const ext = path.extname(sub.name).toLowerCase();
             if (TEXT_EXTS.includes(ext)) {
               const filePath = path.join(dir, item.name, sub.name);
               const stats = fs.statSync(filePath);
               if (stats.size < 200000) { // 200KB limit
                 artifacts.push({
                   name: path.join(item.name, sub.name),
                   content: fs.readFileSync(filePath, "utf-8")
                 });
               }
             }
           }
        }
      } else if (item.isFile()) {
        if (IGNORE_FILES.includes(item.name)) continue;
        const ext = path.extname(item.name).toLowerCase();
        if (TEXT_EXTS.includes(ext)) {
          const filePath = path.join(dir, item.name);
          const stats = fs.statSync(filePath);
          if (stats.size < 200000) {
            artifacts.push({
              name: item.name,
              content: fs.readFileSync(filePath, "utf-8")
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("Artifact Scan Error:", e.message);
  }
  return artifacts;
}

function getJobState(jobId) {
  if (!jobId) {
    const lastJob = db.prepare('SELECT * FROM jobs ORDER BY startTime DESC LIMIT 1').get();
    if (!lastJob) {
      return { status: "idle", startTime: null, lastActivityTime: null, phases: [], currentPhaseIndex: 0, feed: [], artifacts: [] };
    }
    jobId = lastJob.id;
  }

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return { status: "idle", startTime: null, lastActivityTime: null, phases: [], currentPhaseIndex: 0, feed: [], artifacts: [] };

  const phases = db.prepare('SELECT id, name, status FROM phases WHERE job_id = ? ORDER BY phase_order ASC').all(jobId);
  const feed = db.prepare('SELECT id, timestamp, message FROM sitreps WHERE job_id = ? ORDER BY timestamp ASC').all(jobId);
  
  let currentPhaseIndex = 0;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].status === "running" || phases[i].status === "pending") {
      currentPhaseIndex = i;
      break;
    }
    if (phases[i].status === "completed" && i === phases.length - 1) {
      currentPhaseIndex = i;
    }
  }

  const scanPath = job.pathOverride || process.cwd();
  const artifacts = scanArtifacts(scanPath); 

  return {
    id: job.id,
    status: job.status,
    startTime: job.startTime,
    lastActivityTime: job.lastActivityTime,
    task: job.task,
    phases: phases.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    currentPhaseIndex,
    feed,
    artifacts
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/job", (req, res) => {
    res.json(getJobState(activeJobId));
  });

  app.get("/api/jobs", (req, res) => {
    const jobs = db.prepare('SELECT id, status, startTime, task, lastActivityTime FROM jobs ORDER BY startTime DESC').all();
    res.json(jobs);
  });

  app.get("/api/job/:id", (req, res) => {
    const jobId = req.params.id;
    res.json(getJobState(jobId));
  });

  app.get("/api/job/:id/logs", (req, res) => {
    const jobId = req.params.id;
    const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp ASC').all(jobId);
    res.json(logs.map(l => l.message));
  });

  app.post("/api/job/start", (req, res) => {
    if (activeJobId && activeProcess) {
      stopJobProcess();
    }

    const { task, pathOverride } = req.body;
    const jobId = uuidv4();
    activeJobId = jobId;

    db.prepare('INSERT INTO jobs (id, status, startTime, lastActivityTime, task, pathOverride) VALUES (?, ?, ?, ?, ?, ?)')
      .run(jobId, "running", Date.now(), Date.now(), task || "", pathOverride || "");

    const insertPhase = db.prepare('INSERT INTO phases (job_id, phase_order, name, status) VALUES (?, ?, ?, ?)');
    DEFAULT_PHASES.forEach((name, i) => {
      insertPhase.run(jobId, i, name, i === 0 ? "running" : "pending");
    });

    const pyScript = path.join(process.cwd(), "ovan.py");
    const args = ["-u", pyScript];
    if (pathOverride) {
      args.push("--path", pathOverride);
    } else {
      args.push(task);
    }

    activeProcess = spawn("python3", args, { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    
    activeProcess.stdout.on("data", (data) => {
      const text = data.toString();
      text.split('\n').forEach((line) => {
        if (line.trim()) {
           broadcastLog(line);
           if (line.includes("Starting Phase 2")) {
             db.prepare("UPDATE phases SET status = 'completed' WHERE job_id = ? AND phase_order = 0").run(jobId);
             db.prepare("UPDATE phases SET status = 'running' WHERE job_id = ? AND phase_order = 1").run(jobId);
             broadcastStateUpdate();
           } else if (line.includes("Goal 2")) {
             db.prepare("UPDATE phases SET status = 'completed' WHERE job_id = ? AND phase_order = 1").run(jobId);
             db.prepare("UPDATE phases SET status = 'running' WHERE job_id = ? AND phase_order = 2").run(jobId);
             broadcastStateUpdate();
           } else if (line.includes("Goal 3")) {
             db.prepare("UPDATE phases SET status = 'completed' WHERE job_id = ? AND phase_order = 2").run(jobId);
             db.prepare("UPDATE phases SET status = 'running' WHERE job_id = ? AND phase_order = 3").run(jobId);
             broadcastStateUpdate();
           }
        }
      });
    });

    activeProcess.stderr.on("data", (data) => {
      const text = data.toString();
      text.split('\n').forEach((line) => {
        if (line.trim()) broadcastLog(line);
      });
    });

    activeProcess.on("close", (code) => {
      if (activeJobId === jobId) {
        db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(code === 0 ? "completed" : "aborted", jobId);
        db.prepare("UPDATE phases SET status = 'completed' WHERE job_id = ? AND status = 'running'").run(jobId);
        
        broadcastLog(`[OVAN PROCESS EXIT] Code: ${code}`);
        activeProcess = null;
        if (pollingInterval) clearInterval(pollingInterval);
        
        if (code === 0) {
            db.prepare('INSERT INTO sitreps (id, job_id, timestamp, message) VALUES (?, ?, ?, ?)').run(
                uuidv4(), jobId, Date.now(), 
                "Mission Accomplished! Ovan Orchestrator has completed all tasks successfully."
            );
            broadcastStateUpdate();
        }
      }
    });

    startSitrepsPolling(jobId);
    broadcastStateUpdate();
    res.json({ success: true, state: getJobState(jobId) });
  });

  app.post("/api/job/abort", (req, res) => {
    stopJobProcess();
    res.json({ success: true, state: getJobState(activeJobId) });
  });

  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "state_update", state: getJobState(activeJobId) })}\n\n`);

    const sendHistory = () => {
      if (!activeJobId) return;
      const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 1000').all(activeJobId);
      logs.reverse().forEach(l => {
         res.write(`data: ${JSON.stringify({ log: l.message })}\n\n`);
      });
    };
    sendHistory();

    logClients.push(res);
    req.on("close", () => {
      logClients = logClients.filter((client) => client !== res);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // SPA Fallback for Browser History API
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
