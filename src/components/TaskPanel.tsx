import React, { useState, useEffect, useRef } from "react";
import { Task, Habit } from "../types";
import { db, auth } from "../firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { getTaskHelp, parseVoiceInput, getDailySchedule, getHabitCoachingTip, predictCrises, breakDownTask } from "../aiService";
import { 
  Plus, 
  CheckCircle, 
  Trash2, 
  Calendar, 
  Clock, 
  Flame, 
  Trophy, 
  CheckSquare, 
  Search, 
  ShieldAlert, 
  Sparkles, 
  AlertCircle,
  ListFilter,
  ArrowUpDown,
  Hourglass,
  Tag,
  BookOpen,
  Mic,
  Smile,
  Mail
} from "lucide-react";

// --- FIRESTORE ERROR HANDLING UTILITIES (firebase-integration skill) ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- SUB-COMPONENT: REAL-TIME TIME LEFT COUNTDOWN ---
export function TimeLeftCountdown({ deadline }: { deadline: string }) {
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      if (!deadline) {
        setTimeLeftStr("No deadline");
        setIsOverdue(false);
        return;
      }

      const now = Date.now();
      const target = new Date(deadline).getTime();
      const diffMs = target - now;

      if (isNaN(target)) {
        setTimeLeftStr("Invalid date");
        setIsOverdue(false);
        return;
      }

      if (diffMs <= 0) {
        setTimeLeftStr("Overdue!");
        setIsOverdue(true);
        return;
      }

      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      const mins = diffMins % 60;
      const hours = diffHours % 24;

      if (diffDays > 0) {
        setTimeLeftStr(`${diffDays}d ${hours}h ${mins}m left`);
      } else if (hours > 0) {
        setTimeLeftStr(`${hours}h ${mins}m left`);
      } else {
        setTimeLeftStr(`${mins}m left`);
      }
      setIsOverdue(false);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 60000); // update every minute
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <span 
      id={`countdown-${deadline}`}
      className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium px-2 py-0.5 rounded-md ${
        isOverdue 
          ? "bg-red-50 text-red-600 animate-pulse font-bold border border-red-100" 
          : "bg-slate-50 text-slate-600 border border-slate-100"
      }`}
    >
      <Clock className={`w-3 h-3 ${isOverdue ? "text-red-500" : "text-slate-400"}`} />
      <span>{timeLeftStr}</span>
    </span>
  );
}

// --- MAIN TASK PANEL COMPONENT ---
interface TaskPanelProps {
  userId: string;
  tasks: Task[];
  habits: Habit[];
  activeTab: "today" | "all" | "habits" | "calendar";
  aiGenerating?: boolean;
  setAiGenerating?: (val: boolean) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  dbLoading?: boolean;
  agentMode?: boolean;
  agentStatus?: string;
  userProfile?: {
    name: string;
    age: number | null;
    workingHours: string;
    categories: string[];
  };
}

export default function TaskPanel({ 
  userId, 
  tasks, 
  habits, 
  activeTab,
  aiGenerating,
  setAiGenerating,
  showToast,
  dbLoading,
  agentMode = false,
  agentStatus = "idle",
  userProfile
}: TaskPanelProps) {
  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };
  // Task form state
  const [taskName, setTaskName] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskPriority, setTaskPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState<number>(30);
  const [taskCategory, setTaskCategory] = useState("General");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Feature 1: Crisis Predictions
  const [predictions, setPredictions] = useState<any[]>([]);
  const [dismissedPredictionIdxs, setDismissedPredictionIdxs] = useState<number[]>([]);
  const hasPredictedRef = useRef(false);

  useEffect(() => {
    if (!dbLoading && tasks.length > 0 && !hasPredictedRef.current) {
      hasPredictedRef.current = true;
      const runPredictions = async () => {
        try {
          if (setAiGenerating) setAiGenerating(true);
          const results = await predictCrises(tasks);
          setPredictions(results || []);
        } catch (err) {
          console.error("Crisis predictions failed:", err);
        } finally {
          if (setAiGenerating) setAiGenerating(false);
        }
      };
      runPredictions();
    }
  }, [tasks, dbLoading]);

  const handleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error !== "aborted") {
        alert(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("Transcribed text:", transcript);

      if (setAiGenerating) setAiGenerating(true);

      try {
        const nowStr = new Date().toISOString();
        const parsed = await parseVoiceInput(transcript, nowStr);

        if (parsed.name) setTaskName(parsed.name);
        if (parsed.priority) setTaskPriority(parsed.priority);
        if (parsed.estimatedMinutes) setTaskEstimatedMinutes(Number(parsed.estimatedMinutes));
        if (parsed.deadline) {
          const cleaned = parsed.deadline.replace("Z", "").substring(0, 16);
          setTaskDeadline(cleaned);
        }
      } catch (err: any) {
        console.error("AI parse voice failed:", err);
        alert(`Failed to parse voice details: ${err.message || "Unknown error"}`);
      } finally {
        if (setAiGenerating) setAiGenerating(false);
      }
    };

    recognition.start();
  };
  
  // Custom View Mode: "grouped" or "urgency"
  const [viewMode, setViewMode] = useState<"grouped" | "urgency">("grouped");

  // Habit form state
  const [habitTitle, setHabitTitle] = useState("");
  const [habitFrequency, setHabitFrequency] = useState<"daily" | "weekly">("daily");
  const [habitTargetDays, setHabitTargetDays] = useState<number>(7);
  const [isAddingHabit, setIsAddingHabit] = useState(false);

  // Calendar states
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const getYesterdayDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getCurrentWeekDays = () => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);

    const days = [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      days.push({
        name: dayNames[i],
        dayOfMonth: d.getDate(),
        dateStr,
        isToday: dateStr === todayStr
      });
    }
    return days;
  };

  // Helper to initialize local date string format for datetime picker (YYYY-MM-DDTHH:MM)
  const initDefaultDeadline = () => {
    const d = new Date();
    d.setHours(d.getHours() + 4); // default 4 hours from now
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
  };

  useEffect(() => {
    if (isAddingTask && !taskDeadline) {
      setTaskDeadline(initDefaultDeadline());
    }
  }, [isAddingTask]);

  // --- FIRESTORE WRITE ACTIONS ---
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    const path = `users/${userId}/tasks`;
    try {
      const colRef = collection(db, "users", userId, "tasks");
      await addDoc(colRef, {
        name: taskName.trim(),
        notes: taskNotes.trim(),
        deadline: taskDeadline || new Date().toISOString(),
        done: false,
        priority: taskPriority,
        estimatedMinutes: Number(taskEstimatedMinutes) || 0,
        category: taskCategory.trim() || "General",
        userId,
        createdAt: new Date().toISOString()
      });

      // Reset form
      setTaskName("");
      setTaskNotes("");
      setTaskDeadline("");
      setTaskPriority("medium");
      setTaskEstimatedMinutes(30);
      setTaskCategory("General");
      setIsAddingTask(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const path = `users/${userId}/tasks/${task.id}`;
    try {
      const docRef = doc(db, "users", userId, "tasks", task.id);
      const isCompleting = !task.done;
      if (isCompleting) {
        const onTime = task.deadline ? (new Date() < new Date(task.deadline)) : true;
        await updateDoc(docRef, { 
          done: true,
          completedAt: new Date().toISOString(),
          completedOnTime: onTime
        });
      } else {
        await updateDoc(docRef, { 
          done: false,
          completedAt: null,
          completedOnTime: null
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const path = `users/${userId}/tasks/${taskId}`;
    try {
      const docRef = doc(db, "users", userId, "tasks", taskId);
      await deleteDoc(docRef);
      showToast("✓ Task deleted successfully!");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitTitle.trim()) return;

    const path = `users/${userId}/habits`;
    try {
      const colRef = collection(db, "users", userId, "habits");
      await addDoc(colRef, {
        name: habitTitle.trim(),
        title: habitTitle.trim(), // backward compat
        frequency: habitFrequency,
        targetDays: Number(habitTargetDays) || 7,
        currentStreak: 0,
        streak: 0, // backward compat
        lastDone: "",
        completedToday: false, // backward compat
        userId,
        createdAt: new Date().toISOString()
      });
      setHabitTitle("");
      setHabitFrequency("daily");
      setHabitTargetDays(7);
      setIsAddingHabit(false);
      showToast("✓ Habit added successfully!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleToggleHabit = async (habit: Habit) => {
    const path = `users/${userId}/habits/${habit.id}`;
    const lastDoneVal = habit.lastDone || "";
    
    if (lastDoneVal === todayStr) {
      showToast(`Already completed "${habit.name || habit.title}" today!`);
      return;
    }

    try {
      const docRef = doc(db, "users", userId, "habits", habit.id);
      
      let newStreak = 0;
      const yesterday = getYesterdayDateStr();
      
      if (lastDoneVal === yesterday) {
        newStreak = (habit.currentStreak !== undefined ? habit.currentStreak : (habit.streak || 0)) + 1;
      } else {
        newStreak = 1;
      }
      
      await updateDoc(docRef, {
        lastDone: todayStr,
        currentStreak: newStreak,
        streak: newStreak, // backward compat
        completedToday: true // backward compat
      });

      showToast(`✓ Checked in! Current streak: ${newStreak} days`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    const path = `users/${userId}/habits/${habitId}`;
    try {
      const docRef = doc(db, "users", userId, "habits", habitId);
      await deleteDoc(docRef);
      showToast("Habit deleted.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleGetHabitCoaching = async () => {
    if (setAiGenerating) setAiGenerating(true);
    showToast("Generating AI coaching tips...");
    try {
      const chatsColRef = collection(db, "users", userId, "chats");
      await addDoc(chatsColRef, {
        text: "Please analyze my habits and give me a quick, professional coaching tip to help me stay consistent.",
        sender: "user",
        userId,
        createdAt: new Date().toISOString()
      });

      const reply = await getHabitCoachingTip(habits);

      await addDoc(chatsColRef, {
        text: reply,
        sender: "ai",
        userId,
        createdAt: new Date().toISOString()
      });

      showToast("✓ AI coaching tip received! View in AI panel.");
    } catch (err: any) {
      console.error("Habit coaching trigger error:", err);
      showToast(`Failed: ${err.message || "Unknown error"}`);
    } finally {
      if (setAiGenerating) setAiGenerating(false);
    }
  };

  const handleGetDailySchedule = async () => {
    if (setAiGenerating) setAiGenerating(true);
    showToast("Calculating emergency schedule...");
    try {
      const chatsColRef = collection(db, "users", userId, "chats");
      await addDoc(chatsColRef, {
        text: "Generate an hour-by-hour emergency schedule based on my active queue tasks.",
        sender: "user",
        userId,
        createdAt: new Date().toISOString()
      });

      const reply = await getDailySchedule(tasks);

      await addDoc(chatsColRef, {
        text: reply.response,
        sender: "ai",
        userId,
        createdAt: new Date().toISOString()
      });

      showToast("✓ Emergency schedule generated! View in AI panel.");
    } catch (err: any) {
      console.error("AI schedule trigger error:", err);
      showToast(`Failed: ${err.message || "Unknown error"}`);
    } finally {
      if (setAiGenerating) setAiGenerating(false);
    }
  };

  // --- STATS COMPUTATION ---
  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateStr();

  const getActiveStreak = (habit: Habit) => {
    const lastDoneVal = habit.lastDone || "";
    if (lastDoneVal === "") return 0;
    if (lastDoneVal === todayStr || lastDoneVal === getYesterdayDateStr()) {
      return habit.currentStreak !== undefined ? habit.currentStreak : (habit.streak || 0);
    }
    return 0; // Reset to 0 visually if before yesterday
  };

  // Stats:
  // 1. Critical unfinished count
  const criticalCount = tasks.filter(t => t.priority === "critical" && !t.done).length;
  // 2. Unfinished tasks due today
  const dueTodayCount = tasks.filter(t => t.deadline && t.deadline.split("T")[0] === todayStr && !t.done).length;
  // 3. Completed count
  const doneCount = tasks.filter(t => t.done).length;
  // 4. Day Streak (maximum streak of any habit, or 0 if none)
  const dayStreak = habits.length > 0 ? Math.max(...habits.map(h => getActiveStreak(h)), 0) : 0;

  // --- URGENCY SCORE CALCULATION & SORTING ---
  const urgencyScore = (task: Task) => {
    if (!task.deadline) return 0;
    const hoursLeft = (new Date(task.deadline).getTime() - Date.now()) / 3600000;
    const weights = { critical: 4, high: 3, medium: 2, low: 1 };
    return weights[task.priority] / Math.max(hoursLeft, 0.1);
  };

  // Filter tasks matching current view / tab
  const getFilteredTasks = () => {
    return tasks.filter(t => {
      // Exclude subtasks from top-level list
      if (t.parentId) return false;

      const matchesSearch = t.name.toLowerCase().includes(taskSearch.toLowerCase()) || 
                            t.notes.toLowerCase().includes(taskSearch.toLowerCase()) ||
                            t.category.toLowerCase().includes(taskSearch.toLowerCase());
      
      if (activeTab === "today") {
        return t.deadline && t.deadline.split("T")[0] === todayStr && matchesSearch;
      }
      return matchesSearch;
    });
  };

  const filteredTasks = getFilteredTasks();

  // Separate active/undone and completed tasks
  const activeTasks = filteredTasks.filter(t => !t.done);
  const completedTasks = filteredTasks.filter(t => t.done);

  // Sort active tasks by urgency score descending
  const sortedActiveTasks = [...activeTasks].sort((a, b) => urgencyScore(b) - urgencyScore(a));

  // Sort completed tasks by created or deadline date descending
  const sortedCompletedTasks = [...completedTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Group active tasks by priority
  const criticalTasksGroup = sortedActiveTasks.filter(t => t.priority === "critical");
  const highTasksGroup = sortedActiveTasks.filter(t => t.priority === "high");
  const mediumTasksGroup = sortedActiveTasks.filter(t => t.priority === "medium");
  const lowTasksGroup = sortedActiveTasks.filter(t => t.priority === "low");

  // Grouping tasks by deadline date for Calendar view
  const groupedTasksByDate: { [date: string]: Task[] } = {};
  if (activeTab === "calendar") {
    tasks.forEach(t => {
      const date = t.deadline ? t.deadline.split("T")[0] : "No Deadline";
      if (!groupedTasksByDate[date]) {
        groupedTasksByDate[date] = [];
      }
      groupedTasksByDate[date].push(t);
    });
  }

  // Visual helper styles for priority border / badges
  const priorityTheme = {
    critical: {
      border: "border-l-4 border-l-red-500",
      badge: "bg-red-50 text-red-700 border border-red-100 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900/40",
      indicator: "🔴 Critical"
    },
    high: {
      border: "border-l-4 border-l-amber-500",
      badge: "bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900/40",
      indicator: "🟠 High"
    },
    medium: {
      border: "border-l-4 border-l-blue-500",
      badge: "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900/40",
      indicator: "🔵 Medium"
    },
    low: {
      border: "border-l-4 border-l-emerald-500",
      badge: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/40",
      indicator: "🟢 Low"
    }
  };

  const isAllClear = criticalCount === 0 && dueTodayCount === 0;

  return (
    <div id="main-panel-container" className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-gray-950 overflow-y-auto p-6 md:p-8">
      
      {/* 1. DYNAMIC STATS ROW (Critical, Due Today, Completed, Day Streak) */}
      <div id="stats-dashboard-row" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div 
          id="stat-card-critical" 
          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-200 ${
            isAllClear 
              ? "bg-green-50 border-green-200/60 dark:bg-green-950/40 dark:border-green-900/60" 
              : "bg-white border-slate-200/80 dark:bg-gray-800 dark:border-gray-700"
          }`}
        >
          <div className={`${isAllClear ? "bg-green-100 dark:bg-green-900/60 text-green-600 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400"} p-2.5 rounded-xl`}>
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Critical Left</p>
            <h4 className={`font-bold mt-0.5 ${isAllClear ? "text-sm text-green-700 dark:text-green-400" : "text-xl text-slate-800 dark:text-gray-100"}`}>
              {isAllClear ? "✅ All Clear" : criticalCount}
            </h4>
          </div>
        </div>

        <div 
          id="stat-card-due-today" 
          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-200 ${
            isAllClear 
              ? "bg-green-50 border-green-200/60 dark:bg-green-950/40 dark:border-green-900/60" 
              : "bg-white border-slate-200/80 dark:bg-gray-800 dark:border-gray-700"
          }`}
        >
          <div className={`${isAllClear ? "bg-green-100 dark:bg-green-900/60 text-green-600 dark:text-green-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"} p-2.5 rounded-xl`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Due Today</p>
            <h4 className={`font-bold mt-0.5 ${isAllClear ? "text-sm text-green-700 dark:text-green-400" : "text-xl text-slate-800 dark:text-gray-100"}`}>
              {isAllClear ? "🎯 0 remaining" : dueTodayCount}
            </h4>
          </div>
        </div>

        <div 
          id="stat-card-done" 
          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-200 ${
            isAllClear 
              ? "bg-green-50 border-green-200/60 dark:bg-green-950/40 dark:border-green-900/60" 
              : "bg-white border-slate-200/80 dark:bg-gray-800 dark:border-gray-700"
          }`}
        >
          <div className={`${isAllClear ? "bg-green-100 dark:bg-green-900/60 text-green-600 dark:text-green-400" : "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"} p-2.5 rounded-xl`}>
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Total Done</p>
            <h4 className={`font-bold mt-0.5 ${isAllClear ? "text-sm text-green-700 dark:text-green-400" : "text-xl text-slate-800 dark:text-gray-100"}`}>
              {isAllClear ? `⭐ ${doneCount} done` : doneCount}
            </h4>
          </div>
        </div>

        <div 
          id="stat-card-streak" 
          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-200 ${
            isAllClear 
              ? "bg-green-50 border-green-200/60 dark:bg-green-950/40 dark:border-green-900/60" 
              : "bg-white border-slate-200/80 dark:bg-gray-800 dark:border-gray-700"
          }`}
        >
          <div className={`${isAllClear ? "bg-green-100 dark:bg-green-900/60 text-green-600 dark:text-green-400" : "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400"} p-2.5 rounded-xl`}>
            <Flame className={`w-5 h-5 ${isAllClear ? "fill-green-500/60 text-green-600 dark:text-green-400" : "fill-orange-500 text-orange-600"}`} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Habit Streak</p>
            <h4 className="text-xl font-bold text-slate-800 dark:text-gray-100 mt-0.5">{dayStreak} days</h4>
          </div>
        </div>
      </div>

      {/* 2. HEADER TAB DESCRIPTION & ACTION BUTTONS */}
      <div id="panel-header" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          {activeTab === "today" && (
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                Life Saver Workspace
              </span>
              <h1 id="dashboard-greeting-header" className="text-2xl font-black text-slate-900 dark:text-gray-100 mt-0.5 tracking-tight">
                {getGreeting()}, {userProfile?.name || 'there'}! ⚡
              </h1>
            </div>
          )}
          <h2 id="view-title" className="text-xl font-bold text-slate-800 dark:text-gray-100 capitalize flex items-center gap-2.5 flex-wrap">
            <span>{activeTab === "all" ? "All Queue" : activeTab === "today" ? "Today's Agenda" : activeTab}</span>
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
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {activeTab === "today" && "Crush urgent emergencies with high priority tags."}
            {activeTab === "all" && "All items in your life safety and task queue."}
            {activeTab === "habits" && "Consistency saves momentum. Check in daily to build robust streaks!"}
            {activeTab === "calendar" && "Chronological view of deadlines."}
          </p>
        </div>

        {activeTab !== "habits" ? (
          <button
            id="btn-add-task-trigger"
            onClick={() => setIsAddingTask(!isAddingTask)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-sm transition active:scale-[0.98] self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{isAddingTask ? "Collapse" : "New Task"}</span>
          </button>
        ) : (
          <button
            id="btn-add-habit-trigger"
            onClick={() => setIsAddingHabit(!isAddingHabit)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-sm transition active:scale-[0.98] self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{isAddingHabit ? "Collapse" : "New Habit"}</span>
          </button>
        )}
      </div>

      {/* 3. ADD NEW RESCUE TASK FORM */}
      {isAddingTask && (
        <form
          id="add-task-form"
          onSubmit={handleAddTask}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-slate-200/80 dark:border-gray-800 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <h3 className="font-bold text-slate-800 dark:text-gray-100 mb-5 text-base flex items-center gap-2 border-b border-slate-100 dark:border-gray-800 pb-3">
            <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Add New Rescue Task
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase">Task Name *</label>
                <button
                  id="btn-voice-input"
                  type="button"
                  onClick={handleVoiceInput}
                  className={`inline-flex items-center gap-1 text-[10px] md:text-xs font-semibold px-2.5 py-1 rounded-full border transition cursor-pointer ${
                    isListening
                      ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 animate-pulse dark:bg-red-950/60 dark:text-red-400 dark:border-red-900/40"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-900/40 dark:hover:bg-indigo-900/80"
                  }`}
                  title={isListening ? "Click to stop recording" : "Speak task details to auto-fill"}
                >
                  <Mic className={`w-3.5 h-3.5 ${isListening ? "text-red-500 animate-bounce" : "text-indigo-600 dark:text-indigo-400"}`} />
                  <span>{isListening ? "Stop Recording" : "Voice Autofill"}</span>
                </button>
              </div>
              <input
                id="input-task-name"
                type="text"
                required
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Finish physics lab, Complete financial audit, Tax submission..."
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Deadline (Date & Time) *</label>
              <input
                id="input-task-deadline"
                type="datetime-local"
                required
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Priority</label>
              <select
                id="select-task-priority"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              >
                <option value="critical">🚨 Critical (Urgent Threat)</option>
                <option value="high">🟠 High Priority</option>
                <option value="medium">🔵 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Estimated Time (Minutes)</label>
              <div className="relative">
                <input
                  id="input-task-time"
                  type="number"
                  min="1"
                  required
                  value={taskEstimatedMinutes}
                  onChange={(e) => setTaskEstimatedMinutes(Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl pl-4 pr-12 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
                />
                <span className="absolute right-3.5 top-2.5 text-slate-400 dark:text-gray-500 text-xs font-bold font-mono">MIN</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Category / Tag</label>
              <input
                id="input-task-category"
                type="text"
                value={taskCategory}
                onChange={(e) => setTaskCategory(e.target.value)}
                placeholder="Work, Study, Personal, Admin..."
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Notes / Description</label>
              <textarea
                id="input-task-notes"
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="List important attachments, sub-steps, links, or contact details..."
                rows={2}
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-gray-800 pt-4">
            <button
              id="btn-cancel-task"
              type="button"
              onClick={() => setIsAddingTask(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              id="btn-submit-task"
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition"
            >
              Rescue Task
            </button>
          </div>
        </form>
      )}

      {/* 4. ADD NEW HABIT STREAK FORM */}
      {isAddingHabit && (
        <form
          id="add-habit-form"
          onSubmit={handleAddHabit}
          className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-slate-200/80 dark:border-gray-800 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <h3 className="font-bold text-slate-800 dark:text-gray-100 mb-4 text-base flex items-center gap-2 border-b border-slate-100 dark:border-gray-800 pb-3">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
            Build New Habit Loop
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Habit Name *</label>
              <input
                id="input-habit-title"
                type="text"
                required
                value={habitTitle}
                onChange={(e) => setHabitTitle(e.target.value)}
                placeholder="Drink 3L water, Gym check-in..."
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Target Days *</label>
              <input
                id="input-habit-target-days"
                type="number"
                min="1"
                required
                value={habitTargetDays}
                onChange={(e) => setHabitTargetDays(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-gray-400 uppercase mb-1">Frequency</label>
              <select
                id="select-habit-frequency"
                value={habitFrequency}
                onChange={(e) => setHabitFrequency(e.target.value as any)}
                className="w-full text-sm border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-slate-50 dark:bg-gray-950 dark:text-gray-100"
              >
                <option value="daily">Every Single Day</option>
                <option value="weekly">Once Every Week</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-gray-800 pt-4">
            <button
              id="btn-cancel-habit"
              type="button"
              onClick={() => setIsAddingHabit(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              id="btn-submit-habit"
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition"
            >
              Track Habit
            </button>
          </div>
        </form>
      )}

      {/* 5. SEARCH & VIEW-MODE CONTROLLERS (TODAY & ALL VIEWS) */}
      {(activeTab === "today" || activeTab === "all") && (
        <div id="filter-bar" className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              id="search-tasks-input"
              type="text"
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder="Search tasks by name, notes, or category..."
              className="w-full text-xs pl-10 pr-4 py-3 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          {/* Toggle View Mode Segment Control */}
          <div id="view-mode-controller" className="flex bg-slate-200/60 dark:bg-gray-900/80 dark:border dark:border-gray-800 p-1 rounded-xl self-start lg:self-auto gap-0.5">
            <button
              id="btn-view-grouped"
              type="button"
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition uppercase tracking-wider ${
                viewMode === "grouped" 
                  ? "bg-white text-slate-800 shadow-xs dark:bg-gray-800 dark:text-gray-100" 
                  : "text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Grouped By Priority</span>
            </button>
            <button
              id="btn-view-urgency"
              type="button"
              onClick={() => setViewMode("urgency")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition uppercase tracking-wider ${
                viewMode === "urgency" 
                  ? "bg-white text-slate-800 shadow-xs dark:bg-gray-800 dark:text-gray-100" 
                  : "text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sorted By Urgency</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. RENDER ACTIVE TASKS SECTION (Today / All views) */}
      {(activeTab === "today" || activeTab === "all") && (
        <div id="tasks-rendering-core" className="space-y-6">
          
          {dbLoading ? (
            <div className="space-y-5 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-2xl w-full" />
              <div className="space-y-3">
                <div className="h-4 bg-slate-200/60 rounded w-1/4" />
                <div className="h-16 bg-slate-100 rounded-2xl w-full" />
                <div className="h-16 bg-slate-100 rounded-2xl w-full" />
              </div>
            </div>
          ) : (
            <>
              {/* Feature 1 — Crisis Predictions Warnings */}
              {predictions.filter((_, idx) => !dismissedPredictionIdxs.includes(idx)).length > 0 && (
                <div id="crisis-predictions-container" className="space-y-3 mb-4">
                  {predictions.map((p, idx) => {
                    if (dismissedPredictionIdxs.includes(idx)) return null;
                    const isHighRisk = p.riskLevel && p.riskLevel.toLowerCase().includes("high");
                    const borderClass = isHighRisk ? "border-t-2 border-red-400" : "border-t-2 border-amber-400";
                    return (
                      <div 
                        key={idx}
                        id={`prediction-card-${idx}`}
                        className={`bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-400 rounded-xl px-4 py-2 flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 h-[80px] max-h-[80px] overflow-hidden ${borderClass}`}
                      >
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          {/* First line: emoji + task name in bold */}
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-955 dark:text-amber-300 leading-tight">
                            <span>⚠️</span>
                            <span className="truncate">{p.taskName}</span>
                          </div>
                          {/* Second line: reason (truncated to 1 line with text-ellipsis) */}
                          <p className="text-[11px] text-amber-900 dark:text-amber-400 leading-normal line-clamp-1 overflow-hidden truncate">
                            {p.reason}
                          </p>
                          {/* Third line: 💡 suggestion (truncated to 1 line) */}
                          <p className="text-[11px] text-amber-955 dark:text-amber-300 font-semibold leading-normal line-clamp-1 overflow-hidden truncate">
                            💡 {p.suggestion}
                          </p>
                        </div>
                        {/* Dismiss X button on the right */}
                        <button 
                          type="button" 
                          id={`dismiss-prediction-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissedPredictionIdxs([...dismissedPredictionIdxs, idx]);
                          }}
                          className="text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 p-1 rounded-full transition focus:outline-none cursor-pointer"
                          title="Dismiss prediction"
                        >
                          <span className="text-xs font-bold">✕</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* A. Empty State fallback */}
              {activeTasks.length === 0 && (
                <div id="empty-tasks-fallback" className="flex flex-col items-center justify-center p-12 py-16 gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-slate-200 dark:border-gray-700 text-center animate-fade-in">
                  <div className="text-5xl">🎉</div>
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                    {taskSearch ? "All caught up!" : `What's on your plate today, ${userProfile?.name || 'there'}?`}
                  </h3>
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center max-w-xs">
                    {taskSearch 
                      ? "No tasks match your current search criteria. Try typing something else or clear the filter." 
                      : "Your agenda is completely clear right now. Press the button below to add a task!"}
                  </p>
                  {!taskSearch && (
                    <button
                      id="btn-empty-add-task"
                      type="button"
                      onClick={() => setIsAddingTask(true)}
                      className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg uppercase tracking-wider shadow transition cursor-pointer"
                    >
                      Add Your First Task
                    </button>
                  )}
                  {taskSearch && (
                    <button
                      id="btn-empty-clear-search"
                      type="button"
                      onClick={() => setTaskSearch("")}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg uppercase tracking-wider transition cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              )}

          {/* B. Render mode: Grouped by Priority */}
          {activeTasks.length > 0 && viewMode === "grouped" && (
            <div id="grouped-view-layout" className="space-y-6">
              
              {/* Critical Group */}
              {criticalTasksGroup.length > 0 && (
                <div id="critical-group" className="space-y-2.5">
                  <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5 pl-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    🚨 Critical Tasks ({criticalTasksGroup.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {criticalTasksGroup.map(task => renderTaskCard(task))}
                  </div>
                </div>
              )}

              {/* High Group */}
              {highTasksGroup.length > 0 && (
                <div id="high-group" className="space-y-2.5">
                  <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5 pl-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    🟠 High Priority ({highTasksGroup.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {highTasksGroup.map(task => renderTaskCard(task))}
                  </div>
                </div>
              )}

              {/* Medium Group */}
              {mediumTasksGroup.length > 0 && (
                <div id="medium-group" className="space-y-2.5">
                  <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5 pl-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    🔵 Medium Priority ({mediumTasksGroup.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {mediumTasksGroup.map(task => renderTaskCard(task))}
                  </div>
                </div>
              )}

              {/* Low Group */}
              {lowTasksGroup.length > 0 && (
                <div id="low-group" className="space-y-2.5">
                  <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 pl-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    🟢 Low Priority ({lowTasksGroup.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {lowTasksGroup.map(task => renderTaskCard(task))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* C. Render mode: Sorted by Urgency Score */}
          {activeTasks.length > 0 && viewMode === "urgency" && (
            <div id="urgency-sorted-view-layout" className="space-y-3">
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-blue-800">
                  Smart Triage: Tasks sorted strictly by urgency index (based on remaining time and critical weight coefficients).
                </span>
              </div>
              {sortedActiveTasks.map(task => renderTaskCard(task))}
            </div>
          )}

          {/* 7. COMPLETED TASKS TRAY */}
          {sortedCompletedTasks.length > 0 && (
            <div id="completed-tasks-tray" className="pt-6 border-t border-slate-200">
              <details className="group" open={activeTab !== "today"}>
                <summary className="flex items-center justify-between font-bold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition select-none pl-1.5">
                  <span>Completed Tasks ({sortedCompletedTasks.length})</span>
                  <span className="text-slate-300 group-open:rotate-180 transform transition duration-150">▼</span>
                </summary>
                <div className="grid grid-cols-1 gap-2.5 mt-4">
                  {sortedCompletedTasks.map(task => (
                    <div
                      key={task.id}
                      id={`completed-task-card-${task.id}`}
                      className="bg-white/65 rounded-xl border border-slate-100 p-4 shadow-xs flex items-center justify-between gap-4 opacity-55 hover:opacity-85 transition"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          id={`btn-untick-task-${task.id}`}
                          onClick={() => handleToggleTask(task)}
                          className="w-5 h-5 rounded-md bg-blue-600 border border-blue-600 flex items-center justify-center text-white cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4 text-white" />
                        </button>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-500 line-through truncate">
                            {task.name}
                          </h4>
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold uppercase">
                            {task.category}
                          </span>
                        </div>
                      </div>
                      <button
                        id={`btn-delete-completed-${task.id}`}
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-slate-300 hover:text-red-500 p-1 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </>)}

        </div>
      )}

      {/* 8. RENDER HABITS CHECKS VIEW */}
      {activeTab === "habits" && (
        <div id="habits-list-container" className="space-y-6">
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Trophy className="w-10 h-10 text-orange-600 dark:text-orange-400 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-orange-800 dark:text-orange-400 text-sm">Escaping the Deadline Trap</h3>
                <p className="text-xs text-orange-700/90 dark:text-orange-300/80 mt-0.5">
                  Maintaining regular active streaks trains consistent schedules, stopping last-minute panic cycles before they can start!
                </p>
              </div>
            </div>

            <button
              id="btn-ai-habit-coach"
              type="button"
              onClick={handleGetHabitCoaching}
              disabled={aiGenerating}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition disabled:opacity-50 cursor-pointer self-start sm:self-auto"
            >
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
              <span>AI Habit Coach</span>
            </button>
          </div>

          {habits.length === 0 ? (
            <div id="habits-placeholder" className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center animate-fade-in">
              <Flame className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
              <p className="text-slate-800 font-bold mb-1 text-sm">No Habits Logged Yet</p>
              <p className="text-xs text-slate-400 max-w-xs mb-4">
                Click "New Habit" above to schedule core daily or weekly routine objectives.
              </p>
              <button
                id="btn-create-first-habit"
                type="button"
                onClick={() => setIsAddingHabit(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition"
              >
                Track Your First Habit
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {habits.map((habit) => {
                const activeStreak = getActiveStreak(habit);
                const targetDaysVal = habit.targetDays || 7;
                const progressPct = Math.min(100, Math.round((activeStreak / targetDaysVal) * 100));
                const isCheckedInToday = habit.lastDone === todayStr;

                return (
                  <div
                    key={habit.id}
                    id={`habit-card-${habit.id}`}
                    className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200/80 dark:border-gray-800 p-5 shadow-sm hover:shadow transition flex flex-col gap-4 animate-fade-in"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">{habit.name || habit.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="capitalize text-[9px] bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 font-bold px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-gray-700">
                            🔁 {habit.frequency || "daily"}
                          </span>
                          <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-bold font-mono text-[11px]">
                            <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                            {activeStreak} / {targetDaysVal} Days Streak
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          id={`btn-checkin-habit-${habit.id}`}
                          onClick={() => handleToggleHabit(habit)}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition uppercase tracking-wider ${
                            isCheckedInToday
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-900/40 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700 text-white shadow shadow-blue-500/10 cursor-pointer"
                          }`}
                          disabled={isCheckedInToday}
                          title={isCheckedInToday ? "Already checked in today" : "Check in for today"}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{isCheckedInToday ? "Done Today" : "Check In"}</span>
                        </button>

                        <button
                          id={`btn-delete-habit-${habit.id}`}
                          onClick={() => handleDeleteHabit(habit.id)}
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-md transition cursor-pointer"
                          title="Delete Habit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Streak Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-gray-500">
                        <span>Streak Goal Progress</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-gray-950 rounded-full overflow-hidden border border-slate-200/30 dark:border-gray-800/40">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 9. RENDER CALENDAR SCHEDULER VIEW */}
      {activeTab === "calendar" && (
        <div id="calendar-view" className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-slate-200/80 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Weekly Outlook & Smart Triage
              </h3>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                Monitor deadlines across the current week and let AI orchestrate your schedule.
              </p>
            </div>
            <button
              id="btn-ai-schedule-coach"
              type="button"
              onClick={handleGetDailySchedule}
              disabled={aiGenerating}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition disabled:opacity-50 cursor-pointer self-start sm:self-auto"
            >
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
              <span>AI Schedule Coach</span>
            </button>
          </div>

          {/* 7-Day Week Mon-Sun Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {getCurrentWeekDays().map((day) => {
              const dayTasks = tasks.filter(
                (t) => t.deadline && t.deadline.split("T")[0] === day.dateStr && !t.done
              );
              const isSelected = selectedCalendarDate === day.dateStr;

              return (
                <button
                  key={day.dateStr}
                  id={`calendar-day-btn-${day.dateStr}`}
                  type="button"
                  onClick={() => setSelectedCalendarDate(day.dateStr)}
                  className={`p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between min-h-[90px] transition cursor-pointer ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 ring-2 ring-blue-500/20"
                      : "bg-white hover:bg-slate-50 dark:bg-gray-900 dark:hover:bg-gray-800 border-slate-200/70 dark:border-gray-800"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">{day.name}</span>
                  <span className={`text-lg font-extrabold mt-1 ${day.isToday ? "text-blue-600 dark:text-blue-400 underline decoration-2 font-black" : "text-slate-800 dark:text-gray-100"}`}>
                    {day.dayOfMonth}
                  </span>

                  {/* Task priority colored pills/dots */}
                  <div className="flex flex-wrap gap-1 mt-2.5 justify-center w-full">
                    {dayTasks.map((t) => {
                      const pillColor =
                        t.priority === "critical"
                          ? "bg-red-500"
                          : t.priority === "high"
                          ? "bg-amber-500"
                          : t.priority === "medium"
                          ? "bg-blue-500"
                          : "bg-emerald-500";
                      return (
                        <span
                          key={t.id}
                          className={`w-2 h-2 rounded-full ${pillColor}`}
                          title={`${t.name} (${t.priority})`}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed day task view */}
          <div className="bg-slate-50 dark:bg-gray-950 rounded-2xl p-5 border border-slate-200/40 dark:border-gray-800/40">
            <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-gray-800 pb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                Agenda for {selectedCalendarDate === todayStr ? "Today (" + selectedCalendarDate + ")" : selectedCalendarDate}
              </h4>
              <span className="text-[10px] font-bold bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                {tasks.filter((t) => t.deadline && t.deadline.split("T")[0] === selectedCalendarDate).length} Tasks
              </span>
            </div>

            {(() => {
              const selectedDayTasks = tasks.filter(
                (t) => t.deadline && t.deadline.split("T")[0] === selectedCalendarDate
              );

              if (selectedDayTasks.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 dark:text-gray-500 flex flex-col items-center justify-center">
                    <Smile className="w-8 h-8 text-slate-300 dark:text-gray-750 mb-2" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-gray-400">No deadlines scheduled on this day</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Enjoy the breathing room or get ahead on other items!</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5">
                  {selectedDayTasks.map((task) => {
                    const theme = priorityTheme[task.priority] || priorityTheme.medium;
                    return (
                      <div
                        key={task.id}
                        id={`calendar-task-row-${task.id}`}
                        className={`bg-white dark:bg-gray-900 rounded-xl border border-slate-200/50 dark:border-gray-800 p-4 shadow-sm hover:shadow transition flex items-center justify-between gap-4 animate-fade-in ${
                          task.done ? "opacity-55" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            id={`btn-calendar-task-toggle-${task.id}`}
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer flex-shrink-0 ${
                              task.done
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "border-slate-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-950"
                            }`}
                          >
                            {task.done && <CheckCircle className="w-4 h-4 text-white" />}
                          </button>
                          <div className="min-w-0">
                            <h5 className={`text-xs font-bold text-slate-800 dark:text-gray-100 truncate ${task.done ? "line-through text-slate-400 dark:text-gray-500" : ""}`}>
                              {task.name}
                            </h5>
                            {task.notes && <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5 truncate">{task.notes}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${theme.badge}`}>
                            {task.priority}
                          </span>
                          <button
                            id={`btn-delete-calendar-task-${task.id}`}
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-slate-300 hover:text-red-500 p-1 rounded-md transition flex-shrink-0 cursor-pointer"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );

  // --- PRIVATE CARD RENDERING HELPER ---
  function renderTaskCard(task: Task) {
    const theme = priorityTheme[task.priority] || priorityTheme.medium;
    const taskUrgency = urgencyScore(task).toFixed(1);
    const subtasksOfThisTask = tasks.filter(t => t.parentId === task.id);

    return (
      <div key={task.id} className="space-y-2 flex flex-col w-full">
        <div
          id={`task-card-${task.id}`}
          className={`bg-white rounded-xl border border-slate-200/60 p-4.5 shadow-sm hover:shadow transition duration-150 flex items-start gap-4 ${theme.border}`}
        >
        {/* Checked status toggle */}
        <button
          id={`task-checkbox-${task.id}`}
          onClick={() => handleToggleTask(task)}
          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer flex-shrink-0 ${
            task.done
              ? "bg-blue-600 border-blue-600 text-white"
              : "border-slate-300 hover:border-blue-400 bg-white"
          }`}
        >
          {task.done && <CheckCircle className="w-4 h-4 text-white" />}
        </button>

        {/* Content detail segments */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h4 className={`text-sm font-semibold text-slate-800 break-words ${task.done ? "line-through text-slate-400" : ""}`}>
              {task.name}
            </h4>
            
            {/* Urgency Badge (only show for undone tasks) */}
            {!task.done && (
              <span 
                id={`urgency-badge-${task.id}`}
                className="text-[9px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md border border-purple-100"
                title="Dynamic calculated urgency score coefficient"
              >
                Urgency: {taskUrgency}
              </span>
            )}
          </div>

          {task.notes && (
            <p className={`text-xs text-slate-500 mb-2.5 break-words ${task.done ? "line-through text-slate-400" : ""}`}>
              {task.notes}
            </p>
          )}

          {/* Badge & Meta attributes footer bar */}
          <div className="flex items-center gap-3.5 text-[10px] text-slate-400 flex-wrap">
            {/* Priority Badge */}
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${theme.badge}`}>
              {theme.indicator}
            </span>

            {/* Category Badge */}
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5 text-slate-400" />
              {task.category}
            </span>

            {/* Gmail Source Badge */}
            {task.source === "gmail" && (
              <span 
                title="Imported from Gmail"
                className="inline-flex items-center gap-1 font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full cursor-help"
              >
                <Mail className="w-2.5 h-2.5 text-red-500" />
                <span>Gmail Import</span>
              </span>
            )}

            {/* Subtask Badge */}
            {task.source === "breakdown" && (
              <span 
                title="Subtask from breakdown"
                className="inline-flex items-center gap-1 font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full"
              >
                <Sparkles className="w-2.5 h-2.5 text-purple-500" />
                <span>subtask</span>
              </span>
            )}

            {/* Estimated Minutes */}
            <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50/60 border border-slate-100 px-2 py-0.5 rounded-full font-mono">
              <Hourglass className="w-2.5 h-2.5 text-slate-400" />
              {task.estimatedMinutes} mins
            </span>

            {/* Time Left Countdown */}
            {!task.done && <TimeLeftCountdown deadline={task.deadline} />}

            {/* AI Help Button */}
            {!task.done && (
              <button
                id={`btn-ai-help-${task.id}`}
                type="button"
                disabled={aiGenerating}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (setAiGenerating) setAiGenerating(true);

                  const userMsg = `Help me with task: "${task.name}"`;
                  try {
                    const chatsColRef = collection(db, "users", userId, "chats");
                    await addDoc(chatsColRef, {
                      text: userMsg,
                      sender: "user",
                      userId,
                      createdAt: new Date().toISOString()
                    });

                    const aiReply = await getTaskHelp(task);

                    await addDoc(chatsColRef, {
                      text: aiReply.response,
                      sender: "ai",
                      userId,
                      createdAt: new Date().toISOString()
                    });
                  } catch (err: any) {
                    console.error("AI Task Help Error:", err);
                    const chatsColRef = collection(db, "users", userId, "chats");
                    await addDoc(chatsColRef, {
                      text: `Error getting AI Help for "${task.name}": ${err.message || "Unknown error"}`,
                      sender: "ai",
                      userId,
                      createdAt: new Date().toISOString()
                    });
                  } finally {
                    if (setAiGenerating) setAiGenerating(false);
                  }
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full transition disabled:opacity-50 cursor-pointer"
                title="Ask AI for a 3-step action plan"
              >
                <Sparkles className="w-2.5 h-2.5 text-indigo-500 fill-indigo-100" />
                <span>AI Help</span>
              </button>
            )}

            {/* Break it down Button */}
            {!task.done && (
              <button
                id={`btn-breakdown-${task.id}`}
                type="button"
                disabled={aiGenerating}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (setAiGenerating) setAiGenerating(true);
                  try {
                    showToast("Breaking down task with AI...", "info");
                    const subtasks = await breakDownTask(task);
                    if (!Array.isArray(subtasks) || subtasks.length === 0) {
                      throw new Error("No subtasks returned");
                    }
                    
                    const tasksColRef = collection(db, "users", userId, "tasks");
                    for (const sub of subtasks) {
                      await addDoc(tasksColRef, {
                        name: sub.name,
                        deadline: task.deadline,
                        priority: task.priority,
                        category: task.category || "General",
                        notes: `Subtask of: ${task.name}`,
                        estimatedMinutes: Number(sub.estimatedMinutes) || 10,
                        userId,
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
                    if (setAiGenerating) setAiGenerating(false);
                  }
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition disabled:opacity-50 cursor-pointer"
                title="Break down this task into 5 smaller subtasks"
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-500 fill-amber-100" />
                <span>Break it down</span>
              </button>
            )}
          </div>
        </div>

        {/* Delete action button */}
        <button
          id={`btn-delete-task-${task.id}`}
          onClick={() => handleDeleteTask(task.id)}
          className="text-slate-300 hover:text-red-500 p-1.5 rounded-md transition flex-shrink-0"
          title="Delete rescue task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Render Subtasks Subtree */}
      {subtasksOfThisTask.length > 0 && (
        <div className="pl-6 border-l-2 border-dashed border-slate-200 dark:border-gray-700 ml-5.5 space-y-2 py-1">
          {subtasksOfThisTask.map(subtask => (
            <div 
              key={subtask.id}
              id={`subtask-card-${subtask.id}`}
              className={`bg-slate-50/50 dark:bg-gray-900/40 rounded-lg border border-slate-150 dark:border-gray-800 p-3 flex items-start gap-3 shadow-3xs transition duration-150 relative ${
                subtask.done ? "opacity-60" : ""
              }`}
            >
              {/* Decorative L-tree branch indicator */}
              <div className="absolute -left-6 top-5 w-4.5 h-0.5 border-t-2 border-dashed border-slate-200 dark:border-gray-700" />
              
              {/* Subtask Checkbox */}
              <button
                id={`subtask-checkbox-${subtask.id}`}
                onClick={() => handleToggleTask(subtask)}
                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer flex-shrink-0 ${
                  subtask.done
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-slate-300 hover:border-emerald-400 bg-white dark:bg-gray-800 dark:border-gray-700"
                }`}
              >
                {subtask.done && <CheckCircle className="w-3 h-3 text-white" />}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h5 className={`text-xs font-semibold text-slate-700 dark:text-gray-300 break-words ${subtask.done ? "line-through text-slate-400 dark:text-gray-500" : ""}`}>
                    {subtask.name}
                  </h5>
                  <span className="text-[8px] font-bold text-slate-400 bg-slate-100 dark:bg-gray-800 px-1 py-0.2 rounded">
                    {subtask.estimatedMinutes} mins
                  </span>
                </div>
              </div>
              
              {/* Subtask Delete Button */}
              <button
                id={`btn-delete-subtask-${subtask.id}`}
                onClick={() => handleDeleteTask(subtask.id)}
                className="text-slate-300 hover:text-red-500 p-0.5 transition"
                title="Delete subtask"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
}
