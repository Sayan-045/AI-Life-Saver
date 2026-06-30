import { ChatMessage, Task, Habit } from "./types";

export interface AIResponse {
  response: string;
  source: 'gemini' | 'groq' | 'error';
}

/**
 * Main function — uses the server-side API to query Gemini with Groq fallback.
 */
export async function callAI(
  prompt: string,
  tasks: Task[] = [],
  onStatusUpdate: ((status: string) => void) | null = null
): Promise<AIResponse> {
  try {
    if (onStatusUpdate) onStatusUpdate('Thinking...');

    let finalPrompt = prompt;
    if (typeof window !== "undefined") {
      const storedProfile = localStorage.getItem('user_profile');
      if (storedProfile) {
        try {
          const profile = JSON.parse(storedProfile);
          finalPrompt = `User Profile - Name: ${profile.name}, Age: ${profile.age || 'unspecified'}, Working Hours: ${profile.workingHours}, Core Categories: ${JSON.stringify(profile.categories)}\n\n${finalPrompt}`;
        } catch (e) {
          console.error("Failed to parse user_profile:", e);
        }
      }
    }

    if (typeof window !== "undefined" && localStorage.getItem('agentMode') === 'true') {
      finalPrompt = `${finalPrompt}\n\nAGENT MODE: Be decisive. Tell user exactly what to do. No hedging. Under 3 sentences per response.`;
    }

    const res = await fetch("/api/ai/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: finalPrompt, tasks })
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    return {
      response: data.response,
      source: data.source
    };
  } catch (error: any) {
    console.error("AI service call failed:", error);
    return {
      response: "Both AI engines are busy right now. Please wait 30 seconds and try again. Your tasks are safe!",
      source: "error"
    };
  }
}

/**
 * Specific functions for each feature — all use callAI internally
 */
export async function askAI(userMessage: string, tasks: Task[]): Promise<AIResponse> {
  return callAI(userMessage, tasks);
}

export async function getTaskHelp(task: Task): Promise<AIResponse> {
  const hoursLeft = task.deadline
    ? ((new Date(task.deadline).getTime() - Date.now()) / 3600000).toFixed(1)
    : "0";
  const prompt = `Task: "${task.name}". Due in ${hoursLeft} hours. Estimated: ${task.estimatedMinutes || 30} minutes. Give me a specific 3-step action plan to complete this fast. Be very specific.`;
  return callAI(prompt);
}

export async function prioritizeTasks(tasks: Task[]): Promise<AIResponse> {
  const pending = tasks.filter(t => !t.done);
  const prompt = `Rank these tasks in order I should do them RIGHT NOW. One sentence reason each. Tasks: ${JSON.stringify(pending.map(t => ({ name: t.name, deadline: t.deadline, priority: t.priority })))}`;
  return callAI(prompt, tasks);
}

export async function getDailySchedule(tasks: Task[]): Promise<AIResponse> {
  const pending = tasks.filter(t => !t.done);
  const prompt = `Create a realistic hour-by-hour schedule for today based on these tasks. Consider deadlines and estimated times. Tasks: ${JSON.stringify(pending.map(t => ({ name: t.name, deadline: t.deadline, estimatedMinutes: t.estimatedMinutes })))}`;
  return callAI(prompt, tasks);
}

export async function getCrisisRescuePlan(task: Task): Promise<AIResponse> {
  const minutesLeft = task.deadline
    ? ((new Date(task.deadline).getTime() - Date.now()) / 60000).toFixed(0)
    : "0";
  const prompt = `EMERGENCY: Task "${task.name}" is due in ${minutesLeft} minutes and needs ${task.estimatedMinutes || 30} minutes. Give an immediate rescue plan: what to cut, what to do first, whether to ask for extension. Be extremely direct and fast.`;
  return callAI(prompt);
}

export async function getHabitCoaching(habits: Habit[]): Promise<AIResponse> {
  const prompt = `My habits and streaks: ${JSON.stringify(habits.map(h => ({ name: h.name, streak: h.currentStreak, target: h.targetDays })))}\n\nGive me one specific actionable tip to improve my consistency today.`;
  return callAI(prompt);
}

/**
 * Compatibility layers for legacy components to prevent any breakages
 */
export async function askGemini(userMessage: string, tasks: Task[]): Promise<string> {
  const result = await askAI(userMessage, tasks);
  return result.response;
}

export async function generateRescuePlan(tasks: Task[], habits: Habit[]): Promise<string> {
  const prompt = `Rescue me! Generate a full assessment and triage schedule based on my active tasks and habits.`;
  const result = await callAI(prompt, tasks);
  return result.response;
}

export async function parseVoiceInput(spokenText: string, currentLocalTime: string): Promise<{
  name?: string;
  priority?: "critical" | "high" | "medium" | "low";
  estimatedMinutes?: number;
  deadline?: string;
}> {
  const response = await fetch("/api/gemini/parse-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spokenText, currentLocalTime })
  });
  if (!response.ok) {
    throw new Error("Failed to parse voice.");
  }
  return response.json();
}

