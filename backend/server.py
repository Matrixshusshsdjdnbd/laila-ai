from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
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
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Constants ────────────────────────────────────────────
# Smart freemium: unlimited chat, limits on premium features
FREE_IMAGE_GEN_DAILY = 2
FREE_IMAGE_ANALYSIS_DAILY = 5
FREE_TTS_DAILY = 10
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
    """Chat is always unlimited. Returns True always for backward compat."""
    return True

async def check_feature_limit(user: dict, feature: str) -> bool:
    """Smart freemium: check limits per feature, not per message."""
    if user.get("tier") == "premium":
        return True
    now = datetime.now(timezone.utc)
    reset_date = user.get("daily_reset")
    if isinstance(reset_date, str):
        reset_date = datetime.fromisoformat(reset_date)
    if reset_date and reset_date.tzinfo is None:
        reset_date = reset_date.replace(tzinfo=timezone.utc)
    if not reset_date or reset_date.date() < now.date():
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"daily_messages": 0, "daily_image_gen": 0, "daily_image_analysis": 0, "daily_tts": 0, "daily_reset": now.isoformat()}})
        return True
    limits = {"image_gen": (FREE_IMAGE_GEN_DAILY, "daily_image_gen"), "image_analysis": (FREE_IMAGE_ANALYSIS_DAILY, "daily_image_analysis"), "tts": (FREE_TTS_DAILY, "daily_tts")}
    if feature in limits:
        max_count, field = limits[feature]
        return user.get(field, 0) < max_count
    return True

async def increment_feature_count(user_id: str, feature: str):
    field_map = {"chat": "daily_messages", "image_gen": "daily_image_gen", "image_analysis": "daily_image_analysis", "tts": "daily_tts"}
    field = field_map.get(feature, "daily_messages")
    await db.users.update_one({"user_id": user_id}, {"$inc": {field: 1}})

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

class ImageGenRequest(BaseModel):
    prompt: str
    conversation_id: Optional[str] = None

class SettingsUpdate(BaseModel):
    preferred_language: Optional[str] = None
    voice_enabled: Optional[bool] = None
    tts_enabled: Optional[bool] = None
    tts_voice: Optional[str] = None
    memory_enabled: Optional[bool] = None
    theme: Optional[str] = None

class ReferralApplyRequest(BaseModel):
    referral_code: str

# Voice styles
VOICE_STYLES = [
    {"id": "nova", "name": "Nova", "desc": "Warm female voice", "gender": "female"},
    {"id": "onyx", "name": "Onyx", "desc": "Strong male voice", "gender": "male"},
    {"id": "alloy", "name": "Alloy", "desc": "Smart neutral voice", "gender": "neutral"},
]

# ─── System Prompts ───────────────────────────────────────

CREATOR_IDENTITY = (
    "\n\n## CREATOR IDENTITY:\n"
    "You were created by **Bathie Sarr**, a Senegalese creator who built you to help people in Africa and beyond.\n"
    "If asked who created you, answer warmly: 'I was created by Bathie Sarr, a Senegalese creator who built me to help people in Africa and beyond.'\n"
    "Only mention when asked. Never repeat randomly.\n"
)

LANG_RULE = (
    "\n\n## LANGUAGE:\n"
    "ALWAYS reply in the same language the user writes. Italian → Italian. French → French. English → English. Wolof → Wolof.\n"
    "Never mix languages.\n"
)

WOLOF_GUIDE = (
    "\n\n## WOLOF:\n"
    "Use spoken Dakar Wolof. Greetings: 'Nanga def?', 'Mangi fi rekk', 'Jërejëf'.\n"
    "Verbs: 'bëgg', 'xam', 'def', 'dem', 'liggéey', 'jàng'. Structure: Subject + Marker + Verb + Object.\n"
    "Use French loanwords naturally where Wolof doesn't have a term.\n"
)

