import { useState, useRef } from 'react';
import { Mic, MicOff, Send, MessageSquareText, Activity, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<'english' | 'arabic'>('arabic');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Simulated session ID
  const sessionId = useRef(Math.random().toString(36).substring(7));

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioSubmission(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Microphone access is required for voice input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleAudioSubmission = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice.webm');
    
    // Optimistic UI for voice processing
    const userMsgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: '🎤 (Processing Voice...)' }]);

    try {
      const response = await fetch(`/api/voice?session_id=${sessionId.current}&language=${language}`, {
        method: 'POST',
        body: formData,
      });

      const textResponse = await response.text();
      let data;
      try {
          data = JSON.parse(textResponse);
      } catch (err) {
          throw new Error('Invalid JSON response');
      }
      
      if (!response.ok) throw new Error(data?.error || 'API Error');

      // Update actual recognized text
      setMessages((prev) => prev.map(msg => msg.id === userMsgId ? { ...msg, content: data.text_input } : msg));
      
      // Add assistant response
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: data.text_response }]);
      
      // Real backend would return bytes, here we mock audio playback if generated
      if (data.audio_generated) {
         // simulate playback audio via synthesis since backend is just a stub for this preview
         const utterance = new SpeechSynthesisUtterance(data.text_response);
         utterance.lang = language === 'arabic' ? 'ar-SA' : 'en-US';
         window.speechSynthesis.speak(utterance);
      }
    } catch (error: any) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : 'Sorry, there was an error processing your voice.';
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    const userText = textInput;
    setTextInput('');
    setIsLoading(true);
    
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content: userText }]);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, session_id: sessionId.current, language }),
      });

      const textResponse = await response.text();
      let data;
      try {
          data = JSON.parse(textResponse);
      } catch (err) {
          throw new Error('Invalid JSON response');
      }

      if (!response.ok) throw new Error(data?.error || 'API Error');

      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: data.response }]);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : 'Sorry, I am offline.';
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 font-sans flex flex-col items-center justify-center p-4">
      
      <div className="w-full max-w-3xl flex flex-col h-[85vh] bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50">
        
        {/* Header */}
        <div className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-slate-800/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Activity size={20} className={isLoading ? "animate-pulse" : ""} />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight">AI Voice Assistant</h1>
              <p className="text-xs text-slate-400 font-mono tracking-wide">QWEN • LANGGRAPH • WHISPER</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/50 rounded-full px-3 py-1.5 border border-slate-700/50">
                <Globe size={14} className="text-slate-400" />
                <select 
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'english' | 'arabic')}
                  className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer appearance-none px-1"
                >
                    <option value="english" className="bg-slate-800">English</option>
                    <option value="arabic" className="bg-slate-800">العربية</option>
                </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-emerald-500 font-medium tracking-wide">SYSTEM READY</span>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <MessageSquareText size={48} className="text-slate-500" />
              <div>
                <p className="text-lg font-medium text-slate-300">How can I help you today?</p>
                <p className="text-sm text-slate-400 max-w-sm mt-2">
                  Press the microphone button to speak, or type a message below.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                  m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-slate-700/50 text-slate-200 rounded-bl-none border border-white/5'
                }`}>
                  <div className="prose prose-invert prose-sm">
                    {/* Using div instead of ReactMarkdown directly to avoid module issues strictly for preview if markdown fails */}
                    {m.content}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-700/30 rounded-2xl px-5 py-4 rounded-bl-none border border-white/5 flex gap-1">
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-800/80 border-t border-white/5 backdrop-blur-md shrink-0">
          <div className="max-w-4xl mx-auto flex items-end gap-3">
            
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-4 rounded-full transition-all duration-300 flex-shrink-0 ${
                isRecording 
                  ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.4)]' 
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              {isRecording ? <MicOff size={24} className="animate-pulse" /> : <Mic size={24} />}
            </button>

            <form onSubmit={handleTextSubmit} className="flex-1 flex items-center bg-slate-900 rounded-full border border-slate-700 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
              <input
                type="text"
                placeholder={isRecording ? "Listening..." : "Type a message..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isRecording || isLoading}
                className="flex-1 bg-transparent border-none px-6 py-4 text-sm focus:outline-none text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
              />
              <button 
                type="submit" 
                disabled={!textInput.trim() || isLoading}
                className="p-4 text-indigo-400 hover:text-indigo-300 disabled:opacity-30 transition-colors"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
