from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends
from pydantic import BaseModel
from app.services.llm import process_voice_query
from app.services.speech import transcribe_audio, text_to_speech
from typing import List

router = APIRouter()

class QueryRequest(BaseModel):
    text: str
    session_id: str

class QueryResponse(BaseModel):
    response: str
    audio_url: str | None = None

@router.post("/query", response_model=QueryResponse)
async def query_assistant(request: QueryRequest):
    """Fallback text-based query point"""
    llm_response = await process_voice_query(request.text, request.session_id)
    return {"response": llm_response, "audio_url": None}

@router.post("/voice")
async def voice_query(session_id: str, audio: UploadFile = File(...)):
    """Receives voice, transcribes, runs agent, generates speech back"""
    audio_bytes = await audio.read()
    
    # 1. STT (Whisper)
    text = await transcribe_audio(audio_bytes)
    
    # 2. Agent (LangGraph + Qwen fallback)
    llm_response = await process_voice_query(text, session_id)
    
    # 3. TTS (Kokoro)
    audio_response_bytes = await text_to_speech(llm_response)
    
    return {
        "text_input": text,
        "text_response": llm_response,
        # In a real app we'd stream the audio back or save and return URL
        "audio_generated": True 
    }
