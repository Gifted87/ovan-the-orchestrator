# Ovan

Ovan is a Python command-line orchestrator for running a software-generation and refinement workflow across ACN, ProCoder, and Google Gemini. It can start a project through ACN Genesis or take an existing project directory, submit a sequence of refinement prompts to ProCoder, and ask Gemini to review the resulting codebase.

Ovan is an experimental automation tool. Its prompts request testing and production-readiness reviews, but the program does not independently verify that a project is safe, complete, or production-ready.

## Workflow

1. **Generate or select a project.** With a task description, Ovan runs `mix acn.genesis` from the configured ACN directory and looks for the generated workspace path in its output. With `--path`, it skips generation.
2. **Refine with ProCoder.** Ovan launches the configured ProCoder command and sends prompts for architecture review, testing, and documentation.
3. **Review with Gemini.** Ovan concatenates readable files from the target directory and submits them to the `gemini-3-flash-preview` model for critique and readiness review. It can request up to three critique and three final-review iterations.
4. **Apply findings.** Ovan writes Gemini's findings to `ovan_agent_instruction.txt` in the target project and asks ProCoder to act on them.

## Requirements

- Python 3.10 or newer
- `pexpect`
- `google-generativeai`
- ACN and Elixir/Mix when using task-based generation
- ProCoder installed and configured for the selected workspace
- A Google Gemini API key for the review phases

Install the Python packages:

```bash
python3 -m pip install pexpect google-generativeai
```

## Configuration

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `ACN_HOME` | ACN installation directory used for generation | `/home/gifted/acn` |
| `PROCODER_HOME` | ProCoder installation directory | `/home/gifted/procoder_system` |
| `GEMINI_API_KEY` | Credential used for Gemini reviews | Required for review phases |

Set `GEMINI_API_KEY` through your shell or a secret manager. Do not commit API keys or other credentials to a project directory.

## Usage

Generate a project from a task description:

```bash
export GEMINI_API_KEY="your-key"
python3 ovan.py "Build a URL shortener with Redis caching"
```

Run refinement and review on an existing project:

```bash
export GEMINI_API_KEY="your-key"
python3 ovan.py --path /path/to/project
```

View command options:

```bash
python3 ovan.py --help
```

Options include `--procoder-cmd` to select the ProCoder command, `--idle-timeout` to set the inactivity timeout, and `--pause-seconds` to set the delay between goals.

## Security and data handling

Ovan can cause ProCoder to edit files and run commands in its environment. The orchestration loop automatically answers up to 500 ProCoder change-approval prompts per goal. Run it only with projects and tools you trust, and supervise the process.

During Gemini review, Ovan reads files recursively from the target directory. It skips several common build and dependency directories, but it does **not** filter credential files such as `.env` by default. Read and sanitize the target project before running review phases; readable source and configuration files may be sent to Google's Gemini service. Gemini output is also written temporarily into the target project for ProCoder to process.

The readiness signal is based on a model response and is not a security audit, test result, or guarantee of production readiness. Review all generated changes and independently run the checks required for your project.

## Project status and license

This repository contains `ovan.py` and this documentation. No dependency lockfile, automated test suite, or `LICENSE` file is included. Add a license before reusing or redistributing the code.
