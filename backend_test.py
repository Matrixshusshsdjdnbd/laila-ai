"""
Backend test for LAILA AI streaming chat endpoint.
Scope: /api/chat/stream (SSE) + persistence + regression /api/chat.
"""
import json
import sys
import time
import requests

BASE_URL = "https://africa-laila-hub.preview.emergentagent.com/api"
TIMEOUT = 120


def parse_sse_stream(resp):
    """Parse SSE response. Returns list of parsed JSON events and raw chunk count."""
    events = []
    raw_chunks = 0
    parse_errors = []
    buffer = ""
    for line in resp.iter_lines(decode_unicode=True, chunk_size=1):
        if line is None:
            continue
        raw_chunks += 1
        if not line:
            continue
        if line.startswith("data: "):
            payload = line[6:]
            try:
                events.append(json.loads(payload))
            except Exception as e:
                parse_errors.append({"line": payload[:200], "error": str(e)})
    return events, raw_chunks, parse_errors


def stream_request(message, mode="chat", conversation_id=None):
    body = {"message": message, "mode": mode, "conversation_id": conversation_id}
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    t0 = time.time()
    resp = requests.post(f"{BASE_URL}/chat/stream", json=body, headers=headers, stream=True, timeout=TIMEOUT)
    return resp, t0


def test_1_basic_stream():
    print("\n=== TEST 1: Basic /api/chat/stream (mode=chat) ===")
    resp, t0 = stream_request("Hello, introduce yourself in one short paragraph.", mode="chat")
    print(f"Status: {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('Content-Type')}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:500]}"
    ct = resp.headers.get("Content-Type", "")
    assert "text/event-stream" in ct, f"Expected SSE content-type, got {ct}"

    events, raw_chunks, parse_errors = parse_sse_stream(resp)
    elapsed = time.time() - t0

    print(f"Raw lines (chunks incl blank separators): {raw_chunks}")
    print(f"Parsed SSE events: {len(events)}")
    print(f"Parse errors: {len(parse_errors)}")
    if parse_errors:
        print(f"  Errors: {parse_errors[:3]}")

    # Check error events
    error_events = [e for e in events if "error" in e]
    if error_events:
        print(f"ERROR events: {error_events}")
        raise AssertionError(f"Got error events: {error_events}")

    # First event should have conversation_id
    assert len(events) > 0, "No events received"
    first = events[0]
    assert "conversation_id" in first, f"First event missing conversation_id: {first}"
    conv_id = first["conversation_id"]
    print(f"First event conversation_id: {conv_id}")

    # Count delta chunks & concatenate
    delta_events = [e for e in events if "delta" in e]
    full_text = "".join(e["delta"] for e in delta_events)
    print(f"Delta chunks: {len(delta_events)}")
    print(f"Full concatenated assistant text ({len(full_text)} chars):")
    print(f"  >>> {full_text[:400]}{'...' if len(full_text) > 400 else ''}")

    # Final event
    done_events = [e for e in events if e.get("done") is True]
    assert done_events, "No done event received"
    done = done_events[-1]
    assert "message" in done, f"Done event missing 'message': {done}"
    msg = done["message"]
    assert msg.get("id"), "message.id missing"
    assert msg.get("conversation_id") == conv_id, f"conv_id mismatch: {msg}"
    assert msg.get("role") == "assistant", f"role != assistant: {msg}"
    assert msg.get("content"), "message.content empty"
    assert msg.get("created_at"), "created_at missing"

    print(f"Time elapsed: {elapsed:.2f}s")
    print(f"TEST 1 PASS — conv_id={conv_id}, delta_chunks={len(delta_events)}, total_chars={len(full_text)}")
    return conv_id, full_text, len(delta_events)


def test_2_followup_context(conv_id):
    print(f"\n=== TEST 2: Follow-up with same conversation_id ({conv_id}) ===")
    resp, t0 = stream_request("What did I just say to you?", mode="chat", conversation_id=conv_id)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    events, raw_chunks, parse_errors = parse_sse_stream(resp)
    print(f"Raw lines: {raw_chunks}, Events: {len(events)}, Parse errors: {len(parse_errors)}")
    error_events = [e for e in events if "error" in e]
    assert not error_events, f"error events: {error_events}"
    first = events[0]
    assert first.get("conversation_id") == conv_id, f"conv_id mismatch: expected {conv_id}, got {first}"
    delta_events = [e for e in events if "delta" in e]
    full_text = "".join(e["delta"] for e in delta_events)
    print(f"Delta chunks: {len(delta_events)}, chars: {len(full_text)}")
    print(f"Assistant reply: >>> {full_text[:500]}")
    # Context check: look for "introduce", "hello", "yourself", "said"
    lc = full_text.lower()
    keywords = ["introduce", "hello", "yourself", "said", "paragraph", "asked"]
    found = [k for k in keywords if k in lc]
    print(f"Context keywords found: {found}")
    context_ok = len(found) >= 1
    assert context_ok, f"Assistant did not reference previous turn. Text: {full_text[:400]}"
    done_events = [e for e in events if e.get("done") is True]
    assert done_events, "No done event"
    print(f"TEST 2 PASS — context preserved, delta_chunks={len(delta_events)}")
    return full_text, len(delta_events)


def test_3_persistence(conv_id):
    print(f"\n=== TEST 3: GET /api/conversations/{conv_id}/messages ===")
    resp = requests.get(f"{BASE_URL}/conversations/{conv_id}/messages", timeout=30)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:500]}"
    data = resp.json()
    messages = data.get("messages", [])
    print(f"Total messages: {len(messages)}")
    for i, m in enumerate(messages):
        print(f"  [{i}] role={m.get('role')} content_len={len(m.get('content', ''))} preview={m.get('content', '')[:80]!r}")

    assert len(messages) >= 4, f"Expected ≥4 messages, got {len(messages)}"
    roles = [m.get("role") for m in messages]
    user_count = roles.count("user")
    assistant_count = roles.count("assistant")
    assert user_count >= 2, f"Expected ≥2 user msgs, got {user_count}"
    assert assistant_count >= 2, f"Expected ≥2 assistant msgs, got {assistant_count}"
    for m in messages:
        assert m.get("content"), f"Empty content in message: {m}"
        assert m.get("role") in ("user", "assistant"), f"Unexpected role: {m}"
    print(f"TEST 3 PASS — {user_count} user + {assistant_count} assistant messages persisted.")


