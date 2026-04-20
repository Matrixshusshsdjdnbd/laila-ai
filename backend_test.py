"""
Focused re-test for previously failing flows:
- Projects ↔ Conversations linking
- Pin / Rename conversations
- SSE stream with device_id in body

Base URL: https://africa-laila-hub.preview.emergentagent.com
All tests use device_id = "fix-verify-1".
"""

import json
import sys
import time

import requests

BASE = "https://africa-laila-hub.preview.emergentagent.com/api"
DEVICE_ID = "fix-verify-1"

results = []


def record(name, passed, detail=""):
    results.append((name, passed, detail))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} — {detail}")


def main():
    cid = None
    pid = None

    # --- Test 1: POST /api/chat with device_id ---
    try:
        r = requests.post(
            f"{BASE}/chat",
            json={
                "message": "Hi LAILA",
                "mode": "chat",
                "conversation_id": None,
                "device_id": DEVICE_ID,
            },
            timeout=60,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        cid = body.get("conversation_id")
        record(
            "1) POST /api/chat with device_id",
            ok and bool(cid),
            f"status={r.status_code}, cid={cid}",
        )
    except Exception as e:
        record("1) POST /api/chat with device_id", False, f"exc={e}")

    if not cid:
        print("Cannot proceed without conversation_id. Aborting.")
        finalize()
        return

    # --- Test 2: GET /api/conversations?device_id=fix-verify-1 contains cid ---
    try:
        r = requests.get(f"{BASE}/conversations", params={"device_id": DEVICE_ID}, timeout=30)
        ok = r.status_code == 200
        convs = r.json().get("conversations", []) if ok else []
        found = any(c.get("id") == cid for c in convs)
        record(
            "2) GET /api/conversations lists the cid",
            ok and found,
            f"status={r.status_code}, count={len(convs)}, cid_found={found}",
        )
    except Exception as e:
        record("2) GET /api/conversations lists the cid", False, f"exc={e}")

    # --- Test 3: POST /api/projects ---
    try:
        r = requests.post(
            f"{BASE}/projects",
            params={"device_id": DEVICE_ID},
            json={"name": "Verify", "color": "#10B981"},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        pid = body.get("id")
        record(
            "3) POST /api/projects",
            ok and bool(pid),
            f"status={r.status_code}, pid={pid}, name={body.get('name')}, color={body.get('color')}",
        )
    except Exception as e:
        record("3) POST /api/projects", False, f"exc={e}")

    if not pid:
        print("Cannot proceed without project_id. Aborting.")
        finalize()
        return

    # --- Test 4: PATCH /api/conversations/{cid} set project_id=pid ---
    try:
        r = requests.patch(
            f"{BASE}/conversations/{cid}",
            params={"device_id": DEVICE_ID},
            json={"project_id": pid},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        conv = body.get("conversation", body)  # allow either wrapped or direct
        project_id_val = conv.get("project_id") if isinstance(conv, dict) else None
        record(
            "4) PATCH conversation link-to-project returns 200 with project_id=pid",
            ok and project_id_val == pid,
            f"status={r.status_code}, returned_project_id={project_id_val}",
        )
    except Exception as e:
        record("4) PATCH conversation link-to-project", False, f"exc={e}")

    # --- Test 5: GET /api/projects/{pid}/conversations contains cid ---
    try:
        r = requests.get(
            f"{BASE}/projects/{pid}/conversations",
            params={"device_id": DEVICE_ID},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        convs = body.get("conversations", body if isinstance(body, list) else [])
        found = any(c.get("id") == cid for c in convs) if isinstance(convs, list) else False
        record(
            "5) GET /api/projects/{pid}/conversations lists cid",
            ok and found,
            f"status={r.status_code}, count={len(convs) if isinstance(convs, list) else 'n/a'}, cid_found={found}",
        )
    except Exception as e:
        record("5) GET /api/projects/{pid}/conversations lists cid", False, f"exc={e}")

    # --- Test 6: PATCH pinned=true, title="Important" ---
    try:
        r = requests.patch(
            f"{BASE}/conversations/{cid}",
            params={"device_id": DEVICE_ID},
            json={"pinned": True, "title": "Important"},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        conv = body.get("conversation", body)
        pinned_val = conv.get("pinned") if isinstance(conv, dict) else None
        title_val = conv.get("title") if isinstance(conv, dict) else None
        record(
            "6) PATCH pinned=true, title='Important'",
            ok and pinned_val is True and title_val == "Important",
            f"status={r.status_code}, pinned={pinned_val}, title={title_val!r}",
        )
    except Exception as e:
        record("6) PATCH pinned+title", False, f"exc={e}")

    # --- Test 7: GET /api/conversations shows cid first with title "Important" ---
    try:
        r = requests.get(f"{BASE}/conversations", params={"device_id": DEVICE_ID}, timeout=30)
        ok = r.status_code == 200
        convs = r.json().get("conversations", []) if ok else []
        first = convs[0] if convs else {}
        record(
            "7) GET /api/conversations — pinned cid first with title 'Important'",
            ok and first.get("id") == cid and first.get("title") == "Important",
            f"status={r.status_code}, first_id={first.get('id')}, first_title={first.get('title')!r}, first_pinned={first.get('pinned')}",
        )
    except Exception as e:
        record("7) GET /api/conversations pinned sort", False, f"exc={e}")

    # --- Test 8: PATCH project_id="" to unassign ---
    try:
        r = requests.patch(
            f"{BASE}/conversations/{cid}",
            params={"device_id": DEVICE_ID},
            json={"project_id": ""},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        conv = body.get("conversation", body)
        project_id_val = conv.get("project_id") if isinstance(conv, dict) else "SENTINEL"
        # After unassign, project_id should be absent/None/empty
        unassigned = project_id_val in (None, "", "SENTINEL") or project_id_val is None
        record(
            "8) PATCH project_id='' unassigns",
            ok and unassigned,
            f"status={r.status_code}, project_id_after={project_id_val!r}",
        )
    except Exception as e:
        record("8) PATCH unassign project", False, f"exc={e}")

    # --- Test 9: DELETE /api/projects/{pid} ---
    try:
        r = requests.delete(
            f"{BASE}/projects/{pid}",
            params={"device_id": DEVICE_ID},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        record(
            "9) DELETE /api/projects/{pid}",
            ok,
            f"status={r.status_code}, body={body}",
        )
    except Exception as e:
        record("9) DELETE /api/projects/{pid}", False, f"exc={e}")

    # --- Regression: POST /api/chat/stream with device_id in body ---
    stream_cid = None
    try:
        with requests.post(
            f"{BASE}/chat/stream",
            json={
                "message": "Stream test",
                "mode": "chat",
                "device_id": DEVICE_ID,
            },
            stream=True,
            timeout=90,
        ) as r:
            ctype = r.headers.get("Content-Type", "")
            ok_headers = r.status_code == 200 and "text/event-stream" in ctype
            delta_count = 0
            done_seen = False
            buf = ""
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                if raw.startswith("data: "):
                    payload = raw[6:]
                    try:
                        obj = json.loads(payload)
                    except Exception:
                        continue
                    if obj.get("conversation_id") and not stream_cid:
                        stream_cid = obj["conversation_id"]
                    if obj.get("delta"):
                        delta_count += 1
                    if obj.get("done"):
                        done_seen = True
                        break
            record(
                "R1) POST /api/chat/stream SSE with device_id body",
                ok_headers and stream_cid and delta_count > 0 and done_seen,
                f"status={r.status_code}, ctype={ctype}, stream_cid={stream_cid}, deltas={delta_count}, done={done_seen}",
            )
    except Exception as e:
        record("R1) POST /api/chat/stream SSE with device_id body", False, f"exc={e}")

    # --- Regression: final conversation appears in GET /api/conversations ---
    if stream_cid:
        try:
            time.sleep(1)
            r = requests.get(f"{BASE}/conversations", params={"device_id": DEVICE_ID}, timeout=30)
            ok = r.status_code == 200
            convs = r.json().get("conversations", []) if ok else []
            found = any(c.get("id") == stream_cid for c in convs)
            record(
                "R2) Stream conv appears in GET /api/conversations",
                ok and found,
                f"status={r.status_code}, count={len(convs)}, stream_cid_found={found}",
            )
        except Exception as e:
            record("R2) Stream conv appears in GET /api/conversations", False, f"exc={e}")

    finalize()


def finalize():
    print("\n========== SUMMARY ==========")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    for name, ok, detail in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