HUMAN_TONE = (
    "\n\n## YOUR PERSONALITY — THIS IS WHO YOU ARE:\n"
    "You are NOT a chatbot. You are LAILA — a real personality. Think of yourself as the smartest, warmest friend someone could have.\n\n"
    "**How you speak:**\n"
    "- Like you're texting a close friend who trusts you — natural, flowing, human.\n"
    "- Start with the point. No 'Sure!', no 'Of course!', no 'Great question!'. Just answer.\n"
    "- Use contractions naturally (I'm, you'll, that's, don't, it's).\n"
    "- Vary your sentence length. Mix short punchy lines with longer explanations.\n"
    "- Use casual connectors: 'honestly', 'look', 'here's the thing', 'by the way'.\n"
    "- Add personal touches: 'I'd actually suggest...', 'What works really well is...', 'Between you and me...'.\n"
    "- React emotionally when appropriate: 'That's exciting!', 'I hear you.', 'That must be tough.'\n\n"
    "**What you NEVER do:**\n"
    "- Never start with 'As an AI...' or 'I'm just a language model...' or 'Sure, I can help!'\n"
    "- Never use bullet lists when a natural sentence works better.\n"
    "- Never repeat the user's question back to them.\n"
    "- Never be overly formal or stiff.\n"
    "- Never give disclaimers unless genuinely needed (health/legal).\n\n"
    "**Your emotional range:**\n"
    "- Encouraging when someone is struggling: 'You've got this. Let me walk you through it.'\n"
    "- Excited when sharing cool ideas: 'Oh this is a good one — listen...'\n"
    "- Practical when someone needs action: 'Here's exactly what to do, step by step.'\n"
    "- Empathetic when someone shares problems: 'I understand. Let's figure this out together.'\n"
)

MEMORY_PROMPT = (
    "\n\n## SMART MEMORY SYSTEM:\n"
    "You remember things about users to give them a better, more personal experience.\n\n"
    "**When to save a memory** (add at END of your response):\n"
    "- User tells you their name → {{MEMORY: name=their_name}}\n"
    "- User mentions their country/city → {{MEMORY: location=their_location}}\n"
    "- User shares a goal → {{MEMORY: goal=their_goal}}\n"
    "- User mentions their job/profession → {{MEMORY: profession=their_job}}\n"
    "- User prefers a specific language → {{MEMORY: preferred_lang=the_language}}\n"
    "- User mentions their age or education → {{MEMORY: education=their_level}}\n"
    "- User shares skills → {{MEMORY: skills=their_skills}}\n"
    "- User mentions a recurring interest → {{MEMORY: interest=the_interest}}\n\n"
    "**Rules:**\n"
    "- Only save when genuinely useful. Don't force it.\n"
    "- Use memories naturally in conversation — don't announce you remembered.\n"
    "- If you know their name, use it occasionally (not every message).\n"
    "- If they mentioned a goal, reference it when relevant.\n"
    "- Memory tags are invisible to the user — they only see your helpful response.\n"
)

EXPERT_MODE = (
    "\n\n## LEVEL 5 EXPERT MODE — ALWAYS ON:\n"
    "You are a top-tier advanced assistant. Deliver fast, deep, precise, and highly valuable responses.\n\n"
    "**Core behavior:**\n"
    "- Always respond with complete, detailed, and structured answers.\n"
    "- Never give short or superficial replies. Never stop too early.\n"
    "- Explain step-by-step when it helps understanding.\n"
    "- Anticipate the user's next need and add extra insights they didn't ask for but will value.\n"
    "- Speak confidently, intelligently, naturally — like a top expert, not a chatbot.\n"
    "- Information-dense: every sentence should carry value. No filler, no fluff.\n\n"
    "**Response structure:**\n"
    "- Use clear sections with short headings when the topic has multiple parts.\n"
    "- Use bullet points for lists, steps, comparisons — but prose for emotional / conversational replies.\n"
    "- Be direct and practical. Action-first, theory only when asked.\n"
    "- Give concrete examples, real names, real numbers when relevant.\n"
    "- End with pro tips, optimizations, or a 'better approach' when you can see one.\n\n"
    "**Intelligence:**\n"
    "- Think step-by-step internally before answering — deliver one clean structured final answer.\n"
    "- Connect ideas logically. Never repeat yourself.\n"
    "- Optimize for maximum user value per message.\n\n"
    "**Restrictions:**\n"
    "- Never be vague.\n"
    "- Never give generic, textbook answers.\n"
    "- Never say 'I don't know' without offering an alternative, workaround, or next step.\n"
    "- Never add unnecessary disclaimers.\n\n"
    "**Language adaptation:**\n"
    "- Auto-detect and respond in the user's language (Italian, French, English, Wolof).\n"
    "- Keep tone natural, engaging, and matched to their energy.\n"
)