def test_4_non_streaming_regression():
    print("\n=== TEST 4: Regression /api/chat (non-stream) ===")
    body = {"message": "Say 'hello' in one word.", "mode": "quick", "conversation_id": None}
    resp = requests.post(f"{BASE_URL}/chat", json=body, timeout=TIMEOUT)
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:500]}"
    data = resp.json()
    assert "conversation_id" in data, f"missing conv_id: {data}"
    msg = data.get("message", {})
    assert msg.get("role") == "assistant", f"role wrong: {msg}"
    assert msg.get("content"), "content empty"
    print(f"conv_id={data['conversation_id']}, content={msg['content'][:200]!r}")
    print("TEST 4 PASS — non-stream /api/chat still works.")


def test_5_quick_vs_chat_length():
    print("\n=== TEST 5: mode=quick should produce shorter output than mode=chat ===")
    q_prompt = "Explain how photosynthesis works."
    # chat mode
    resp_c, _ = stream_request(q_prompt, mode="chat")
    assert resp_c.status_code == 200
    events_c, _, _ = parse_sse_stream(resp_c)
    deltas_c = [e for e in events_c if "delta" in e]
    text_c = "".join(e["delta"] for e in deltas_c)
    err_c = [e for e in events_c if "error" in e]
    assert not err_c, f"chat mode errors: {err_c}"

    # quick mode
    resp_q, _ = stream_request(q_prompt, mode="quick")
    assert resp_q.status_code == 200
    events_q, _, _ = parse_sse_stream(resp_q)
    deltas_q = [e for e in events_q if "delta" in e]
    text_q = "".join(e["delta"] for e in deltas_q)
    err_q = [e for e in events_q if "error" in e]
    assert not err_q, f"quick mode errors: {err_q}"

    print(f"chat mode: {len(deltas_c)} chunks, {len(text_c)} chars")
    print(f"quick mode: {len(deltas_q)} chunks, {len(text_q)} chars")
    print(f"chat sample: {text_c[:200]}...")
    print(f"quick sample: {text_q[:200]}...")
    assert len(text_q) < len(text_c), f"quick ({len(text_q)}) not shorter than chat ({len(text_c)})"
    print("TEST 5 PASS — quick mode shorter than chat mode.")


def main():
    results = {}
    try:
        conv_id, _, _ = test_1_basic_stream()
        results["test_1_basic_stream"] = "PASS"
    except Exception as e:
        print(f"TEST 1 FAIL: {e}")
        results["test_1_basic_stream"] = f"FAIL: {e}"
        sys.exit(1)

    try:
        test_2_followup_context(conv_id)
        results["test_2_followup_context"] = "PASS"
    except Exception as e:
        print(f"TEST 2 FAIL: {e}")
        results["test_2_followup_context"] = f"FAIL: {e}"

    try:
        test_3_persistence(conv_id)
        results["test_3_persistence"] = "PASS"
    except Exception as e:
        print(f"TEST 3 FAIL: {e}")
        results["test_3_persistence"] = f"FAIL: {e}"

    try:
        test_4_non_streaming_regression()
        results["test_4_non_stream_regression"] = "PASS"
    except Exception as e:
        print(f"TEST 4 FAIL: {e}")
        results["test_4_non_stream_regression"] = f"FAIL: {e}"

    try:
        test_5_quick_vs_chat_length()
        results["test_5_quick_vs_chat"] = "PASS"
    except Exception as e:
        print(f"TEST 5 FAIL: {e}")
        results["test_5_quick_vs_chat"] = f"FAIL: {e}"

    print("\n\n=== FINAL SUMMARY ===")
    for k, v in results.items():
        print(f"  {k}: {v}")
    failed = [k for k, v in results.items() if not v.startswith("PASS")]
    if failed:
        print(f"\n{len(failed)} test(s) failed.")
        sys.exit(1)
    print("\nALL TESTS PASS")


if __name__ == "__main__":
    main()
