"""
Scoped regression + new-feature backend test for LAILA AI.
Tests:
  1) GET /api/voices — must return exactly 6 voices with correct ids/names/genders.
  2) POST /api/tts with speed parameter (4 sub-cases).
  3) POST /api/chat/stream — SSE regression.
  4) POST /api/chat — non-stream regression.
  5) GET /api/conversations?device_id=test-regression — persistence regression.
"""
import json
import sys
import base64
import requests

BASE = "https://africa-laila-hub.preview.emergentagent.com/api"
TIMEOUT = 60

results = []  # list of (name, passed, details)


def record(name, passed, details=""):
    results.append((name, passed, details))
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {name}")
    if details:
        print(f"       {details}")


# ─── Test 1: GET /api/voices ─────────────────────────────
def test_voices():
    expected = {
        "nova":    ("Nova",    "female"),
        "shimmer": ("Shimmer", "female"),
        "onyx":    ("Onyx",    "male"),
        "echo":    ("Echo",    "male"),
        "fable":   ("Fable",   "male"),
        "alloy":   ("Alloy",   "neutral"),
    }
    try:
        r = requests.get(f"{BASE}/voices", timeout=TIMEOUT)
        if r.status_code != 200:
            record("GET /api/voices status 200", False, f"HTTP {r.status_code}: {r.text[:200]}")
            return
        body = r.json()
        voices = body.get("voices")
        if not isinstance(voices, list):
            record("GET /api/voices returns voices list", False, f"body={body}")
            return

        print("       Listed voices:")
        for v in voices:
            print(f"         - id={v.get('id')!r:12} name={v.get('name')!r:12} gender={v.get('gender')!r:10} desc={v.get('desc')!r}")

        if len(voices) != 6:
            record("GET /api/voices returns exactly 6 voices", False, f"got {len(voices)}")
            return
        record("GET /api/voices returns exactly 6 voices", True, "6 voices returned")

        required_fields = {"id", "name", "desc", "gender"}
        all_fields_ok = True
        missing_details = []
        for v in voices:
            missing = required_fields - set(v.keys())
            if missing:
                all_fields_ok = False
                missing_details.append(f"voice {v.get('id')} missing {missing}")
        record("Each voice has id/name/desc/gender", all_fields_ok, "; ".join(missing_details) if missing_details else "all fields present")

        by_id = {v["id"]: v for v in voices if "id" in v}
        mismatches = []
        for vid, (ename, egender) in expected.items():
            if vid not in by_id:
                mismatches.append(f"missing id={vid}")
                continue
            v = by_id[vid]
            if v.get("name") != ename:
                mismatches.append(f"{vid}: name={v.get('name')} expected {ename}")
            if v.get("gender") != egender:
                mismatches.append(f"{vid}: gender={v.get('gender')} expected {egender}")
        record(
            "Voices match expected set (Nova/Shimmer/Onyx/Echo/Fable/Alloy)",
            len(mismatches) == 0,
            "; ".join(mismatches) if mismatches else "all 6 voices match expected spec",
        )
    except Exception as e:
        record("GET /api/voices", False, f"exception: {e}")


# ─── Test 2: POST /api/tts with speed ─────────────────────
def _tts_call(payload, label, expect_ok=True):
    try:
        r = requests.post(f"{BASE}/tts", json=payload, timeout=TIMEOUT)
        if expect_ok:
            if r.status_code != 200:
                record(f"POST /api/tts {label}", False, f"HTTP {r.status_code}: {r.text[:300]}")
                return
            body = r.json()
            audio = body.get("audio")
            fmt = body.get("format")
            if not audio or not isinstance(audio, str):
                record(f"POST /api/tts {label}", False, f"no audio in response: {body}")
                return
            try:
                raw = base64.b64decode(audio, validate=False)
                size = len(raw)
            except Exception as de:
                record(f"POST /api/tts {label}", False, f"audio not valid base64: {de}")
                return
            record(f"POST /api/tts {label}", True, f"HTTP 200, format={fmt}, audio_bytes={size}, base64_chars={len(audio)}")
        else:
            if 400 <= r.status_code < 600:
                record(f"POST /api/tts {label} (invalid voice → graceful error)", True, f"HTTP {r.status_code}: {r.text[:150]}")
            else:
                record(f"POST /api/tts {label} (invalid voice → graceful error)", False, f"unexpected HTTP {r.status_code}: {r.text[:200]}")
    except requests.exceptions.RequestException as e:
        if not expect_ok:
            record(f"POST /api/tts {label} (invalid voice)", False, f"connection error (not graceful): {e}")
        else:
            record(f"POST /api/tts {label}", False, f"request exception: {e}")


