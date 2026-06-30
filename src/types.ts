export interface Task {
  id: string;
  name: string;
  notes: string;
  deadline: string; // ISO datetime string
  done: boolean;
  priority: "critical" | "high" | "medium" | "low";
  estimatedMinutes: number;
  category: string;
  userId: string;
  createdAt: string;
  source?: "gmail" | string;
  completedAt?: string;
  completedOnTime?: boolean;
  parentId?: string;
}

export interface Habit {
  id: string;
  name: string;
  targetDays: number;
  currentStreak: number;
  lastDone: string; // YYYY-MM-DD or empty
  userId: string;
  createdAt: string;
  frequency?: "daily" | "weekly";
  // Fallbacks for older DB items
  title?: string;
  streak?: number;
  completedToday?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "ai";
  userId: string;
  createdAt: string;
  source?: "gemini" | "groq" | "error" | string;
}