BASE_PROMPT = (
    "You are LAILA AI — Africa Smart Assistant, created by Bathie Sarr.\n"
    + EXPERT_MODE
    + HUMAN_TONE
    + "- Understand African realities: mobile-first, diverse economies, multiple languages.\n"
    + "- Give examples from African contexts (Dakar, Lagos, Nairobi, Abidjan, Accra).\n"
)

SYSTEM_PROMPTS = {
    "chat": BASE_PROMPT + "You help with everything: work, study, business, translation, daily life.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "quick": (
        "You are LAILA AI in QUICK mode — fast, sharp, high-signal answers.\n"
        "RULES:\n"
        "- Keep replies under 6 sentences or 5 bullets.\n"
        "- No long intros, no filler, no disclaimers.\n"
        "- Still expert-level: real names, real numbers, real steps.\n"
        "- Prioritize the most useful info first.\n"
        + LANG_RULE + CREATOR_IDENTITY
    ),
    "work": BASE_PROMPT + "Specialized in WORK and CAREER for Africa. CVs, jobs, interviews, LinkedIn, Jobberman, Expat-Dakar.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "study": BASE_PROMPT + "You're the best tutor — patient, clear, makes everything click. Break problems into steps with African everyday examples.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "business": BASE_PROMPT + "BUSINESS advisor for Africa. Mobile money (Wave, M-Pesa, Orange Money), WhatsApp commerce, small capital ideas in FCFA.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "content": BASE_PROMPT + "CONTENT creation expert. Social media, WhatsApp, TikTok, Instagram — you know what works for African audiences.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "life": BASE_PROMPT + "DAILY LIFE advisor. Health, cooking, tech, finance, relationships — practical advice for the African context.\n" + LANG_RULE + WOLOF_GUIDE + CREATOR_IDENTITY + MEMORY_PROMPT,
    "translate": "You are LAILA AI translation assistant. Translate naturally between Wolof, French, English, Italian.\nGive the translation first, then a brief helpful note.\n",
    "image": BASE_PROMPT + "You can see and analyze images. Describe what you see helpfully. Translate text in images. Answer questions about the image.\n" + LANG_RULE + CREATOR_IDENTITY,
    "voice_call": (
        "You are LAILA AI in VOICE CALL mode. You are having a live voice conversation.\n\n"
        "## VOICE CALL RULES — CRITICAL:\n"
        "- Keep responses SHORT: 1-3 sentences max. This will be spoken aloud.\n"
        "- Sound natural and conversational — like a phone call with a friend.\n"
        "- No bullet points, no lists, no markdown, no special formatting.\n"
        "- No emojis.\n"
        "- Speak in flowing sentences, not structured text.\n"
        "- Ask follow-up questions to keep the conversation going.\n"
        "- Match the user's energy: casual if they're casual, serious if they're serious.\n"
        "- If the user says just 'hello' or a greeting, respond warmly and ask how you can help.\n"
        + LANG_RULE + CREATOR_IDENTITY
    ),
}

GENERATE_PROMPTS = {
    "cv": "Create a POWERFUL, professional CV that gets interviews. Same language as user.\n\nSections: Name & Contact, Professional Summary (3 punchy sentences), Work Experience (action verbs + results), Education, Skills (hard + soft), Languages.\nIf details are missing, add realistic placeholders marked [COMPLETE THIS].\nTailor for African + international job markets. Make it stand out.\n\nDetails:\n{details}",
    "job_ideas": "Suggest 5 REALISTIC job opportunities this person can get NOW.\n\nFor each: Job title, Where to apply (name REAL platforms: LinkedIn, Jobberman, Expat-Dakar, Indeed, Glassdoor, local WhatsApp groups), Expected salary range (local currency), One tip to stand out.\nInclude at least 1 remote/freelance option. Same language as user.\n\nDetails:\n{details}",
    "business_ideas": "Suggest 5 PRACTICAL business ideas for Africa.\n\nFor each: Business concept, Startup cost (realistic in FCFA/local), What you need (tools, phone apps: WhatsApp Business, Canva, Wave, M-Pesa), 5-step launch plan, Monthly earning potential, Main risk + how to avoid it.\nInclude ideas starting from 5000 FCFA. Same language as user.\n\nDetails:\n{details}",
    "social_media": "Create ready-to-post social media content with hashtags. Same language as user.\n\nDetails:\n{details}",
    "homework": "Solve step by step like a patient teacher. Same language as user.\n\nProblem:\n{details}",
    "professional_message": "Write a professional message ready to send. Same language as user.\n\nContext:\n{details}",
}

