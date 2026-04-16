from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Models ───────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    device_id: str
    mode: str = "chat"  # chat, work, study, business, content

class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    device_id: str

class GenerateRequest(BaseModel):
    type: str  # cv, job_ideas, business_ideas, social_media, homework, professional_message
    details: str
    device_id: str
    conversation_id: Optional[str] = None

class ConversationOut(BaseModel):
    id: str
    title: str
    mode: str
    last_message: str
    created_at: str
    updated_at: str

class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

# ─── Helpers ──────────────────────────────────────────────

SYSTEM_PROMPTS = {
    "chat": (
        "You are LAILA AI, a smart and friendly assistant for people in Africa. "
        "You give clear, simple, practical answers. Keep language easy to understand. "
        "You can respond in French, English, Italian, or Wolof based on what language the user writes in. "
        "Be warm, encouraging, and helpful."
    ),
    "work": (
        "You are LAILA AI, specialized in career and work advice for people in Africa. "
        "Help with CV creation, job searching tips, interview preparation, and professional development. "
        "Give practical, actionable advice. Keep it simple and clear."
    ),
    "study": (
        "You are LAILA AI, a patient and clear tutor for students. "
        "Explain concepts step by step like a great teacher. "
        "Help with math, reading, writing, science, and any school subject. "
        "Use simple language and examples from everyday life in Africa."
    ),
    "business": (
        "You are LAILA AI, a business advisor for entrepreneurs in Africa. "
        "Help with business ideas, earning money from phone, small business tips, "
        "marketing strategies, and financial advice. Be practical and realistic."
    ),
    "content": (
        "You are LAILA AI, a content creation expert. "
        "Help create social media posts, video ideas, professional messages, "
        "and marketing content. Make it engaging and culturally relevant for African audiences."
    ),
    "translate": (
        "You are LAILA AI, a translation assistant. "
        "Translate text accurately between languages. "
        "After the translation, provide a brief explanation of key words or phrases if helpful. "
        "Supported languages: Wolof, French, English, Italian."
    ),
}

GENERATE_PROMPTS = {
    "cv": (
        "Create a professional CV based on the following details. "
        "Format it clearly with sections: Personal Info, Summary, Experience, Education, Skills. "
        "Make it professional but simple. Details: {details}"
    ),
    "job_ideas": (
        "Based on the following skills and interests, suggest 5 realistic job opportunities "
        "available in Africa, with practical steps to apply. Details: {details}"
    ),
    "business_ideas": (
        "Suggest 5 practical business ideas that can be started with a phone or small capital in Africa. "
        "Include estimated costs, steps to start, and potential earnings. Context: {details}"
    ),
    "social_media": (
        "Create engaging social media content based on the following. "
        "Include post text, hashtags, and posting tips. Details: {details}"
    ),
    "homework": (
        "Help solve this homework problem step by step. "
        "Explain each step clearly like a patient teacher. Problem: {details}"
    ),
    "professional_message": (
        "Write a professional message based on the following context. "
        "Make it clear, polite, and effective. Context: {details}"
    ),
}


async def get_or_create_conversation(device_id: str, mode: str, conversation_id: Optional[str] = None):
    if conversation_id:
        conv = await db.conversations.find_one({"id": conversation_id, "device_id": device_id}, {"_id": 0})
        if conv:
            return conv
    
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conv = {
        "id": conv_id,
        "device_id": device_id,
        "mode": mode,
        "title": "New Conversation",
        "last_message": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.conversations.insert_one(conv)
    return {k: v for k, v in conv.items() if k != "_id"}


async def save_message(conversation_id: str, role: str, content: str):
    msg = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg)
    return {k: v for k, v in msg.items() if k != "_id"}


async def get_conversation_history(conversation_id: str, limit: int = 20):
    messages = await db.messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()
    return messages


async def call_ai(system_prompt: str, user_text: str, session_id: str):
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    )
    chat.with_model("openai", "gpt-4o")
    user_message = UserMessage(text=user_text)
    response = await chat.send_message(user_message)
    return response


