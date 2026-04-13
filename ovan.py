#!/usr/bin/env python3
"""
Ovan: The ACN -> ProCoder Orchestrator
--------------------------------------
Phase 1: Runs ACN Genesis. Streams output and intercepts the "Codebase: <path>" line.
         (Can be skipped by passing --path <directory>)
Phase 2: Runs ProCoder targeting the extracted (or provided) workspace directory.
         - Waits for "System Mixer: Phase 2 (Binding) complete." to begin goals.
         - Uses a 30 MINUTE (1800s) IDLE TIMEOUT: Timer resets every time a log is printed.
         - Wipes context via /new, injects goals, auto-approves diffs, pauses 30s between.
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

# ANSI Colors
C_CYAN = '\033[96m'
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_RESET = '\033[0m'

ACN_HOME = os.environ.get("ACN_HOME", "/home/gifted/acn")
PROCODER_HOME = os.environ.get("PROCODER_HOME", "/home/gifted/procoder_system")

# 30 minutes of ABSOLUTE SILENCE required to trigger a timeout/restart
IDLE_TIMEOUT_SECONDS = 1800 

# ---------------------------------------------------------------------------
# The Strict 3-Goal Refinement Pipeline (Word-for-Word from User)
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
        # Run ACN, pipe stdout so we can read line-by-line while also printing it to the user
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            
            # Intercept the exact output path
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

def run_phase2_procoder(target_dir, procoder_cmd, idle_timeout=1800, pause_seconds=30):
    """Phase 2: Interactive ProCoder Refinement via PTY with IDLE restart handling."""
    log(f"Changing to ProCoder directory: {PROCODER_HOME}")
    if not os.path.exists(PROCODER_HOME):
        log(f"ERROR: ProCoder directory not found at {PROCODER_HOME}", C_RED)
        sys.exit(1)
        
    os.chdir(PROCODER_HOME)

    log(f"Starting Phase 2: ProCoder Refinement", C_GREEN)
    log(f"Targeting Codebase: {target_dir}")

    current_goal_index = 0
    max_retries = 5
    retry_count = 0

    while current_goal_index < len(REFINEMENT_GOALS):
        cmd = f"{procoder_cmd} {target_dir}"
        log(f"Launching ProCoder: {cmd}")
        
        child = pexpect.spawn(cmd, encoding='utf-8')
        child.logfile_read = sys.stdout 
        phase_marker = "STARTUP"

        try:
            # ---------------------------------------------------------
            # WAIT FOR CDMS/SYSTEM TO FULLY INITIALIZE
            # ---------------------------------------------------------
            phase_marker = "INIT"
            log(f"Waiting for 'System Mixer' or 'GENESIS: Cold Boot' (Timeout: {idle_timeout}s)...", C_YELLOW)
            
            while True:
                idx = child.expect([
                    r'System\s*Mixer.*Phase\s*2.*Binding.*complete',
                    r'GENESIS:\s*Cold\s*Boot\s*COMPLETE',
                    r'\r?\n' # Matches any log line, resetting the timeout
                ], timeout=idle_timeout)
                
                if idx == 0 or idx == 1:
                    log("System is fully bound/booted and ready! Proceeding with goals...", C_GREEN)
                    break
                elif idx == 2:
                    # System is actively logging startup sequences. Timer resets!
                    pass

            # ---------------------------------------------------------
            # EXECUTE REMAINING GOALS
            # ---------------------------------------------------------
            phase_marker = "GOAL"
            while current_goal_index < len(REFINEMENT_GOALS):
                goal = REFINEMENT_GOALS[current_goal_index]
                
                log(f"\n=============================================", C_CYAN)
                log(f"Executing Goal {current_goal_index+1}/{len(REFINEMENT_GOALS)}", C_YELLOW)
                log(f"=============================================\n", C_CYAN)
                
                # 1. Flush terminal buffer to clear any leftover "> " prompts
                flush_pexpect_buffer(child)
                
                # 2. Reset memory session for a clean slate
                log("Resetting session via /new...", C_CYAN)
                child.sendline("/new")
                
                # 3. Permissive, non-fatal check for the session reset
                try:
                    child.expect(r'New session started', timeout=30)
                    log("Session reset confirmed.", C_GREEN)
                except pexpect.TIMEOUT:
                    log("Warning: Did not see 'New session started' confirmation. Injecting goal anyway...", C_YELLOW)

                time.sleep(2) # Give ProCoder time to digest the command
                
                # 4. Inject the goal
                # FIX: Sanitizing the goal to a single line to prevent the REPL 
                # from being triggered by internal newlines in the goal text.
                log("Injecting sanitized goal prompt...", C_GREEN)
                sanitized_goal = " ".join([line.strip() for line in goal.splitlines() if line.strip()])
                child.sendline(sanitized_goal)

                approvals_for_this_goal = 0
                max_approvals = 500 # Increased significantly to accommodate massive file-by-file testing
                
                # 5. Idle Timeout Loop: Waits for Summary or Diff approval.
                while True:
                    idx = child.expect([
                        r'\[ProCoder\] Summary', 
                        r'Apply changes\?.*\(y\)es',
                        r'\r?\n' # Matches ANY log line, resetting the timeout
                    ], timeout=idle_timeout)

                    if idx == 0:
                        # The finish tool was called!
                        log(f"Goal {current_goal_index+1} completed successfully.", C_GREEN)
                        
                        # Absorb the final '> ' prompt that appears right after the summary
                        try:
                            child.expect(r'> ', timeout=5)
                        except pexpect.TIMEOUT:
                            pass
                        
                        current_goal_index += 1
                        retry_count = 0 # reset retries on success
                        break # Break out of the inner loop to move to the next goal
                        
                    elif idx == 1:
                        # The agent proposed a diff, auto-approve it
                        if approvals_for_this_goal >= max_approvals:
                            log("WARNING: Maximum auto-approvals reached. Rejecting to break loop.", C_RED)
                            child.sendline("n")
                        else:
                            log("Auto-approving proposed diff...", C_YELLOW)
                            child.sendline("y")
                            approvals_for_this_goal += 1
                            
                    elif idx == 2:
                        # The agent is actively researching/coding and printed a log.
                        # The while loop continues, and the 30-minute idle timer is RESET to 0.
                        pass

                # 6. Apply Timeout between goals
                if current_goal_index < len(REFINEMENT_GOALS):
                    log(f"Initiating {pause_seconds}-second resting cooldown...", C_YELLOW)
                    countdown_timer(pause_seconds, msg_prefix="Next goal starting in")

            # If we successfully finished all goals, we break out entirely.
            if child.isalive():
                child.sendline("/stop")
                time.sleep(1)
                child.close(force=True)
            break

        except pexpect.TIMEOUT as e:
            if phase_marker == "INIT":
                log(f"System hung during startup. {idle_timeout} seconds (30 minutes) of absolute silence elapsed.", C_RED)
            else:
                log(f"Agent froze. No terminal output detected for {idle_timeout} seconds (30 minutes) straight.", C_RED)
            
            retry_count += 1
            if retry_count > max_retries:
                log("Maximum retries reached. Aborting pipeline.", C_RED)
                if child.isalive():
                    child.close(force=True)
                break
            
            log(f"Restarting ProCoder and resuming from Goal {current_goal_index+1}...", C_YELLOW)
            if child.isalive():
                child.close(force=True)
            continue # Restart the outer while loop

        except pexpect.EOF:
            log("ProCoder process terminated unexpectedly.", C_RED)
            retry_count += 1
            if retry_count > max_retries:
                break
            
            log(f"Restarting ProCoder and resuming from Goal {current_goal_index+1}...", C_YELLOW)
            if child.isalive():
                child.close(force=True)
            continue
            
        except KeyboardInterrupt:
            log("Interrupted by user. Shutting down.", C_RED)
            if child.isalive():
                child.close(force=True)
            break

    log("Ovan Orchestration Complete. Your system is ready.", C_GREEN)


def main():
    parser = argparse.ArgumentParser(description="Ovan: ACN -> ProCoder Orchestrator")
    
    # Make 'task' optional by using nargs='?' so we can supply --path instead
    parser.add_argument("task", type=str, nargs="?", default=None, 
                        help="The initial high-level task for ACN (Optional if --path is provided).")
    
    parser.add_argument("--path", type=str, default=None, 
                        help="Directly provide the workspace path to refine, skipping Phase 1 (ACN Genesis).")
                        
    parser.add_argument("--procoder-cmd", type=str, default="python3 scripts/procoder_cli.py", 
                        help="The CLI command used to launch ProCoder")
    
    # Force the timeout to default to 1800 (30 minutes)
    parser.add_argument("--idle-timeout", type=int, default=1800, 
                        help="Inactivity timeout in seconds (default: 1800s / 30m)")
    
    # Catch the old flag just in case your bash script uses it, but ignore it and force 1800
    parser.add_argument("--goal-timeout", type=int, default=1800, help=argparse.SUPPRESS)
    
    parser.add_argument("--pause-seconds", type=int, default=30, 
                        help="Seconds to pause between goals (default: 30s)")
    
    args = parser.parse_args()
    
    # HARD OVERRIDE: Even if a legacy script passes --goal-timeout 600, force to args.idle_timeout.
    actual_timeout = 1800 if args.goal_timeout == 600 else args.idle_timeout

    detected_target = None

    if args.path:
        # User provided a direct path, skip Phase 1
        detected_target = os.path.abspath(args.path)
        log(f"Skipping Phase 1 (ACN Genesis).", C_YELLOW)
        log(f"Using provided target path: {detected_target}", C_CYAN)
    elif args.task:
        # Phase 1: Fire ACN Genesis and extract output path
        detected_target = run_phase1_acn(args.task)
        if not detected_target:
            log("Could not extract 'Codebase: <path>' from ACN output. Did it fail?", C_RED)
            sys.exit(1)
        log(f"ACN output detected at: {detected_target}", C_YELLOW)
    else:
        log("ERROR: You must provide either a 'task' or a '--path'.", C_RED)
        parser.print_help()
        sys.exit(1)
    
    # Check if the output is a single file or a directory
    if os.path.isfile(detected_target):
        log(f"Target '{detected_target}' is a single file.", C_CYAN)
        log("Skipping ProCoder refinement phase. Presenting work to user.", C_GREEN)
        sys.exit(0)
    elif not os.path.isdir(detected_target):
        log(f"Extracted/Provided path '{detected_target}' does not exist on the filesystem.", C_RED)
        sys.exit(1)

    time.sleep(2)

    # Phase 2: Run ProCoder
    run_phase2_procoder(detected_target, args.procoder_cmd, actual_timeout, args.pause_seconds)


if __name__ == "__main__":
    main()
        log("Skipping ProCoder refinement phase. Presenting work to user.", C_GREEN)
        sys.exit(0)
    elif not os.path.isdir(detected_target):
        log(f"Extracted/Provided path '{detected_target}' does not exist on the filesystem.", C_RED)
        sys.exit(1)

    time.sleep(2)

    # Phase 2: Run ProCoder
    run_phase2_procoder(detected_target, args.procoder_cmd, actual_timeout, args.pause_seconds)