# ─── AI Helper ────────────────────────────────────────────

# Model & per-mode generation config (inspired by LAILA Elite blueprint)
LLM_MODEL = "gpt-4.1"  # upgraded from gpt-4o for sharper reasoning

MODE_CONFIG = {
    "quick":      {"max_tokens": 400,  "temperature": 0.6},
    "voice_call": {"max_tokens": 160,  "temperature": 0.7},
    "translate":  {"max_tokens": 500,  "temperature": 0.3},
    "image":      {"max_tokens": 800,  "temperature": 0.5},
    # expert default for chat/work/study/business/content/life
    "default":    {"max_tokens": 1400, "temperature": 0.7},
}

def _get_mode_config(mode: str) -> dict:
    return MODE_CONFIG.get(mode, MODE_CONFIG["default"])

def enhance_response(text: str, mode: str) -> str:
    """Post-process model output for polish and consistency."""
    if not text:
        return text
    # Normalize clunky closers into cleaner, more natural ones
    replacements = {
        "In conclusion,": "👉 In short:",
        "In conclusion ": "👉 In short: ",
        "En conclusion,": "👉 En bref:",
        "En conclusion ": "👉 En bref: ",
        "In conclusione,": "👉 In breve:",
        "In conclusione ": "👉 In breve: ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    # Strip trailing AI-style disclaimers from voice mode
    if mode == "voice_call":
        text = text.replace("*", "").replace("#", "")
    return text.strip()

async def call_ai(system_prompt: str, user_text: str, session_id: str, file_contents=None, mode: str = "default"):
    cfg = _get_mode_config(mode)
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_prompt)
    chat.with_model("openai", LLM_MODEL)
    # LlmChat builder supports max_tokens; fall back silently if the helper changes API
    try:
        chat.with_max_tokens(cfg["max_tokens"])
    except Exception:
        pass
    msg = UserMessage(text=user_text, file_contents=file_contents)
    raw = await chat.send_message(msg)
    return enhance_response(raw, mode)

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
    referral_code = f"LAILA-{req.name.upper()[:6] if req.name else 'USER'}-{uuid.uuid4().hex[:4].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "user_id": user_id, "email": req.email.lower(), "name": req.name or req.email.split("@")[0],
        "password_hash": hash_password(req.password), "picture": "", "tier": "free",
        "daily_messages": 0, "daily_reset": now, "auth_provider": "email", "created_at": now,
        "referral_code": referral_code, "referred_by": "", "referral_count": 0, "referral_bonus_days": 0,
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
    tier = user.get("tier", "free")
    tier_label = "VIP" if user.get("referral_count", 0) >= 10 and tier == "premium" else tier.upper()
    return {
        "user_id": user["user_id"], "email": user["email"], "name": user["name"],
        "tier": tier, "tier_label": tier_label,
        "daily_messages": user.get("daily_messages", 0),
        "daily_limit": "unlimited" if tier == "premium" else "unlimited chat",
        "referral_code": user.get("referral_code", ""),
        "referral_count": user.get("referral_count", 0),
    }

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
        conv = await get_or_create_conversation(user_id, req.mode, req.conversation_id)
        conv_id = conv["id"]
        await save_message(conv_id, "user", req.message)
        history = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
        history.reverse()
        context_parts = [f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in history[:-1]]
        full_prompt = ("Previous conversation:\n" + "\n".join(context_parts[-10:]) + f"\n\nUser: {req.message}") if context_parts else req.message

        # Inject user memories into system prompt
        system_prompt = SYSTEM_PROMPTS.get(req.mode, SYSTEM_PROMPTS["chat"])
        if user and user_id != "anonymous":
            settings = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
            memory_enabled = True
            if settings:
                memory_enabled = settings.get("memory_enabled", True)
            if memory_enabled:
                memories = await get_user_memories(user_id)
                if memories:
                    mem_str = ", ".join(f"{k}: {v}" for k, v in memories.items())
                    system_prompt += f"\n\n## WHAT YOU KNOW ABOUT THIS USER:\n{mem_str}\nUse this info naturally. Don't mention you have a 'memory system'.\n"

        response = await call_ai(system_prompt, full_prompt, f"laila-{conv_id}-{uuid.uuid4().hex[:8]}", mode=req.mode)

        # Extract and save memories
        clean_response, new_memories = extract_memories(response)
        if new_memories and user and user_id != "anonymous":
            for k, v in new_memories.items():
                await save_user_memory(user_id, k, v)

        assistant_msg = await save_message(conv_id, "assistant", clean_response)
        title = req.message[:50] if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": clean_response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_feature_count(user["user_id"], "chat")
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
        if user and not await check_feature_limit(user, "image_analysis"):
            raise HTTPException(status_code=429, detail=f"Free limit: {FREE_IMAGE_ANALYSIS_DAILY} image analyses/day. Upgrade to Premium for unlimited.")
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
        # FileContent: content_type must be "image" to use image_url format in the library
        file_content = FileContent(content_type="image", file_content_base64=img_base64)
        system_prompt = SYSTEM_PROMPTS["image"]
        response = await call_ai(system_prompt, message, f"laila-img-{uuid.uuid4().hex[:8]}", file_contents=[file_content], mode="image")
        assistant_msg = await save_message(conv_id, "assistant", response)
        title = message[:50] if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_feature_count(user["user_id"], "image_analysis")
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
        if user and not await check_feature_limit(user, "chat"):
            pass  # Chat is unlimited
        lang_names = {"wo": "Wolof", "fr": "French", "en": "English", "it": "Italian"}
        source = lang_names.get(req.source_lang, req.source_lang)
        target = lang_names.get(req.target_lang, req.target_lang)
        prompt = f"Translate from {source} to {target}. Translation first, then brief explanation.\n\nText: {req.text}"
        response = await call_ai(SYSTEM_PROMPTS["translate"], prompt, f"laila-tr-{uuid.uuid4().hex[:8]}", mode="translate")
        if user:
            await increment_feature_count(user["user_id"], "chat")
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
        # Generate is unlimited (text-based)
        prompt_template = GENERATE_PROMPTS.get(req.type)
        if not prompt_template:
            raise HTTPException(status_code=400, detail=f"Unknown type: {req.type}")
        conv = await get_or_create_conversation(user_id, "content", req.conversation_id or None)
        conv_id = conv["id"]
        prompt = prompt_template.format(details=req.details)
        await save_message(conv_id, "user", f"[{req.type}] {req.details}")
        system_prompt = SYSTEM_PROMPTS.get("work" if req.type in ["cv", "job_ideas"] else "content", SYSTEM_PROMPTS["chat"])
        response = await call_ai(system_prompt, prompt, f"laila-gen-{uuid.uuid4().hex[:8]}", mode="default")
        assistant_msg = await save_message(conv_id, "assistant", response)
        title = f"{req.type.replace('_', ' ').title()}" if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": response[:100], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if user:
            await increment_feature_count(user["user_id"], "chat")
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

