import { useState } from 'react';
import { generateMindmap } from '../services/gemini';
import { saveMindmap, extractTitleFromMarkdown } from '../services/db';

export function useAudioUpload() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState(null);
  const [markdown, setMarkdown] = useState("");
  const [savedMindmap, setSavedMindmap] = useState(null);

  const processAudio = async (file) => {
    setIsProcessing(true);
    setError(null);
    setProgressMsg("Starting process...");
    
    try {
      const result = await generateMindmap(file, (msg) => setProgressMsg(msg));
      
      // Enforce strict Markdown output, removing any accidental code fences
      let cleanResult = result.trim();
      if (cleanResult.startsWith("```markdown")) {
        cleanResult = cleanResult.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');
      } else if (cleanResult.startsWith("```")) {
        cleanResult = cleanResult.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      setMarkdown(cleanResult);

      // Auto-save to Firestore
      try {
        const fileTitle = file.name ? file.name.replace(/\.[^/.]+$/, "") : "Lecture Mindmap";
        const title = extractTitleFromMarkdown(cleanResult, fileTitle);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const durationEst = `${fileSizeMB} MB`;

        const saved = await saveMindmap(title, cleanResult, durationEst, {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        setSavedMindmap(saved);
      } catch (saveErr) {
        console.warn("Auto-save to Firestore failed (proceeding with local session):", saveErr);
      }

      return cleanResult;
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during audio processing.");
      throw err;
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const reset = () => {
    setMarkdown("");
    setSavedMindmap(null);
    setError(null);
  };

  return { 
    processAudio, 
    isProcessing, 
    progressMsg, 
    error, 
    markdown, 
    savedMindmap,
    reset 
  };
}
