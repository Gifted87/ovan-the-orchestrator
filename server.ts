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
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }); // Uses process.env.GEMINI_API_KEY (Google AI Studio / Vertex)

// In-Memory state tracking for the active job process
let activeProcess: import("child_process").ChildProcessWithoutNullStreams | null = null;
let activeJobId: string | null = null;
let logClients: express.Response[] = [];
let pollingInterval: NodeJS.Timeout | null = null;

const DEFAULT_PHASES = [
  "ACN Genesis (Scaffolding)",
  "Architecture Breakdown & Compilation",
  "Unit Testing Suite",
  "Readme & Specifications Document"
];

function ensureIdleState() {
  const current = db.prepare("SELECT id FROM jobs WHERE status = 'running'").get() as { id: string } | undefined;
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

function broadcastLog(log: string) {
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

async function startSitrepsPolling(jobId: string) {
  const generateSitrep = async () => {
    if (!activeJobId || activeJobId !== jobId) return;
    
    // Get recent logs (approx last 500 lines to represent ~5000 words depending on density)
    const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 500').all(jobId) as {message: string}[];
    const logText = logs.reverse().map(l => l.message).join("\\n");
    if (!logText.trim()) return;

    // Get previous SITREPs as context
    const previousSitreps = db.prepare('SELECT message FROM sitreps WHERE job_id = ? ORDER BY timestamp ASC').all(jobId) as {message: string}[];
    
    let historyContext = "";
    if (previousSitreps.length > 0) {
      historyContext = "Previous Updates:\\n" + previousSitreps.map((s, i) => `Update ${i+1}: ${s.message}`).join("\\n\\n") + "\\n\\n";
    }

    const lastSitrep = db.prepare('SELECT timestamp FROM sitreps WHERE job_id = ? ORDER BY timestamp DESC LIMIT 1').get(jobId) as {timestamp: number} | undefined;
    const lastTimestamp = lastSitrep ? lastSitrep.timestamp : 0;
    const newLogs = db.prepare('SELECT COUNT(*) as c FROM logs WHERE job_id = ? AND timestamp > ?').get(jobId, lastTimestamp) as {c: number};
    
    // Only generate an update if there's actual new output (or it's the very first update)
    if (newLogs.c === 0 && lastTimestamp > 0) return;

    const prompt = `You are the strict fact-reporting AI for the Ovan Orchestrator. 
Your goal is to inform the user about the current status of their software generation/refinement task in a concise SITREP (Situation Report) update.
The user receives these updates automatically.

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
- If the logs only say "Starting Phase 1", simply state that the phase has commenced and the system is hanging or processing. 
- Be extremely clinical and honest. Your output is used by actual developers who hate LLM fluff.
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      
      const newUpdate = response.text || "Reporter AI could not generate an update.";
      
      db.prepare('INSERT INTO sitreps (id, job_id, timestamp, message) VALUES (?, ?, ?, ?)').run(uuidv4(), jobId, Date.now(), newUpdate);
      broadcastStateUpdate();
    } catch (e: any) {
      console.error("LLM Error:", e.message);
    }
  };

  // Run every 3 minutes (180,000 ms)
  pollingInterval = setInterval(generateSitrep, 180000);
  
  // Also run an initial brief update after 15 seconds to ensure the user knows it's alive
  setTimeout(generateSitrep, 15000);
}

function getJobState(jobId: string | null) {
  if (!jobId) {
    const lastJob = db.prepare('SELECT * FROM jobs ORDER BY startTime DESC LIMIT 1').get() as any;
    if (!lastJob) {
      return { status: "idle", startTime: null, lastActivityTime: null, phases: [], currentPhaseIndex: 0, feed: [], artifacts: [] };
    }
    jobId = lastJob.id;
  }

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
  if (!job) return { status: "idle", startTime: null, lastActivityTime: null, phases: [], currentPhaseIndex: 0, feed: [], artifacts: [] };

  const phases = db.prepare('SELECT id, name, status FROM phases WHERE job_id = ? ORDER BY phase_order ASC').all(jobId) as any[];
  const feed = db.prepare('SELECT id, timestamp, message FROM sitreps WHERE job_id = ? ORDER BY timestamp ASC').all(jobId) as any[];
  
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

  // We are skipping real artifacts reading from disk for now unless we search the path, 
  // but let's mock it or leave it empty so the UI doesn't crash
  const artifacts: any[] = []; 

  return {
    status: job.status,
    startTime: job.startTime,
    lastActivityTime: job.lastActivityTime,
    phases: phases.map((p: any) => ({ id: p.id, name: p.name, status: p.status })),
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
    const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp ASC').all(jobId) as {message: string}[];
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
    const args = ["-u", pyScript]; // -u forces unbuffered stdout
    if (pathOverride) {
      args.push("--path", pathOverride);
    } else {
      args.push(task);
    }

    activeProcess = spawn("python3", args, { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    
    activeProcess.stdout.on("data", (data) => {
      const text = data.toString();
      text.split('\n').forEach((line: string) => {
        if (line.trim()) {
           broadcastLog(line);
           // Try to do some rudimentary goal transitioning parsing
           if (line.includes("Phase 1 Complete")) {
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
      text.split('\n').forEach((line: string) => {
        if (line.trim()) broadcastLog(line);
      });
    });

    activeProcess.on("close", (code) => {
      if (activeJobId === jobId) {
        db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(code === 0 ? "completed" : "aborted", jobId);
        // Mark all remaining running phases completed
        db.prepare("UPDATE phases SET status = 'completed' WHERE job_id = ? AND status = 'running'").run(jobId);
        
        activeProcess = null;
        broadcastLog(`[OVAN PROCESS EXIT] Code: ${code}`);
        activeProcess = null;
        if (pollingInterval) clearInterval(pollingInterval);
        
        // Final SITREP after completion
        if (code === 0) {
            db.prepare('INSERT INTO sitreps (id, job_id, timestamp, message) VALUES (?, ?, ?, ?)').run(
                uuidv4(), jobId, Date.now(), 
                "Mission Accomplished! Ovan Orchestrator has completed all tasks successfully. The system state is now idle."
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
      const logs = db.prepare('SELECT message FROM logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 1000').all(activeJobId) as {message: string}[];
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
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://172.20.68.58:${PORT}`);
  });
}

startServer();
