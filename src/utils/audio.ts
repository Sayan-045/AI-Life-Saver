/**
 * Play a gentle, modern warning chime followed by speaking the name of the crisis task.
 */
export function playCrisisAlert(taskName: string) {
  try {
    // 1. Play a pleasant dual-tone chime using Web Audio API
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      
      // Tone 1: Gentle chime starting now
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      
      // Gentle fade in and out
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.08);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);

      // Tone 2: Harmonious chime delayed slightly
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.7);
    }
  } catch (e) {
    console.warn("Web Audio API not supported or blocked by browser autoplays:", e);
  }

  // 2. Speak the crisis task name using SpeechSynthesis API
  try {
    if ("speechSynthesis" in window) {
      // Cancel any ongoing speech so it does not queue up indefinitely
      window.speechSynthesis.cancel();

      const text = `Attention: Task "${taskName}" is in a crisis situation.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0; // Normal rate
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Try to find a nice English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural"))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn("SpeechSynthesis API failed:", e);
  }
}
