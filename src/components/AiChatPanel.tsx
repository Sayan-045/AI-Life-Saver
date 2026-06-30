import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, Task, Habit } from "../types";
import { 
  sendChatMessage, 
  generateRescuePlan, 
  askGemini, 
  getTaskHelp, 
  prioritizeTasks, 
  getDailySchedule,
  callAI
} from "../aiService";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { Send, Sparkles, ShieldAlert, Zap, RefreshCw, MessageSquare, Mail, Loader } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AiChatPanelProps {
  userId: string;
  tasks: Task[];
  habits: Habit[];
  chatMessages: ChatMessage[];
  aiGenerating?: boolean;
  setAiGenerating?: (val: boolean) => void;
  syncing?: boolean;
  aiMessage?: string | null;
  agentMode?: boolean;
  agentUsageToday?: number;
  runAgentCycle?: () => void;
  userProfile?: {
    name: string;
    age: number | null;
    workingHours: string;
    categories: string[];
  };
}

export default function AiChatPanel({ 
  userId, 
  tasks, 
  habits, 
  chatMessages,
  aiGenerating,
  setAiGenerating,
  syncing,
  aiMessage,
  agentMode = false,
  agentUsageToday = 0,
  runAgentCycle,
  userProfile
}: AiChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Status and message states for engine monitoring
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'switching' | 'error'>('idle');
  const [statusText, setStatusText] = useState("Thinking...");
  const [lastMessage, setLastMessage] = useState("");
  const [countdown, setCountdown] = useState(30);

  const generating = aiGenerating || isGenerating;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    messagesEndRef.current?.scrollIntoView({ 
      behavior,
      block: 'end'
    });
  };

  // Scroll to bottom whenever messages change (with timeout to ensure DOM layout is ready)
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom('auto');
    }, 120);
    return () => clearTimeout(timer);
  }, [chatMessages, generating, aiStatus]);

  // Also scroll to bottom on initial load instantly
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom('auto');
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Countdown and Auto-retry logic
  useEffect(() => {
    if (aiStatus !== 'error') return;
    setCountdown(30);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          retryLastMessage(); // auto retry when hits 0
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [aiStatus, lastMessage]);

  const retryLastMessage = async () => {
    if (!lastMessage) return;
    setAiStatus('idle'); // Clear error state to allow retrying
    await triggerMessageSend(lastMessage);
  };

  // Find the most urgent undone task
  const getMostUrgentTask = (): Task | null => {
    const activeTasks = tasks.filter(t => !t.done);
    if (activeTasks.length === 0) return null;
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    return [...activeTasks].sort((a, b) => {
      const wA = priorityWeight[a.priority] || 2;
      const wB = priorityWeight[b.priority] || 2;
      if (wB !== wA) return wB - wA;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    })[0];
  };

  // Unified sending trigger
  const triggerMessageSend = async (messageText: string, customPrompt?: string) => {
    setLastMessage(messageText);
    setIsGenerating(true);
    if (setAiGenerating) setAiGenerating(true);
    setAiStatus('thinking');
    setStatusText("Thinking...");
    setErrorMessage(null);

    const actualPrompt = customPrompt || messageText;

    try {
      const messagesColRef = collection(db, "users", userId, "chats");
      
      // 1. Save user message to Firestore
      await addDoc(messagesColRef, {
        text: messageText,
        sender: "user",
        userId,
        createdAt: new Date().toISOString()
      });

      // 2. Call secure API endpoint with status callback
      const { response, source } = await callAI(
        actualPrompt,
        tasks,
        (statusUpdate) => {
          setStatusText(statusUpdate);
          if (statusUpdate.includes('Switching')) {
            setAiStatus('switching');
          }
        }
      );

      setIsGenerating(false);
      if (setAiGenerating) setAiGenerating(false);

      if (source === 'error') {
        setAiStatus('error');
      } else {
        setAiStatus('idle');
        // Save AI response to Firestore
        await addDoc(messagesColRef, {
          text: response,
          sender: "ai",
          userId,
          createdAt: new Date().toISOString(),
          source: source
        });
      }
    } catch (err: any) {
      console.error("AI chat failed:", err);
      setAiStatus('error');
      setIsGenerating(false);
      if (setAiGenerating) setAiGenerating(false);
    }
  };

  // Handle standard message submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || generating) return;

    const userQuery = inputText.trim();
    setInputText("");
    await triggerMessageSend(userQuery);
  };

  // One-click Rescue Plan generator
  const handleTriggerRescuePlan = async () => {
    if (generating) return;
    const userMessage = "Rescue me! Generate a full assessment and triage schedule based on my active tasks and habits.";
    await triggerMessageSend(userMessage);
  };

  // Quick Action Handler
  const handleQuickAction = async (action: "now" | "prioritize" | "schedule" | "urgent" | "take_control" | "run_agent_now") => {
    if (generating) return;

    let userPrompt = "";
    let customAiPrompt = "";

    switch (action) {
      case "run_agent_now": {
        if (runAgentCycle) {
          runAgentCycle();
        }
        return;
      }
      case "take_control":
        userPrompt = "Take control of my day";
        customAiPrompt = "Give me an authoritative, zero-excuses direct schedule and list of actions to take control of my day right now.";
        break;
      case "now":
        userPrompt = agentMode ? "What do I do RIGHT NOW?" : "What should I do now?";
        customAiPrompt = agentMode 
          ? `Based on my tasks, tell me exactly which 1 task to do immediately right now, why, and how to start. Tasks: ${JSON.stringify(tasks.filter(t => !t.done).map(t => ({ name: t.name, deadline: t.deadline, priority: t.priority })))}`
          : "What should I do now?";
        break;
      case "prioritize": {
        userPrompt = "Prioritize my tasks";
        const pending = tasks.filter(t => !t.done);
        customAiPrompt = `Rank these tasks in order I should do them RIGHT NOW. One sentence reason each. Tasks: ${JSON.stringify(pending.map(t => ({ name: t.name, deadline: t.deadline, priority: t.priority })))}`;
        break;
      }
      case "schedule": {
        userPrompt = agentMode ? "Fix my schedule" : "Make me a schedule";
        const pending = tasks.filter(t => !t.done);
        customAiPrompt = agentMode
          ? `Re-organize my day and fix my schedule to be highly productive and efficient. Tasks: ${JSON.stringify(pending.map(t => ({ name: t.name, deadline: t.deadline, estimatedMinutes: t.estimatedMinutes })))}`
          : `Create a realistic hour-by-hour schedule for today based on these tasks. Consider deadlines and estimated times. Tasks: ${JSON.stringify(pending.map(t => ({ name: t.name, deadline: t.deadline, estimatedMinutes: t.estimatedMinutes })))}`;
        break;
      }
      case "urgent": {
        const urgentTask = getMostUrgentTask();
        if (!urgentTask) {
          userPrompt = "Help with most urgent task";
          customAiPrompt = "You don't have any pending tasks right now! Great job! 🎉 Add a task if you'd like to plan something.";
        } else {
          userPrompt = `Help with most urgent task: "${urgentTask.name}"`;
          const hoursLeft = urgentTask.deadline
            ? ((new Date(urgentTask.deadline).getTime() - Date.now()) / 3600000).toFixed(1)
            : "0";
          customAiPrompt = `Task: "${urgentTask.name}". Due in ${hoursLeft} hours. Estimated: ${urgentTask.estimatedMinutes || 30} minutes. Give me a specific 3-step action plan to complete this fast. Be very specific.`;
        }
        break;
      }
      default:
        return;
    }

    if (action === "urgent" && !getMostUrgentTask()) {
      try {
        const messagesColRef = collection(db, "users", userId, "chats");
        await addDoc(messagesColRef, {
          text: userPrompt,
          sender: "user",
          userId,
          createdAt: new Date().toISOString()
        });
        await addDoc(messagesColRef, {
          text: customAiPrompt,
          sender: "ai",
          userId,
          createdAt: new Date().toISOString(),
          source: "gemini"
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    await triggerMessageSend(userPrompt, customAiPrompt);
  };

  return (
    <div id="ai-panel-container" className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col h-full flex-shrink-0 shadow-lg">
      {/* Panel Header */}
      <div id="ai-header" className="p-4 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-2xl lg:rounded-none">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{agentMode ? "🤖 Life Saver Agent" : "Life Saver AI"}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${
                aiStatus === 'error' ? 'bg-red-500' :
                aiStatus === 'switching' ? 'bg-yellow-400 animate-pulse' :
                'bg-green-500 animate-pulse'
              }`} />
              <span className="text-[10px] text-blue-50 font-medium">
                {aiStatus === 'error' ? 'Temporarily Busy' :
                 aiStatus === 'switching' ? 'Switching AI Engine' :
                 aiStatus === 'thinking' ? 'Thinking...' :
                 'Ready to Rescue'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Header Button Group */}
        <div className="flex gap-1.5">
          <button
            id="btn-ai-prioritize-header"
            onClick={() => handleQuickAction("prioritize")}
            disabled={generating}
            className="flex items-center gap-1 bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-[10px] uppercase tracking-wider px-2 py-1.5 rounded-lg transition disabled:opacity-50 cursor-pointer"
            title="AI rank and prioritize tasks"
          >
            <Sparkles className="w-3 h-3 text-white" />
            <span>Prioritize</span>
          </button>

          <button
            id="btn-trigger-rescue"
            onClick={handleTriggerRescuePlan}
            disabled={generating}
            className="flex items-center gap-1 bg-white hover:bg-slate-50 text-blue-600 font-bold text-[10px] uppercase tracking-wider px-2 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
            title="Analyze tasks and compile action guide"
          >
            <Zap className="w-3 h-3 fill-blue-600 text-blue-600" />
            <span>Rescue Plan</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div 
        id="ai-messages-list" 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 flex flex-col"
      >
        {chatMessages.length === 0 ? (
          <div id="chat-placeholder" className="h-full flex flex-col justify-center items-center text-center p-6 text-slate-400 dark:text-gray-500">
            <MessageSquare className="w-10 h-10 text-slate-300 dark:text-gray-600 mb-2" />
            <p className="font-bold text-xs text-slate-700 dark:text-gray-300">No chat history</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1 max-w-[200px]">
              Ask me how to partition your work, write study strategies, or click the quick chips below to get instant AI assistance!
            </p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div key={msg.id} className="border-b border-gray-100 dark:border-gray-800/60 pb-3 mb-3">
              <div
                className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}
              >
                {/* Sender Tag */}
                <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-1">
                  {msg.sender === "user" ? "You" : "Life Saver AI"}
                </span>
                {/* Message Bubble */}
                <div
                  className={`p-4 rounded-2xl text-xs shadow-sm leading-relaxed break-words overflow-hidden w-full ${
                    msg.sender === "user"
                      ? "bg-slate-900 text-white rounded-tr-none dark:bg-blue-900 dark:text-blue-100"
                      : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-100 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-750"
                  }`}
                >
                  {msg.sender === "user" ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  ) : (
                    <div className="markdown-body space-y-2 select-text leading-relaxed">
                      <ReactMarkdown components={{
                        li: ({node, ...props}) => <li className="mb-2" {...props} />
                      }}>{typeof msg.text === "string" ? msg.text : ""}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {msg.sender === "ai" && msg.source === 'groq' && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">⚡ powered by Groq</span>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator with Animated Dots */}
        {generating && (
          <div className="flex flex-col items-start max-w-[85%] mr-auto animate-in fade-in duration-300">
            <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-1">
              Life Saver AI
            </span>
            <div className="bg-slate-100 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 text-slate-500 dark:text-gray-300 p-3 rounded-2xl rounded-tl-none">
              <div className="flex flex-col gap-1 p-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">{statusText}</p>
              </div>
            </div>
          </div>
        )}



        {/* Error State Countdown Panel */}
        {aiStatus === 'error' && (
          <div className="border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 rounded-lg p-3 my-2 animate-in fade-in duration-300 w-full max-w-[85%] mr-auto">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              AI is temporarily busy. Retrying in {countdown} seconds...
            </p>
            <div className="w-full bg-red-100 dark:bg-gray-800 rounded-full h-1 mt-2">
              <div 
                className="bg-red-400 h-1 rounded-full transition-all duration-1000"
                style={{width: `${(countdown/30)*100}%`}}
              />
            </div>
            <button 
              type="button"
              onClick={retryLastMessage}
              className="mt-2 text-xs text-red-500 dark:text-red-400 underline hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
            >
              Retry now
            </button>
          </div>
        )}

        {/* Secondary Legacy Error State */}
        {errorMessage && aiStatus !== 'error' && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 p-3 rounded-xl flex items-start gap-2 text-[10px]">
            <ShieldAlert className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">AI Interface Error</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} style={{height:'1px'}} />
      </div>

      {/* Quick Action Chips Panel */}
      <div id="ai-quick-chips" className="px-3 pt-2.5 pb-1 flex flex-wrap gap-2 border-t border-slate-100 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/50">
        {agentMode ? (
          <>
            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("take_control")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Zap className="w-2.5 h-2.5 text-blue-500" />
              <span>Take control of my day ↗</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("now")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
              <span>What do I do RIGHT NOW? ↗</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("schedule")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-emerald-400 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
              <span>Fix my schedule ↗</span>
            </button>

            {agentUsageToday < 3 && runAgentCycle && (
              <button
                type="button"
                disabled={generating}
                onClick={() => handleQuickAction("run_agent_now")}
                className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5 text-indigo-500 animate-spin" />
                <span>Run agent now ↗</span>
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("now")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-blue-500" />
              <span>What should I do now?</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("prioritize")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
              <span>Prioritize my tasks</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("schedule")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-emerald-400 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
              <span>Make me a schedule</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => handleQuickAction("urgent")}
              className="text-[10px] font-semibold bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-red-400 dark:hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-full shadow-2xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-red-500" />
              <span>Help with most urgent task</span>
            </button>
          </>
        )}
      </div>

      {/* Message input panel */}
      <form id="ai-input-form" onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/80">
        <div className="relative flex items-center">
          <input
            type="text"
            required
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={generating}
            placeholder="Feeling stuck? Ask for advice..."
            className="w-full text-xs bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-900 dark:text-gray-100 rounded-xl pl-3 pr-10 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            id="btn-send-message"
            type="submit"
            disabled={!inputText.trim() || generating}
            className="absolute right-2 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-2 border-t border-gray-100 dark:border-gray-800">
        Primary: Gemini • Backup: Groq
      </p>
    </div>
  );
}
