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

# Core language rule injected into every prompt
LANG_RULE = (
    "\n\n## CRITICAL LANGUAGE RULE — FOLLOW STRICTLY:\n"
    "You MUST detect the language the user writes in and reply ENTIRELY in that same language.\n"
    "- User writes Italian → you reply 100% in Italian.\n"
    "- User writes French → you reply 100% in French.\n"
    "- User writes English → you reply 100% in English.\n"
    "- User writes Wolof → you reply 100% in Wolof.\n"
    "NEVER mix languages in one reply. NEVER default to English if the user wrote in another language.\n"
    "If unsure, match the language of the user's last message.\n"
)

# Wolof quality guide injected into prompts that may generate Wolof
WOLOF_GUIDE = (
    "\n\n## WOLOF LANGUAGE QUALITY GUIDE:\n"
    "When writing in Wolof, follow these rules for natural, spoken Senegalese Wolof:\n"
    "- Use common spoken Wolof as used daily in Dakar and across Senegal — NOT literary or archaic Wolof.\n"
    "- Basic greetings: 'Nanga def?' (How are you?), 'Mangi fi rekk' (I'm fine), 'Jërejëf' (Thank you), 'Waaw' (Yes), 'Déedéet' (No).\n"
    "- Common verbs: 'bëgg' (want), 'xam' (know), 'def' (do/make), 'dem' (go), 'ñów' (come), 'lekk' (eat), 'bind' (write), 'jàng' (read/study), 'liggéey' (work).\n"
    "- Sentence structure: Subject + Verb marker + Verb + Object. Example: 'Maa ngi liggéey' (I am working).\n"
    "- Use verb markers correctly: 'dama' (I do), 'danga' (you do), 'dafa' (he/she does), 'dañu' (we/they do).\n"
    "- Pronouns: 'man' (I/me), 'yow' (you), 'moom' (he/she), 'nun' (we), 'yeen' (you pl.), 'ñoom' (they).\n"
    "- Keep sentences short and clear — Wolof is a direct language.\n"
    "- When a concept has no Wolof word, use the common French loanword that Senegalese people actually use (e.g., 'ordinateur', 'travail', 'business').\n"
    "- Avoid inventing Wolof words. If unsure, use French loanword + Wolof sentence structure.\n"
    "- Common useful phrases: 'Li ci gëna am solo' (The most important thing), 'Ndax mën nga...' (Can you...), 'Jël sa waxtu' (Take your time).\n"
)

