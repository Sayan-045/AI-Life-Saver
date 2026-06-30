import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Support all environment variations of Gemini keys for rotation
const GEMINI_KEYS = [
  process.env.GEMINI_KEY_1 || process.env.VITE_GEMINI_KEY_1,
  process.env.GEMINI_KEY_2 || process.env.VITE_GEMINI_KEY_2,
  process.env.GEMINI_KEY_3 || process.env.VITE_GEMINI_KEY_3,
  process.env.GEMINI_API_KEY
].filter(Boolean);

let currentKeyIndex = 0;

function getNextGeminiClient(): GoogleGenAI {
  if (GEMINI_KEYS.length === 0) {
    throw new Error("No Gemini API keys found. Please configure GEMINI_KEY_1, GEMINI_KEY_2, GEMINI_KEY_3, or GEMINI_API_KEY in the Secrets panel.");
  }
  const key = GEMINI_KEYS[currentKeyIndex];
  console.log(`Using Gemini API Key Index ${currentKeyIndex}`);
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

// Lazy-initialize Groq client to prevent crash on startup if key is missing
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not defined in the environment. Please configure it in the Secrets panel.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

async function callGroqServer(prompt: string): Promise<string> {
  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: "llama3-8b-8192",
    messages: [
      {
        role: "system",
        content: "You are Life Saver, an AI deadline rescue assistant. Be concise, direct and actionable. Maximum 4 sentences per response. Use ** for bold text on important info."
      },
      { 
        role: "user", 
        content: prompt 
      }
    ],
    max_tokens: 500,
    temperature: 0.7
  });
  return completion.choices[0]?.message?.content || "";
}

async function callGeminiServer(prompt: string): Promise<string> {
  const result = await generateContentWithFallback({
    contents: prompt,
    model: "gemini-3.5-flash"
  });
  return result.text || "";
}

async function generateContentWithFallback(params: {
  contents: any;
  config?: any;
  model?: string;
}): Promise<any> {
  const primaryModel = params.model || "gemini-3.5-flash";
  const modelsToTry = [primaryModel, "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const maxAttempts = Math.max(3, GEMINI_KEYS.length);
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ai = getNextGeminiClient();
    for (const model of modelsToTry) {
      try {
        const result = await ai.models.generateContent({
          ...params,
          model
        });
        return result;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isOverloaded = 
          errMsg.includes('503') || 
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.includes('high demand');

        if (isOverloaded && attempt < maxAttempts) {
          console.warn(`Model ${model} overloaded on key index ${(currentKeyIndex - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length}. Rotating key...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          break; // Try next key
        } else {
          console.warn(`Model ${model} failed on attempt ${attempt}:`, errMsg);
        }
      }
    }
  }

  const errMsg = lastError?.message || String(lastError);
  if (errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429")) {
    throw new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary. We tried multiple fallback models and rotated API keys but all are busy. Please try again in a few seconds! ⚡");
  }
  throw lastError;
}

async function sendChatMessageWithFallback(
  formattedHistory: any[],
  message: string,
  systemInstruction: string
): Promise<any> {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const maxAttempts = Math.max(3, GEMINI_KEYS.length);
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ai = getNextGeminiClient();
    for (const model of modelsToTry) {
      try {
        const chat = ai.chats.create({
          model,
          history: formattedHistory,
          config: { systemInstruction }
        });
        const result = await chat.sendMessage({ message });
        return result;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isOverloaded = 
          errMsg.includes('503') || 
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.includes('high demand');

        if (isOverloaded && attempt < maxAttempts) {
          console.warn(`Chat model ${model} overloaded on key index ${(currentKeyIndex - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length}. Rotating key...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          break; // Try next key
        } else {
          console.warn(`Chat model ${model} failed on attempt ${attempt}:`, errMsg);
        }
      }
    }
  }

  const errMsg = lastError?.message || String(lastError);
  if (errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429")) {
    throw new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary. We tried multiple fallback models and rotated API keys but all are busy. Please try again in a few seconds! ⚡");
  }
  throw lastError;
}

// 1. Core Chat Endpoint
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const formattedHistory = (history || []).map((h: any) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }]
    }));

    const systemInstruction = "You are 'Life Saver', a high-energy, empathetic AI deadline rescue companion. Your job is to help users prioritize their tasks, break down overwhelming deadlines into actionable micro-steps, build positive habits, and defeat procrastination. Use bullet points, bold text, and a highly encouraging, direct tone.";

    const result = await sendChatMessageWithFallback(
      formattedHistory,
      message,
      systemInstruction
    );

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: error.message || "Failed to communicate with AI companion." });
  }
});

