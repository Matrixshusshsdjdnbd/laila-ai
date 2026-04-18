#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

backend:
  - task: "SSE streaming chat endpoint /api/chat/stream"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "All 5 scoped tests passed against https://africa-laila-hub.preview.emergentagent.com/api. Test 1 (basic stream, mode=chat): Status 200, Content-Type text/event-stream; first SSE event carries conversation_id, 107 delta chunks totaling 455 chars, final event has done=true with complete message object (id, conversation_id, role=assistant, content, created_at). No parse errors, no error events. Test 2 (follow-up with same conversation_id): assistant correctly references prior turn using keywords 'introduce', 'said', 'paragraph', 'asked' — context preserved across streamed calls (82 delta chunks, 383 chars). Test 3 (GET /api/conversations/{id}/messages): returns exactly 4 messages (2 user + 2 assistant) with correct roles, non-empty content, persisted in MongoDB. Test 4 (regression /api/chat non-stream): Status 200, returns conversation_id + assistant message. Test 5 (quick vs chat length): chat mode=2435 chars / 567 chunks vs quick mode=513 chars / 142 chunks — quick mode correctly produces shorter output. Raw SSE framing matches 'data: {json}\\n\\n'. No chunked JSON parse failures, no error events throughout. Litellm acompletion with Emergent proxy base is streaming deltas correctly."
        -working: true
        -agent: "testing"
        -comment: "Regression re-verified. POST /api/chat/stream with {message:'Say hi in one short sentence.', mode:'chat', conversation_id:null} → HTTP 200, Content-Type text/event-stream; charset=utf-8. First SSE event supplied conversation_id; 8 delta chunks (34 chars) followed by final done event. No JSON parse errors, no error events. SSE framing (data: <json>\\n\\n) intact."

  - task: "GET /api/voices — 6-voice catalog"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "GET /api/voices returns HTTP 200 with exactly 6 voices as specified. Full listing: (1) id=nova, name=Nova, gender=female, desc='Warm female — friendly, clear'; (2) id=shimmer, name=Shimmer, gender=female, desc='Soft female — calm, welcoming'; (3) id=onyx, name=Onyx, gender=male, desc='Strong male — deep, confident'; (4) id=echo, name=Echo, gender=male, desc='Calm male — steady, natural'; (5) id=fable, name=Fable, gender=male, desc='British male — elegant, clear'; (6) id=alloy, name=Alloy, gender=neutral, desc='Neutral — smart, versatile'. Every entry carries the required id/name/desc/gender fields. Matches spec exactly (Nova+Shimmer female, Onyx+Echo+Fable male, Alloy neutral)."

  - task: "POST /api/tts with speed parameter"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "All 4 TTS sub-cases pass. (a) Baseline {voice:'nova'} no speed → HTTP 200, mp3 audio base64 ~43520 chars / 32640 bytes decoded. (b) {voice:'onyx', speed:1.15} → HTTP 200, mp3 base64 ~38400 chars / 28800 bytes. (c) {voice:'echo', speed:1.1} → HTTP 200, mp3 base64 ~19840 chars / 14880 bytes. (d) {voice:'invalid_voice_xyz'} → HTTP 500 with graceful JSON body {detail:'Speech generation failed: Validation error: Invalid voice: invalid_voice_xyz. Must be one of [alloy, ash, coral, echo, fable, ...]'} — handled by FastAPI error path, no crash, no connection drop. Server clamps speed to [0.5, 2.0] via max/min before forwarding to OpenAITextToSpeech. New speed parameter is honoured for both male (onyx) and echo voices."

  - task: "POST /api/chat non-stream regression"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "POST /api/chat with {message:'Hello.', mode:'chat', conversation_id:null} → HTTP 200. Response contains conversation_id=35f0c040-7c9d-4433-b29f-fa070e2ff9a2 and message object with id, conversation_id, role=assistant, non-empty content. No regression."

  - task: "GET /api/conversations persistence regression"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "GET /api/conversations?device_id=test-regression → HTTP 200, body contains 'conversations' array field (count=0 for fresh device_id, as expected). Endpoint contract preserved."

metadata:
  created_by: "testing"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "testing"
    -message: "Streaming endpoint /api/chat/stream is fully functional. All 5 scoped tests pass: basic SSE stream, multi-turn context preservation, MongoDB message persistence, non-stream regression, and quick/chat mode length differentiation. No errors, no parse failures. Ready to ship."
    -agent: "testing"
    -message: "Voice-expansion + TTS speed regression complete — 11/11 checks passed against https://africa-laila-hub.preview.emergentagent.com/api. (1) GET /api/voices returns exactly the 6 expected voices with id/name/desc/gender: Nova(female), Shimmer(female), Onyx(male), Echo(male), Fable(male), Alloy(neutral). (2) POST /api/tts: baseline nova (no speed) ✓, onyx speed=1.15 ✓, echo speed=1.1 ✓ — all return HTTP 200 with valid base64 mp3. Invalid voice ('invalid_voice_xyz') is handled gracefully with HTTP 500 + JSON detail (no crash, no socket drop; backend log confirms the OpenAI validation error is caught by the FastAPI handler). Speed parameter is properly clamped to [0.5, 2.0]. (3) SSE /api/chat/stream regression ✓ (conv_id + deltas + done). (4) Non-stream /api/chat ✓. (5) GET /api/conversations?device_id=test-regression ✓ (returns conversations array). No regressions, the new speed param and expanded voice catalog work as specified."