import React, { useState } from "react";
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { LifeBuoy, AlertCircle, Sparkles } from "lucide-react";

interface LoginScreenProps {
  onLoginSuccess?: (token: string | null) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (onLoginSuccess) {
        onLoginSuccess(token);
      }
    } catch (err: any) {
      console.error("Firebase Sign-In Error:", err);
      // Fallback to redirect if popup is blocked in iframe environment
      if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr: any) {
          setError("Google Sign-In failed. Please enable popups or try again.");
          setLoading(false);
        }
      } else {
        setError(err.message || "An error occurred during authentication.");
        setLoading(false);
      }
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-slate-50 dark:bg-gray-950 flex flex-col justify-center items-center p-4 transition-colors duration-200">
      <div id="login-card" className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-slate-100 dark:border-gray-800/80 p-8 text-center flex flex-col items-center">
        {/* Visual Header */}
        <div id="logo-wrapper" className="relative mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <span className="font-bold text-3xl select-none">+</span>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-400 p-1.5 rounded-full text-slate-900 shadow-sm">
            <Sparkles className="w-4 h-4 text-slate-800" />
          </div>
        </div>

        {/* Brand Identity */}
        <h1 id="app-title" className="text-3xl font-bold text-slate-950 dark:text-gray-100 tracking-tight mb-2">
          Life Saver
        </h1>
        <p id="app-tagline" className="text-slate-500 dark:text-gray-400 font-medium text-sm max-w-xs mb-8">
          Your AI deadline rescue companion
        </p>

        {/* Interactive Description */}
        <div id="app-feature-list" className="w-full text-left bg-slate-50 dark:bg-gray-950 rounded-xl p-4 mb-8 space-y-3 border border-slate-100 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-50 dark:bg-blue-950/60 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold">1</span>
            <p className="text-xs text-slate-600 dark:text-gray-300"><strong className="dark:text-gray-100">Triage Deadlines:</strong> Instant sorting by urgency and dynamic stress indexes.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-50 dark:bg-blue-950/60 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold">2</span>
            <p className="text-xs text-slate-600 dark:text-gray-300"><strong className="dark:text-gray-100">AI Rescue Coach:</strong> Stagger plans, chat, and break through procrastination blocks.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-50 dark:bg-blue-950/60 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold">3</span>
            <p className="text-xs text-slate-600 dark:text-gray-300"><strong className="dark:text-gray-100">Habit Loop:</strong> Stay consistent with daily and weekly habit checklists.</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div id="login-error" className="w-full mb-6 flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 p-3 rounded-xl text-xs text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In Button */}
        <button
          id="btn-google-signin"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 dark:bg-gray-800 dark:hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition duration-150 disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? "Connecting..." : "Sign in with Google"}
        </button>

        <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-6">
          By signing in, you agree to access your personal AI rescue environment.
        </p>
      </div>
    </div>
  );
}