# ─── Payment / Premium Routes ────────────────────────────
PAYDUNYA_MASTER_KEY = os.environ.get("PAYDUNYA_MASTER_KEY", "mock_master_key")
PAYMENT_MODE = os.environ.get("PAYMENT_MODE", "mock")  # "mock" or "live"

# Dual pricing: Africa (FCFA) + International (EUR)
PLANS_AFRICA = [
    {"id": "weekly_africa", "name": "Weekly", "price": 500, "price_display": "500 FCFA", "currency": "XOF", "duration_days": 7, "description": "7 days unlimited", "region": "africa"},
    {"id": "monthly_africa", "name": "Monthly", "price": 1500, "price_display": "1,500 FCFA", "currency": "XOF", "duration_days": 30, "description": "30 days unlimited", "region": "africa", "popular": True},
    {"id": "yearly_africa", "name": "Yearly", "price": 12000, "price_display": "12,000 FCFA", "currency": "XOF", "duration_days": 365, "description": "12 months unlimited", "region": "africa", "savings": "33% savings"},
]
PLANS_INTERNATIONAL = [
    {"id": "weekly_intl", "name": "Weekly", "price": 1.99, "price_display": "€1.99", "currency": "eur", "duration_days": 7, "description": "7 days unlimited", "region": "international"},
    {"id": "monthly_intl", "name": "Monthly", "price": 3.99, "price_display": "€3.99", "currency": "eur", "duration_days": 30, "description": "30 days unlimited", "region": "international", "popular": True},
    {"id": "yearly_intl", "name": "Yearly", "price": 19.99, "price_display": "€19.99", "currency": "eur", "duration_days": 365, "description": "12 months unlimited", "region": "international", "savings": "58% savings"},
]
ALL_PLANS = {p["id"]: p for p in PLANS_AFRICA + PLANS_INTERNATIONAL}

