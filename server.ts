import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

// Memory Layer
const sessionMemory: Record<string, any[]> = {};

function getSessionHistory(sessionId: string) {
  if (!sessionMemory[sessionId]) {
    sessionMemory[sessionId] = [];
  }
  return sessionMemory[sessionId];
}

function addToHistory(sessionId: string, role: string, content: string) {
  const history = getSessionHistory(sessionId);
  history.push({ role, content });
  // Keep history manageable
  if (history.length > 20) {
      sessionMemory[sessionId] = history.slice(history.length - 20);
  }
}

// AI orchestrator using Gemini
async function processVoiceQuery(text: string, sessionId: string, language: string, retryCount = 0): Promise<string> {
  const shortTermHistory = getSessionHistory(sessionId);
  
  if (!process.env.GEMINI_API_KEY) {
      const fb = `System is in mock mode (GEMINI_API_KEY missing). You said: "${text}".`;
      addToHistory(sessionId, 'user', text);
      addToHistory(sessionId, 'assistant', fb);
      return fb;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    let historyText = shortTermHistory.map(h => `${h.role}: ${h.content}`).join('\n');
    const targetLang = language === 'arabic' ? 'Arabic (العربية)' : 'English';
    
    let prompt = `System Instruction: You are a professional, accurate Voice Assistant.
IMPORTANT RULES:
1. You MUST ALWAYS respond in ${targetLang}, regardless of the language the user speaks. Translate or answer the user's prompt in ${targetLang}.
2. If the user asks multiple questions or makes multiple requests in a single message, DO NOT answer all of them. ONLY answer the primary or first question, and ignore the rest.
3. Keep your tone highly professional and accurate. Provide ONLY the direct answer without extra conversational filler.\n\n`;
    
    if (historyText) {
        prompt += `Conversation History:\n${historyText}\n\n`;
    }
    prompt += `User: ${text}\nAssistant:`;

    const response = await ai.models.generateContent({
        model: retryCount === 0 ? 'gemini-2.5-flash' : 'gemini-2.0-flash',
        contents: prompt
    });

    const responseText = response.text || "No response generated.";
    
    addToHistory(sessionId, 'user', text);
    addToHistory(sessionId, 'assistant', responseText);
    
    return responseText;
  } catch (error: any) {
    const errorString = error?.message || error?.toString?.() || JSON.stringify(error) || "";
    if (error.status === 429 || errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('Quota') || errorString.includes('exceeded')) {
        console.error("AI Generation Quota Exceeded:", errorString);
        return language === 'arabic' 
            ? "لقد تجاوزت الحد المسموح به لاستخدام واجهة برمجة التطبيقات (Quota exceeded). يرجى التحقق من خطة الفوترة الخاصة بك."
            : "You have exceeded your API usage quota currently. Please try again later or check your billing plan.";
    }

    if (retryCount < 2) {
        console.log(`[Retry ${retryCount + 1}] Retrying due to error:`, errorString);
        await new Promise(res => setTimeout(res, 2000 * (retryCount + 1))); // exponential backoff
        return processVoiceQuery(text, sessionId, language, retryCount + 1);
    }
    console.error("AI Generation Error after retries:", error);
    
    // Provide appropriate localized language response upon failure
    const isArabic = language === 'arabic';
    return isArabic 
        ? "عذراً، أواجه مشكلة في الاتصال بالذكاء الاصطناعي بسبب الضغط. يرجى المحاولة بعد قليل."
        : "Sorry, I encountered an error connecting to the AI due to high demand. Please try again later.";
  }
}

// Speech Services using Gemini STT
async function transcribeAudio(audioBytes: Buffer, mimeType: string, retryCount = 0): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "This is a simulated transcription.";
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        'Transcribe this audio EXACTLY as spoken in its original language. Return ONLY the transcription and NOTHING else.',
        {
          inlineData: {
            data: audioBytes.toString('base64'),
            mimeType: mimeType || 'audio/webm'
          }
        }
      ]
    });
    return (response.text || "Could not transcribe audio.").trim();
  } catch (err: any) {
    const errorString = err?.message || err?.toString?.() || JSON.stringify(err) || "";
    
    if (err.status === 429 || errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('Quota') || errorString.includes('exceeded')) {
        console.error("Transcription Quota Exceeded:", errorString);
        throw new Error("You have exceeded your API usage quota currently. Please try again later or check your billing plan.");
    }

    if (retryCount < 2) {
        console.log(`[STT Retry ${retryCount + 1}] Retrying due to error:`, errorString);
        await new Promise(res => setTimeout(res, 2000 * (retryCount + 1))); // exponential backoff
        return transcribeAudio(audioBytes, mimeType, retryCount + 1);
    }
    
    console.error("Transcription error after retries:", errorString);
    if (err.status === 503 || errorString.includes('503') || errorString.includes('UNAVAILABLE') || errorString.includes('high demand')) {
        throw new Error("The AI models are currently busy due to high demand. Please try speaking again in a few moments.");
    }

    throw new Error("Could not transcribe the audio.");
  }
}

// Ensure uploads dir exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes MUST be defined before Vite middleware

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "voice-assistant-node-fallback" });
  });

  app.post("/api/query", async (req, res) => {
    try {
        const { text, session_id, language = 'english' } = req.body;
        if (!text || !session_id) {
           res.status(400).json({ error: "Missing text or session_id" });
           return;
        }
        const response = await processVoiceQuery(text, String(session_id), String(language));
        res.json({ response, audio_url: null });
    } catch (err: any) {
        console.error("Error in /api/query:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/voice", upload.single("audio"), async (req, res) => {
    const sessionId = req.query.session_id as string || "default_session";
    const language = req.query.language as string || "english";
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No audio file uploaded" });
      return;
    }

    try {
      const audioBytes = fs.readFileSync(file.path);
      
      // 1. STT (Whisper Mock)
      const text = await transcribeAudio(audioBytes, file.mimetype);
      
      // 2. Agent (LangGraph + Qwen Mock)
      const llmResponse = await processVoiceQuery(text, sessionId, language);
      
      // 3. TTS (Kokoro Mock indicates generation, frontend uses Web Speech API)
      
      // Cleanup temp audio file
      fs.unlinkSync(file.path);
      
      res.json({
          text_input: text,
          text_response: llmResponse,
          audio_generated: true
      });
    } catch (err: any) {
      console.error("Error in /api/voice:", err);
      res.status(500).json({ error: err.message || "Voice processing failed" });
    }
  });

  // Vite Integration for AI Studio Preview Runtime
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
