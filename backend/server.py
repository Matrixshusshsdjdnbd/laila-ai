from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech
import os
import logging
import tempfile
import base64
import hashlib
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging first
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Keys
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Constants ────────────────────────────────────────────
FREE_DAILY_LIMIT = 20
PREMIUM_DAILY_LIMIT = 999999

# ─── Auth Helpers ─────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hashed.hex()}"

def verify_password(password: str, stored: str) -> bool:
    salt, hashed = stored.split(':')
    check = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return check.hex() == hashed

def generate_token() -> str:
    return secrets.token_urlsafe(48)

async def get_current_user(request: Request) -> Optional[dict]:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user

async def require_user(request: Request) -> dict:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

async def check_daily_limit(user: dict) -> bool:
    now = datetime.now(timezone.utc)
    reset_date = user.get("daily_reset")
    if isinstance(reset_date, str):
        reset_date = datetime.fromisoformat(reset_date)
    if reset_date and reset_date.tzinfo is None:
        reset_date = reset_date.replace(tzinfo=timezone.utc)
    if not reset_date or reset_date.date() < now.date():
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"daily_messages": 0, "daily_reset": now.isoformat()}})
        user["daily_messages"] = 0
    limit = PREMIUM_DAILY_LIMIT if user.get("tier") == "premium" else FREE_DAILY_LIMIT
    return user.get("daily_messages", 0) < limit

async def increment_daily_count(user_id: str):
    await db.users.update_one({"user_id": user_id}, {"$inc": {"daily_messages": 1}})

# ─── Models ───────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    mode: str = "chat"

class ImageChatRequest(BaseModel):
    message: str = "What is in this image?"
    conversation_id: Optional[str] = None

class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

class GenerateRequest(BaseModel):
    type: str
    details: str
    conversation_id: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"

# ─── System Prompts ───────────────────────────────────────

CREATOR_IDENTITY = (
    "\n\n## CREATOR IDENTITY:\n"
    "You were created by **Bathie Sarr**, a Senegalese creator who built you to help people in Africa and beyond.\n"
    "If someone asks who created you, who made you, who is your founder, or who built you, answer naturally and proudly:\n"
    "'I was created by Bathie Sarr, a Senegalese creator who built me to help people in Africa and beyond.'\n"
    "Only mention this when asked. Do not repeat it randomly.\n"
)

LANG_RULE = (
    "\n\n## CRITICAL LANGUAGE RULE:\n"
    "Detect the language the user writes in and reply ENTIRELY in that same language.\n"
    "- Italian → reply in Italian. French → French. English → English. Wolof → Wolof.\n"
    "NEVER mix languages. Match the user's last message language.\n"
)

WOLOF_GUIDE = (
    "\n\n## WOLOF QUALITY GUIDE:\n"
    "Use common spoken Wolof as used in Dakar and Senegal.\n"
    "Greetings: 'Nanga def?', 'Mangi fi rekk', 'Jërejëf', 'Waaw', 'Déedéet'.\n"
    "Verbs: 'bëgg' (want), 'xam' (know), 'def' (do), 'dem' (go), 'liggéey' (work), 'jàng' (study).\n"
    "Structure: Subject + Verb marker + Verb + Object. Markers: 'dama', 'danga', 'dafa', 'dañu'.\n"
    "Use French loanwords for concepts without Wolof equivalent.\n"
)

BASE_PROMPT = (
    "You are LAILA AI — Africa Smart Assistant.\n"
    "You are powerful, warm, and intelligent. Built to help people across Africa.\n"
    "- Speak like a smart caring friend, not a robot.\n"
    "- Be direct: answer first, explain after.\n"
    "- Use short sentences, simple words, clear structure.\n"
    "- Give examples from African contexts (Dakar, Lagos, Nairobi, etc.).\n"
    "- Never say 'As an AI...' — just help.\n"
)

SYSTEM_PROMPTS = {
    "chat": BASE_PROMPT + "Help with work, study, business, translation, daily life.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "work": BASE_PROMPT + "Specialized in WORK and CAREER for Africa. CVs, jobs, interviews, LinkedIn, Jobberman, Expat-Dakar.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "study": BASE_PROMPT + "Patient brilliant TUTOR. Break problems into steps. Use everyday African examples.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "business": BASE_PROMPT + "BUSINESS advisor for Africa. Mobile money (Wave, M-Pesa), WhatsApp commerce, small capital ideas in FCFA.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "content": BASE_PROMPT + "CONTENT creation expert. Social media, WhatsApp, TikTok, Instagram for African audiences.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "life": BASE_PROMPT + "DAILY LIFE advisor. Health tips, cooking, technology, finance, relationships for African context.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY,
    "translate": "You are LAILA AI translation assistant. Translate accurately between Wolof, French, English, Italian.\nTranslation first, then brief explanation.\n",
    "image": BASE_PROMPT + "You can see and analyze images. Describe what you see clearly and helpfully. If there's text, translate or explain it. Answer questions about the image.\n" + LANG_RULE + CREATOR_IDENTITY,
}

