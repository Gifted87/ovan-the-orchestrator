# Ovan: The Orchestrator

> **"The engine of autonomous refinement, bridging the gap between raw code generation and production-ready excellence."**

Ovan is a sophisticated Python-based orchestration engine designed to manage the end-to-end lifecycle of autonomous software development. It serves as the conductor for **The Genesis Machine's** core components—**ACN** and **ProCoder**—integrating advanced LLM-based critique loops to ensure every line of code meets strict production standards.

---

## 🌌 Overview

Ovan automates the progression from a conceptual task to a verified, tested, and documented codebase. It moves beyond simple generation by implementing a multi-stage pipeline that includes architectural analysis, rigorous unit testing, and iterative "Critic Agent" reviews powered by Gemini 3 Flash preview.

### Core Value Proposition
- **End-to-End Automation**: From `mix acn.genesis` to a fully hardened project.
- **Iterative Refinement**: Uses state-machine logic to recover from freezes, timeouts, or terminal errors.
- **AI-Driven Quality Control**: Integrates Gemini 3 Flash preview as a "Critic Agent" and "Final Reviewer" to find stubs, wiring breaks, and architectural flaws that traditional linters miss.

---

## 🛠 The 4-Phase Pipeline

Ovan operates through four distinct phases of development:

### Phase 1: ACN Genesis
The orchestrator initiates **ACN Genesis** to generate the initial codebase from a high-level task description. It monitors the output in real-time, extracts the target workspace path, and prepares the system for refinement.

### Phase 2: ProCoder Baseline Refinement
Using **ProCoder**, Ovan executes a strict 3-goal refinement sequence:
1.  **Architecture Breakdown**: Recursively maps every module, submodule, and file. It validates imports and ensures the project compiles.
2.  **Robust Testing**: Generates and executes a comprehensive unit test suite for every component. It refuses to proceed until every test passes.
3.  **Documentation Mastery**: Produces a 3000-word README and a 3000-word technical specification, codifying the system design.

### Phase 3: Critic Agent Evaluation
Ovan consolidates the entire codebase and feeds it into **Gemini 3 Flash preview**. The "Critic Agent" looks for:
- Logic stubs and "TODO" comments.
- Wiring breaks or unimplemented features.
- Semantic and syntax bugs.
The findings are then injected back into ProCoder for automated resolution.

### Phase 4: Final Production Review
The "Final Reviewer" (Gemini 3 Flash preview) performs a terminal assessment. It iterates up to 3 times, demanding perfection. The process only terminates when the agent issues the explicit `PRODUCTION_READY` signal.

---

## 🚀 Installation & Prerequisites

### System Requirements
- **Linux Environment** (Optimized for Ubuntu/Debian).
- **Python 3.10+**.
- **Elixir/Phoenix** (For ACN).

### Dependencies
Install the required Python libraries:
```bash
pip install pexpect google-generativeai
```

### Infrastructure
Ensure ACN and ProCoder are installed and accessible on your system.

---

## ⚙️ Configuration

Ovan relies on environment variables for system pathing and API access:

| Variable | Description | Default Path |
| :--- | :--- | :--- |
| `ACN_HOME` | Path to the ACN generator directory. | `/home/gifted/acn` |
| `PROCODER_HOME` | Path to the ProCoder refinement system. | `/home/gifted/procoder_system` |
| `GEMINI_API_KEY` | API Key for Google Generative AI (Phase 3 & 4). | *Required* |

---

## 📖 Usage Guide

### Starting a New Project
To start from a task description:
```bash
python3 ovan.py "build a high-performance URL shortener with Redis caching"
```

### Resuming an Existing Workspace
To run the refinement pipeline on an existing codebase:
```bash
python3 ovan.py --path /path/to/existing/codebase
```

### Advanced Options
```bash
python3 ovan.py --help

Options:
  task                  Initial task for ACN Genesis.
  --path PATH           Directly provide workspace path, skipping Phase 1.
  --procoder-cmd CMD    CLI command to launch ProCoder (default: python3 scripts/procoder_cli.py).
  --idle-timeout SEC    Inactivity timeout (default: 1800s / 30m).
  --pause-seconds SEC   Seconds to pause between goals (default: 30s).
```

---

## 🧠 Technical Architecture

Ovan is built as a **Resilient State Machine**. It handles the inherent unpredictability of LLM agents through:

- **Pexpect Orchestration**: Maintains a persistent interactive session with ProCoder, handling auto-approvals and tool-call sequences.
- **Prompt Injection**: Bypasses Linux terminal input limits by writing complex agent instructions to `ovan_agent_instruction.txt` for ProCoder to ingest.
- **Fail-Safe Loops**: If an agent freezes or the process hangs, Ovan detects the timeout and automatically restarts the process, resuming exactly where it left off.
- **Codebase Consolidation**: Automatically crawls the target directory, ignoring build artifacts and sensitive files, to provide a clean context window for Gemini agents.

---

## 🛡 License

Proprietary Infrastructure for **The Genesis Machine**. Developed by Gift Braimah.
