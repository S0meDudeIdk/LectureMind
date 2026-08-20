import { useState } from 'react';
import { UploadSimple, FileAudio, Waveform } from '@phosphor-icons/react';

export default function DropZone({ onFileSelect }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (file.type.startsWith('audio/')) {
      onFileSelect(file);
    } else {
      alert("Please upload an audio file (MP3, WAV, M4A, etc.)");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-16 p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-3 tracking-tight">Turn lectures into knowledge</h2>
        <p className="text-text-muted">Upload an audio recording and let Gemini create a structured mindmap.</p>
      </div>

      <label 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center w-full h-72 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
          isDragging 
            ? 'border-primary bg-primary/5 scale-[1.02]' 
            : 'border-border bg-surface-alt/50 hover:bg-surface-alt hover:border-primary/50'
        }`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center mb-4 shadow-sm">
            <UploadSimple size={32} className={isDragging ? 'text-primary' : 'text-text-muted'} />
          </div>
          <p className="mb-2 text-sm font-medium">
            <span className="text-primary-light">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-text-muted/70 flex items-center gap-2">
            <FileAudio size={14} /> MP3, WAV, M4A (Max 20MB inline, larger via File API)
          </p>
        </div>
        <input 
          type="file" 
          className="hidden" 
          accept="audio/*" 
          onChange={handleFileInput}
        />
        
        {/* Decorative elements */}
        <div className="absolute bottom-4 left-4 text-border opacity-50"><Waveform size={24} /></div>
        <div className="absolute top-4 right-4 text-border opacity-50"><Waveform size={24} /></div>
      </label>
    </div>
  );
}