export async function getHabitCoachingTip(habits: Habit[]): Promise<string> {
  const result = await getHabitCoaching(habits);
  return result.response;
}

export async function sendChatMessage(message: string, history: ChatMessage[]): Promise<string> {
  const response = await fetch("/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history })
  });
  if (!response.ok) {
    throw new Error("Failed to send message.");
  }
  const data = await response.json();
  return data.text;
}

export async function predictCrises(tasks: Task[]): Promise<any[]> {
  const pending = tasks.filter(t => !t.done);
  if (pending.length === 0) return [];
  const prompt = `Analyze these tasks and identify which ones 
  the user is at RISK of missing today, even if deadline is 
  not immediate yet. Consider total workload vs available hours.
  Tasks: ${JSON.stringify(pending)}
  Current time: ${new Date().toLocaleString()}
  Return predictions as JSON array:
  [{"taskName": "...", "riskLevel": "high/medium", "reason": "...", "suggestion": "..."}]
  
  CRITICAL: reason must be under 10 words. suggestion must be under 10 words. Be extremely concise.`;
  
  try {
    const res = await callAI(prompt);
    let responseText = res.response;
    const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(responseText.trim());
  } catch (err) {
    console.error("Failed to parse predictCrises JSON output:", err);
    return [];
  }
}

export async function breakDownTask(task: Task): Promise<any[]> {
  const prompt = `Break down this task into 5 specific subtasks with time estimates:
  Task: ${task.name}. Total estimated time: ${task.estimatedMinutes} minutes.
  Return JSON: [{"name":"subtask name","estimatedMinutes":10}]`;

  try {
    const res = await callAI(prompt);
    let responseText = res.response;
    const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(responseText.trim());
  } catch (err) {
    console.error("Failed to parse breakDownTask JSON output:", err);
    throw err;
  }
}

export async function getScoreMotivation(score: number, doneCount: number, remainingCount: number): Promise<string> {
  const prompt = `My productivity score is ${score}/100 today. ${doneCount} tasks done, ${remainingCount} remaining. 
  Give me exactly one motivational sentence. Maximum 8 words. No quotes around it.`;
  try {
    const res = await callAI(prompt);
    return res.response.replace(/^["']|["']$/g, "").trim();
  } catch (err) {
    console.error("Failed to get score motivation:", err);
    return "Keep going! Every small step counts towards your goal.";
  }
}

export async function getDailyReportSummary(score: number, doneCount: number, totalCount: number, streak: number): Promise<string> {
  const prompt = `Generate a warm personal daily summary in exactly 2 sentences for someone who scored ${score}/100 today, completed ${doneCount} of ${totalCount} tasks, and has a ${streak} day streak. Make it feel like a friend is speaking, not a robot. End with one emoji.`;
  try {
    const res = await callAI(prompt);
    return res.response.replace(/^["']|["']$/g, "").trim();
  } catch (err) {
    console.error("Failed to generate daily summary:", err);
    return "You gave it your best shot today, and that is what matters most. Sleep well, recharge, and we will crush tomorrow's challenges together! 🌅";
  }
}