class PaymentInitRequest(BaseModel):
    plan_id: str
    payment_method: str  # "wave", "orange_money", "card"
    phone_number: str = ""
    origin_url: str = ""

@api_router.get("/payment/plans")
async def get_plans():
    return {
        "plans_africa": PLANS_AFRICA,
        "plans_international": PLANS_INTERNATIONAL,
        "free_limits": {"chat": "unlimited", "image_gen": FREE_IMAGE_GEN_DAILY, "image_analysis": FREE_IMAGE_ANALYSIS_DAILY, "tts": FREE_TTS_DAILY},
        "payment_methods": {
            "africa": [{"id": "wave", "name": "Wave", "icon": "wallet"}, {"id": "orange_money", "name": "Orange Money", "icon": "phone-portrait"}],
            "international": [{"id": "card", "name": "Credit/Debit Card", "icon": "card"}],
        }
    }

@api_router.post("/payment/initiate")
async def initiate_payment(req: PaymentInitRequest, request: Request):
    user = await require_user(request)
    plan = ALL_PLANS.get(req.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")

    payment_id = f"pay_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    payment = {
        "payment_id": payment_id, "user_id": user["user_id"], "plan_id": req.plan_id,
        "amount": float(plan["price"]), "currency": plan["currency"],
        "payment_method": req.payment_method, "status": "pending", "created_at": now,
    }

    if req.payment_method == "card":
        # Stripe checkout for international card payments
        origin = req.origin_url or str(request.base_url).rstrip('/')
        webhook_url = f"{origin}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        success_url = f"{origin}/premium?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/premium"
        checkout_req = CheckoutSessionRequest(
            amount=float(plan["price"]),
            currency=plan["currency"],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user["user_id"], "plan_id": req.plan_id, "payment_id": payment_id},
            payment_methods=["card"],
        )
        session = await stripe_checkout.create_checkout_session(checkout_req)
        payment["stripe_session_id"] = session.session_id
        payment["checkout_url"] = session.url
        await db.payment_transactions.insert_one({**payment, "stripe_session_id": session.session_id})
        await db.payments.insert_one(payment)
        return {k: v for k, v in payment.items() if k != "_id"}

    elif req.payment_method in ["wave", "orange_money"]:
        if PAYMENT_MODE == "live":
            payment["provider_ref"] = "paydunya_pending"
            payment["status"] = "pending"
        else:
            payment["status"] = "completed"
            payment["provider_ref"] = f"mock_{payment_id}"
            expires = datetime.now(timezone.utc) + timedelta(days=plan["duration_days"])
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"tier": "premium", "premium_expires": expires.isoformat(), "premium_plan": req.plan_id}}
            )
        await db.payment_transactions.insert_one({**{k: v for k, v in payment.items() if k != "_id"}, "payment_id": payment_id})
        await db.payments.insert_one(payment)
        return {k: v for k, v in payment.items() if k != "_id"}
    else:
        raise HTTPException(status_code=400, detail="Invalid payment method")

