#!/usr/bin/env python3
"""
Ovan: The Orchestrator 
--------------------------------------
Phase 1: ACN Genesis generation.
Phase 2: ProCoder Baseline Refinement (Bug fixing, Testing).
Phase 3: Critic Agent Evaluation (3 iterations). Uses Gemini to critique compiled codebase.
Phase 4: Final Production Review (Up to 3 iterations). Uses Gemini to review readiness.
"""

import sys
import os
import subprocess
import argparse
import time

try:
    import pexpect
except ImportError:
    print("\n[OVAN ERROR] 'pexpect' library is required.")
    print("Install it by running: pip install pexpect\n")
    sys.exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print("\n[OVAN ERROR] 'google-generativeai' library is required for Phase 3 & 4.")
    print("Install it by running: pip install google-generativeai\n")
    sys.exit(1)

# ANSI Colors
C_CYAN = '\033[96m'
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_MAGENTA = '\033[95m'
C_RESET = '\033[0m'

ACN_HOME = os.environ.get("ACN_HOME", "/home/gifted/acn")
PROCODER_HOME = os.environ.get("PROCODER_HOME", "/home/gifted/procoder_system")

# 30 minutes of ABSOLUTE SILENCE required to trigger a timeout/restart
IDLE_TIMEOUT_SECONDS = 1800 

# ---------------------------------------------------------------------------
# Phase 2: The Strict 3-Goal Refinement Pipeline
# ---------------------------------------------------------------------------
REFINEMENT_GOALS = [
    """First of all, create an architecture breakdown.md document and for each step on the way, update your findings to this document.
make a list all modules 
Make a list of what they are supposed to do.
For each module, make a list of all sub modules 
And what they are supposed to do.
For each sub module, make a list of its own submodules and what they are supposed to do.
Do this recursively until you get to the per file level.
When you get a file, make a list of what it is supposed to do and how it contributes to the overall architecture.
During this phase, when you get to a file, 
1. Check it's import of other files and make sure the path of the imports are correct.
2. Make sure all imported modules are installed in the system, and make sure you install them if they are not.
3. Make sure the file compiles and runs without error.
After finishing with that file, proceed to the next file.
AT THE END OF THIS PROCESS, YOU MUST NOW COMPILE AND RUN THE ENTIRE PROJECT. FIX ALL ERRORS THAT ARISE. UNTIL THE ENTIRE PROJECT RUNS WITHOUT A HITCH, YOUR JOB IS NOT DONE.
YOU MUST NOT ATTEMPT TO WRITE THE ARCHITECTURE DOUCMENT IN ONE GO. WRITE IT IN MULTIPLE TURNS. each timne you must research the codebase before updating the document each time, step by step!!!
YOU MUST GO TO THE BASE PATH OF THE PROJECT AND USE "ls" command to ensure you dont skip any important project directory!!! this is of utmost importance. you must never overlook this in struction. pay attention here!!!
THIS INSTRICTION IS NON NEGOTIABLE AND MUST BE FOLLOWED STRICTLY

When this entire process is completely finished, use the 'finish' tool.""",

    """Second goal: WRITE UNIT TESTS SUITE FOR EACH and every MODULE and submodule IN THE SYSTEM AS DEFINED IN THE ARCHITECTURAL DOCUMENT.MD FILE THAT MUST HAVE BEEN CREATED during the first goal. The unit tests
Must test the functionality of each and every feature of that module or submodule. The unit test must run without a hitch. Fix any limitation revealed by the unit test. DO NOT EDIT THE UNIT TEST YOU CREATED TO SATISFY THE LACKINGS AND SHORTCOMINGS OF THE MODULE OR SUBMODULE. INSTEAD FIX THE MODULE AND SUBMODULES FILES TO MEET THE EXPECTATIONS OF A ROBUST SYSTEM.

LIKE I SAID, DO THIS FOR EACH AND EVERY MODULE AND SUBMODULE. THEN YOU MUST RUN AND MAKE SURE EACH TESTS PASS
LASTLY YOU MUST NOW COMPILE AND RUN THE ENTIRE PROJECT. FIX ALL ERRORS THAT ARISE. UNTIL THE ENTIRE PROJECT RUNS WITHOUT A HITCH, YOUR JOB IS NOT DONE.

When this entire process is completely finished, use the 'finish' tool.""",

    """Goal 3:
Write a 3000 words Readme, and a 3000 words specifications document. Documenting every single module and submodule in the system, the entire architecture, design, implementation etc. Use the architectural Document that must have been created in the first stage as reference. YOU MUST NOT ATTEMPT TO WRITE THE ARCHITECTURE DOUCMENT IN ONE GO. WRITE IT IN MULTIPLE TURNS. each timne you must research the codebase before updating the document each time, step by step!!!
YOU MUST GO TO THE BASE PATH OF THE PROJECT AND USE "ls" command to ensure you dont skip any important project directory!!! this is of utmost importance. you must never overlook this in struction. pay attention here!!!
THIS INSTRICTION IS NON NEGOTIABLE AND MUST BE FOLLOWED STRICTLY

When this entire process is completely finished, use the 'finish' tool."""
]

