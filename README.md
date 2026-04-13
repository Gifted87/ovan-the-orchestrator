# Ovan the Orchestrator

**Developed by Gift Braimah for the Autonomous Intelligence Community.**  
*Licensed under the MIT License. (c) 2026 Ovan the Orchestrator*

![Ovan Orchestrator](https://via.placeholder.com/1000x200?text=OVAN+THE+ORCHESTRATOR+-+SYSTEM+OF+SYSTEMS)

## 1. Executive Summary: The System of Systems

In the pursuit of Autonomous Software Synthesis, individual AI agents—no matter how advanced—are insufficient for end-to-end software lifecycle management. The **Autonomous Cognitive Network (ACN)** excels at macro-architectural bootstrapping (creating the boilerplate, wiring the databases, establishing the foundation). **ProCoder** excels at micro-architectural refinement (surgically altering the AST, fixing compilation errors, writing tests). 

However, a profound operational gap exists: *Who manages the transition?* Who monitors a multi-hour compilation loop? Who restarts an agent if it freezes? Who reads 50,000 lines of terminal logs to provide a human engineer with a concise progress update?

Enter **Ovan the Orchestrator**.

Ovan is the master control plane—the "CEO" of the autonomous engineering department. It is a full-stack, headless-capable orchestration engine that securely manages the lifecycle of both ACN and ProCoder. Ovan completely removes the human from the loop during the grueling, multi-hour "grind" of software synthesis. It automatically hands off the ACN-generated codebase to ProCoder, forcefully injects strict refinement goals, simulates a human engineer to approve code diffs, handles agent freezes via watchdog timeouts, and translates raw terminal noise into clinical, executive-level Situation Reports (SITREPs) using a dedicated secondary LLM.

### The Goal of the System
The ultimate goal of Ovan is to achieve **Zero-Touch, AGI-Level System Generation**. A human engineer simply types a goal into the Ovan UI, clicks "Initialize," and walks away. Ovan handles the orchestration of the underlying systems, transforming a raw prompt into a compiled, unit-tested, and exhaustively documented production-ready repository.

---

## 2. The Philosophy of Orchestration

Ovan operates on several core engineering philosophies designed to tame the non-deterministic, chaotic nature of interacting with complex LLM agents.

### 2.1 The "Ghost in the Machine" (PTY Automation)
ProCoder is inherently designed as a Human-in-the-Loop (HITL) system. It presents an interactive terminal UI (TUI) and asks the user for permission before applying codebase patches (`(y)es`, `(n)o`). To achieve total autonomy, Ovan utilizes an advanced Pseudo-Terminal (PTY) automation engine (via Python's `pexpect`). 

Ovan wraps the ProCoder process, intercepts its standard output in real-time, and programmatically injects human responses. When ProCoder asks to apply a patch, Ovan's automation engine instantly replies `y`. Ovan effectively acts as a tireless, infinitely patient "Ghost in the Machine," supervising the AI agents at machine speed.

### 2.2 Clinical Observability (The SITREP Engine)
When an autonomous system runs for 4 hours, it generates tens of thousands of lines of terminal logs. Human engineers suffer from "log fatigue" and cannot easily discern if the system is making progress or looping. 

Ovan introduces the **SITREP (Situation Report) Engine**. Every 3 minutes, Ovan's Node.js backend scrapes the last 500 lines of raw terminal output from the SQLite database. It feeds this raw data—along with a historical context buffer—into a secondary LLM (Gemini 2.5 Flash). The prompt given to this LLM is ruthlessly strict: *"DO NOT hallucinate. DO NOT invent progress. Write a clinical, precise update."* 

The result is a clean, timeline-based feed in the UI that tells the engineer exactly what is happening (e.g., *"Update 4: The agent is currently resolving a dependency conflict in the Ecto schema. It has successfully compiled the Auth module and is now running unit tests."*). 

### 2.3 Resiliency via Absolute Silence Timeouts
LLMs occasionally hallucinate, freeze, or enter infinite cognitive loops where they stop outputting data. Ovan implements a brutal watchdog mechanism. If the supervised agent fails to output a single line of text to the terminal for 30 minutes (`IDLE_TIMEOUT_SECONDS = 1800`), Ovan assumes the agent has suffered a catastrophic cognitive failure. Ovan will ruthlessly kill the pseudo-terminal process, cleanly restart the session, issue a `/new` command to flush corrupted context, and re-inject the goal from scratch.

---

## 3. The Dual-Phase Pipeline

When a job is initialized in Ovan, it executes a deterministic, two-phase pipeline defined in the `ovan.py` execution engine.

### Phase 1: ACN Genesis (Macro-Architecture Bootstrapping)
Ovan begins by invoking the Autonomous Cognitive Network.
1.  **Ignition**: Ovan executes `mix acn.genesis --task "<USER_PROMPT>"`.
2.  **Streaming**: Ovan pipes the raw stdout of the ACN swarm into its SQLite database, broadcasting it to the frontend via Server-Sent Events (SSE).
3.  **Interception**: Ovan scans the output stream for a specific termination marker: `Codebase: <path>`. 
4.  **Handoff**: Once ACN finishes synthesizing the macro-architecture, Ovan extracts the absolute path of the newly generated workspace and gracefully terminates Phase 1.

### Phase 2: ProCoder Refinement (Micro-Architecture & Hardening)
With the boilerplate generated, Ovan navigates to the `PROCODER_HOME` directory and launches the ProCoder interactive CLI, pointing it at the ACN-generated workspace. Ovan then programmatically forces ProCoder through **Three Strict Refinement Goals**:

#### Goal 1: Architecture Compilation & Resolution
Ovan issues a massive prompt commanding ProCoder to recursively crawl the codebase, map every module, ensure all imports are correct, install missing dependencies, and—crucially—**compile and run the entire project until zero errors remain.** Ovan sits in a loop, auto-approving ProCoder's patches up to 500 times, ensuring the agent has the freedom to brutally refactor the ACN code until the system mathematically compiles.

#### Goal 2: Exhaustive Unit Testing
Once the project compiles, Ovan flushes the terminal buffer, issues a `/new` command to reset the agent's context window, and injects the second goal. ProCoder is commanded to write a unit test suite for *every single module and submodule*. Furthermore, it is commanded that if a test fails due to a flaw in the actual implementation, it must *fix the implementation*, not the test. It must loop until `mix test` (or equivalent) passes flawlessly.

#### Goal 3: Documentation Synthesis
Finally, Ovan resets the agent again and commands it to write a 3000-word `README.md` and a 3000-word specifications document. ProCoder must use the `ls` command to explore the final, compiled state of the repository and document the entire architecture, design, and implementation details.

When the `finish` tool is invoked after Goal 3, Ovan intercepts the signal, cleanly shuts down the ProCoder PTY, marks the job as `completed` in the database, and generates a final SITREP.

---

## 4. Architectural Stack & Infrastructure

Ovan is built on a highly responsive, modern tech stack designed to handle massive volumes of streaming text while providing a sleek, executive-level user interface.

### 4.1 The Backend (Node.js & Express)
The control server (`server.ts`) is built on Node.js using Express.
*   **Job Management**: Exposes a REST API to start, abort, and retrieve historical jobs.
*   **Server-Sent Events (SSE)**: Provides a `/api/stream` endpoint. When `ovan.py` generates a log line, the backend instantly pushes it to all connected frontend clients without the overhead of WebSocket framing.
*   **Process Management**: Uses Node's `child_process.spawn` to instantiate the Python orchestrator, capturing `stdout` and `stderr` natively.

### 4.2 Persistence (SQLite in WAL Mode)
Because Ovan must write hundreds of log lines per second while simultaneously reading them for the SITREP engine and the frontend, standard database configurations would lock and crash. 
Ovan uses `better-sqlite3` configured with **Write-Ahead Logging (`journal_mode = WAL`)**.
The schema is rigorously structured into four tables:
1.  `jobs`: Tracks high-level execution state (running, completed, aborted).
2.  `phases`: Tracks the progress of the 4 predefined pipeline phases.
3.  `logs`: An append-only ledger of every raw terminal character emitted by the agents.
4.  `sitreps`: The clinical, AI-generated timeline summaries.

### 4.3 The Frontend (React & Vite)
The user interface is a sleek, dark-mode/light-mode ready Single Page Application (SPA) built with React, TailwindCSS, and Vite.
*   **Job Sidebar**: A historical archive of all past and currently running missions.
*   **Timeline View**: A minimalist feed displaying the AI-generated SITREPs, keeping the user informed without overwhelming them.
*   **Terminal Drawer**: A slide-out, auto-scrolling terminal window that allows the engineer to "peek under the hood" and watch the raw output of ACN and ProCoder in real-time.
*   **Artifact Viewer**: A live file-explorer that allows the user to browse the ACN-generated workspace directly from the browser as the agents create it.

---

## 5. Security & Isolation

As Ovan orchestrates agents capable of executing arbitrary shell commands, it enforces strict boundary protocols.

### 5.1 Path Overrides & Workspace Sandboxing
Ovan never executes code in its own directory. By default, it bridges the `ACN_HOME` and `PROCODER_HOME` directories via environment variables. When initiating a job, the user can provide an explicit `pathOverride`. If provided, Ovan skips the ACN Genesis phase entirely and commands ProCoder to aggressively refine the exact absolute path provided by the user.

### 5.2 Abort Sovereignty
If the user notices an agent engaging in destructive behavior via the Terminal Drawer, they can click the "Abort" button in the UI. The Express backend will instantly send a `SIGTERM` to the `ovan.py` orchestrator, which in turn violently severs the PTY connection to ProCoder, instantly halting all filesystem and shell operations.

---

## 6. Installation & Configuration

Ovan is designed to sit alongside your existing ACN and ProCoder installations. 

### 6.1 Prerequisites
*   **Node.js** (v18+)
*   **Python** (3.10+) with the `pexpect` library (`pip install pexpect`).
*   **Google Gemini API Key** (For the SITREP Reporter AI).
*   Valid, functioning installations of **ACN** and **ProCoder**.

### 6.2 Environment Setup

Ovan requires several environment variables to function correctly. You can set these in a `.env` file in the project root or export them directly in your shell.

#### Option A: Using a .env file (Recommended)
Copy the provided example file and fill in your values:
```bash
cp .env.example .env
```
Then edit `.env` with your preferred editor:

| Variable | Description | Required |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Your Google Gemini API key (used for SITREP generation). | **Yes** |
| `ACN_HOME` | Absolute path to your ACN installation directory. | **Yes** |
| `PROCODER_HOME` | Absolute path to your ProCoder system directory. | **Yes** |
| `APP_URL` | The base URL where the application is hosted (e.g., `http://localhost:3000`). | No |
| `DISABLE_HMR` | Set to `true` to disable Vite's Hot Module Replacement (useful for stable editing). | No |

#### Option B: Exporting via Shell
Alternatively, you can export these variables directly in your terminal before running the application:
```bash
export GEMINI_API_KEY="AIzaSy..."
export ACN_HOME="/home/user/acn"
export PROCODER_HOME="/home/user/procoder"
```

### 6.3 Installation
Install the Node dependencies for the backend and frontend.
```bash
npm install
```

### 6.4 Execution
Ovan provides a unified startup script. Running the `dev` command will start the Vite frontend, the Express backend, and automatically initialize the SQLite WAL database.

```bash
npm run dev
```

The server will output:
```text
Server running on:
  - Local:   http://localhost:3000
```

---

## 7. Operational Workflow: Using Ovan

### 7.1 Initiating an Orchestration
1.  Navigate to `http://localhost:3000`.
2.  In the **New Orchestration** panel, input your "Task Parameters" (The Prime Directive). 
    *Example: "Build a distributed Erlang key-value store with an HTTP API wrapper."*
3.  Click **Initialize Agents**.

### 7.2 Monitoring the Swarm
Once initialized, you will be taken to the **Active Orchestration** view.
*   **The Pipeline Tracker**: On the right side, you will see the pipeline moving from *ACN Genesis (Code Generation)* to *Architecture Breakdown & Compilation*, etc.
*   **Live Logs**: Click the "Live Logs" button in the header to slide out the raw terminal drawer. Here you will see the exact thoughts, tools, and bash commands executed by ACN and ProCoder.
*   **Reporter AI Timeline**: Every 3 minutes, a new clinical update will appear in the main feed, translating the raw terminal output into an executive summary.

### 7.3 Bypassing ACN (ProCoder-Only Mode)
If you already possess a codebase that you want Ovan to aggressively harden and unit-test, you can skip Phase 1.
1.  In the New Orchestration panel, leave the "Task Parameters" blank (or provide specific refinement instructions).
2.  Fill in the **Local Path Override** with the absolute path to your existing project (e.g., `/home/user/legacy_project`).
3.  Click Initialize. Ovan will bypass ACN and immediately unleash ProCoder on the provided directory.

---

## 8. The Future of Orchestration

Ovan represents the crucial "Layer 3" in the Autonomous Intelligence stack. 
1.  **Layer 1**: The Agents (The specialized tools).
2.  **Layer 2**: The Systems (ACN for building, ProCoder for refining).
3.  **Layer 3**: The Orchestrator (Ovan for managing the lifecycle, timeouts, and human-readable translation).

By removing the human engineer from the grueling, repetitive oversight loop of multi-hour generation and compilation cycles, Ovan the Orchestrator fulfills the ultimate promise of the ACN ecosystem: true, zero-touch, AGI-grade software synthesis.