<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success.svg" alt="Status" />
  <img src="https://img.shields.io/badge/Electron-Desktop-47848f.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/React-Frontend-61dafb.svg" alt="Frontend" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933.svg" alt="Backend" />
</div>

<br />

<h1 align="center">Observer AI - Live Meeting Intelligence Platform</h1>

<p align="center">
  <strong>Observer AI</strong> is a powerful, desktop-native meeting assistant that runs in the background of your video calls (Google Meet, Zoom, Teams). It watches, listens, and understands your meetings in real-time—automatically extracting action items, summarizing discussions, capturing visual context from shared screens, and scheduling follow-ups.
</p>

---

## 📸 Screenshots

<div align="center">
  <img src="docs/assets/screenshot_1.png" alt="Live Meeting Intelligence" width="800" />
  <br />
  <br />
  <img src="docs/assets/screenshot_2.png" alt="Settings Configuration" width="800" />
  <br />
  <br />
  <img src="docs/assets/screenshot_3.png" alt="Summaries Dashboard" width="800" />
  <br />
  <br />
  <img src="docs/assets/screenshot_4.png" alt="Screen Monitoring Overlay" width="800" />
  <br />
  <br />
  <img src="docs/assets/screenshot_5.png" alt="Dashboard Overview" width="800" />
</div>

---

## 🚀 Key Features

### 🎙️ Real-Time Audio Transcription & Intelligence
- **Live Voice-to-Text:** Captures system and microphone audio flawlessly using OpenAI's Whisper model.
- **Rolling Live Summary:** As the meeting progresses, the intelligence panel continuously updates a rolling summary of the discussion.
- **Task Detection on the Fly:** Instantly identifies action items, who they are assigned to, and their priority level with an AI confidence score.

### 📸 Smart Visual Context & Region Monitoring
- **Automated Screen Capture:** Select a specific region of your screen (like a presentation slide or architectural diagram) for Observer AI to monitor.
- **Visual Intelligence:** Uses advanced Vision models (via Groq) to analyze visual changes, seamlessly weaving slide text, charts, and diagrams into your post-meeting summary. 

### 🗂️ Comprehensive Post-Meeting Summaries
Never write meeting minutes again. Immediately after ending a session, gain access to deeply structured insights:
- **Meeting Overview:** A concise executive summary.
- **Key Topics & Decisions:** Auto-extracted tags and definitive outcomes reached during the call.
- **Assigned Tasks:** A filtered list of action items, assignees, and AI-determined confidence levels (e.g., *85% confidence*).

### 📅 Google Calendar Auto-Scheduling
Did someone mention, *"Let's follow up on this next Wednesday at 3 PM"*?
- The backend utilizes highly-accurate relative date resolution (`chrono-node`) to identify follow-up mentions.
- Features a **1-Click Google Calendar Sync** button directly inside the app to authenticate and schedule the follow-up entirely autonomously.

### 🪟 Non-Intrusive Floating Overlay
- A sleek, floating **Intelligence Panel** sits quietly over your meeting software. 
- Expand it to monitor live transcripts, or collapse it to stay focused. 
- Fully draggable with a beautiful dark-mode, glassmorphic UI.

---

## 🛠️ Technology Stack

| Architecture Layer | Technologies Used |
| :--- | :--- |
| **Desktop Client** | Electron, IPC Bridging (Node <-> React) |
| **Frontend UI** | React 18, Vite, Vanilla CSS (Glassmorphism design) |
| **Backend API** | Node.js, Express, Server-Sent Events (SSE) for real-time data |
| **Database** | MongoDB (Mongoose) |
| **AI Integration** | OpenAI (Whisper), Groq (LLaMA-3 for fast processing, Vision), Zod schema validation |
| **External Auth** | Google APIs (OAuth2, Calendar API) |

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Local MongoDB instance or MongoDB Atlas cluster.
- API Keys: [OpenAI](https://platform.openai.com/), [Groq](https://console.groq.com/), and a Google Cloud Project with Calendar API enabled.

### 1. Clone the Repository
```bash
git clone https://github.com/Mustafa2431/AI-Powered-Live-Meeting-Intelligence-System.git
cd AI-Powered-Live-Meeting-Intelligence-System
```

### 2. Install Dependencies
```bash
npm install
npm run postinstall # Or install front/backend dependencies if separated
```

### 3. Environment Variables
Create a `.env` file in the root directory based on the following template:

```env
# ── OpenAI ───────────────────────────────────────────────
OPENAI_API_KEY=your_openai_api_key

# ── MongoDB ──────────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/meeting_intelligence

# ── Backend port ─────────────────────────────────────────
BACKEND_PORT=3001

# ── Groq ─────────────────────────────────────────────────
GROQ_API_KEY=your_groq_api_key

# ── Google Calendar (For Follow-Up Sync) ─────────────────
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
```

### 4. Start the Application
Run the frontend UI and the backend node server concurrently via Electron:
```bash
npm run dev
```

---

## 💡 How It Works (The Pipeline)
1. **Audio Capture:** Electron captures desktop audio and routes it to the Express backend backend.
2. **Buffering & Processing:** Audio is chunked and sent to `faster-whisper`/OpenAI API.
3. **Data Extraction:** The resulting transcript is fed into Groq LLMs configured with strict `zod` JSON schemas to parse out arrays of Topics, Tasks, and Decisions.
4. **Visual Context:** IPC triggers screenshots of user-defined screen bounds -> sent to Vision API -> descriptions are appended to the language pipeline.
5. **Streaming:** SSE (Server-Sent Events) broadcast the newly resolved tasks and transcripts live directly to the React Overlay.

## 🔒 Privacy & Data
- All transcripts, generated summaries, and visual capture descriptions are securely stored in your configured MongoDB instance.
- Visual captures of regions are intentionally restricted to user-defined boundary boxes to prevent capturing sensitive out-of-bounds screen data.

---
*Built with ❤️ for the future of asynchronous work.*
