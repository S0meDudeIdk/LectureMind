import { useState } from 'react';
import { generateMindmap } from '../services/gemini';

export function useAudioUpload() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState(null);
  const [markdown, setMarkdown] = useState("");

  const processAudio = async (file) => {
    setIsProcessing(true);
    setError(null);
    setProgressMsg("Starting process...");
    
    try {
      const result = await generateMindmap(file, (msg) => setProgressMsg(msg));
      
      // Enforce strict Markdown output, removing any accidental backticks
      let cleanResult = result.trim();
      if (cleanResult.startsWith("```markdown")) {
        cleanResult = cleanResult.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');
      } else if (cleanResult.startsWith("```")) {
        cleanResult = cleanResult.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      setMarkdown(cleanResult);
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during audio processing.");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  const reset = () => {
    setMarkdown("");
    setError(null);
  };

  return { processAudio, isProcessing, progressMsg, error, markdown, reset };
}