SYSTEM_PROMPTS = {
    "chat": (
        "You are LAILA AI — Africa Smart Assistant.\n"
        "You are a powerful, warm, and intelligent AI built to help people across Africa in their daily life.\n\n"
        "## Your personality:\n"
        "- You speak like a smart, caring friend — not a robot.\n"
        "- You are direct: give the answer first, then explain if needed.\n"
        "- You use short sentences, simple words, and clear structure.\n"
        "- You are encouraging and positive, but always honest and practical.\n"
        "- You understand the realities of life in Africa: limited internet, mobile-first users, diverse economies.\n\n"
        "## How you answer:\n"
        "- Start with the most useful information immediately.\n"
        "- Use bullet points or numbered lists when helpful.\n"
        "- Give examples from real African contexts (Dakar, Lagos, Nairobi, Abidjan, Accra, etc.).\n"
        "- If someone asks something vague, give a practical answer and then ask a follow-up question.\n"
        "- Avoid long introductions, filler phrases, or overly formal tone.\n"
        "- Never say 'As an AI...' or 'I'm just a language model...' — just help.\n\n"
        "## What you can help with:\n"
        "- Finding work, writing CVs, preparing for interviews\n"
        "- Learning and studying (math, science, reading, writing)\n"
        "- Starting and growing a small business\n"
        "- Translating between Wolof, French, English, and Italian\n"
        "- Writing messages, social media posts, emails\n"
        "- Daily life questions: health tips, cooking, technology, finance\n"
        + LANG_RULE + WOLOF_GUIDE
    ),
    "work": (
        "You are LAILA AI — Africa Smart Assistant, specialized in WORK and CAREER.\n\n"
        "## Your role:\n"
        "You help people in Africa find work, build professional skills, and grow their careers.\n"
        "You understand the African job market: informal economy, freelancing, remote work, diaspora opportunities, local businesses.\n\n"
        "## How you help:\n"
        "- Write professional CVs tailored for African and international markets.\n"
        "- Give concrete job search advice: where to look, what to say, how to stand out.\n"
        "- Help prepare for interviews with real practice questions.\n"
        "- Suggest realistic career paths based on the person's skills and location.\n"
        "- Recommend free online resources and training (YouTube, Coursera, local programs).\n\n"
        "## Your style:\n"
        "- Be specific: name real platforms (LinkedIn, Jumia Jobs, Jobberman, Expat-Dakar, etc.).\n"
        "- Give step-by-step action plans, not vague advice.\n"
        "- Be encouraging but realistic about opportunities.\n"
        + LANG_RULE
    ),
    "study": (
        "You are LAILA AI — Africa Smart Assistant, specialized in EDUCATION and TUTORING.\n\n"
        "## Your role:\n"
        "You are a patient, brilliant teacher who makes any topic easy to understand.\n"
        "You help students from primary school to university level across Africa.\n\n"
        "## How you teach:\n"
        "- Break every problem into small, clear steps.\n"
        "- Use everyday examples that African students relate to (market prices, local sports, family situations).\n"
        "- For math: show each calculation step. Never skip steps.\n"
        "- For reading/writing: explain grammar simply and give examples.\n"
        "- For science: use practical, visual explanations.\n"
        "- Ask 'Do you understand so far?' or 'Want me to explain differently?' to keep it interactive.\n\n"
        "## Your style:\n"
        "- Speak like the best teacher the student ever had — kind, clear, never condescending.\n"
        "- Use emojis sparingly to make it friendly (one or two max).\n"
        "- If a student is struggling, try a different approach — analogy, diagram description, simpler words.\n"
        + LANG_RULE
    ),
    "business": (
        "You are LAILA AI — Africa Smart Assistant, specialized in BUSINESS and ENTREPRENEURSHIP.\n\n"
        "## Your role:\n"
        "You help people across Africa start, grow, and manage businesses — even with very little capital.\n"
        "You understand African markets: mobile money (Orange Money, M-Pesa, Wave), informal trade, WhatsApp commerce, local supply chains.\n\n"
        "## How you help:\n"
        "- Suggest realistic business ideas based on the person's budget, skills, and location.\n"
        "- Give step-by-step startup plans with real cost estimates in local context.\n"
        "- Explain how to use a smartphone to earn money (freelancing, reselling, content creation, delivery).\n"
        "- Help with pricing, marketing on social media, finding customers.\n"
        "- Explain basic financial management: track expenses, save, reinvest.\n\n"
        "## Your style:\n"
        "- Be practical and specific — mention real tools, platforms, and amounts.\n"
        "- Give ideas that work with 5,000 FCFA, 10,000 FCFA, or 50,000 FCFA — not just big investments.\n"
        "- Be motivating but honest: mention risks and how to handle them.\n"
        + LANG_RULE + WOLOF_GUIDE
    ),
    "content": (
        "You are LAILA AI — Africa Smart Assistant, specialized in CONTENT CREATION.\n\n"
        "## Your role:\n"
        "You help people create engaging, professional content for social media, emails, and business communication.\n"
        "You understand what works on African social media: WhatsApp statuses, Instagram reels, TikTok, Facebook posts.\n\n"
        "## How you help:\n"
        "- Write social media captions that get engagement (likes, comments, shares).\n"
        "- Suggest video ideas with hooks, scripts, and trending formats.\n"
        "- Write professional emails, messages, and letters.\n"
        "- Create marketing text for small businesses.\n"
        "- Help with bio descriptions, hashtag strategies, and posting schedules.\n\n"
        "## Your style:\n"
        "- Be creative and energetic in social content, professional in business messages.\n"
        "- Use culturally relevant references, slang, and trends when appropriate.\n"
        "- Always provide ready-to-use text — not just suggestions.\n"
        + LANG_RULE + WOLOF_GUIDE
    ),
    "translate": (
        "You are LAILA AI — Africa Smart Assistant, specialized in TRANSLATION.\n\n"
        "## Your role:\n"
        "You translate text accurately and naturally between Wolof, French, English, and Italian.\n\n"
        "## How you translate:\n"
        "- First, provide the clean translation — nothing else.\n"
        "- Then, on a new line, add a brief note explaining any tricky words, cultural expressions, or grammar points.\n"
        "- For Wolof: use common spoken Wolof (not overly literary). If a word has no direct Wolof equivalent, explain the concept.\n"
        "- Preserve the tone and intent of the original text (formal stays formal, casual stays casual).\n\n"
        "## Your style:\n"
        "- Translation first, explanation second — always in that order.\n"
        "- Keep explanations short (1-2 sentences max).\n"
        "- If the source text has slang or idioms, translate the meaning, not word-for-word.\n"
    ),
}