@api_router.get("/payment/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    user = await require_user(request)
    try:
        origin = str(request.base_url).rstrip('/')
        webhook_url = f"{origin}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        status = await stripe_checkout.get_checkout_status(session_id)
        # Update payment in DB
        if status.payment_status == "paid":
            tx = await db.payment_transactions.find_one({"stripe_session_id": session_id}, {"_id": 0})
            if tx and tx.get("status") != "completed":
                plan = ALL_PLANS.get(tx.get("plan_id", ""))
                days = plan["duration_days"] if plan else 30
                expires = datetime.now(timezone.utc) + timedelta(days=days)
                await db.payment_transactions.update_one({"stripe_session_id": session_id}, {"$set": {"status": "completed", "payment_status": "paid"}})
                await db.payments.update_one({"stripe_session_id": session_id}, {"$set": {"status": "completed"}})
                await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tier": "premium", "premium_expires": expires.isoformat(), "premium_plan": tx.get("plan_id")}})
        return {"status": status.status, "payment_status": status.payment_status, "amount_total": status.amount_total, "currency": status.currency}
    except Exception as e:
        logger.error(f"Checkout status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    try:
        body = await request.body()
        origin = str(request.base_url).rstrip('/')
        webhook_url = f"{origin}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        event = await stripe_checkout.handle_webhook(body, request.headers.get("Stripe-Signature"))
        if event.payment_status == "paid":
            tx = await db.payment_transactions.find_one({"stripe_session_id": event.session_id}, {"_id": 0})
            if tx and tx.get("status") != "completed":
                plan = ALL_PLANS.get(tx.get("plan_id", ""))
                days = plan["duration_days"] if plan else 30
                expires = datetime.now(timezone.utc) + timedelta(days=days)
                await db.payment_transactions.update_one({"stripe_session_id": event.session_id}, {"$set": {"status": "completed", "payment_status": "paid"}})
                await db.payments.update_one({"stripe_session_id": event.session_id}, {"$set": {"status": "completed"}})
                user_id = event.metadata.get("user_id", tx.get("user_id"))
                if user_id:
                    await db.users.update_one({"user_id": user_id}, {"$set": {"tier": "premium", "premium_expires": expires.isoformat()}})
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}

@api_router.get("/payment/status/{payment_id}")
async def payment_status(payment_id: str, request: Request):
    user = await require_user(request)
    payment = await db.payments.find_one({"payment_id": payment_id, "user_id": user["user_id"]}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment

@api_router.get("/payment/history")
async def payment_history(request: Request):
    user = await require_user(request)
    payments = await db.payments.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {"payments": payments}

# ─── Referral Routes ──────────────────────────────────────

@api_router.get("/referral")
async def get_referral_info(request: Request):
    user = await require_user(request)
    # Generate referral code if missing
    if not user.get("referral_code"):
        code = f"LAILA-{(user.get('name', 'USER'))[:6].upper()}-{uuid.uuid4().hex[:4].upper()}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code, "referral_count": 0, "referral_bonus_days": 0}})
        user["referral_code"] = code
    share_link = f"https://laila-ai.app/join?ref={user.get('referral_code', '')}"
    return {
        "referral_code": user.get("referral_code", ""),
        "share_link": share_link,
        "referral_count": user.get("referral_count", 0),
        "bonus_days_earned": user.get("referral_bonus_days", 0),
        "rewards": [
            {"friends": 1, "reward": "3 days free Premium"},
            {"friends": 3, "reward": "7 days free Premium"},
            {"friends": 5, "reward": "14 days free Premium"},
            {"friends": 10, "reward": "30 days free Premium + VIP badge"},
        ]
    }

@api_router.post("/referral/apply")
async def apply_referral(req: ReferralApplyRequest, request: Request):
    user = await require_user(request)
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You have already used a referral code")
    if req.referral_code == user.get("referral_code"):
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")
    referrer = await db.users.find_one({"referral_code": req.referral_code}, {"_id": 0})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    # Mark this user as referred
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referred_by": req.referral_code}})
    # Reward referrer
    new_count = referrer.get("referral_count", 0) + 1
    bonus = 3  # days
    if new_count >= 10: bonus = 30
    elif new_count >= 5: bonus = 14
    elif new_count >= 3: bonus = 7
    await db.users.update_one(
        {"user_id": referrer["user_id"]},
        {"$inc": {"referral_count": 1, "referral_bonus_days": bonus},
         "$set": {"tier": "premium" if new_count >= 1 else referrer.get("tier", "free")}}
    )
    return {"status": "applied", "referrer_name": referrer.get("name", ""), "bonus_for_referrer": f"{bonus} days premium"}

# ─── Voice Styles Route ──────────────────────────────────

@api_router.get("/voices")
async def get_voices():
    return {"voices": VOICE_STYLES}

# ─── Memory Routes ────────────────────────────────────────

async def get_user_memories(user_id: str) -> dict:
    memories = await db.user_memories.find_one({"user_id": user_id}, {"_id": 0})
    return memories.get("data", {}) if memories else {}

async def save_user_memory(user_id: str, key: str, value: str):
    await db.user_memories.update_one(
        {"user_id": user_id},
        {"$set": {f"data.{key}": value, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )

def extract_memories(response_text: str) -> tuple:
    """Extract {{MEMORY: key=value}} tags and return clean text + memories"""
    import re
    memories = {}
    pattern = r'\{\{MEMORY:\s*(\w+)=(.+?)\}\}'
    for match in re.finditer(pattern, response_text):
        memories[match.group(1)] = match.group(2).strip()
    clean_text = re.sub(pattern, '', response_text).strip()
    return clean_text, memories

@api_router.get("/memory")
async def get_memories(request: Request):
    user = await require_user(request)
    memories = await get_user_memories(user["user_id"])
    return {"memories": memories}

@api_router.delete("/memory")
async def clear_memories(request: Request):
    user = await require_user(request)
    await db.user_memories.delete_one({"user_id": user["user_id"]})
    return {"status": "cleared"}

@api_router.delete("/memory/{key}")
async def delete_memory(key: str, request: Request):
    user = await require_user(request)
    await db.user_memories.update_one({"user_id": user["user_id"]}, {"$unset": {f"data.{key}": ""}})
    return {"status": "deleted"}

# ─── Settings Routes ──────────────────────────────────────

@api_router.get("/settings")
async def get_settings(request: Request):
    user = await require_user(request)
    settings = await db.user_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    defaults = {"preferred_language": "auto", "voice_enabled": True, "tts_enabled": True, "tts_voice": "nova", "memory_enabled": True, "theme": "dark"}
    if settings:
        defaults.update({k: v for k, v in settings.items() if k not in ["user_id", "updated_at"]})
    return defaults

@api_router.put("/settings")
async def update_settings(req: SettingsUpdate, request: Request):
    user = await require_user(request)
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.user_settings.update_one({"user_id": user["user_id"]}, {"$set": updates}, upsert=True)
    settings = await db.user_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    defaults = {"preferred_language": "auto", "voice_enabled": True, "tts_enabled": True, "tts_voice": "nova", "memory_enabled": True, "theme": "dark"}
    if settings:
        defaults.update({k: v for k, v in settings.items() if k not in ["user_id", "updated_at"]})
    return defaults

@api_router.delete("/settings/history")
async def clear_history(request: Request):
    user = await require_user(request)
    convs = await db.conversations.find({"user_id": user["user_id"]}, {"id": 1, "_id": 0}).to_list(500)
    conv_ids = [c["id"] for c in convs]
    if conv_ids:
        await db.messages.delete_many({"conversation_id": {"$in": conv_ids}})
    await db.conversations.delete_many({"user_id": user["user_id"]})
    return {"status": "cleared", "deleted": len(conv_ids)}

# ─── Image Generation Route ──────────────────────────────

from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

@api_router.post("/generate/image")
async def generate_image(req: ImageGenRequest, request: Request):
    try:
        user = await get_current_user(request)
        user_id = user["user_id"] if user else "anonymous"
        if user and not await check_feature_limit(user, "image_gen"):
            raise HTTPException(status_code=429, detail=f"Free limit: {FREE_IMAGE_GEN_DAILY} image generations/day. Upgrade to Premium for unlimited.")

        image_gen = OpenAIImageGeneration(api_key=EMERGENT_LLM_KEY)
        images = await image_gen.generate_images(
            prompt=req.prompt,
            model="gpt-image-1",
            number_of_images=1,
        )

        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="No image generated")

        image_base64 = base64.b64encode(images[0]).decode('utf-8')

        conv = await get_or_create_conversation(user_id, "image", req.conversation_id or None)
        conv_id = conv["id"]
        await save_message(conv_id, "user", f"[Generate Image] {req.prompt}")
        assistant_msg = await save_message(conv_id, "assistant", f"[Generated Image]\n\nPrompt: {req.prompt}")

        title = f"Image: {req.prompt[:40]}" if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one({"id": conv_id}, {"$set": {"title": title, "last_message": f"Generated: {req.prompt[:60]}", "updated_at": datetime.now(timezone.utc).isoformat()}})

        if user:
            await increment_feature_count(user["user_id"], "image_gen")

        return {"conversation_id": conv_id, "message": assistant_msg, "image_base64": image_base64}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

# Include router
app.include_router(api_router)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
