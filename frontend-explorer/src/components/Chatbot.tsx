'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CreateMLCEngine, InitProgressReport, MLCEngine } from '@mlc.ai/web-llm';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: 'HELLO. I AM THE LAKEHOUSE ASSISTANT, YOUR IN-BROWSER AI GUIDE. HOW CAN I HELP YOU TODAY?' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initEngine = async () => {
    if (engine) return;
    try {
      const initProgressCallback = (report: InitProgressReport) => {
        setProgress(report.text);
      };
      
      const selectedModel = "Phi-3.5-mini-instruct-q4f16_1-MLC";
      
      const newEngine = await CreateMLCEngine(
        selectedModel,
        { initProgressCallback }
      );
      setEngine(newEngine);
      setProgress('');
    } catch (err: any) {
      console.error(err);
      setProgress('ERROR: DEVICE DOES NOT SUPPORT WEBGPU OR DOWNLOAD FAILED.');
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (!engine && progress === '') {
      setProgress('INITIALIZING AI ENGINE... THIS MAY TAKE A MINUTE.');
      initEngine();
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !engine || isGenerating) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);
    
    try {
      const chatMessages = [
        { 
          role: 'system' as const, 
          content: 'You are the Lakehouse Assistant, an expert AI guide for the Wolfsonian Lakehouse collection. The catalog database contains the following fields for each object: title, identifier, collection type, note, credit line, physical extent, form, genre, description, linked agent (creator), subject, place published, date created, and decade. Focus your answers entirely on these fields. Provide informative, concise answers. Match the brutalist aesthetic of the site.' 
        },
        ...messages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        { role: 'user' as const, content: userMsg }
      ];
      
      const chunks = await engine.chat.completions.create({
        messages: chatMessages,
        stream: true,
      });
      
      let reply = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      
      for await (const chunk of chunks) {
        reply += chunk.choices[0]?.delta.content || '';
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].content = reply;
          return newMsgs;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'ERROR GENERATING RESPONSE.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button 
        onClick={handleOpen}
        className={`fixed bottom-6 right-6 z-50 bg-mca-cyan text-mca-black font-black tracking-widest px-6 py-4 border-2 border-mca-cyan hover:bg-mca-black hover:text-mca-cyan transition-colors text-sm uppercase shadow-lg ${isOpen ? 'hidden' : 'block'}`}
      >
        CHAT WITH LAKEHOUSE ASSISTANT
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[22rem] sm:w-96 h-[32rem] bg-mca-dark border-2 border-white z-50 flex flex-col shadow-[8px_8px_0_0_#00FFFF]">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b-2 border-white bg-mca-black">
            <h2 className="font-black tracking-widest text-white uppercase">LAKEHOUSE ASSISTANT (AI)</h2>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-red-500 font-bold"
            >
              [X]
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 max-w-[85%] border-2 ${msg.role === 'user' ? 'bg-white text-mca-black border-white' : 'bg-transparent text-mca-cyan border-mca-cyan'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="p-3 bg-transparent text-mca-cyan border-2 border-mca-cyan animate-pulse">
                  GENERATING...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Progress Bar Area */}
          {progress && (
            <div className="p-2 border-t border-white/20 text-mca-yellow text-[10px] font-mono leading-tight break-all">
              {progress}
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t-2 border-white bg-mca-black">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="ASK THE ASSISTANT..."
                disabled={!engine || isGenerating}
                className="flex-1 bg-transparent border border-white/30 text-white p-2 text-sm placeholder-white/30 focus:outline-none focus:border-mca-cyan disabled:opacity-50"
              />
              <button 
                onClick={sendMessage}
                disabled={!engine || isGenerating || !input.trim()}
                className="bg-mca-cyan text-mca-black px-4 font-bold disabled:opacity-50 hover:bg-white transition-colors uppercase text-sm"
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
