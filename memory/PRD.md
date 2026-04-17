# LAILA AI – Africa Smart Assistant

## Product Requirements Document (PRD) v2.0

### Vision
A powerful AI assistant app designed to help people in Africa in daily life - work, study, communication, and personal growth. Multi-modal: text, voice, and image.

### Core Features

#### 1. Authentication
- Email/Password registration and login (PBKDF2 hashing, JWT sessions)
- Google OAuth via Emergent Auth
- Session persistence with AsyncStorage
- Clean login/register screen with toggle tabs

#### 2. AI Smart Chat (GPT-4o)
- Conversational AI with context memory
- Multi-language: French, English, Italian, Wolof
- Auto language detection and matching
- Creator identity: Bathie Sarr (on request)
- Quick action buttons and preset prompts

#### 3. Image Analysis (GPT-4o Vision)
- Camera photo capture
- Gallery image selection
- AI analyzes and describes images
- Translates text in images
- Helps with documents and forms

#### 4. Voice Features
- **Voice-to-text**: Whisper API transcription (mic button)
- **Text-to-speech**: OpenAI TTS playback (speaker button under AI messages)
- Supports IT/FR/EN/Wolof

#### 5. Language Translation
- AI-powered translation between Wolof, French, English, Italian
- Swap languages, word explanations

#### 6. AI Assistants
- CV Builder, Job Finder, Business Ideas
- Homework Help, Social Media, Professional Messages

#### 7. Smart AI Modes
- Chat, Work, Study, Business, Content, Life, Translation, Image

#### 8. Freemium Model
- Free: 20 messages/day
- Premium: unlimited (prepared for future)
- Daily counter reset at midnight UTC

#### 9. Conversation History
- Per-user chat history linked to accounts
- View, expand, delete conversations

### Technical Stack
- **Frontend:** Expo React Native (SDK 54) with Expo Router tabs
- **Backend:** FastAPI with async endpoints
- **Database:** MongoDB (users, conversations, messages, sessions)
- **AI:** OpenAI GPT-4o (chat + vision), Whisper (STT), TTS-1 (speech)
- **Auth:** PBKDF2 password hashing, token-based sessions, Emergent Google OAuth

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| POST | /api/auth/logout | Logout |
| POST | /api/auth/google/session | Google OAuth |
| POST | /api/chat | AI chat |
| POST | /api/chat/image | Image analysis |
| POST | /api/translate | Translation |
| POST | /api/generate | Content generation |
| POST | /api/transcribe | Voice-to-text |
| POST | /api/tts | Text-to-speech |
| GET | /api/conversations | List history |
| GET | /api/conversations/{id}/messages | Messages |
| DELETE | /api/conversations/{id} | Delete |

### Future
- Payment integration (Wave, Orange Money via PayDunya/CinetPay)
- Offline caching
- Push notifications
- More African languages
