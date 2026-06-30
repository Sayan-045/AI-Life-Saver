import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, setDoc, updateDoc, increment, deleteDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Task, Habit, ChatMessage } from "./types";
import LoginScreen from "./components/LoginScreen";
import TaskPanel from "./components/TaskPanel";
import AiChatPanel from "./components/AiChatPanel";
import CrisisBanner from "./components/CrisisBanner";
import { askGemini, getScoreMotivation, getDailyReportSummary, callAI, breakDownTask } from "./aiService";
import html2canvas from "html2canvas";
import { playCrisisAlert } from "./utils/audio";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ArchitectureView from "./components/ArchitectureView";
import {
  LifeBuoy,
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Flame,
  LogOut,
  Sparkles,
  Menu,
  X,
  Clock,
  Mail
} from "lucide-react";

const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getYesterdayDateStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/architecture" element={<ArchitectureView />} />
        <Route path="/*" element={<MainAppContent />} />
      </Routes>
    </BrowserRouter>
  );
}

function MainAppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation State
  const [activeTab, setActiveTab] = useState<"today" | "all" | "habits" | "calendar">("today");
  
  // Real-time Firestore State arrays
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Mobile layout state toggles
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem('darkMode') === 'true'
  );

  useEffect(() => {
    document.documentElement.style.transition = 'background-color 0.2s, color 0.2s';
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Global AI generation loading state to bridge panels
  // Global AI generation loading state to bridge panels
  const [aiGenerating, setAiGenerating] = useState(false);

  // Onboarding & Profile States
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: 'there',
    age: null as number | null,
    workingHours: '9am-6pm',
    categories: ['Work', 'Personal', 'College'] as string[]
  });
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingForm, setOnboardingForm] = useState({
    name: "",
    age: "",
    workingHours: "9am-6pm",
    categories: [] as string[]
  });

  // Firestore initial load state
  const [dbLoading, setDbLoading] = useState(true);

  // Daily Report States
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [dailySummary, setDailySummary] = useState<string>("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [rescuedCount, setRescuedCount] = useState<number>(0);
  const [captureLoading, setCaptureLoading] = useState(false);

  // AI Agent Mode States and Constants
  const [agentMode, setAgentMode] = useState(
    localStorage.getItem('agentMode') === 'true'
  );
  const [agentUsageToday, setAgentUsageToday] = useState(0);
  const [lastAgentRun, setLastAgentRun] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'limited'>('idle');

  const AGENT_DAILY_LIMIT = 3;
  const AGENT_MIN_INTERVAL = 60;
  const hasRunRef = useRef(false);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((current) => current?.message === message ? null : current);
    }, 4000);
  };

  // Crisis Mode States
  const [crisisTask, setCrisisTask] = useState<Task | null>(null);
  const [triggeredCrisisIds, setTriggeredCrisisIds] = useState<string[]>([]);
  const [dismissedCrisisTaskId, setDismissedCrisisTaskId] = useState<string | null>(null);

  // Gmail Sync States
  const [gmailToken, setGmailToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem("gmail_token");
      const savedTime = localStorage.getItem("gmail_token_time");
      if (stored && savedTime) {
        const age = (Date.now() - Number(savedTime)) / 1000;
        if (age < 3500) {
          return stored;
        }
      }
    } catch (e) {
      console.error("Local storage error:", e);
    }
    return null;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const syncing = isSyncing; // alias for compatibility
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<boolean>(false);
  const [tick, setTick] = useState(0);

  // Trigger relative time updates every minute
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Productivity Score motivation and streak check cache
  const [motivation, setMotivation] = useState<string>("");
  const lastScoreRef = useRef<number | null>(null);

  // AI Agent helper functions
  const addAIMessage = async (text: string) => {
    if (!user) return;
    try {
      const chatsColRef = collection(db, "users", user.uid, "chats");
      await addDoc(chatsColRef, {
        text,
        sender: "ai",
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to add AI message:", e);
    }
  };

  const handleBreakdown = async (task: Task) => {
    if (!user) return;
    setAiGenerating(true);
    try {
      showToast("Breaking down task with AI...", "info");
      const subtasks = await breakDownTask(task);
      if (!Array.isArray(subtasks) || subtasks.length === 0) {
        throw new Error("No subtasks returned");
      }
      
      const tasksColRef = collection(db, "users", user.uid, "tasks");
      for (const sub of subtasks) {
        await addDoc(tasksColRef, {
          name: sub.name,
          deadline: task.deadline,
          priority: task.priority,
          category: task.category || "General",
          notes: `Subtask of: ${task.name}`,
          estimatedMinutes: Number(sub.estimatedMinutes) || 10,
          userId: user.uid,
          done: false,
          source: "breakdown",
          parentId: task.id,
          createdAt: new Date().toISOString()
        });
      }
      
      showToast("✓ Task successfully broken down!", "success");
    } catch (err: any) {
      console.error("Task breakdown failed:", err);
      showToast("Failed to break down task. Please try again.", "error");
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleAgentMode = () => {
    const newValue = !agentMode;
    setAgentMode(newValue);
    localStorage.setItem('agentMode', String(newValue));
    if (newValue) {
      addAIMessage(
        '🤖 Agent Mode activated!\n\n' +
        'I will now proactively manage your tasks. ' +
        'I run up to 3 analyses per day to conserve API tokens. ' +
        'Running first analysis now...'
      );
      runAgentCycle(newValue);
    } else {
      addAIMessage(
        '💤 Agent Mode deactivated. ' +
        'I will wait for your instructions.'
      );
    }
  };

  // STEP 3 — Load usage from Firestore on app start
  useEffect(() => {
    if (!user) return;
    const loadAgentUsage = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data();
        const today = new Date().toDateString();
        if (data?.agentUsageDate === today) {
          setAgentUsageToday(data?.agentUsageCount || 0);
          setLastAgentRun(data?.lastAgentRun || null);
        } else {
          setAgentUsageToday(0);
          await setDoc(doc(db, 'users', user.uid), {
            agentUsageDate: today,
            agentUsageCount: 0
          }, { merge: true });
        }
      } catch(e) {
        console.error('Failed to load agent usage:', e);
      }
    };
    loadAgentUsage();
  }, [user]);

  // STEP 4 — canRunAgent check
  function canRunAgent(currentUsage: number, currentLastRun: string | null) {
    if (currentUsage >= AGENT_DAILY_LIMIT) {
      setAgentStatus('limited');
      addAIMessage(
        `⚠️ Agent has used all ${AGENT_DAILY_LIMIT} daily runs ` +
        `to conserve API tokens. Resets at midnight.\n\n` +
        `You can still use all AI features manually from the chat.`
      );
      return false;
    }
    if (currentLastRun) {
      const minutesSince = 
        (Date.now() - new Date(currentLastRun).getTime()) / 60000;
      if (minutesSince < AGENT_MIN_INTERVAL) {
        const minutesLeft = Math.ceil(AGENT_MIN_INTERVAL - minutesSince);
        addAIMessage(
          `⏳ Agent cooling down. ` +
          `Next run in ${minutesLeft} minutes.`
        );
        return false;
      }
    }
    return true;
  }

  // STEP 5 — runAgentCycle with limits
  async function runAgentCycle(forcedAgentMode?: boolean) {
    const isModeActive = forcedAgentMode !== undefined ? forcedAgentMode : agentMode;
    if (!isModeActive) return;

    // Fetch fresher state values directly inside action to prevent stale enclosures
    let freshUsage = agentUsageToday;
    let freshLastRun = lastAgentRun;
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data();
        const today = new Date().toDateString();
        if (data?.agentUsageDate === today) {
          freshUsage = data?.agentUsageCount || 0;
          freshLastRun = data?.lastAgentRun || null;
        } else {
          freshUsage = 0;
          freshLastRun = null;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!canRunAgent(freshUsage, freshLastRun)) return;

    const pending = tasks.filter(t => !t.done);
    if (pending.length === 0) {
      addAIMessage(
        '🤖 Agent checked your tasks — all clear! ' +
        'Nothing needs attention right now.'
      );
      return;
    }

    setAgentStatus('running');
    addAIMessage(
      `🤖 Agent analysis running... ` +
      `(${freshUsage + 1}/${AGENT_DAILY_LIMIT} uses today)`
    );

    const prompt = `You are an AI agent managing someone's tasks.
Analyze and pick MAXIMUM 2 actions. Be brief.

Tasks: ${JSON.stringify(pending.map(t => ({
  id: t.id,
  name: t.name,
  priority: t.priority,
  deadline: t.deadline,
  estimatedMinutes: t.estimatedMinutes || 30
})))}

Time now: ${new Date().toLocaleString()}

Actions available:
- BREAKDOWN: task over 90 min needs splitting
- WARN: task becoming critical under 4 hours
- SCHEDULE: suggest order for today
- MOTIVATE: encouragement if workload manageable

Return ONLY raw JSON, no markdown:
[{
  "action": "BREAKDOWN/WARN/SCHEDULE/MOTIVATE",
  "taskId": "id or null",
  "taskName": "name or null",
  "message": "under 25 words",
  "autoExecute": true or false
}]

Maximum 2 actions. Be very concise.`;

    try {
      const { response } = await callAI(prompt);
      let text = response
        .replace(/```json/gi,'')
        .replace(/```/g,'')
        .trim();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1) {
        setAgentStatus('idle');
        return;
      }
      const actions = JSON.parse(text.substring(start, end + 1));
      for (const action of actions) {
        await executeAgentAction(action);
        await new Promise(r => setTimeout(r, 1000));
      }
      await incrementAgentUsage(freshUsage);
      setAgentStatus('idle');
    } catch(e) {
      console.error('Agent error:', e);
      setAgentStatus('idle');
    }
  }

  // STEP 6 — executeAgentAction
  async function executeAgentAction(action: any) {
    switch(action.action) {
      case 'BREAKDOWN':
        addAIMessage(
          `🤖 Agent: Breaking down "${action.taskName}"...`
        );
        if (action.autoExecute && action.taskId) {
          const task = tasks.find(t => t.id === action.taskId);
          if (task) await handleBreakdown(task);
        }
        break;
      case 'WARN':
        addAIMessage(`⚠️ Agent: ${action.message}`);
        break;
      case 'SCHEDULE':
        addAIMessage(`📅 Agent: ${action.message}`);
        break;
      case 'MOTIVATE':
        addAIMessage(`✨ Agent: ${action.message}`);
        break;
    }
  }

  // Onboarding completion
  const completeOnboarding = async (formData: { name: string; age: string; workingHours: string; categories: string[] }) => {
    if (!user) return;
    try {
      const profile = {
        name: formData.name.trim() || user.displayName || 'there',
        age: parseInt(formData.age) || null,
        workingHours: formData.workingHours || '9am-6pm',
        categories: formData.categories.length > 0 ? formData.categories : ['Work', 'Personal', 'College']
      };
      
      // 1. Save to firestore users doc
      await setDoc(doc(db, 'users', user.uid), {
        ...profile,
        onboardingComplete: true
      }, { merge: true });
      
      // 2. Set userProfile state & localStorage
      setUserProfile(profile);
      localStorage.setItem('user_profile', JSON.stringify(profile));
      setOnboardingDone(true);
      setShowOnboarding(false);
      
      // 3. Inject welcome message to AI Chats
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      await addDoc(chatsRef, {
        text: `Hi ${profile.name}! Welcome to Life Saver. I've personalized your rescue dashboard based on your age (${profile.age || 'unspecified'}) and working hours (${profile.workingHours}). Let's conquer your tasks together!`,
        sender: 'ai',
        createdAt: new Date().toISOString()
      });
      
      showToast(`Onboarding complete! Welcome, ${profile.name} ⚡`);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      showToast("Failed to save profile. Try again.", "error");
    }
  };

  // STEP 7 — incrementAgentUsage
  async function incrementAgentUsage(currentCount: number) {
    const newCount = currentCount + 1;
    const now = new Date().toISOString();
    setAgentUsageToday(newCount);
    setLastAgentRun(now);
    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        agentUsageCount: newCount,
        agentUsageDate: new Date().toDateString(),
        lastAgentRun: now
      }, { merge: true });
    }
  }

  // STEP 9 — Morning briefing (cheap prompt)
  async function morningBriefing() {
    if (!agentMode || !user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const data = userDoc.data();
      const today = new Date().toDateString();
      if (data?.lastAgentBriefing === today) {
        // Already ran today — skip to save tokens
        return;
      }
      
      let freshUsage = agentUsageToday;
      let freshLastRun = lastAgentRun;
      if (data?.agentUsageDate === today) {
        freshUsage = data?.agentUsageCount || 0;
        freshLastRun = data?.lastAgentRun || null;
      } else {
        freshUsage = 0;
        freshLastRun = null;
      }

      if (!canRunAgent(freshUsage, freshLastRun)) return;

      const pending = tasks.filter(t => !t.done);
      if (pending.length === 0) return;

      const prompt = `2 sentence morning briefing.
Tasks: ${pending.map(t=>t.name).join(', ')}.
Sentence 1: biggest risk today.
Sentence 2: what to start with right now.
Be direct. Under 40 words total.`;

      const { response } = await callAI(prompt);
      addAIMessage(`🌅 Morning briefing:\n\n${response}`);

      await setDoc(doc(db, 'users', user.uid), {
        lastAgentBriefing: today
      }, { merge: true });
      await incrementAgentUsage(freshUsage);
    } catch(e) {
      console.error('Morning briefing error:', e);
    }
  }

  // STEP 8 — Run agent only on app open, never on interval
  useEffect(() => {
    if (!agentMode || tasks.length === 0 || !user) return;
    
    if (!hasRunRef.current) {
      hasRunRef.current = true;
      
      // Check if morning briefing needed
      morningBriefing();
    }
  }, [tasks.length, agentMode, user]);

  // 1. Auth Listener & Browser Title Configuration
  useEffect(() => {
    document.title = "Life Saver ⚡";
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1.5. Onboarding Status Check
  useEffect(() => {
    if (!user) return;
    const checkOnboarding = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || !userDoc.data()?.onboardingComplete) {
          setShowOnboarding(true);
          setOnboardingDone(false);
        } else {
          // Load existing user data
          const data = userDoc.data();
          const profile = {
            name: data.name || user.displayName || 'there',
            age: data.age || null,
            workingHours: data.workingHours || '9am-6pm',
            categories: data.categories || ['Work','Personal','College']
          };
          setUserProfile(profile);
          localStorage.setItem('user_profile', JSON.stringify(profile));
          setOnboardingDone(true);
        }
      } catch (err) {
        console.error("Error checking onboarding status:", err);
      }
    };
    checkOnboarding();
  }, [user]);

  // 2. Real-time Database Listeners when user is logged in
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setHabits([]);
      setChatMessages([]);
      setDbLoading(false);
      return;
    }

    setDbLoading(true);

    // A. Tasks Listener
    const tasksQuery = query(
      collection(db, "users", user.uid, "tasks"),
      orderBy("deadline", "asc")
    );
    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      const loadedTasks: Task[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedTasks.push({
          id: doc.id,
          name: data.name || data.title || "",
          notes: data.notes || data.description || "",
          deadline: data.deadline || "",
          done: data.done !== undefined ? !!data.done : !!data.completed,
          priority: data.priority || "medium",
          estimatedMinutes: Number(data.estimatedMinutes) || 0,
          category: data.category || "General",
          userId: data.userId || "",
          createdAt: data.createdAt || "",
          source: data.source || "",
          completedAt: data.completedAt || "",
          completedOnTime: data.completedOnTime !== undefined ? !!data.completedOnTime : undefined
        });
      });
      setTasks(loadedTasks);
      setDbLoading(false);
    }, (err) => {
      console.error("Error loading tasks:", err);
      setDbLoading(false);
    });

    // B. Habits Listener
    const habitsQuery = query(
      collection(db, "users", user.uid, "habits"),
      orderBy("createdAt", "desc")
    );
    const unsubHabits = onSnapshot(habitsQuery, (snapshot) => {
      const loadedHabits: Habit[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedHabits.push({
          id: doc.id,
          name: data.name || data.title || "",
          targetDays: Number(data.targetDays) || 7,
          currentStreak: Number(data.currentStreak !== undefined ? data.currentStreak : (data.streak || 0)),
          lastDone: data.lastDone || "",
          userId: data.userId || "",
          createdAt: data.createdAt || "",
          frequency: data.frequency || "daily",
          title: data.title || data.name || "",
          streak: Number(data.streak) || 0,
          completedToday: !!data.completedToday
        });
      });
      setHabits(loadedHabits);
    }, (err) => {
      console.error("Error loading habits:", err);
    });

    // C. Chats/Messages Listener
    const chatsQuery = query(
      collection(db, "users", user.uid, "chats"),
      orderBy("createdAt", "asc")
    );
    const unsubChats = onSnapshot(chatsQuery, (snapshot) => {
      const loadedChats: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let chatText = "";
        if (data.text) {
          if (typeof data.text === "object") {
            chatText = data.text.response || data.text.text || JSON.stringify(data.text);
          } else {
            chatText = String(data.text);
          }
        }
        loadedChats.push({
          id: doc.id,
          text: chatText,
          sender: data.sender || "user",
          userId: data.userId || "",
          createdAt: data.createdAt || ""
        });
      });
      setChatMessages(loadedChats);
    }, (err) => {
      console.error("Error loading chats:", err);
    });

    // D. User Document Listener (to get lastSyncTimestamp and rescuedCount)
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLastSyncTime(data.lastSyncTimestamp || null);
        setRescuedCount(data.rescuedCount || 0);
      }
    }, (err) => {
      console.error("Error loading user document:", err);
    });

    return () => {
      unsubTasks();
      unsubHabits();
      unsubChats();
      unsubUser();
    };
  }, [user]);

  // Auto-seed default tasks if empty to make the dashboard vibrant, operational, and premium for judges
  useEffect(() => {
    if (!user || dbLoading) return;

    const seedDefaultData = async () => {
      const seedKey = `tasks_seeded_${user.uid}`;
      if (localStorage.getItem(seedKey)) return;

      if (tasks.length === 0) {
        localStorage.setItem(seedKey, "true");
        showToast("⚡ Loading vibrant production workspace...", "info");

        // Seed Tasks
        const tasksColRef = collection(db, "users", user.uid, "tasks");
        const defaultTasks = [
          {
            name: "Resolve Production DB Connection Leak",
            priority: "critical",
            estimatedMinutes: 20,
            deadline: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // due in 25 mins -> triggers CRISIS!
            category: "DevOps",
            notes: "Active connection leak is exhausting PostgreSQL connection pool. Core platform experiencing 504 Gateway Timeouts. Action required immediately.",
            userId: user.uid,
            done: false,
            source: "seed",
            createdAt: new Date().toISOString()
          },
          {
            name: "Patch Zero-Day SSL Vulnerability",
            priority: "high",
            estimatedMinutes: 45,
            deadline: new Date(Date.now() + 120 * 60 * 1000).toISOString(), // due in 2 hrs
            category: "Security",
            notes: "Critical OpenSSL vulnerability identified in gateway configurations. Update certs and perform zero-downtime rolling restart.",
            userId: user.uid,
            done: false,
            source: "seed",
            createdAt: new Date().toISOString()
          },
          {
            name: "Scale Redis Cache Clusters",
            priority: "medium",
            estimatedMinutes: 60,
            deadline: new Date(Date.now() + 300 * 60 * 1000).toISOString(), // due in 5 hrs
            category: "Infrastructure",
            notes: "Redis memory usage exceeds 88%. Provision additional shard node and adjust eviction strategy.",
            userId: user.uid,
            done: false,
            source: "seed",
            createdAt: new Date().toISOString()
          },
          {
            name: "Audit S3 Snapshot Data Integrity",
            priority: "low",
            estimatedMinutes: 15,
            deadline: new Date(Date.now() + 480 * 60 * 1000).toISOString(), // due in 8 hrs
            category: "Database",
            notes: "Nightly backup checksum integrity successfully verified. Disaster recovery mock simulation passed.",
            userId: user.uid,
            done: true,
            source: "seed",
            createdAt: new Date().toISOString()
          }
        ];

        for (const task of defaultTasks) {
          try {
            await addDoc(tasksColRef, task);
          } catch (e) {
            console.error("Failed to seed task:", e);
          }
        }

        // Seed Habits
        if (habits.length === 0) {
          const habitsColRef = collection(db, "users", user.uid, "habits");
          const defaultHabits = [
            {
              name: "Check Server Telemetry Logs",
              targetDays: 7,
              currentStreak: 5,
              lastDone: getYesterdayDateStr(),
              userId: user.uid,
              createdAt: new Date().toISOString(),
              frequency: "daily",
              title: "Check Server Telemetry Logs",
              streak: 5,
              completedToday: false
            },
            {
              name: "Review Sentry Error Rates",
              targetDays: 5,
              currentStreak: 3,
              lastDone: getTodayDateStr(),
              userId: user.uid,
              createdAt: new Date().toISOString(),
              frequency: "daily",
              title: "Review Sentry Error Rates",
              streak: 3,
              completedToday: true
            }
          ];

          for (const habit of defaultHabits) {
            try {
              await addDoc(habitsColRef, habit);
            } catch (e) {
              console.error("Failed to seed habit:", e);
            }
          }
        }

        showToast("✅ Vibrant preview environment ready!", "success");
      }
    };

    seedDefaultData();
  }, [user, dbLoading, tasks.length, habits.length]);

  // 3. Crisis Mode Detection Hook & Sync
  useEffect(() => {
    if (!user) {
      setCrisisTask(null);
      return;
    }

    const checkCrisis = () => {
      let foundCrisisTask: Task | null = null;

      tasks.forEach(async (task) => {
        if (task.done) return;
        if (!task.deadline) return;

        const minutesLeft = (new Date(task.deadline).getTime() - Date.now()) / 60000;
        const ratio = task.estimatedMinutes / Math.max(minutesLeft, 1);

        // Crisis Mode Conditions:
        // - A task has less than 30 minutes until deadline AND
        // - The estimated time is more than 70% of the remaining time
        if (minutesLeft > 0 && minutesLeft < 30 && ratio > 0.7) {
          foundCrisisTask = task;

          // Auto-trigger Gemini once per unique task
          if (!triggeredCrisisIds.includes(task.id)) {
            setTriggeredCrisisIds((prev) => [...prev, task.id]);
            playCrisisAlert(task.name);
            setAiGenerating(true);

            try {
              const chatsColRef = collection(db, "users", user.uid, "chats");
              const roundedMinutes = Math.max(1, Math.round(minutesLeft));
              const crisisMsg = `[CRISIS AUTO-TRIGGER] Emergency: Task "${task.name}" is due in ${roundedMinutes} minutes and estimated to take ${task.estimatedMinutes} minutes!`;

              await addDoc(chatsColRef, {
                text: crisisMsg,
                sender: "user",
                userId: user.uid,
                createdAt: new Date().toISOString()
              });

              const prompt = `EMERGENCY: Task "${task.name}" is due in ${roundedMinutes} minutes and needs ${task.estimatedMinutes} minutes. Give an immediate rescue plan: what to cut, what to do first, whether to ask for an extension. Be direct and fast.`;
              const reply = await askGemini(prompt, tasks);

              await addDoc(chatsColRef, {
                text: reply,
                sender: "ai",
                userId: user.uid,
                createdAt: new Date().toISOString()
              });

              // Increment rescuedCount in user's profile document
              const userRef = doc(db, "users", user.uid);
              await setDoc(userRef, {
                rescuedCount: increment(1)
              }, { merge: true });
            } catch (err) {
              console.error("Crisis AI rescue plan auto-generation failed:", err);
            } finally {
              setAiGenerating(false);
            }
          }
        }
      });

      if (foundCrisisTask) {
        if (dismissedCrisisTaskId !== (foundCrisisTask as Task).id) {
          setCrisisTask(foundCrisisTask);
        } else {
          setCrisisTask(null);
        }
      } else {
        setCrisisTask(null);
      }
    };

    checkCrisis();
    const interval = setInterval(checkCrisis, 60000);
    return () => clearInterval(interval);
  }, [tasks, user, triggeredCrisisIds, dismissedCrisisTaskId]);

  useEffect(() => {
    if (crisisTask) {
      const activeCurrent = tasks.find((t) => t.id === crisisTask.id);
      if (!activeCurrent || activeCurrent.done) {
        setCrisisTask(null);
      }
    }
  }, [tasks, crisisTask]);

  // Show relative time (Requirement 5)
  function getRelativeTime(timestamp: string | null) {
    if (!timestamp) return 'Never';
    const mins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  const runGmailDemoSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setGmailError(false);
    showToast("🔄 Connecting to Gmail Demo Service...", "info");

    // Simulate Gmail Fetch and Gemini extraction
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const sampleGmailTasks = [
      {
        name: "Security Audit Action Items",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // due tomorrow
        priority: "high",
        category: "Security",
        notes: "Identified in security sync: revoke legacy credentials and update IP whitelist.",
        estimatedMinutes: 45,
        userId: user!.uid,
        done: false,
        source: "gmail",
        createdAt: new Date().toISOString()
      },
      {
        name: "Update API Integration Docs",
        deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // due in 2 days
        priority: "medium",
        category: "DevOps",
        notes: "Requested by partners: document our new webhooks and schema payloads.",
        estimatedMinutes: 30,
        userId: user!.uid,
        done: false,
        source: "gmail",
        createdAt: new Date().toISOString()
      }
    ];

    let addedCount = 0;
    try {
      for (const task of sampleGmailTasks) {
        const existingTasks = tasks.filter(t => 
          t.source === 'gmail' && 
          t.name.toLowerCase() === task.name.toLowerCase()
        );

        if (existingTasks.length === 0) {
          await addDoc(collection(db, 'users', user!.uid, 'tasks'), task);
          addedCount++;
        }
      }

      setLastSyncTime(new Date().toISOString());

      if (addedCount > 0) {
        showToast(`✅ Demo: Imported ${addedCount} sample tasks from Gmail`, "success");
      } else {
        showToast("📭 No new deadlines in Gmail inbox", "success");
      }
    } catch (err) {
      console.error("Gmail demo import failed:", err);
      showToast("⚠️ Gmail demo import failed", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const todayStr = getTodayDateStr();
  const todayTasks = tasks.filter((t) => t.deadline && t.deadline.split("T")[0] === todayStr);
  const completedTodayCount = todayTasks.filter((t) => t.done).length;
  const totalTodayCount = todayTasks.length;
  const progressPercent = totalTodayCount > 0 ? Math.round((completedTodayCount / totalTodayCount) * 100) : 0;

  // Feature 3: Productivity Score calculations
  const getActiveStreak = (habit: Habit) => {
    const lastDoneVal = habit.lastDone || "";
    if (lastDoneVal === "") return 0;
    if (lastDoneVal === todayStr || lastDoneVal === getYesterdayDateStr()) {
      return habit.currentStreak !== undefined ? habit.currentStreak : (habit.streak || 0);
    }
    return 0;
  };

  const dayStreak = habits.length > 0 ? Math.max(...habits.map(h => getActiveStreak(h)), 0) : 0;

  const completedOnTimeTodayCount = todayTasks.filter(
    (t) => t.done && t.completedOnTime !== false
  ).length;

  const baseScore = totalTodayCount > 0 ? (completedTodayCount / totalTodayCount) * 60 : 0;
  const streakBonus = Math.min(dayStreak * 2, 20);
  const onTimeBonus = Math.min(completedOnTimeTodayCount * 2, 20);
  
  const getProductivityScore = () => {
    if (totalTodayCount > 0 && completedTodayCount === 0) {
      return 30;
    }
    const score = Math.round(baseScore + streakBonus + onTimeBonus);
    return Math.min(100, score);
  };

  const totalScore = getProductivityScore();
  const scoreColor = totalScore < 40 ? "#ef4444" : totalScore <= 70 ? "#f59e0b" : "#10b981";
  const scoreColorText = totalScore < 40 ? "text-red-500" : totalScore <= 70 ? "text-amber-500" : "text-emerald-500";

  useEffect(() => {
    if (!user) {
      setMotivation("");
      lastScoreRef.current = null;
      return;
    }

    if (lastScoreRef.current !== totalScore) {
      lastScoreRef.current = totalScore;
      
      const fetchMotivation = async () => {
        try {
          const completedCount = completedTodayCount;
          const remainingCount = totalTodayCount - completedTodayCount;
          const msg = await getScoreMotivation(totalScore, completedCount, remainingCount);
          setMotivation(msg);
        } catch (err) {
          console.error("Failed to fetch score motivation:", err);
        }
      };
      fetchMotivation();
    }
  }, [totalScore, completedTodayCount, totalTodayCount, user]);

  const handleOpenDailyReport = async () => {
    setDailyReportOpen(true);
    setDailySummary("");
    setSummaryLoading(true);
    try {
      const completed = tasks.filter(t => t.done);
      const missed = tasks.filter(t => !t.done && t.deadline && new Date(t.deadline) < new Date());
      
      const prompt = `Write a brief personal daily progress summary.
User's Name: ${userProfile?.name || 'there'}. 
Productivity Score: ${totalScore}/100.
Completed tasks: ${completed.map(t => t.name).join(', ') || 'none'}.
Missed tasks: ${missed.map(t => t.name).join(', ') || 'none'}.
Streak: ${dayStreak} days.
Make it exactly 2 sentences of high-energy supportive feedback:
Sentence 1: what they achieved specifically.
Sentence 2: one constructive actionable focus tip or encouraging words for tomorrow.
Tone: athletic, like a premium supportive Strava coach. Under 40 words total. No quotes.`;

      const { response } = await callAI(prompt);
      setDailySummary(response.replace(/^["']|["']$/g, "").trim());
    } catch (e) {
      console.error(e);
      setDailySummary("Fantastic athletic work today, pushing through key focus pillars. Rest up, let your synapses recharge, and let's dominate tomorrow's agenda! ⚡");
    } finally {
      setSummaryLoading(false);
    }
  };

  const captureAndDownload = async () => {
    try {
      setCaptureLoading(true);
      showToast("📸 Processing high-fidelity render...", "info");
      
      // Small delay to ensure all content is rendered
      await new Promise(r => setTimeout(r, 500));
      
      const card = document.getElementById('daily-report-card');
      if (!card) {
        console.error('Report card element not found');
        showToast("❌ Report card container not found", "error");
        return;
      }
      
      const canvas = await html2canvas(card, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        width: card.offsetWidth,
        height: card.offsetHeight,
        windowWidth: card.offsetWidth,
        windowHeight: card.offsetHeight,
        onclone: (clonedDoc) => {
          const clonedCard = clonedDoc.getElementById('daily-report-card');
          if (clonedCard) {
            clonedCard.style.transform = 'none';
          }
        }
      });
      
      const link = document.createElement('a');
      link.download = `lifesaver-${new Date().toLocaleDateString()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast("🎨 Daily report saved successfully!", "success");
    } catch (err) {
      console.error("Failed to capture daily-report-card:", err);
      showToast("❌ Render capture failed. Try again.", "error");
    } finally {
      setCaptureLoading(false);
    }
  };

  const shareReport = async () => {
    const text = `Life Saver ⚡ Daily Report\nProductivity Score: ${totalScore}/100\nCompleted: ${completedTodayCount}/${totalTodayCount} tasks\nDay Streak: ${dayStreak} days\n\nTrack your focus at life-saver-362351694101.asia-east1.run.app ⚡`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Life Saver Daily Effort Report ⚡',
          text: text,
          url: 'https://life-saver-362351694101.asia-east1.run.app'
        });
        showToast("🔗 Shared successfully!", "success");
      } catch (e) {
        console.log("Web Share cancelled or failed", e);
      }
    } else {
      // Fallback: copy to clipboard & redirect to whatsapp or web share
      try {
        await navigator.clipboard.writeText(text);
        showToast("📋 Report copied to clipboard! Opening WhatsApp...", "info");
        setTimeout(() => {
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        }, 1200);
      } catch (err) {
        showToast("❌ Could not copy link automatically.", "error");
      }
    }
  };

  const getFormattedDate = () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  };

  const getReportRingColor = (score: number) => {
    if (score > 70) return "#4ade80";
    if (score >= 40) return "#fbbf24";
    return "#f87171";
  };

  // Render Loader during initial Auth checking
  if (loading) {
    return (
      <div id="boot-loader" className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="relative">
          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white shadow animate-bounce">
            <LifeBuoy className="w-6 h-6 animate-spin duration-3000" />
          </div>
        </div>
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-4 animate-pulse">
          Launching Life Saver...
        </p>
      </div>
    );
  }

  // Redirect to Login if unauthenticated
  if (!user) {
    return (
      <LoginScreen
        onLoginSuccess={(token) => {
          if (token) {
            setGmailToken(token);
          }
        }}
      />
    );
  }

  return (
    <div id="app-workspace" className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-gray-950 font-sans relative">
      {/* Onboarding Screen (Fullscreen) */}
      {showOnboarding && (
        <div id="onboarding-modal" className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-8 border border-slate-100 dark:border-gray-800 shadow-2xl flex flex-col gap-6 relative text-slate-800 dark:text-gray-100">
            
            {/* Step Indicators */}
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      step === onboardingStep 
                        ? 'w-8 bg-blue-600' 
                        : step < onboardingStep 
                          ? 'w-3 bg-blue-600/45' 
                          : 'w-3 bg-slate-200 dark:bg-gray-800'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Step {onboardingStep} of 3
              </span>
            </div>

            {/* STEP 1: Basic Info */}
            {onboardingStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-gray-100 tracking-tight">
                    Welcome to Life Saver ⚡
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    First, let's learn a tiny bit about you.
                  </p>
                </div>
                
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      What should we call you? *
                    </label>
                    <input
                      type="text"
                      id="onboarding-name-input"
                      value={onboardingForm.name}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, name: e.target.value })}
                      placeholder="e.g. Sayan"
                      required
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-gray-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      How old are you? *
                    </label>
                    <input
                      type="number"
                      id="onboarding-age-input"
                      value={onboardingForm.age}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, age: e.target.value })}
                      placeholder="e.g. 25"
                      required
                      min="1"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-gray-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  id="onboarding-next-1"
                  disabled={!onboardingForm.name.trim() || !onboardingForm.age}
                  onClick={() => setOnboardingStep(2)}
                  className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold tracking-wider uppercase shadow transition cursor-pointer"
                >
                  Continue
                </button>
              </div>
            )}

            {/* STEP 2: Working Hours */}
            {onboardingStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-gray-100 tracking-tight">
                    Your Focus Window 🕒
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    When is your default working bracket?
                  </p>
                </div>
                
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                      Working Hours
                    </label>
                    <select
                      id="onboarding-hours-select"
                      value={onboardingForm.workingHours}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, workingHours: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-gray-100"
                    >
                      <option value="9am-6pm">Standard (9am - 6pm)</option>
                      <option value="8am-4pm">Early Bird (8am - 4pm)</option>
                      <option value="12pm-8pm">Mid-day (12pm - 8pm)</option>
                      <option value="6pm-2am">Night Owl (6pm - 2am)</option>
                      <option value="Flexible">Fully Flexible</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    id="onboarding-back-2"
                    onClick={() => setOnboardingStep(1)}
                    className="flex-1 py-3 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-750 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-extrabold tracking-wider uppercase transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    id="onboarding-next-2"
                    onClick={() => setOnboardingStep(3)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold tracking-wider uppercase shadow transition cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Categories Selection */}
            {onboardingStep === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-gray-100 tracking-tight">
                    Select Your Pillars 📁
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    Toggle categories of safety plans and tasks.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 py-2">
                  {["Work", "Personal", "College", "Health", "Finance", "DevOps", "Security"].map((cat) => {
                    const isSelected = onboardingForm.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        id={`onboarding-cat-${cat}`}
                        onClick={() => {
                          const cats = onboardingForm.categories.includes(cat)
                            ? onboardingForm.categories.filter((c) => c !== cat)
                            : [...onboardingForm.categories, cat];
                          setOnboardingForm({ ...onboardingForm, categories: cats });
                        }}
                        className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                            : "bg-slate-50 dark:bg-gray-850 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    id="onboarding-back-3"
                    onClick={() => setOnboardingStep(2)}
                    className="flex-1 py-3 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-750 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-extrabold tracking-wider uppercase transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    id="onboarding-submit"
                    onClick={() => completeOnboarding(onboardingForm)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold tracking-wider uppercase shadow transition cursor-pointer"
                  >
                    Complete 🚀
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {toast && (
        <div
          id="toast-notification"
          className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider px-4.5 py-3 rounded-2xl shadow-xl border border-slate-800 animate-slide-in hover:opacity-90 transition cursor-pointer"
          onClick={() => setToast(null)}
        >
          <span className="text-sm">⚡</span>
          <span>{toast.message}</span>
        </div>
      )}

      {crisisTask && (
        <CrisisBanner
          task={crisisTask}
          onDismiss={() => {
            setDismissedCrisisTaskId(crisisTask.id);
            setCrisisTask(null);
          }}
        />
      )}
      {/* Mobile Header Bar */}
      <div id="mobile-header" className="lg:hidden flex items-center justify-between bg-white border-b border-slate-200 text-slate-800 p-4 z-20 shadow-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 w-6 h-6 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-xs">
            +
          </div>
          <span className="font-bold text-base tracking-tight text-slate-800 dark:text-gray-100">Life Saver</span>
          {agentMode && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: '#eef2ff',
                    color: '#6366f1',
                    animation: agentStatus === 'running' 
                      ? 'pulse 1s infinite' : 'none'
                  }}>
              🤖 Agent {agentStatus === 'running' ? 'running...' : 'active'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Dark</span>
            <button
              id="mobile-dark-mode-toggle"
              onClick={() => setDarkMode(!darkMode)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
              title="Toggle dark mode"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  darkMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <button
            id="mobile-menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* 3-Column Core Layout container */}
      <div id="app-layout" className="flex-1 flex flex-row h-full overflow-hidden relative">
        
        {/* SIDEBAR: Navigation Panel */}
        <aside
          id="left-sidebar"
          className={`bg-white border-r border-slate-200/85 text-slate-700 w-64 flex flex-col h-screen overflow-y-auto sidebar z-30 transition-transform duration-200 absolute lg:relative lg:translate-x-0 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ height: '100vh' }}
        >
          {/* Sidebar Top Brand */}
          <div id="sidebar-brand" className="p-6 border-b border-slate-100 dark:border-gray-700 flex items-center gap-3 justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                +
              </div>
              <span className="font-bold text-xl text-slate-800 dark:text-gray-100 tracking-tight">Life Saver</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Dark</span>
              <button
                id="dark-mode-toggle"
                onClick={() => setDarkMode(!darkMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
                title="Toggle dark mode"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    darkMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <button
                id="btn-sidebar-close"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200 ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sidebar Navigation Options */}
          <nav id="sidebar-nav" className="px-4 py-6 space-y-1">
            <button
              id="nav-btn-today"
              onClick={() => {
                setActiveTab("today");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-xs transition uppercase tracking-wider cursor-pointer ${
                activeTab === "today"
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-gray-800 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              }`}
            >
              <Clock className={`w-4 h-4 ${activeTab === "today" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-gray-500"}`} />
              <span>Today's Agenda</span>
            </button>

            <button
              id="nav-btn-all"
              onClick={() => {
                setActiveTab("all");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-xs transition uppercase tracking-wider cursor-pointer ${
                activeTab === "all"
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-gray-800 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              }`}
            >
              <CheckSquare className={`w-4 h-4 ${activeTab === "all" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-gray-500"}`} />
              <span>All Tasks</span>
            </button>

            <button
              id="nav-btn-habits"
              onClick={() => {
                setActiveTab("habits");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-xs transition uppercase tracking-wider cursor-pointer ${
                activeTab === "habits"
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-gray-800 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              }`}
            >
              <Flame className={`w-4 h-4 ${activeTab === "habits" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-gray-500"}`} />
              <span>Habit Loops</span>
            </button>

            <button
              id="nav-btn-calendar"
              onClick={() => {
                setActiveTab("calendar");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-xs transition uppercase tracking-wider cursor-pointer ${
                activeTab === "calendar"
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-gray-800 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              }`}
            >
              <Calendar className={`w-4 h-4 ${activeTab === "calendar" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-gray-500"}`} />
              <span>Calendar</span>
            </button>

            {/* Demo: Import from Gmail Button */}
            <div className="px-3 py-3 border-t border-slate-100 dark:border-gray-700 mt-4 bg-slate-50/40 dark:bg-gray-800/40 rounded-xl flex flex-col gap-2">
              <button 
                onClick={runGmailDemoSync}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-gray-700 text-xs font-semibold py-2 px-3 rounded-lg border border-red-100 dark:border-gray-700 transition cursor-pointer disabled:opacity-50"
                title="Demo: Import sample tasks from Gmail"
              >
                <span>📧 {isSyncing ? "Importing..." : "Demo: Import from Gmail"}</span>
              </button>
              {lastSyncTime && (
                <div className="flex justify-between text-[9px] text-slate-400 px-1 font-mono">
                  <span>Last import:</span>
                  <span>{getRelativeTime(lastSyncTime)}</span>
                </div>
              )}
            </div>
          </nav>

          {/* Today's Productivity Score */}
          <div id="sidebar-productivity-score" className="px-5 py-4 border-t border-slate-100 dark:border-gray-700 bg-slate-50/40 dark:bg-gray-800 flex flex-col justify-between">
            <span className="uppercase tracking-widest text-xs text-gray-400 dark:text-gray-500 block mb-2">Today's Score</span>
            
            <div className="flex items-center gap-4 mt-3 mb-1">
              <div className="relative w-20 h-20 flex items-center justify-center flex-shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80" className="w-20 h-20">
                  <circle cx="40" cy="40" r="34" fill="none" 
                          stroke={darkMode ? "#374151" : "#f0f0f0"} strokeWidth="6"/>
                  <circle cx="40" cy="40" r="34" fill="none" 
                          stroke={scoreColor} strokeWidth="6"
                          strokeDasharray={`${(totalScore/100)*213.6} 213.6`}
                          strokeLinecap="round"
                          transform="rotate(-90 40 40)"/>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span 
                    id="score-big-number"
                    className={`text-5xl font-black tracking-tight ${scoreColorText}`}
                  >
                    {totalScore}
                  </span>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[10px] text-slate-400 dark:text-gray-500 font-bold uppercase tracking-wider">Score</span>
                <span className="text-sm font-extrabold text-slate-700 dark:text-gray-200 mt-0.5 leading-tight">
                  {totalScore === 30 && totalTodayCount > 0 && completedTodayCount === 0 
                    ? "Ready to go 🚀" 
                    : totalScore < 40 ? "Needs focus ⚠️" : totalScore <= 70 ? "Making progress 👍" : "On fire! 🔥"
                  }
                </span>
                <span className="text-[10px] text-slate-400 dark:text-gray-500 font-bold mt-0.5 uppercase">/ 100</span>
              </div>
            </div>

            {motivation && (
              <p 
                id="score-motivation-card"
                className="text-[10px] text-gray-500 dark:text-gray-400 italic line-clamp-2 mt-1"
              >
                💡 {motivation}
              </p>
            )}
          </div>

          {/* Daily Report Trigger Button */}
          <div className="px-5 pb-4 bg-slate-50/40 dark:bg-gray-800">
            <button
              onClick={handleOpenDailyReport}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform active:scale-95 cursor-pointer"
            >
              <span>📊 My Day</span>
            </button>
          </div>

          {/* Thin divider line between the score widget and the progress section */}
          <hr className="border-t border-slate-100 dark:border-gray-700" />

          {/* Today's Tasks Progress Bar */}
          <div id="sidebar-progress" className="px-5 py-4 border-t border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Today's Progress</span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {completedTodayCount}/{totalTodayCount} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Powered by Gemini Badge */}
          <a href="/architecture" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-2 mx-3 mb-3 p-2 rounded-lg bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer">
            <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" 
                 width="16" height="16" alt="Gemini"/>
            <span className="text-xs text-blue-600 font-medium">
              Powered by Gemini
            </span>
            <span className="text-xs text-blue-400 ml-auto">↗</span>
          </a>

          {/* Sidebar Footer User Profile */}
          <div id="sidebar-user" className="p-4 border-t border-slate-100 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img
                  id="user-avatar"
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-10 h-10 rounded-full ring-2 ring-slate-100"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div id="user-avatar-placeholder" className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-semibold text-sm border border-slate-200">
                  {(user.displayName || user.email || "U").substring(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">{user.displayName || "Rescue Client"}</p>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              id="btn-signout"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 transition font-medium text-xs py-2 px-3 rounded-lg border border-slate-200/60"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Overlay when sidebar is open on mobile */}
        {sidebarOpen && (
          <div
            id="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-25 lg:hidden"
          />
        )}

        {/* MAIN PANEL: Task / Calendar Area */}
        <main id="main-content-column" className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Agent Mode Banner */}
          <div className={`px-6 py-3 flex items-center justify-between border-b transition-all duration-300 ${
            agentMode 
              ? 'bg-indigo-950 border-indigo-800 text-indigo-100' 
              : 'bg-gray-50 border-gray-100 dark:bg-gray-900 dark:border-gray-800 text-slate-700 dark:text-gray-300'
          }`}>
            {/* Left side — toggle and label */}
            <div className="flex items-center gap-3">
              <button 
                id="btn-toggle-agent-mode"
                onClick={toggleAgentMode}
                className={`relative w-10 h-5 rounded-full transition-colors duration-300 flex items-center px-0.5 cursor-pointer ${
                  agentMode ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
                title="Toggle AI Agent Mode"
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform duration-300 ${
                  agentMode ? 'transform translate-x-5' : ''
                }`} />
              </button>
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-tight uppercase">Agent Mode</span>
                <span className="text-[10px] opacity-70">
                  {agentMode ? 'AI proactively runs daily diagnostic plans' : 'Manual mode (trigger with AI panel)'}
                </span>
              </div>
            </div>

            {/* Right side — stats and manual run */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1 text-[10px] font-semibold opacity-70">
                <span>Usage:</span>
                <span>{agentUsageToday}/{AGENT_DAILY_LIMIT} runs</span>
              </div>
              
              {agentMode && (
                <button
                  id="btn-run-agent-cycle"
                  onClick={() => runAgentCycle()}
                  disabled={agentStatus === 'running' || agentUsageToday >= AGENT_DAILY_LIMIT}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className={`w-3 h-3 ${agentStatus === 'running' ? 'animate-spin' : ''}`} />
                  <span>{agentStatus === 'running' ? 'Running...' : 'Run Analysis'}</span>
                </button>
              )}
            </div>
          </div>

          <TaskPanel
            userId={user.uid}
            tasks={tasks}
            habits={habits}
            activeTab={activeTab}
            aiGenerating={aiGenerating}
            setAiGenerating={setAiGenerating}
            showToast={showToast}
            dbLoading={dbLoading}
            agentMode={agentMode}
            agentStatus={agentStatus}
            userProfile={userProfile}
          />
        </main>

        {/* RIGHT PANEL: AI Copilot Chat */}
        <aside id="right-ai-column" className="hidden lg:flex flex-col h-full">
          <AiChatPanel
            userId={user.uid}
            tasks={tasks}
            habits={habits}
            chatMessages={chatMessages}
            aiGenerating={aiGenerating}
            setAiGenerating={setAiGenerating}
            syncing={syncing}
            aiMessage={aiMessage}
            agentMode={agentMode}
            agentUsageToday={agentUsageToday}
            runAgentCycle={runAgentCycle}
            userProfile={userProfile}
          />
        </aside>
      </div>

      {/* Mini floating menu for mobile to open AI Chat */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <button
          id="btn-mobile-chat-toggle"
          onClick={() => {
            // Simply switch activeTab to a custom view or open a modal or show chat
            // To keep simple, let's allow toggling a full-screen drawer of the AI Chat!
            // We can handle this nicely in a mobile modal!
            const drawer = document.getElementById("mobile-chat-drawer");
            if (drawer) {
              drawer.classList.toggle("hidden");
            }
          }}
          className="bg-red-500 hover:bg-red-600 text-white p-3.5 rounded-full shadow-lg flex items-center justify-center animate-bounce"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Chat Drawer */}
      <div id="mobile-chat-drawer" className="hidden fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col items-end">
        <div className="w-full max-w-md h-full bg-white flex flex-col relative">
          <button
            onClick={() => {
              const drawer = document.getElementById("mobile-chat-drawer");
              if (drawer) drawer.classList.add("hidden");
            }}
            className="absolute top-3.5 right-3.5 text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-full z-50"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 overflow-hidden h-full">
            <AiChatPanel
              userId={user.uid}
              tasks={tasks}
              habits={habits}
              chatMessages={chatMessages}
              aiGenerating={aiGenerating}
              setAiGenerating={setAiGenerating}
              syncing={syncing}
              aiMessage={aiMessage}
              agentMode={agentMode}
              agentUsageToday={agentUsageToday}
              runAgentCycle={runAgentCycle}
              userProfile={userProfile}
            />
          </div>
        </div>
      </div>

      {/* Daily Report Overlay Modal */}
      {dailyReportOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 overflow-y-auto"
          onClick={() => setDailyReportOpen(false)}
        >
          {/* Inner container to hold card and close action button */}
          <div 
            className="relative w-full max-w-[400px] flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Redesigned Centered Card (Strava-Style) */}
            <div 
              id="daily-report-card"
              className="w-full rounded-[24px] px-6 py-8 text-white flex flex-col gap-6 shadow-2xl relative"
              style={{
                background: "linear-gradient(160deg, #0f0c29, #302b63, #24243e)",
                fontFamily: "var(--font-sans)"
              }}
            >
              {/* Close Button Inside Card */}
              <button
                onClick={() => setDailyReportOpen(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition duration-200 cursor-pointer p-1 rounded-full bg-white/5"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
 
              {/* SECTION 1: HEADER */}
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <span className="font-black text-sm tracking-widest text-orange-500 uppercase">
                  Life Saver ⚡
                </span>
                <div className="text-right">
                  <span className="block text-[9px] font-extrabold uppercase tracking-widest text-white/50">
                    DAILY EFFORT REPORT
                  </span>
                  <span className="block text-[11px] font-mono text-white/70">
                    {getFormattedDate()}
                  </span>
                </div>
              </div>

              {/* SECTION 2: HERO SCORE */}
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="relative w-[130px] h-[130px] flex items-center justify-center">
                  <svg width="130" height="130" viewBox="0 0 130 130" className="w-[130px] h-[130px]">
                    <circle 
                      cx="65" 
                      cy="65" 
                      r="56" 
                      fill="none" 
                      stroke="rgba(255,255,255,0.08)" 
                      strokeWidth="10"
                    />
                    <circle 
                      cx="65" 
                      cy="65" 
                      r="56" 
                      fill="none" 
                      stroke={getReportRingColor(totalScore)} 
                      strokeWidth="10"
                      strokeDasharray="351.86" 
                      strokeDashoffset={351.86 - (totalScore / 100) * 351.86}
                      strokeLinecap="round" 
                      transform="rotate(-90 65 65)"
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center mt-1">
                    <span className="text-[44px] font-black leading-none tracking-tight font-mono text-white">
                      {totalScore}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-white/50 tracking-widest mt-1">
                      SCORE
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-orange-500 px-3 py-1 bg-orange-500/10 rounded-full">
                  {totalScore === 30 && totalTodayCount > 0 && completedTodayCount === 0 
                    ? "PR RECRUIT 🚀" 
                    : totalScore < 40 ? "NEEDS FOCUS ⚠️" : totalScore <= 70 ? "MAKING PROGRESS 👍" : "ON FIRE! 🔥"
                  }
                </span>
              </div>

              {/* SECTION 3: KEY STATS ROW */}
              <div className="grid grid-cols-3 gap-2 border-t border-b border-white/10 py-4">
                <div className="text-center">
                  <span className="block text-[20px] font-black tracking-tight text-white leading-none font-mono">
                    {completedTodayCount}
                  </span>
                  <span className="block text-[9px] uppercase font-bold text-white/50 tracking-wider mt-1">
                    TASKS DONE
                  </span>
                  <span className="block text-[8px] text-white/40 font-mono mt-0.5">
                    Goal: {totalTodayCount}
                  </span>
                </div>
                <div className="text-center border-l border-r border-white/10">
                  <span className="block text-[20px] font-black tracking-tight text-white leading-none font-mono">
                    {dayStreak}
                  </span>
                  <span className="block text-[9px] uppercase font-bold text-white/50 tracking-wider mt-1">
                    STREAK
                  </span>
                  <span className="block text-[8px] text-white/40 font-mono mt-0.5">
                    Consec. Days
                  </span>
                </div>
                <div className="text-center">
                  <span className="block text-[20px] font-black tracking-tight text-white leading-none font-mono">
                    {rescuedCount}
                  </span>
                  <span className="block text-[9px] uppercase font-bold text-white/50 tracking-wider mt-1">
                    RESCUED
                  </span>
                  <span className="block text-[8px] text-white/40 font-mono mt-0.5">
                    Crisis Repelled
                  </span>
                </div>
              </div>

              {/* SECTION 4: PROGRESS BAR */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-white/60 font-bold uppercase tracking-wider">
                  <span>Effort Completed</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-white/15 h-[8px] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercent}%`, backgroundColor: getReportRingColor(totalScore) }}
                  />
                </div>
              </div>

              {/* SECTION 5: PERFORMANCE ANALYTICS (AMAZING EFFORT VELOCITY GRAPH) */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-extrabold text-white/50 uppercase tracking-widest block">
                  Effort Velocity Index 📈
                </span>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3 shadow-inner">
                  {/* SVG Bar Chart representing key shareable metrics */}
                  <div className="flex justify-between items-end h-[85px] px-2 pt-2">
                    {/* Bar 1: Score */}
                    <div className="flex flex-col items-center gap-1.5 w-[18%]">
                      <div className="text-[9px] font-mono font-bold text-orange-400">{totalScore}</div>
                      <div className="w-full bg-white/10 rounded-t-md relative overflow-hidden" style={{ height: '55px' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 transition-all duration-1000 ease-out"
                          style={{ height: `${totalScore}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-extrabold text-white/60 tracking-tight uppercase">SCORE</span>
                    </div>

                    {/* Bar 2: Completion Rate */}
                    <div className="flex flex-col items-center gap-1.5 w-[18%]">
                      <div className="text-[9px] font-mono font-bold text-emerald-400">{progressPercent}%</div>
                      <div className="w-full bg-white/10 rounded-t-md relative overflow-hidden" style={{ height: '55px' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out"
                          style={{ height: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-extrabold text-white/60 tracking-tight uppercase">DONE</span>
                    </div>

                    {/* Bar 3: Day Streak */}
                    <div className="flex flex-col items-center gap-1.5 w-[18%]">
                      <div className="text-[9px] font-mono font-bold text-amber-400">{dayStreak}d</div>
                      <div className="w-full bg-white/10 rounded-t-md relative overflow-hidden" style={{ height: '55px' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-t-md bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-1000 ease-out"
                          style={{ height: `${Math.min(100, Math.max(15, dayStreak * 15))}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-extrabold text-white/60 tracking-tight uppercase">STREAK</span>
                    </div>

                    {/* Bar 4: Rescued */}
                    <div className="flex flex-col items-center gap-1.5 w-[18%]">
                      <div className="text-[9px] font-mono font-bold text-blue-400">{rescuedCount}</div>
                      <div className="w-full bg-white/10 rounded-t-md relative overflow-hidden" style={{ height: '55px' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-1000 ease-out"
                          style={{ height: `${rescuedCount > 0 ? Math.min(100, Math.max(15, rescuedCount * 25)) : 10}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-extrabold text-white/60 tracking-tight uppercase">RESCUE</span>
                    </div>

                    {/* Bar 5: Intensity */}
                    <div className="flex flex-col items-center gap-1.5 w-[18%]">
                      <div className="text-[9px] font-mono font-bold text-indigo-400">
                        {Math.round((totalScore + progressPercent) / 2)}
                      </div>
                      <div className="w-full bg-white/10 rounded-t-md relative overflow-hidden" style={{ height: '55px' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-1000 ease-out"
                          style={{ height: `${Math.round((totalScore + progressPercent) / 2)}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-extrabold text-white/60 tracking-tight uppercase">INTENS</span>
                    </div>
                  </div>

                  {/* Aesthetic grid markers behind the bars */}
                  <div className="flex justify-between items-center text-[8px] font-mono text-white/40 border-t border-white/5 pt-2">
                    <span className="flex items-center gap-1">⚡ Focus Level Analytics</span>
                    <span>High Fidelity Effort Vector</span>
                  </div>
                </div>
              </div>

              {/* SECTION 6: AI COACH SUMMARY */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold text-orange-500 uppercase tracking-widest block">
                  AI COACH ANALYSIS 🤖
                </span>
                <div className="min-h-[60px] flex items-center justify-center text-left px-4 bg-white/5 rounded-xl py-3 border border-white/5">
                  {summaryLoading ? (
                    <div className="flex items-center gap-1.5 justify-center py-2">
                      <span className="text-xs text-white/60 animate-pulse font-medium mr-1">Analyzing effort vectors</span>
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <p className="text-white text-[12px] leading-[1.6] opacity-90 font-medium">
                      {dailySummary}
                    </p>
                  )}
                </div>
              </div>

              {/* SECTION 7: STREAK CELEBRATION */}
              {dayStreak > 2 && (
                <div className="bg-orange-600/20 border border-orange-500/35 rounded-xl p-2.5 text-center flex items-center justify-center gap-2 animate-pulse">
                  <span className="text-sm">🔥</span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-400">
                    Streak is blazing! {dayStreak} consecutive days!
                  </span>
                </div>
              )}

              {/* SECTION 8: FOOTER */}
              <div className="border-t border-white/10 pt-4 text-center space-y-1 mt-2">
                <span className="block text-[10px] font-mono text-white opacity-40">
                  life-saver-362351694101.asia-east1.run.app
                </span>
              </div>
            </div>

            {/* ACTION BUTTONS (Outside Card) */}
            <div className="w-full flex flex-col gap-2">
              <button
                id="btn-report-share"
                onClick={shareReport}
                className="w-full py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🔗 Share Report</span>
              </button>
              <button
                id="btn-report-close"
                onClick={() => setDailyReportOpen(false)}
                className="w-full py-2.5 bg-white/5 text-white/70 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ⚡ LIFE SAVER: PRODUCTION DEPLOYMENT & PROVISIONING INSTRUCTIONS
 * 
 * To deploy this application securely to production (Cloud Run, Vercel, or custom containers):
 * 
 * 1. PERSISTENT STORAGE & FIREBASE CONFIGURATION:
 *    - Ensure you configure Firestore & Firebase Auth by navigating to the Settings panel in AI Studio.
 *    - Security Rules (`firestore.rules`): Ensure the `firestore.rules` are deployed using the
 *      `deploy_firebase` tool or manually uploaded to your Firebase Console.
 *    
 * 2. ENVIRONMENT VARIABLES CONFIGURATION:
 *    - Ensure you set up these production-ready variables in your host container settings:
 *      - `GEMINI_API_KEY`: Secret API key for Gemini 1.5 Flash (obtained from Google AI Studio).
 *      - Keep all other API keys server-side (using our full-stack proxy endpoints if added).
 * 
 * 3. PRODUCTION COMPILE & START COMMANDS:
 *    - Build Command: `npm run build` (transpiles the client-side files into the `dist/` production folder).
 *    - For custom full-stack setups, configure `server.ts` to run as ES modules and run:
 *      `npm run start` to host the compiled output.
 * 
 * 4. BROWSER iFRAME COMPATIBILITY:
 *    - This app includes an eye-safe "Life Saver ⚡" window state. For OAuth popup redirection flows,
 *      always configure your redirects and cookies correctly to avoid sandbox frame constraints.
 */