# ─── Routes ───────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "LAILA AI API is running"}


@api_router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        conv = await get_or_create_conversation(req.device_id, req.mode, req.conversation_id)
        conv_id = conv["id"]
        
        await save_message(conv_id, "user", req.message)
        
        # Build context from history
        history = await get_conversation_history(conv_id)
        context_parts = []
        for msg in history[:-1]:  # exclude the just-saved message
            prefix = "User" if msg["role"] == "user" else "Assistant"
            context_parts.append(f"{prefix}: {msg['content']}")
        
        if context_parts:
            full_prompt = "Previous conversation:\n" + "\n".join(context_parts[-10:]) + f"\n\nUser: {req.message}"
        else:
            full_prompt = req.message
        
        system_prompt = SYSTEM_PROMPTS.get(req.mode, SYSTEM_PROMPTS["chat"])
        session_id = f"laila-{conv_id}-{str(uuid.uuid4())[:8]}"
        
        response = await call_ai(system_prompt, full_prompt, session_id)
        
        assistant_msg = await save_message(conv_id, "assistant", response)
        
        # Update conversation
        title = req.message[:50] if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one(
            {"id": conv_id},
            {"$set": {
                "title": title,
                "last_message": response[:100],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        
        return {
            "conversation_id": conv_id,
            "message": assistant_msg,
        }
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/translate")
async def translate_endpoint(req: TranslateRequest):
    try:
        lang_names = {
            "wo": "Wolof", "fr": "French", "en": "English", "it": "Italian"
        }
        source = lang_names.get(req.source_lang, req.source_lang)
        target = lang_names.get(req.target_lang, req.target_lang)
        
        prompt = (
            f"Translate the following text from {source} to {target}. "
            f"First give the translation, then briefly explain any key words.\n\n"
            f"Text: {req.text}"
        )
        
        session_id = f"laila-translate-{str(uuid.uuid4())[:8]}"
        response = await call_ai(SYSTEM_PROMPTS["translate"], prompt, session_id)
        
        return {"translation": response, "source_lang": req.source_lang, "target_lang": req.target_lang}
    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/generate")
async def generate_endpoint(req: GenerateRequest):
    try:
        conv = await get_or_create_conversation(req.device_id, "content", req.conversation_id)
        conv_id = conv["id"]
        
        prompt_template = GENERATE_PROMPTS.get(req.type)
        if not prompt_template:
            raise HTTPException(status_code=400, detail=f"Unknown generation type: {req.type}")
        
        prompt = prompt_template.format(details=req.details)
        await save_message(conv_id, "user", f"[{req.type}] {req.details}")
        
        system_prompt = SYSTEM_PROMPTS.get("work" if req.type in ["cv", "job_ideas"] else "content", SYSTEM_PROMPTS["chat"])
        session_id = f"laila-gen-{str(uuid.uuid4())[:8]}"
        
        response = await call_ai(system_prompt, prompt, session_id)
        
        assistant_msg = await save_message(conv_id, "assistant", response)
        
        title = f"{req.type.replace('_', ' ').title()}" if conv.get("title") == "New Conversation" else conv["title"]
        await db.conversations.update_one(
            {"id": conv_id},
            {"$set": {
                "title": title,
                "last_message": response[:100],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        
        return {
            "conversation_id": conv_id,
            "message": assistant_msg,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/conversations")
async def list_conversations(device_id: str):
    try:
        convs = await db.conversations.find(
            {"device_id": device_id},
            {"_id": 0}
        ).sort("updated_at", -1).limit(50).to_list(50)
        return {"conversations": convs}
    except Exception as e:
        logger.error(f"List conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    try:
        messages = await db.messages.find(
            {"conversation_id": conversation_id},
            {"_id": 0}
        ).sort("created_at", 1).to_list(200)
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
        logger.error(f"Delete conversation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include router
app.include_router(api_router)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