// 2. Rescue Plan Endpoint
app.post("/api/gemini/rescue-plan", async (req, res) => {
  try {
    const { tasks, habits } = req.body;
    


    const tasksStr = (tasks || []).map((t: any) => {
      const isDone = t.done !== undefined ? t.done : t.completed;
      const taskName = t.name || t.title || "Untitled";
      return `- [${isDone ? "COMPLETED" : "PENDING"}] "${taskName}" (Priority: ${t.priority || "medium"}, Deadline: ${t.deadline || "None"})`;
    }).join("\n");

    const habitsStr = (habits || []).map((h: any) => 
      `- [${h.completedToday ? "DONE TODAY" : "TODO"}] "${h.title}" (Streak: ${h.streak} days, Frequency: ${h.frequency})`
    ).join("\n");

    const prompt = `
Generate a high-impact, custom "Deadline Rescue Plan" for this user.
Here is their current focus and dashboard list:

TASKS & DEADLINES:
${tasksStr || "No tasks currently listed."}

ACTIVE HABITS:
${habitsStr || "No active habits tracked."}

Deliver a beautifully organized response using Markdown:
1. **The Assessment**: A quick, 2-sentence energy-boosting diagnostic. Tell them what needs their focus first.
2. **Action Plan (Triage)**: Break down the most critical tasks into 2-3 immediate, ultra-simple micro-steps (e.g. "Do this for 10 minutes now").
3. **Daily Habit Hook**: Suggest how to tie one of their active habits into their schedule to maintain momentum.
4. **Rescue Spark**: A single, powerful quote or custom pep-talk to blast procrastination.

Keep the tone encouraging, laser-focused, and direct. Avoid overwhelming fluff.
`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Rescue Plan Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI rescue plan." });
  }
});

// 3. Ask Gemini Endpoint with Task Context
app.post("/api/gemini/ask", async (req, res) => {
  try {
    const { userMessage, tasks } = req.body;
    if (!userMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    const tasksStr = (tasks || []).map((t: any) => {
      const isDone = t.done !== undefined ? t.done : t.completed;
      return `- [${isDone ? "COMPLETED" : "PENDING"}] "${t.name || t.title || "Untitled"}" (Priority: ${t.priority || "medium"}, Deadline: ${t.deadline || "None"}, Category: ${t.category || "General"})`;
    }).join("\n");

    const systemInstruction = `You are Life Saver, an AI deadline rescue assistant. The user's tasks are:\n${tasksStr || "None"}\nToday is ${new Date().toISOString().split('T')[0]}. Be concise (3-4 sentences), direct, and actionable.`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: userMessage,
      config: { systemInstruction }
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Ask Error:", error);
    res.status(500).json({ error: error.message || "Failed to query Life Saver AI." });
  }
});

// 4. Task Specific Help Endpoint
app.post("/api/gemini/task-help", async (req, res) => {
  try {
    const { task } = req.body;
    if (!task) {
      return res.status(400).json({ error: "Task is required." });
    }

    const now = Date.now();
    const target = task.deadline ? new Date(task.deadline).getTime() : now;
    const diffMs = target - now;
    const hoursLeft = task.deadline ? Math.max(0.1, diffMs / 3600000).toFixed(1) : "unspecified";
    const estimatedMinutes = task.estimatedMinutes || 0;

    const prompt = `Task: ${task.name}. Due in ${hoursLeft} hours. Estimated: ${estimatedMinutes} minutes. Give me a specific 3-step action plan to complete this fast.`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Task Help Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate task action plan." });
  }
});

// 5. Prioritize Tasks Endpoint
app.post("/api/gemini/prioritize", async (req, res) => {
  try {
    const { tasks } = req.body;

    const pendingTasks = (tasks || []).filter((t: any) => {
      const isDone = t.done !== undefined ? t.done : t.completed;
      return !isDone;
    });

    const tasksListStr = pendingTasks.map((t: any) => 
      `- "${t.name || t.title || "Untitled"}" (Deadline: ${t.deadline || "None"}, Priority: ${t.priority || "medium"})`
    ).join("\n");

    const prompt = `Rank these tasks in order I should tackle them right now, with one sentence reason each:\n${tasksListStr || "No pending tasks."}`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Prioritize Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate priorities." });
  }
});

// 6. Daily Schedule Endpoint
app.post("/api/gemini/schedule", async (req, res) => {
  try {
    const { tasks } = req.body;

    const pendingTasks = (tasks || []).filter((t: any) => {
      const isDone = t.done !== undefined ? t.done : t.completed;
      return !isDone;
    });

    const tasksListStr = pendingTasks.map((t: any) => 
      `- "${t.name || t.title || "Untitled"}" (Estimated: ${t.estimatedMinutes || 30} mins, Deadline: ${t.deadline || "None"}, Priority: ${t.priority || "medium"})`
    ).join("\n");

    const prompt = `Create an hour-by-hour schedule for today based on these tasks and their deadlines. Be realistic about time.\nTasks:\n${tasksListStr || "No pending tasks."}`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Schedule Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate daily schedule." });
  }
});

// 7. Parse Voice Input Task Endpoint
app.post("/api/gemini/parse-voice", async (req, res) => {
  try {
    const { spokenText, currentLocalTime } = req.body;
    if (!spokenText) {
      return res.status(400).json({ error: "Spoken text is required." });
    }

    const prompt = `Extract task details from the spoken text: "${spokenText}".
Today's local date/time context is: ${currentLocalTime || new Date().toISOString()}.
You must interpret words like "today", "tomorrow", "tonight", "next Monday at 3pm" relative to this time.
Please return a valid JSON object matching the requested schema.`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            priority: { type: "STRING", enum: ["critical", "high", "medium", "low"] },
            estimatedMinutes: { type: "INTEGER" },
            deadline: { type: "STRING", description: "Format: YYYY-MM-DDTHH:MM (compatible with datetime-local input, e.g., 2026-06-27T15:00)" }
          },
          required: ["name", "priority", "estimatedMinutes", "deadline"]
        }
      }
    });

    res.json(JSON.parse(result.text || "{}"));
  } catch (error: any) {
    console.error("Gemini Voice Parse Error:", error);
    res.status(500).json({ error: error.message || "Failed to parse voice input." });
  }
});

