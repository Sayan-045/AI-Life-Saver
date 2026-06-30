import React, { useState, useEffect } from "react";
import { Task } from "../types";
import { AlertTriangle, Sparkles } from "lucide-react";

interface CrisisBannerProps {
  task: Task;
  onDismiss: () => void;
}

export default function CrisisBanner({ task, onDismiss }: CrisisBannerProps) {
  const targetTime = new Date(task.deadline).getTime();
  const [timeLeft, setTimeLeft] = useState(targetTime - Date.now());

  useEffect(() => {
    // Initial sync
    setTimeLeft(targetTime - Date.now());

    const interval = setInterval(() => {
      setTimeLeft(targetTime - Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [task, targetTime]);

  const minutesLeft = Math.floor(timeLeft / 60000);
  const secondsLeft = Math.floor((timeLeft % 60000) / 1000);

  let countdownText = "";
  if (timeLeft <= 0) {
    countdownText = "OVERDUE!";
  } else {
    countdownText = `${minutesLeft}m ${secondsLeft}s`;
  }

  const handleScrollView = () => {
    // 1. Scroll to the AI chat panel
    const chatContainer = document.getElementById("ai-panel-container");
    if (chatContainer) {
      chatContainer.scrollIntoView({ behavior: "smooth" });
    }

    // 2. On mobile, open the mobile chat drawer
    const drawer = document.getElementById("mobile-chat-drawer");
    if (drawer) {
      drawer.classList.remove("hidden");
    }
  };

  return (
    <div
      id="crisis-banner"
      className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white p-3 md:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md animate-pulse duration-3000 z-50 relative border-b border-red-700"
    >
      <div className="flex items-center gap-3">
        {/* Pulsing red dot animation */}
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-100"></span>
        </span>

        <AlertTriangle className="w-5 h-5 text-white animate-bounce" />
        <span className="text-xs md:text-sm font-bold tracking-wide">
          CRISIS — "{task.name}" due in <span className="font-mono underline decoration-wavy bg-red-800/60 px-1.5 py-0.5 rounded">{countdownText}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          id="btn-crisis-view-rescue"
          type="button"
          onClick={handleScrollView}
          className="bg-white text-red-700 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-red-600 fill-red-100" />
          <span>View Rescue Plan</span>
        </button>
        <button
          id="btn-crisis-dismiss"
          type="button"
          onClick={onDismiss}
          className="bg-red-700 hover:bg-red-800 border border-red-500/30 text-red-100 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