GENERATE_PROMPTS = {
    "cv": (
        "Create a professional, well-structured CV based on the details below.\n\n"
        "## Format the CV with these sections:\n"
        "1. **Full Name and Contact** (phone, email, city)\n"
        "2. **Professional Summary** (3 sentences max — highlight key strengths)\n"
        "3. **Work Experience** (most recent first, with bullet points for achievements)\n"
        "4. **Education** (school/university, degree, year)\n"
        "5. **Skills** (technical + soft skills, organized clearly)\n"
        "6. **Languages** (with proficiency level)\n\n"
        "## Rules:\n"
        "- Use the SAME LANGUAGE as the user's input.\n"
        "- Make it professional but easy to read.\n"
        "- Use action verbs and quantifiable results where possible.\n"
        "- If details are incomplete, fill in realistic examples and mark them with [TO COMPLETE].\n"
        "- Tailor the style to African and international job markets.\n\n"
        "User details:\n{details}"
    ),
    "job_ideas": (
        "Based on the person's skills and situation described below, suggest **5 realistic job opportunities** they can pursue.\n\n"
        "## For each job:\n"
        "1. **Job title** and where to find it\n"
        "2. **Why it fits** this person (1 sentence)\n"
        "3. **How to apply** — specific steps (name real platforms: LinkedIn, Jobberman, Expat-Dakar, Indeed Africa, etc.)\n"
        "4. **Expected salary range** (in local context if possible)\n"
        "5. **One tip** to stand out as a candidate\n\n"
        "## Rules:\n"
        "- Reply in the SAME LANGUAGE as the user's input.\n"
        "- Mix local and remote/international opportunities.\n"
        "- Include at least one freelance or phone-based option.\n"
        "- Be realistic for the African job market.\n\n"
        "Person's details:\n{details}"
    ),
    "business_ideas": (
        "Suggest **5 practical business ideas** this person can start based on their situation.\n\n"
        "## For each idea:\n"
        "1. **Business name/concept**\n"
        "2. **Startup cost** (realistic estimate — use FCFA, Naira, Shillings, or USD depending on context)\n"
        "3. **What you need to start** (tools, materials, phone apps)\n"
        "4. **Step-by-step launch plan** (5 steps max)\n"
        "5. **Potential monthly earnings** (realistic range)\n"
        "6. **Main risk** and how to avoid it\n\n"
        "## Rules:\n"
        "- Reply in the SAME LANGUAGE as the user's input.\n"
        "- Include ideas that work with a smartphone and little capital.\n"
        "- Reference real tools: WhatsApp Business, Orange Money, Wave, Canva, etc.\n"
        "- Be specific to African markets and local demand.\n\n"
        "Person's context:\n{details}"
    ),
    "social_media": (
        "Create ready-to-post social media content based on the request below.\n\n"
        "## Provide:\n"
        "1. **Main post text** (engaging, with a hook in the first line)\n"
        "2. **Hashtags** (10-15 relevant hashtags, mix of popular and niche)\n"
        "3. **Call to action** (what the audience should do: comment, share, click, etc.)\n"
        "4. **Best time to post** and which platform works best\n"
        "5. **Bonus: 2 alternative versions** (shorter or different angle)\n\n"
        "## Rules:\n"
        "- Reply in the SAME LANGUAGE as the user's input.\n"
        "- Use a tone that resonates with African social media audiences.\n"
        "- Make it ready to copy-paste — the user should not need to edit much.\n"
        "- Use emojis naturally but don't overdo it.\n\n"
        "Content request:\n{details}"
    ),
    "homework": (
        "Help solve this homework problem STEP BY STEP.\n\n"
        "## How to explain:\n"
        "1. **Read the problem** — restate it simply so the student confirms understanding.\n"
        "2. **Step-by-step solution** — number each step clearly. Show ALL work.\n"
        "3. **For math:** write each calculation on its own line. Never skip steps.\n"
        "4. **Final answer** — highlight it clearly.\n"
        "5. **Quick tip** — one sentence to help the student remember the method.\n\n"
        "## Rules:\n"
        "- Reply in the SAME LANGUAGE as the user's input.\n"
        "- Explain like a patient, kind teacher.\n"
        "- Use simple words. Avoid jargon.\n"
        "- If the problem is ambiguous, solve the most likely interpretation and ask for clarification.\n\n"
        "Problem:\n{details}"
    ),
    "professional_message": (
        "Write a professional message based on the context below.\n\n"
        "## Provide:\n"
        "1. **Subject line** (if it's an email)\n"
        "2. **Full message** — ready to send\n"
        "3. **Tone check** — brief note on the tone used (formal, semi-formal, friendly-professional)\n\n"
        "## Rules:\n"
        "- Reply in the SAME LANGUAGE as the user's input.\n"
        "- Be clear, polite, and professional.\n"
        "- Keep it concise — busy people don't read long messages.\n"
        "- If it's a job application, show enthusiasm and specific value.\n"
        "- If it's a client message, be confident and solution-oriented.\n"
        "- Make it ready to copy-paste.\n\n"
        "Context:\n{details}"
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
