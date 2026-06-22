"use client";

import { useState, useEffect } from "react";

interface AudioReaderProps {
  identifier: string;
  audioCount: number;
}

export default function AudioReader({ identifier, audioCount }: AudioReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // If there's no audio or count is 0, render nothing
  if (!audioCount || audioCount === 0) return null;

  const identifiers = identifier.split(';').map(i => i.trim()).filter(Boolean);
  const baseId = identifiers.length > 0 ? identifiers[0].replace(/[^a-zA-Z0-9.-]/g, '_') : '';

  // First file is base.mp3, subsequent files are base_1.mp3, base_2.mp3
  const audioSrc = currentIndex === 0 

    ? `/audio/${encodeURIComponent(baseId)}.mp3`
    : `/audio/${encodeURIComponent(baseId)}_${currentIndex}.mp3`;

  return (
    <div className="w-full bg-mca-black border-t-2 border-white flex flex-col p-6 animate-in slide-in-from-bottom-4">
      <div className="text-[10px] text-mca-cyan uppercase tracking-widest font-bold mb-4">
        [ RECORDING: {currentIndex + 1} / {audioCount} ]
      </div>
      
      <audio 
        key={audioSrc}
        controls 
        className="w-full grayscale contrast-125 sepia hover:sepia-0 transition-all duration-300 rounded-none h-12"
        controlsList="nodownload"
      >
        <source src={audioSrc} type="audio/mpeg" />
        <source src={audioSrc.replace('.mp3', '.wav')} type="audio/wav" />
        Your browser does not support the audio element.
      </audio>

      {audioCount > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto custom-scrollbar pb-2">
          {Array.from({ length: audioCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest border-2 transition-colors ${
                currentIndex === idx 
                  ? 'bg-mca-cyan text-mca-black border-mca-cyan' 
                  : 'bg-transparent text-white border-white/30 hover:border-white'
              }`}
            >
              TRACK {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