def test_tts():
    _tts_call({"text": "Hello, testing voice speed.", "voice": "nova"}, "baseline nova (no speed)", expect_ok=True)
    _tts_call({"text": "Hello, testing voice speed.", "voice": "onyx", "speed": 1.15}, "onyx speed=1.15", expect_ok=True)
    _tts_call({"text": "Testing echo.", "voice": "echo", "speed": 1.1}, "echo speed=1.1", expect_ok=True)
    _tts_call({"text": "Test", "voice": "invalid_voice_xyz"}, "invalid_voice_xyz", expect_ok=False)


# ─── Test 3: SSE streaming regression ─────────────────────
def test_stream():
    try:
        r = requests.post(
            f"{BASE}/chat/stream",
            json={"message": "Say hi in one short sentence.", "mode": "chat", "conversation_id": None},
            stream=True,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            record("POST /api/chat/stream status 200", False, f"HTTP {r.status_code}: {r.text[:200]}")
            return
        ctype = r.headers.get("Content-Type", "")
        if "text/event-stream" not in ctype:
            record("POST /api/chat/stream Content-Type SSE", False, f"got {ctype}")
        else:
            record("POST /api/chat/stream Content-Type SSE", True, ctype)

        delta_count = 0
        delta_chars = 0
        done_seen = False
        conversation_id = None
        error_events = 0
        buffer = ""
        for raw_chunk in r.iter_content(chunk_size=None, decode_unicode=True):
            if not raw_chunk:
                continue
            buffer += raw_chunk
            while "\n\n" in buffer:
                frame, buffer = buffer.split("\n\n", 1)
                for line in frame.splitlines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    payload_text = line[len("data:"):].strip()
                    if not payload_text:
                        continue
                    try:
                        evt = json.loads(payload_text)
                    except json.JSONDecodeError:
                        error_events += 1
                        continue
                    if "conversation_id" in evt and not conversation_id:
                        conversation_id = evt.get("conversation_id")
                    if evt.get("type") == "delta" or "delta" in evt:
                        d = evt.get("delta") or evt.get("content") or ""
                        if d:
                            delta_count += 1
                            delta_chars += len(d)
                    if evt.get("done") is True or evt.get("type") == "done":
                        done_seen = True
                    if evt.get("type") == "error" or evt.get("error"):
                        error_events += 1
            if done_seen:
                break
        r.close()

        details = f"deltas={delta_count}, chars={delta_chars}, done={done_seen}, conv_id={bool(conversation_id)}, errors={error_events}"
        passed = delta_count > 0 and done_seen and bool(conversation_id) and error_events == 0
        record("POST /api/chat/stream SSE regression", passed, details)
    except Exception as e:
        record("POST /api/chat/stream SSE regression", False, f"exception: {e}")


# ─── Test 4: Non-stream chat regression ───────────────────
def test_chat_non_stream():
    try:
        r = requests.post(
            f"{BASE}/chat",
            json={"message": "Hello.", "mode": "chat", "conversation_id": None},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            record("POST /api/chat non-stream", False, f"HTTP {r.status_code}: {r.text[:300]}")
            return
        body = r.json()
        conv_id = body.get("conversation_id")
        msg = body.get("message")
        has_content = bool(msg and (msg.get("content") if isinstance(msg, dict) else msg))
        passed = bool(conv_id) and has_content
        record(
            "POST /api/chat non-stream",
            passed,
            f"conv_id={conv_id}, has_message={has_content}, msg_preview={(str(msg)[:80] if msg else '')!r}",
        )
    except Exception as e:
        record("POST /api/chat non-stream", False, f"exception: {e}")


# ─── Test 5: Conversations persistence ───────────────────
def test_conversations_list():
    try:
        r = requests.get(f"{BASE}/conversations", params={"device_id": "test-regression"}, timeout=TIMEOUT)
        if r.status_code != 200:
            record("GET /api/conversations?device_id=test-regression", False, f"HTTP {r.status_code}: {r.text[:200]}")
            return
        body = r.json()
        if "conversations" not in body:
            record("GET /api/conversations?device_id=test-regression", False, f"missing 'conversations' field: {body}")
            return
        if not isinstance(body["conversations"], list):
            record("GET /api/conversations?device_id=test-regression", False, f"'conversations' not a list: {type(body['conversations'])}")
            return
        record(
            "GET /api/conversations?device_id=test-regression",
            True,
            f"conversations array returned (count={len(body['conversations'])})",
        )
    except Exception as e:
        record("GET /api/conversations?device_id=test-regression", False, f"exception: {e}")


def main():
    print(f"=== LAILA AI backend regression tests ===\nBASE={BASE}\n")
    test_voices()
    print()
    test_tts()
    print()
    test_stream()
    print()
    test_chat_non_stream()
    print()
    test_conversations_list()

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, p, _ in results if p)
    failed = sum(1 for _, p, _ in results if not p)
    print(f"passed={passed}  failed={failed}  total={len(results)}")
    for name, p, det in results:
        print(f"  [{'PASS' if p else 'FAIL'}] {name}")
        if not p and det:
            print(f"         {det}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
