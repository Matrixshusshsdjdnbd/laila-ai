"""
LAILA AI Backend Regression + New Feature Test
Scoped to the review request items only.
"""
import json
import sys
import base64
import requests

BASE = "https://africa-laila-hub.preview.emergentagent.com/api"
DEVICE = "final-regress-1"
TIMEOUT = 90

results = []

def log(name, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}  {detail}")
    results.append((ok, name, detail))
    return ok


project_id = None

def test_projects_crud():
    global project_id
    # a) Create
    r = requests.post(f"{BASE}/projects", params={"device_id": DEVICE},
                      json={"name": "CV Project", "description": "My resume work", "color": "#3B82F6"},
                      timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    project_id = data.get("id")
    cond = ok and project_id and data.get("name") == "CV Project" and data.get("color") == "#3B82F6" and data.get("chat_count") == 0
    log("1a POST /api/projects creates project", cond,
        f"status={r.status_code} body={r.text[:200]}")

    # b) List
    r = requests.get(f"{BASE}/projects", params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    projs = data.get("projects", [])
    cond = ok and isinstance(projs, list) and any(p.get("id") == project_id for p in projs)
    log("1b GET /api/projects lists created project", cond,
        f"status={r.status_code} count={len(projs) if ok else 'n/a'}")

    # c) Patch
    r = requests.patch(f"{BASE}/projects/{project_id}", params={"device_id": DEVICE},
                       json={"name": "CV Final", "color": "#10B981"}, timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    cond = ok and data.get("name") == "CV Final" and data.get("color") == "#10B981"
    log("1c PATCH /api/projects/{id} updates", cond,
        f"status={r.status_code} body={r.text[:200]}")

    # d) Delete
    r = requests.delete(f"{BASE}/projects/{project_id}", params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    cond = ok and data.get("ok") is True
    log("1d DELETE /api/projects/{id} ok:true", cond,
        f"status={r.status_code} body={r.text[:200]}")

    # e) 404
    r = requests.patch(f"{BASE}/projects/non-existent-id", params={"device_id": DEVICE},
                       json={"name": "x"}, timeout=TIMEOUT)
    cond = r.status_code == 404
    log("1e PATCH non-existent project → 404", cond, f"status={r.status_code}")


def test_project_conv_relationship():
    # fresh project
    r = requests.post(f"{BASE}/projects", params={"device_id": DEVICE},
                      json={"name": "Work Folder", "description": "", "color": "#F59E0B"},
                      timeout=TIMEOUT)
    if r.status_code != 200:
        log("2a Create project", False, f"status={r.status_code}")
        return
    pid = r.json()["id"]
    log("2a Create project for conv link", True, f"pid={pid}")

    # chat → conv id
    r = requests.post(f"{BASE}/chat",
                      json={"message": "Hi", "mode": "chat", "conversation_id": None,
                            "device_id": DEVICE},
                      timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    conv_id = data.get("conversation_id")
    log("2b POST /api/chat returns conversation_id", ok and bool(conv_id),
        f"status={r.status_code} conv_id={conv_id}")
    if not conv_id:
        return

    # Link
    r = requests.patch(f"{BASE}/conversations/{conv_id}", params={"device_id": DEVICE},
                       json={"project_id": pid}, timeout=TIMEOUT)
    link_ok = r.status_code == 200
    log("2c PATCH /api/conversations/{id} link to project", link_ok,
        f"status={r.status_code} body={r.text[:220]}")

    # List
    r = requests.get(f"{BASE}/projects/{pid}/conversations",
                     params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    convs = r.json().get("conversations", []) if ok else []
    cond = ok and any(c.get("id") == conv_id for c in convs)
    log("2d GET /api/projects/{pid}/conversations includes conv", cond,
        f"status={r.status_code} count={len(convs) if ok else 'n/a'}")

    # Unassign
    r = requests.patch(f"{BASE}/conversations/{conv_id}", params={"device_id": DEVICE},
                       json={"project_id": ""}, timeout=TIMEOUT)
    cond = r.status_code == 200
    log("2e PATCH project_id='' unassigns", cond,
        f"status={r.status_code} body={r.text[:200]}")

    # Empty
    r = requests.get(f"{BASE}/projects/{pid}/conversations",
                     params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    convs = r.json().get("conversations", []) if ok else []
    cond = ok and not any(c.get("id") == conv_id for c in convs)
    log("2f GET /api/projects/{pid}/conversations empty after unassign", cond,
        f"status={r.status_code} remaining={len(convs) if ok else 'n/a'}")

    requests.delete(f"{BASE}/projects/{pid}", params={"device_id": DEVICE}, timeout=TIMEOUT)


def test_pin_rename():
    r = requests.post(f"{BASE}/chat",
                      json={"message": "Hi for pin test", "mode": "chat",
                            "conversation_id": None, "device_id": DEVICE},
                      timeout=TIMEOUT)
    if r.status_code != 200:
        log("3 pre-req chat", False, f"status={r.status_code}")
        return
    conv_id = r.json()["conversation_id"]

    r = requests.patch(f"{BASE}/conversations/{conv_id}", params={"device_id": DEVICE},
                       json={"pinned": True, "title": "Pinned Important Chat"},
                       timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    cond = ok and data.get("pinned") is True and data.get("title") == "Pinned Important Chat"
    log("3a PATCH pinned=true title=Pinned Important Chat", cond,
        f"status={r.status_code} body={r.text[:220]}")

    r = requests.get(f"{BASE}/conversations", params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    convs = r.json().get("conversations", []) if ok else []
    match = next((c for c in convs if c.get("id") == conv_id), None)
    cond = ok and match and match.get("pinned") is True and match.get("title") == "Pinned Important Chat"
    log("3b GET /api/conversations shows pinned:true + new title", cond,
        f"status={r.status_code} match_found={bool(match)} "
        f"title={(match or {}).get('title')!r} pinned={(match or {}).get('pinned')}")

    r = requests.patch(f"{BASE}/conversations/{conv_id}", params={"device_id": DEVICE},
                       json={"pinned": False}, timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    cond = ok and data.get("pinned") is False
    log("3c PATCH pinned=false returns pinned:false", cond,
        f"status={r.status_code} body={r.text[:200]}")


def test_export_txt():
    content = "Hello, this is my CV content\nLine 2"
    r = requests.post(f"{BASE}/export/txt",
                      json={"content": content, "filename": "my-cv"}, timeout=TIMEOUT)
    ok = r.status_code == 200
    ctype = r.headers.get("content-type", "")
    cdisp = r.headers.get("content-disposition", "")
    body = r.text
    cond = (ok and "text/plain" in ctype and "attachment" in cdisp
            and 'my-cv.txt' in cdisp and body == content)
    log("4 POST /api/export/txt returns correct file", cond,
        f"status={r.status_code} ctype={ctype!r} cdisp={cdisp!r} "
        f"body_match={body == content} body_len={len(body)}")


def test_regressions():
    # SSE
    try:
        with requests.post(f"{BASE}/chat/stream",
                           json={"message": "Say hi in one short sentence.", "mode": "chat",
                                 "conversation_id": None},
                           stream=True, timeout=TIMEOUT) as r:
            ctype = r.headers.get("content-type", "")
            got_delta = False
            got_done = False
            got_conv = False
            for line in r.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                try:
                    evt = json.loads(line[6:])
                except Exception:
                    continue
                if "conversation_id" in evt and not got_done:
                    got_conv = True
                if "delta" in evt:
                    got_delta = True
                if evt.get("done"):
                    got_done = True
                    break
            cond = r.status_code == 200 and "text/event-stream" in ctype and got_conv and got_delta and got_done
            log("5a POST /api/chat/stream SSE works", cond,
                f"status={r.status_code} ctype={ctype!r} conv={got_conv} delta={got_delta} done={got_done}")
    except Exception as e:
        log("5a POST /api/chat/stream SSE works", False, f"exc={e}")

    # TTS
    r = requests.post(f"{BASE}/tts",
                      json={"text": "Bonjour, ceci est un test de voix.",
                            "voice": "onyx", "speed": 1.1}, timeout=TIMEOUT)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    audio = data.get("audio", "")
    raw = b""
    try:
        raw = base64.b64decode(audio) if audio else b""
        b64_ok = len(raw) > 100
    except Exception:
        b64_ok = False
    cond = ok and b64_ok and data.get("format") == "mp3"
    log("5b POST /api/tts onyx speed=1.1 returns base64 mp3", cond,
        f"status={r.status_code} audio_chars={len(audio)} decoded_bytes={len(raw)}")

    # Voices
    r = requests.get(f"{BASE}/voices", timeout=TIMEOUT)
    ok = r.status_code == 200
    voices = r.json().get("voices", []) if ok else []
    cond = ok and len(voices) == 6
    log("5c GET /api/voices returns 6 voices", cond,
        f"status={r.status_code} count={len(voices)}")

    # Conversations
    r = requests.get(f"{BASE}/conversations", params={"device_id": DEVICE}, timeout=TIMEOUT)
    ok = r.status_code == 200
    cond = ok and "conversations" in (r.json() if ok else {})
    log("5d GET /api/conversations returns conversations array", cond,
        f"status={r.status_code}")


def main():
    print(f"Testing backend: {BASE}\n")
    print("=== 1. Projects CRUD ===")
    test_projects_crud()
    print("\n=== 2. Project <-> Conversation ===")
    test_project_conv_relationship()
    print("\n=== 3. Pin + Rename ===")
    test_pin_rename()
    print("\n=== 4. Export TXT ===")
    test_export_txt()
    print("\n=== 5. Regressions ===")
    test_regressions()

    print("\n\n===== SUMMARY =====")
    passed = sum(1 for ok, *_ in results if ok)
    total = len(results)
    print(f"{passed}/{total} passed")
    for ok, name, detail in results:
        mark = "PASS" if ok else "FAIL"
        print(f"  [{mark}] {name}")
        if not ok:
            print(f"         {detail}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