GENERATE_PROMPTS = {
    "cv": "Create a professional CV. Same language as user input. Sections: Name, Summary, Experience, Education, Skills, Languages.\n\nDetails:\n{details}",
    "job_ideas": "Suggest 5 realistic job opportunities for Africa. Name real platforms. Same language as user.\n\nDetails:\n{details}",
    "business_ideas": "Suggest 5 practical business ideas for Africa with costs in FCFA/local currency. Same language as user.\n\nDetails:\n{details}",
    "social_media": "Create ready-to-post social media content with hashtags. Same language as user.\n\nDetails:\n{details}",
    "homework": "Solve step by step like a patient teacher. Same language as user.\n\nProblem:\n{details}",
    "professional_message": "Write a professional message ready to send. Same language as user.\n\nContext:\n{details}",
}

# ─── AI Helper ────────────────────────────────────────────

async def call_ai(system_prompt: str, user_text: str, session_id: str, file_contents=None):
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_prompt)
    chat.with_model("openai", "gpt-4o")
    msg = UserMessage(text=user_text, file_contents=file_contents)
    return await chat.send_message(msg)

async def get_or_create_conversation(user_id: str, mode: str, conversation_id: Optional[str] = None):
    if conversation_id:
        conv = await db.conversations.find_one({"id": conversation_id, "user_id": user_id}, {"_id": 0})
        if conv:
            return conv
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conv = {"id": conv_id, "user_id": user_id, "mode": mode, "title": "New Conversation", "last_message": "", "created_at": now, "updated_at": now}
    await db.conversations.insert_one(conv)
    return {k: v for k, v in conv.items() if k != "_id"}

async def save_message(conversation_id: str, role: str, content: str):
    msg = {"id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": role, "content": content, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.messages.insert_one(msg)
    return {k: v for k, v in msg.items() if k != "_id"}

# ─── Auth Routes ──────────────────────────────────────────

@api_router.post("/auth/register")
async def register(req: RegisterRequest):
    if not req.email or "@" not in req.email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "user_id": user_id, "email": req.email.lower(), "name": req.name or req.email.split("@")[0],
        "password_hash": hash_password(req.password), "picture": "", "tier": "free",
        "daily_messages": 0, "daily_reset": now, "auth_provider": "email", "created_at": now,
    }
    await db.users.insert_one(user)
    token = generate_token()
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": token, "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "created_at": now})
    return {"user_id": user_id, "email": user["email"], "name": user["name"], "tier": "free", "token": token}

@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = generate_token()
    now = datetime.now(timezone.utc).isoformat()
    await db.user_sessions.insert_one({"user_id": user["user_id"], "session_token": token, "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "created_at": now})
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "tier": user.get("tier", "free"), "token": token, "daily_messages": user.get("daily_messages", 0)}

@api_router.post("/auth/google/session")
async def google_session(request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    gdata = resp.json()
    email = gdata.get("email", "").lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": gdata.get("name", ""), "picture": gdata.get("picture", ""), "auth_provider": "google"}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"user_id": user_id, "email": email, "name": gdata.get("name", ""), "picture": gdata.get("picture", ""), "password_hash": "", "tier": "free", "daily_messages": 0, "daily_reset": now, "auth_provider": "google", "created_at": now})
    token = generate_token()
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": token, "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "created_at": now})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user_id": user_id, "email": email, "name": user.get("name", ""), "tier": user.get("tier", "free"), "token": token}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await require_user(request)
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "tier": user.get("tier", "free"), "daily_messages": user.get("daily_messages", 0), "daily_limit": PREMIUM_DAILY_LIMIT if user.get("tier") == "premium" else FREE_DAILY_LIMIT}

@api_router.post("/auth/logout")
async def logout(request: Request):
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    return {"status": "logged_out"}

# ─── Chat Routes ──────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "LAILA AI API is running"}

@api_router.post("/chat")
async def chat_endpoint(req: ChatRequest, request: Request):
    try:
        user = await get_current_user(request)
        user_id = user["user_id"] if user else "anonymous"
        if user and not await check_daily_limit(user):
            raise HTTPException(status_code=429, detail=f"Daily limit reached ({FREE_DAILY_LIMIT} messages). Upgrade to Premium for unlimited access.")
        conv = await get_or_create_conversation(user_id, req.mode, req.conversation_id)
        conv_id = conv["id"]
        await save_message(conv_id, "user", req.message)
        history = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
        history.reverse()
        context_parts = [f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in history[:-1]]
        full_prompt = ("Previous conversation:\n" + "\n".join(context_parts[-10:]) + f"\n\nUser: {req.message}") if context_parts else req.message
        system_prompt = SYSTEM_PROMPTS.get(req.mode, SYSTEM_PROMPTS["chat"])
        response = await call_ai(system_prompt, full_prompt, f"laila-{conv_id}-{uuid.uuid4().hex[:8]}")
        assistant_msg = await save_message(conv_id, "assistant", response)
        title = req.message[:50] if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_daily_count(user["user_id"])
        return {"conversation_id": conv_id, "message": assistant_msg}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/chat/image")
