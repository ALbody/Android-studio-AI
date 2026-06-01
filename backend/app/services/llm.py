"""
LangGraph and LLM Orchestration
"""
from app.config import settings
from app.services.memory import get_session_history, add_to_history, recall_long_term
import logging

logger = logging.getLogger(__name__)

async def process_voice_query(text: str, session_id: str) -> str:
    """
    Simulates a LangGraph execution with a local Qwen model / API fallback.
    """
    try:
        # Retrieve context
        short_term_history = get_session_history(session_id)
        long_term_context = recall_long_term(text)
        
        # Here you would invoke your LangGraph compiled graph.
        # For the sake of the runnable project, we simulate the agent processing:
        # graph.ainvoke({"input": text, "history": short_term_history})
        
        prompt = f"Context: {long_term_context}\nHistory: {short_term_history}\nUser: {text}\nAssistant:"
        
        # Simulating Qwen Response
        response_text = f"I heard you say: {text}. I'm processing this through my simulated LangGraph agent."
        
        # Store in memory
        add_to_history(session_id, "user", text)
        add_to_history(session_id, "assistant", response_text)
        
        return response_text
    except Exception as e:
        logger.error(f"Error in process_voice_query: {e}")
        return "I'm sorry, I'm having trouble processing that right now."