// 8. Habit Coaching Endpoint
app.post("/api/gemini/habit-coach", async (req, res) => {
  try {
    const { habits } = req.body;

    const habitsStr = (habits || []).map((h: any) => 
      `- "${h.name}" (Streak: ${h.currentStreak || 0} days, Target: ${h.targetDays || 7} days, Last Done: ${h.lastDone || "Never"})`
    ).join("\n");

    const prompt = `My habits and streaks are:\n${habitsStr || "No habits tracked yet."}\n\nGive me one specific tip to improve my consistency. Keep it friendly, short (2-3 sentences), and highly actionable.`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt
    });

    res.json({ text: result.text });
  } catch (error: any) {
    console.error("Gemini Habit Coach Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate coaching tip." });
  }
});

// 9. Parse Gmail Deadlines Endpoint
app.post("/api/gemini/parse-gmail", async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: "Emails array is required." });
    }

    const prompt = `Extract tasks and deadlines from these emails.
Return ONLY a raw JSON array, no markdown, no backticks, no explanation, no text before or after.
Start your response with [ and end with ].

Format exactly like this:
[{"name":"task name here","deadline":"2024-06-30T23:59:00","priority":"critical","category":"Hackathon"}]

Priority rules:
- critical: due within 24 hours
- high: due within 3 days
- medium: due within 7 days
- low: due after 7 days

Category rules: detect from context — Hackathon, College, Work, Personal, Finance, Health

If no clear deadline found in an email, skip it completely.
If deadline has no specific time mentioned, use 23:59:00.
Only include future deadlines — ignore anything already past.
Today is ${new Date().toISOString()}.

Emails:
${emails.join('\n---\n')}`;

    const result = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ text: result.text || "" });
  } catch (error: any) {
    console.error("Gemini Gmail Parse Error:", error);
    res.status(500).json({ error: error.message || "Failed to parse deadlines from emails." });
  }
});

// Secure and Fallbacked AI Call Route (tries Gemini first, falls back to Groq)
app.post("/api/ai/call", async (req, res) => {
  try {
    const { prompt, tasks = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    // Build full prompt with task context
    const fullPrompt = tasks.length > 0 
      ? `You are Life Saver AI. User tasks: ${JSON.stringify((tasks as any[]).map(t => ({
          name: t.name || t.title || "Untitled",
          priority: t.priority || "medium",
          deadline: t.deadline || "None",
          estimatedMinutes: t.estimatedMinutes || 30,
          done: t.done !== undefined ? t.done : t.completed
        })))}. Today: ${new Date().toLocaleString()}.\n\n${prompt}`
      : prompt;

    try {
      console.log("Trying Gemini first...");
      // Try Gemini via our fallback wrapper (which tries 3.5-flash, 3.1-flash-lite, etc.)
      const response = await callGeminiServer(fullPrompt);
      return res.json({ response, source: "gemini" });
    } catch (geminiError: any) {
      console.warn("Gemini failed, switching to Groq:", geminiError.message || geminiError);
      
      // Fallback to Groq
      try {
        const response = await callGroqServer(fullPrompt);
        return res.json({ response, source: "groq" });
      } catch (groqError: any) {
        console.error("Groq also failed:", groqError.message || groqError);
        return res.json({
          response: "Both AI engines are busy right now. Please wait 30 seconds and try again. Your tasks are safe!",
          source: "error"
        });
      }
    }
  } catch (error: any) {
    console.error("Secure AI Call Router Error:", error);
    res.status(500).json({ error: error.message || "Failed to process AI call." });
  }
});

// Vite middleware configuration for Development or Static Asset serving in Production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupServer();
