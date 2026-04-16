# LAILA AI – Africa Smart Assistant

## Product Requirements Document (PRD)

### Vision
A powerful AI assistant app designed to help people in Africa in daily life - work, study, communication, and personal growth. Simple, fast, and intelligent.

### Core Features (MVP)

#### 1. AI Smart Chat
- GPT-4o powered chat via Emergent LLM Key
- Conversational AI with context memory
- Multi-language support (French, English, Italian, Wolof)
- Quick action buttons for Work, Study, Translation, Business
- Conversation history stored in MongoDB

#### 2. Language Translation
- AI-powered translation between Wolof, French, English, Italian
- Swap languages with one tap
- Explanations of key words/phrases
- Clean translation interface

#### 3. AI Assistants (Work & Study)
- **CV Builder** - Auto-generate professional CVs
- **Job Finder** - Find job opportunities based on skills
- **Business Ideas** - Practical business ideas for Africa
- **Homework Help** - Step-by-step explanations
- **Social Media** - Create engaging content
- **Professional Messages** - Write polished messages

#### 4. Conversation History
- View all past conversations
- Expand to see messages
- Delete conversations
- Organized by mode (chat, work, study, etc.)

### Technical Stack
- **Frontend:** Expo React Native (SDK 54) with Expo Router tabs
- **Backend:** FastAPI with async endpoints
- **Database:** MongoDB (conversations + messages collections)
- **AI Provider:** OpenAI GPT-4o via Emergent LLM Key
- **Architecture:** Device-based sessions (no authentication)

### Design
- Dark mode (#0A0908 background, #FFC107 gold accent)
- African-inspired aesthetic
- 48px+ touch targets for accessibility
- Optimized for low-end Android devices
- Bottom tab navigation (Chat, Translate, Assistants, History)

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/ | Health check |
| POST | /api/chat | AI chat |
| POST | /api/translate | Translation |
| POST | /api/generate | Content generation |
| POST | /api/transcribe | Voice-to-text (Whisper) |
| GET | /api/conversations | List conversations |
| GET | /api/conversations/{id}/messages | Get messages |
| DELETE | /api/conversations/{id} | Delete conversation |

### Future Enhancements
- User authentication (Google OAuth)
- Voice input/output
- Offline mode
- Push notifications
- Premium features (subscription model)
- More African languages support