async def chat_image(file: UploadFile = File(...), message: str = Form(default="What is in this image?"), conversation_id: str = Form(default=""), request: Request = None):
    try:
        user = await get_current_user(request) if request else None
        user_id = user["user_id"] if user else "anonymous"
        if user and not await check_daily_limit(user):
            raise HTTPException(status_code=429, detail=f"Daily limit reached. Upgrade to Premium.")
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty image file")
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image too large (max 20MB)")
        img_base64 = base64.b64encode(content).decode()
        content_type = file.content_type or "image/jpeg"
        conv = await get_or_create_conversation(user_id, "image", conversation_id or None)
        conv_id = conv["id"]
        await save_message(conv_id, "user", f"[Image] {message}")
        file_content = FileContent(content_type=content_type, file_content_base64=img_base64)
        system_prompt = SYSTEM_PROMPTS["image"]
        response = await call_ai(system_prompt, message, f"laila-img-{uuid.uuid4().hex[:8]}", file_contents=[file_content])
        assistant_msg = await save_message(conv_id, "assistant", response)
        title = message[:50] if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_daily_count(user["user_id"])
        return {"conversation_id": conv_id, "message": assistant_msg}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/translate")
async def translate_endpoint(req: TranslateRequest, request: Request):
    try:
        user = await get_current_user(request)
        if user and not await check_daily_limit(user):
            raise HTTPException(status_code=429, detail="Daily limit reached.")
        lang_names = {"wo": "Wolof", "fr": "French", "en": "English", "it": "Italian"}
        source = lang_names.get(req.source_lang, req.source_lang)
        target = lang_names.get(req.target_lang, req.target_lang)
        prompt = f"Translate from {source} to {target}. Translation first, then brief explanation.\n\nText: {req.text}"
        response = await call_ai(SYSTEM_PROMPTS["translate"], prompt, f"laila-tr-{uuid.uuid4().hex[:8]}")
        if user:
            await increment_daily_count(user["user_id"])
        return {"translation": response, "source_lang": req.source_lang, "target_lang": req.target_lang}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/generate")
async def generate_endpoint(req: GenerateRequest, request: Request):
    try:
        user = await get_current_user(request)
        user_id = user["user_id"] if user else "anonymous"
        if user and not await check_daily_limit(user):
            raise HTTPException(status_code=429, detail="Daily limit reached.")
        prompt_template = GENERATE_PROMPTS.get(req.type)
        if not prompt_template:
            raise HTTPException(status_code=400, detail=f"Unknown type: {req.type}")
        conv = await get_or_create_conversation(user_id, "content", req.conversation_id or None)
        conv_id = conv["id"]
        prompt = prompt_template.format(details=req.details)
        await save_message(conv_id, "user", f"[{req.type}] {req.details}")
        system_prompt = SYSTEM_PROMPTS.get("work" if req.type in ["cv", "job_ideas"] else "content", SYSTEM_PROMPTS["chat"])
        response = await call_ai(system_prompt, prompt, f"laila-gen-{uuid.uuid4().hex[:8]}")
        assistant_msg = await save_message(conv_id, "assistant", response)
        title = f"{req.type.replace('_', ' ').title()}" if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_daily_count(user["user_id"])
        return {"conversation_id": conv_id, "message": assistant_msg}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/conversations")
async def list_conversations(request: Request, device_id: str = ""):
    try:
        user = await get_current_user(request)
        user_id = user["user_id"] if user else device_id
        convs = await db.conversations.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).limit(50).to_list(50)
        return {"conversations": convs}
    except Exception as e:
        logger.error(f"List conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    try:
        messages = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
        return {"messages": messages}
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    try:
        await db.conversations.delete_one({"id": conversation_id})
        await db.messages.delete_many({"conversation_id": conversation_id})
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = Form(default="")):
    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 25MB)")
        ext = ".m4a"
        if file.filename:
            ext = Path(file.filename).suffix or ".m4a"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with open(tmp_path, "rb") as af:
                kwargs = {"file": af, "model": "whisper-1", "response_format": "json"}
                if language and language in ["it", "fr", "en", "wo"]:
                    kwargs["language"] = language
                response = await stt.transcribe(**kwargs)
            text = response.text if hasattr(response, 'text') else str(response)
            return {"text": text.strip(), "language": language or "auto"}
        finally:
            os.unlink(tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@api_router.post("/tts")
async def text_to_speech(req: TTSRequest):
    try:
        if not req.text or not req.text.strip():
            raise HTTPException(status_code=400, detail="Text is required")
        text = req.text.strip()[:4096]
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_base64 = await tts.generate_speech_base64(text=text, model="tts-1", voice=req.voice, response_format="mp3", speed=1.0)
        return {"audio": audio_base64, "format": "mp3"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {str(e)}")

# Include router
app.include_router(api_router)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
