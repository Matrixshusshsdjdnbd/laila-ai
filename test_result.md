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

  - task: "Projects CRUD (POST/GET/PATCH/DELETE /api/projects)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "All 5 Projects CRUD sub-tests pass against https://africa-laila-hub.preview.emergentagent.com/api with device_id=final-regress-1. (1a) POST /api/projects body {name:'CV Project', description:'My resume work', color:'#3B82F6'} → HTTP 200, returns id (uuid), user_id=final-regress-1, name='CV Project', color='#3B82F6', chat_count=0, created_at/updated_at ISO timestamps. (1b) GET /api/projects → HTTP 200, body {projects:[...]} array, the freshly created project appears (count=1 for this fresh device_id). (1c) PATCH /api/projects/{id} with {name:'CV Final', color:'#10B981'} → HTTP 200, both fields updated in the returned document, updated_at bumped. (1d) DELETE /api/projects/{id} → HTTP 200 body {ok:true}. (1e) PATCH /api/projects/non-existent-id → HTTP 404 {detail:'Project not found'}. Schema, status codes, ownership scoping via device_id all correct."

  - task: "Text file export POST /api/export/txt"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "POST /api/export/txt body {content:'Hello, this is my CV content\\nLine 2', filename:'my-cv'} → HTTP 200. Content-Type='text/plain; charset=utf-8'. Content-Disposition='attachment; filename=\"my-cv.txt\"'. Response body is the exact raw content bytes (35 bytes, byte-for-byte match, newline preserved). Filename sanitization is active (only alnum+-_ retained). Works as spec'd."

  - task: "Project-Conversation linking PATCH /api/conversations/{id} project_id + GET /api/projects/{pid}/conversations"
    implemented: true
    working: false
    file: "backend/server.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
        -working: false
        -agent: "testing"
        -comment: "CRITICAL BUG — anonymous/device flows are broken for PATCH /api/conversations/{id}. Root cause confirmed: POST /api/chat (and /api/chat/stream) does NOT accept a device_id (neither as query param nor as body field — ChatRequest model only has message/conversation_id/mode). When an anonymous user posts to /api/chat with device_id=final-regress-1 in the body, that device_id is SILENTLY IGNORED and the conversation is created under user_id='anonymous' (verified: GET /api/conversations?device_id=anonymous returns 42 conversations including the ones we just created). However, PATCH /api/conversations/{id}?device_id=final-regress-1 correctly scopes the query to {id: conv_id, user_id: 'final-regress-1'}, which finds nothing → HTTP 404 'Conversation not found'. Same story for GET /api/projects/{pid}/conversations — queries user_id=device_id, finds nothing. Results: 2c PATCH link-to-project → 404 FAIL, 2d GET project conversations includes conv → 200 but count=0 FAIL, 2e PATCH unassign → 404 FAIL. 2f 'empty after unassign' accidentally passes because the conv was never linked in the first place. FIX NEEDED: add optional device_id (query param) to /api/chat and /api/chat/stream, and when present (and no authed user), use it as user_id when creating conversations and storing messages — mirror the pattern already used by the Projects endpoints and by GET /api/conversations. Also /api/chat currently ignores device_id even if added to ChatRequest body, so the fix must either add the field to the Pydantic model OR read it as a query parameter."

  - task: "Pin + Rename conversations PATCH /api/conversations/{id}"
    implemented: true
    working: false
    file: "backend/server.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
        -working: false
        -agent: "testing"
        -comment: "Same root cause as the project-conversation task: /api/chat ignores device_id when creating conversations (stores under user_id='anonymous'), but PATCH /api/conversations/{id}?device_id=final-regress-1 scopes by user_id=final-regress-1 → HTTP 404 for every PATCH. Sub-tests: 3a PATCH {pinned:true, title:'Pinned Important Chat'} → 404 FAIL, 3b GET /api/conversations?device_id=final-regress-1 did not list the conv (because the conv is under user_id='anonymous', not 'final-regress-1') FAIL, 3c PATCH {pinned:false} → 404 FAIL. The PATCH handler's logic (update title.strip()[:120] or 'Untitled', bool(pinned), $set/$unset project_id) looks correct in isolation — it just never finds the target because the owner id mismatch. FIX: same as above — propagate device_id into /api/chat and /api/chat/stream so anonymous device-scoped conversations are stored under the device_id as user_id."

metadata:
  created_by: "testing"
  version: "1.2"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "Project-Conversation linking PATCH /api/conversations/{id} project_id + GET /api/projects/{pid}/conversations"
    - "Pin + Rename conversations PATCH /api/conversations/{id}"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "testing"
    -message: "Streaming endpoint /api/chat/stream is fully functional. All 5 scoped tests pass: basic SSE stream, multi-turn context preservation, MongoDB message persistence, non-stream regression, and quick/chat mode length differentiation. No errors, no parse failures. Ready to ship."
    -agent: "testing"
    -message: "Voice-expansion + TTS speed regression complete — 11/11 checks passed against https://africa-laila-hub.preview.emergentagent.com/api. GET /api/voices returns the 6 expected voices; POST /api/tts baseline nova / onyx 1.15 / echo 1.1 all return valid base64 mp3; invalid voice gracefully returns 500 with detail; speed clamped to [0.5, 2.0]. SSE chat stream + non-stream /api/chat + GET /api/conversations regression all green."
    -agent: "testing"
    -message: "Final regression + new-feature scan complete — 13/19 PASS, 6 FAIL. PASSING (all spec requirements): Projects CRUD (5/5) — POST/GET/PATCH/DELETE + 404 on non-existent id, schema correct with chat_count=0 on create. Text export /api/export/txt — correct Content-Type 'text/plain; charset=utf-8', correct Content-Disposition 'attachment; filename=\"my-cv.txt\"', body exact byte match. All regressions green: /api/chat/stream SSE ✓ (conv_id + deltas + done events), /api/tts onyx speed=1.1 ✓ (51840 base64 chars / 38880 mp3 bytes), /api/voices returns exactly 6 voices ✓, /api/conversations returns array ✓. FAILING — SINGLE ROOT CAUSE: /api/chat (and /api/chat/stream) IGNORE the device_id passed in the request body. ChatRequest Pydantic model defines only {message, conversation_id, mode} — no device_id field, no query param. Result: anonymous device users have their conversations stored under user_id='anonymous' (verified via GET /api/conversations?device_id=anonymous → 42 convs including the ones we just created), but PATCH /api/conversations/{id}?device_id=final-regress-1 and GET /api/projects/{pid}/conversations?device_id=final-regress-1 scope by user_id=device_id → always 404/empty. This breaks the entire anonymous project-conversation linking flow AND the pin/rename flow. FIX: add optional device_id as a query param (and/or body field) to /api/chat and /api/chat/stream; when present and no authed user, pass device_id as user_id into get_or_create_conversation. Mirror the exact pattern already used by /api/projects and /api/conversations GET. After the fix, re-run 2c/2d/2e and 3a/3b/3c. No other bugs found; POST /api/export/txt, GET /api/projects, PATCH /api/projects, DELETE /api/projects, GET /api/voices, POST /api/tts with speed, and SSE /api/chat/stream all work as specified."