def log(msg, color=C_CYAN):
    print(f"\n{color}[OVAN] {msg}{C_RESET}")

def run_phase1_acn(task):
    """Phase 1: Fire ACN Genesis, stream output, and extract the Codebase path."""
    log(f"Changing to ACN directory: {ACN_HOME}")
    if not os.path.exists(ACN_HOME):
        log(f"ERROR: ACN directory not found at {ACN_HOME}", C_RED)
        sys.exit(1)
        
    os.chdir(ACN_HOME)

    log(f"Starting Phase 1: ACN Genesis", C_GREEN)
    log(f"Task: {task}")
    
    cmd = ["mix", "acn.genesis", "--task", task]
    extracted_path = None
    
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            if "Codebase:" in line:
                extracted_path = line.split("Codebase:")[1].strip()

        process.wait()
        if process.returncode != 0:
            log("ACN Genesis failed or was interrupted. Aborting.", C_RED)
            sys.exit(process.returncode)
            
    except KeyboardInterrupt:
        log("Interrupted by user.", C_RED)
        sys.exit(1)
    
    log("Phase 1 Complete. ACN has finished generation.", C_GREEN)
    return extracted_path

def flush_pexpect_buffer(child):
    """Flushes any leftover terminal output to ensure a clean state."""
    while True:
        try:
            child.read_nonblocking(size=4096, timeout=0.1)
        except (pexpect.TIMEOUT, pexpect.EOF):
            break

def countdown_timer(seconds, msg_prefix="Next goal starting in"):
    """Displays a live countdown timer in the terminal."""
    try:
        for remaining in range(seconds, 0, -1):
            sys.stdout.write(f"\r[OVAN Timer] {msg_prefix}: {remaining//60:02d}:{remaining%60:02d}  ")
            sys.stdout.flush()
            time.sleep(1)
        print() 
    except KeyboardInterrupt:
        print("\n")
        log("Timer interrupted. Skipping remaining wait time.", C_YELLOW)

# ---------------------------------------------------------------------------
# Consolidation & Agent Implementations (Phases 3 & 4)
# ---------------------------------------------------------------------------
def consolidate_codebase(target_dir):
    """Crawls directory and concatenates code into a single string for Gemini."""
    ignored_dirs = {
        "_build", "deps", "tmp", "test", "dist", "tests", "reports", 
        "samples", "__pycache__", "node_modules", ".git", ".idea", 
        ".vscode", "venv311", "env", "venv"
    }
    ignored_filenames = {
        "compiled_codebase.txt", "consolidator.py", "package-lock.json", "yarn.lock", "ovan_agent_instruction.txt"
    }
    
    output = []
    for root, dirs, files in os.walk(target_dir):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        
        for file in files:
            if file in ignored_filenames:
                continue
                
            filepath = os.path.join(root, file)
            rel_path = os.path.relpath(filepath, target_dir)
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                output.append(f"--- File: {rel_path} ---\n{content}\n")
            except UnicodeDecodeError:
                pass # Skip binary files seamlessly
                
    return "\n".join(output)

def call_gemini_agent(prompt, retries=3):
    """Executes a call to Gemini Pro for codebase critique and review."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("ERROR: GEMINI_API_KEY environment variable is missing.", C_RED)
        log("Please export GEMINI_API_KEY='your_api_key' to run Phases 3 & 4.", C_YELLOW)
        sys.exit(1)
        
    genai.configure(api_key=api_key)
    # Using Gemini 3 Flash preview to comfortably handle giant codebase context windows
    model = genai.GenerativeModel("gemini-3-flash-preview")
    
    for attempt in range(retries):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            log(f"Gemini API error: {e}", C_YELLOW)
            if attempt < retries - 1:
                log("Retrying Gemini API in 10 seconds...", C_YELLOW)
                time.sleep(10)
            else:
                log("Failed to get response from Gemini API after multiple retries.", C_RED)
                raise

# ---------------------------------------------------------------------------
# Core ProCoder Orchestration Loop
# ---------------------------------------------------------------------------
def execute_procoder_goal(child, goal_text, prefix, idle_timeout, pause_seconds):
    """Executes a single ProCoder prompt sequence, tracks approvals, waits for finish."""
    log(f"\n=============================================", C_CYAN)
    log(f"Executing {prefix}", C_YELLOW)
    log(f"=============================================\n", C_CYAN)
    
    flush_pexpect_buffer(child)
    
    log("Resetting session via /new...", C_CYAN)
    child.sendline("/new")
    try:
        child.expect(r'New session started', timeout=30)
    except pexpect.TIMEOUT:
        log("Warning: Did not see 'New session started' confirmation. Injecting goal anyway...", C_YELLOW)

    time.sleep(2) 
    
    log("Injecting prompt into ProCoder...", C_GREEN)
    child.sendline(goal_text)

    approvals_for_this_goal = 0
    max_approvals = 500 
    
    while True:
        idx = child.expect([
            r'\[ProCoder\] Summary', 
            r'Apply changes\?.*\(y\)es',
            r'\r?\n' 
        ], timeout=idle_timeout)

        if idx == 0:
            log(f"{prefix} completed successfully.", C_GREEN)
            try: child.expect(r'> ', timeout=5)
            except pexpect.TIMEOUT: pass
            
            log(f"Initiating {pause_seconds}-second resting cooldown...", C_YELLOW)
            countdown_timer(pause_seconds, msg_prefix="Next phase starting in")
            return True
            
        elif idx == 1:
            if approvals_for_this_goal >= max_approvals:
                log("WARNING: Maximum auto-approvals reached. Rejecting to break loop.", C_RED)
                child.sendline("n")
            else:
                child.sendline("y")
                approvals_for_this_goal += 1
                
        elif idx == 2:
            pass # Active ProCoder logging, loops again and resets timeout


def run_phases_2_to_4(target_dir, procoder_cmd, idle_timeout=1800, pause_seconds=30):
    """Orchestrates Phases 2, 3, and 4 inside a resilient state machine."""
    log(f"Changing to ProCoder directory: {PROCODER_HOME}")
    if not os.path.exists(PROCODER_HOME):
        log(f"ERROR: ProCoder directory not found at {PROCODER_HOME}", C_RED)
        sys.exit(1)
        
    os.chdir(PROCODER_HOME)

    # State Machine Variables
    state_phase = 2
    state_index = 0
    max_retries = 5
    retry_count = 0

    while state_phase <= 4:
        cmd = f"{procoder_cmd} {target_dir}"
        log(f"Launching ProCoder: {cmd}")
        
        child = pexpect.spawn(cmd, encoding='utf-8')
        child.logfile_read = sys.stdout 
        phase_marker = "STARTUP"

        try:
            # WAIT FOR INIT
            phase_marker = "INIT"
            log(f"Waiting for 'System Mixer' or 'GENESIS: Cold Boot' (Timeout: {idle_timeout}s)...", C_YELLOW)
            while True:
                idx = child.expect([
                    r'System\s*Mixer.*Phase\s*2.*Binding.*complete',
                    r'GENESIS:\s*Cold\s*Boot\s*COMPLETE',
                    r'\r?\n'
                ], timeout=idle_timeout)
                if idx == 0 or idx == 1:
                    log("System is fully bound/booted and ready! Proceeding with tasks...", C_GREEN)
                    break

            # GOAL EXECUTION
            phase_marker = "EXECUTION"
            while state_phase <= 4:
                goal_text = ""
                instruction_path = os.path.join(target_dir, "ovan_agent_instruction.txt")
                
                # --- PHASE 2: BASELINE REFINEMENT ---
                if state_phase == 2:
                    if state_index >= len(REFINEMENT_GOALS):
                        state_phase = 3
                        state_index = 0
                        continue
                        
                    prefix = f"Phase 2: Base Refinement (Goal {state_index+1}/{len(REFINEMENT_GOALS)})"
                    # Sanitize internal newlines so Pexpect's sendline executes as a single command
                    goal_text = " ".join([line.strip() for line in REFINEMENT_GOALS[state_index].splitlines() if line.strip()])

                # --- PHASE 3: CRITIC AGENT ---
                elif state_phase == 3:
                    if state_index >= 3:
                        state_phase = 4
                        state_index = 0
                        continue
                        
                    prefix = f"Phase 3: Critic Agent (Attempt {state_index+1}/3)"
                    log("\nCompiling codebase for Critic Agent...", C_MAGENTA)
                    codebase = consolidate_codebase(target_dir)
                    
                    log("Calling Gemini Critic Agent...", C_MAGENTA)
                    critic_prompt = f"evaluate and find evidences from accross the codebase that shows this codebase is not yet production ready. find stubs, wiring breaks, unimplemented logic, unwired or unused logic and features, semantic and syntax bugs etc\n\nCodebase:\n{codebase}"
                    critic_out = call_gemini_agent(critic_prompt)
                    
                    # Bypass Linux terminal input limits (4096 bytes) by writing the prompt natively to a file
                    with open(instruction_path, "w", encoding="utf-8") as f:
                        f.write(f"Resolve all this issues and update the documentations: {critic_out}")
                        
                    goal_text = "Read the file 'ovan_agent_instruction.txt' at the root of the project and meticulously execute the prompt contained within it."

                # --- PHASE 4: FINAL REVIEW AGENT ---
                elif state_phase == 4:
                    if state_index >= 3:
                        state_phase = 5 # Complete!
                        break
                        
                    prefix = f"Phase 4: Readiness Review (Attempt {state_index+1}/3)"
                    log("\nCompiling codebase for Final Review Agent...", C_MAGENTA)
                    codebase = consolidate_codebase(target_dir)
                    
                    log("Calling Gemini Final Review Agent...", C_MAGENTA)
                    review_prompt = f"How production ready is this code? list all shortcomings if there are any.\nIf the codebase is 100% completely production ready with absolutely no shortcomings, start your response with the exact word: PRODUCTION_READY\n\nCodebase:\n{codebase}"
                    review_out = call_gemini_agent(review_prompt)
                    
                    if review_out.strip().startswith("PRODUCTION_READY"):
                        log("Final Review Agent deemed the codebase PRODUCTION READY! Validation complete.", C_GREEN)
                        state_phase = 5
                        break
                        
                    # Bypass Linux terminal limits
                    with open(instruction_path, "w", encoding="utf-8") as f:
                        f.write(f"Resolve all issues and update the documentations: {review_out}")
                        
                    goal_text = "Read the file 'ovan_agent_instruction.txt' at the root of the project and meticulously execute the prompt contained within it."

                # --- Execute Chosen Goal ---
                success = execute_procoder_goal(child, goal_text, prefix, idle_timeout, pause_seconds)
                
                if success:
                    state_index += 1
                    retry_count = 0
                    if os.path.exists(instruction_path):
                        try: os.remove(instruction_path)
                        except: pass
                else:
                    break # Breaks the inner loop to respawn ProCoder

            # SHUTDOWN IF FINISHED
            if state_phase == 5:
                if child.isalive():
                    child.sendline("/stop")
                    time.sleep(1)
                    child.close(force=True)
                break

        except pexpect.TIMEOUT as e:
            if phase_marker == "INIT":
                log(f"System hung during startup. {idle_timeout}s elapsed without output.", C_RED)
            else:
                log(f"Agent froze. No output detected for {idle_timeout}s straight.", C_RED)
                
            retry_count += 1
            if retry_count > max_retries:
                log("Maximum retries reached. Aborting pipeline.", C_RED)
                if child.isalive(): child.close(force=True)
                break
                
            log(f"Restarting ProCoder and resuming from Phase {state_phase}, Goal/Attempt {state_index+1}...", C_YELLOW)
            if child.isalive(): child.close(force=True)
            continue 

        except pexpect.EOF:
            log("ProCoder process terminated unexpectedly.", C_RED)
            retry_count += 1
            if retry_count > max_retries: break
            log(f"Restarting ProCoder and resuming from Phase {state_phase}, Goal/Attempt {state_index+1}...", C_YELLOW)
            if child.isalive(): child.close(force=True)
            continue
            
        except KeyboardInterrupt:
            log("Interrupted by user. Shutting down.", C_RED)
            if child.isalive(): child.close(force=True)
            break

    log("==========================================================", C_GREEN)
    log(f"ORCHESTRATION COMPLETE! HANDING OVER FINAL CODEBASE", C_GREEN)
    log(f"FULL PRODUCTION READY PATH: {target_dir}", C_CYAN)
    log("==========================================================", C_GREEN)


def main():
    parser = argparse.ArgumentParser(description="Ovan: Evolved ACN -> ProCoder Orchestrator")
    
    parser.add_argument("task", type=str, nargs="?", default=None, 
                        help="Initial task for ACN Genesis (Optional if --path provided).")
    parser.add_argument("--path", type=str, default=None, 
                        help="Directly provide workspace path, skipping Phase 1.")
    parser.add_argument("--procoder-cmd", type=str, default="python3 scripts/procoder_cli.py", 
                        help="CLI command used to launch ProCoder")
    parser.add_argument("--idle-timeout", type=int, default=1800, 
                        help="Inactivity timeout in seconds (default: 1800s / 30m)")
    parser.add_argument("--goal-timeout", type=int, default=1800, help=argparse.SUPPRESS)
    parser.add_argument("--pause-seconds", type=int, default=30, 
                        help="Seconds to pause between goals (default: 30s)")
    
    args = parser.parse_args()
    actual_timeout = 1800 if args.goal_timeout == 600 else args.idle_timeout

    detected_target = None

    if args.path:
        detected_target = os.path.abspath(args.path)
        log(f"Skipping Phase 1 (ACN Genesis).", C_YELLOW)
        log(f"Using provided target path: {detected_target}", C_CYAN)
    elif args.task:
        detected_target = run_phase1_acn(args.task)
        if not detected_target:
            log("Could not extract 'Codebase: <path>' from ACN output. Did it fail?", C_RED)
            sys.exit(1)
        log(f"ACN output detected at: {detected_target}", C_YELLOW)
    else:
        log("ERROR: You must provide either a 'task' or a '--path'.", C_RED)
        parser.print_help()
        sys.exit(1)
    
    if os.path.isfile(detected_target):
        log(f"Target '{detected_target}' is a single file. Skipping ProCoder.", C_CYAN)
        sys.exit(0)
    elif not os.path.isdir(detected_target):
        log(f"Extracted/Provided path '{detected_target}' does not exist on the filesystem.", C_RED)
        sys.exit(1)

    time.sleep(2)

    # Boot Phases 2 through 4
    run_phases_2_to_4(detected_target, args.procoder_cmd, actual_timeout, args.pause_seconds)

if __name__ == "__main__":
    main()