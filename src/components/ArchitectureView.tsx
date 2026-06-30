import React, { useState, useEffect } from "react";
import { ArrowDown, Layers, Server, Shield, Cpu, Database, Cloud, Sparkles } from "lucide-react";

export default function ArchitectureView() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: '🏠 Overview', icon: 'ti-home' },
    { id: 'flow', label: '🔄 User Flow', icon: 'ti-arrow-right' },
    { id: 'frontend', label: '🎨 Frontend', icon: 'ti-layout' },
    { id: 'ai', label: '🤖 AI Layer', icon: 'ti-robot' },
    { id: 'backend', label: '☁️ Backend', icon: 'ti-cloud' },
    { id: 'database', label: '🗄️ Database', icon: 'ti-database' },
    { id: 'google', label: '🔵 Google Tech', icon: 'ti-brand-google' },
    { id: 'stack', label: '📦 Full Stack', icon: 'ti-stack' },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.1, rootMargin: '-10% 0px -70% 0px' }
    );
    
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-gray-100 font-sans antialiased selection:bg-blue-100 selection:text-blue-900 flex flex-col h-screen overflow-hidden">
      
      {/* TOP NAV BAR */}
      <div 
        style={{
          height: '48px',
          borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          flexShrink: 0
        }}
        className="bg-white border-slate-200 text-slate-800 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100"
      >
        <a href="/" style={{
          display:'flex', alignItems:'center', gap:6,
          fontSize:13, textDecoration:'none'
        }} className="text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-200">
          ← Back to app
        </a>

        <div style={{ fontSize: 14, fontWeight: 600 }}>
          Life Saver ⚡ Architecture
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-full">
          <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" 
               width="12" height="12" alt="Gemini"/>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
            Powered by Gemini
          </span>
        </div>
      </div>

      {/* THREE-COLUMN INNER CONTAINER */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '200px 1fr', 
          height: 'calc(100vh - 48px)', 
          overflow: 'hidden' 
        }} 
        className="w-full flex-1"
      >
        {/* LEFT SIDEBAR */}
        <aside 
          style={{
            height: '100%',
            overflowY: 'auto',
            padding: '1rem 0',
            borderRight: '0.5px solid rgba(128, 128, 128, 0.2)',
          }}
          className="bg-white border-slate-200 dark:bg-gray-900 dark:border-gray-800 select-none sidebar"
        >
          {/* Sidebar header */}
          <div style={{ padding: '0 1rem 1rem', borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }} className="border-slate-200 dark:border-gray-800">
            <div style={{ fontSize: 15, fontWeight: 500 }} className="text-slate-800 dark:text-gray-100">⚡ Life Saver</div>
            <div style={{ fontSize: 11, marginTop: 2 }} className="text-slate-400 dark:text-gray-500">
              Architecture
            </div>
          </div>

          {/* Navigation Items */}
          <div style={{ marginTop: '1rem' }} className="space-y-0.5">
            {sections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 1rem',
                    width: '100%',
                    background: isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    color: isActive ? '#2563eb' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    textAlign: 'left',
                    borderLeft: isActive ? '2px solid #2563eb' : '2px solid transparent',
                    transition: 'all 0.15s'
                  }}
                  className={`${
                    isActive 
                      ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-500' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-850'
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div 
          style={{
            overflowY: 'auto',
            height: '100%',
            padding: '2rem'
          }}
          className="bg-slate-50 dark:bg-gray-950 text-slate-800 dark:text-gray-100 sidebar"
        >
          <div className="max-w-4xl mx-auto pb-16">
            
            {/* 1. OVERVIEW */}
            <section id="overview" style={{ marginBottom: '4rem' }}>
              <div className="space-y-2 mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-gray-100 flex items-center gap-3">
                  Life Saver <span className="text-blue-600">⚡</span>
                </h1>
                <h2 className="text-lg font-medium text-slate-500 dark:text-gray-400">
                  Technical Architecture & Real-Time AI Pipeline
                </h2>
                <div className="h-[1px] w-full bg-slate-200 dark:bg-gray-800 mt-4" />
              </div>

              <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-8">
                <h3 className="text-lg font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  Interactive System Flow Overview
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
                  Life Saver is a highly resilient, offline-first responsive crisis dashboard. Below is an interactive flow diagram that illustrates how browser state-loops, Google Firebase, secure backends, and multiple Gemini AI fallback routines communicate instantly.
                </p>
              </div>
            </section>

            {/* 2. USER FLOW */}
            <section id="flow" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-gray-800 pb-2">
                <ArrowDown className="w-5 h-5 text-slate-500" />
                Row 1 — User Interactive Layer
              </h3>
              <div className="w-full bg-slate-100 dark:bg-gray-900 border border-slate-300 dark:border-gray-800 rounded-xl p-6 shadow-xs">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 block mb-1">User Layer</span>
                <span className="text-base font-bold text-slate-800 dark:text-gray-100 block">User (Browser / Client Client)</span>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 leading-relaxed">
                  The client enters details, updates checkbox state loops, speaks audio queries, or handles immediate notifications in real-time. Action logs are propagated instantly.
                </p>
              </div>
            </section>

            {/* 3. FRONTEND */}
            <section id="frontend" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-gray-800 pb-2">
                <Layers className="w-5 h-5 text-orange-500" />
                Row 2 — Frontend & Presentation Layer
              </h3>
              <div className="w-full bg-orange-50 dark:bg-amber-950/20 border border-orange-200 dark:border-amber-900/40 rounded-2xl p-6 shadow-xs">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 block mb-2">Frontend Frameworks</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-gray-800 rounded-xl p-4 shadow-3xs">
                    <span className="text-sm font-bold text-slate-800 dark:text-gray-100 block">Dashboard & Tasks</span>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Calculates immediate priority tags, streak metrics, and renders study routines dynamically.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-gray-800 rounded-xl p-4 shadow-3xs">
                    <span className="text-sm font-bold text-slate-800 dark:text-gray-100 block">AI Chat Panel</span>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Manages real-time conversational assistance, advice threads, and triggers automated task splitting routines.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-gray-800 rounded-xl p-4 shadow-3xs">
                    <span className="text-sm font-bold text-slate-800 dark:text-gray-100 block">Crisis Mode UI</span>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Triggers overlay visual warns, urgent action directives, and sound warnings when deadlines expire.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. AI LAYER */}
            <section id="ai" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-gray-800 pb-2">
                <Cpu className="w-5 h-5 text-blue-500" />
                Row 3 (Left) — AI Engine & Smart Failover
              </h3>
              <div className="bg-blue-50/75 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl p-6 shadow-xs">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-3">AI Engine Layer</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Primary AI */}
                  <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-gray-800 rounded-xl p-4 shadow-3xs">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-[10px] font-mono text-blue-500 font-bold">PRIMARY</span>
                    </div>
                    <span className="text-sm font-bold text-slate-950 dark:text-gray-100 block">Google Gemini 1.5 Flash</span>
                    <ul className="text-xs text-slate-600 dark:text-gray-400 list-disc list-inside mt-2 space-y-1">
                      <li>Crisis rescue plans & mitigation</li>
                      <li>Smart task breakdowns</li>
                      <li>AI Chat assistance</li>
                      <li>Voice processing pipeline</li>
                      <li>Personal habit coaching</li>
                    </ul>
                  </div>

                  {/* Fallback AI */}
                  <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-850 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-mono text-slate-500 font-bold block mb-1">BACKUP FALLOVER</span>
                      <span className="text-sm font-bold text-slate-700 dark:text-gray-300 block">Groq Llama 3</span>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 leading-relaxed">
                        Engages instantly if primary Gemini limits are reached, maintaining chat support even during cloud outages.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. DATABASE */}
            <section id="database" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-gray-800 pb-2">
                <Database className="w-5 h-5 text-amber-500" />
                Row 3 (Right) — Database & Persistence Layer
              </h3>
              <div className="bg-amber-50/75 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-6 shadow-xs">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-3">Cloud Storage</span>
                
                <div className="bg-white dark:bg-gray-900 border border-amber-100 dark:border-gray-800 rounded-xl p-5 shadow-3xs">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-slate-950 dark:text-gray-100">Google Firebase</span>
                  </div>
                  
                  <ul className="text-xs text-slate-600 dark:text-gray-400 space-y-3 mt-3">
                    <li className="flex gap-2">
                      <span className="text-amber-500">🔐</span>
                      <div>
                        <strong className="text-slate-800 dark:text-gray-200 block">Authentication</strong>
                        Google OAuth login securely sandboxes workspaces.
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500">🗄️</span>
                      <div>
                        <strong className="text-slate-800 dark:text-gray-200 block">Firestore DB</strong>
                        Real-time NoSQL client sync keeps data unified.
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500">📦</span>
                      <div>
                        <strong className="text-slate-800 dark:text-gray-200 block">Collections</strong>
                        Stores user state, tasks list, habit routines, and logs.
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 6. BACKEND */}
            <section id="backend" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-gray-800 pb-2">
                <Cloud className="w-5 h-5 text-indigo-500" />
                Row 4 — Production Cloud Infrastructure
              </h3>
              <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-lg">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-indigo-400 block mb-3">Google Cloud Infrastructure (Docker Deployment)</span>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-center">
                    <Cloud className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-slate-100 block">Google Cloud Run</span>
                    <p className="text-[11px] text-slate-400 mt-1">Scalable Docker containers hosting responsive backends.</p>
                  </div>
                  <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-center">
                    <Sparkles className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-slate-100 block">Google AI Studio</span>
                    <p className="text-[11px] text-slate-400 mt-1">Development server API gateways and prompt endpoints.</p>
                  </div>
                  <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-center">
                    <Database className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-slate-100 block">Cloud Firestore</span>
                    <p className="text-[11px] text-slate-400 mt-1">Globally replicated, cloud-native storage engine.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 7. STACK */}
            <section id="stack" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4 border-b border-slate-200 dark:border-gray-800 pb-2">
                ⚡ Full Stack Technologies Used
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                
                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🤖</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Gemini 1.5 Flash</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Primary model generating rescue plans and task splittings</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">⚡</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Groq Llama 3</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Failover redundancy for peak hours limits mitigation</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🔥</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Firebase Auth</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Provides secure profile login via Google OAuth</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🗄️</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Cloud Firestore</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Real-time NoSQL sync of tasks, history logs, and chats</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">☁️</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Cloud Run</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Autoscaling container deployments keeping lag near zero</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🎨</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">React 18 + Vite</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Frontend single-page web framework ensuring fast state feedback</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🎯</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Tailwind CSS</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Aesthetic responsive styles and fluid grid alignment properties</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🐳</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Docker</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Standardized container images deploying smoothly to servers</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex items-start gap-3 shadow-3xs">
                  <span className="text-2xl mt-0.5">🎤</span>
                  <div>
                    <strong className="text-sm text-slate-800 dark:text-gray-200 block">Web Speech API</strong>
                    <span className="text-xs text-slate-500 dark:text-gray-400">Handles in-app verbal directives and dictation prompts</span>
                  </div>
                </div>

              </div>
            </section>

            {/* 8. GOOGLE */}
            <section id="google" style={{ marginBottom: '4rem' }}>
              <h3 className="text-xl font-bold flex items-center gap-2 mb-4 border-b border-slate-200 dark:border-gray-800 pb-2">
                <span className="text-blue-500">G</span>
                <span className="text-red-500">o</span>
                <span className="text-yellow-500">o</span>
                <span className="text-blue-500">g</span>
                <span className="text-green-500">l</span>
                <span className="text-red-500">e</span>
                <span className="text-slate-800 dark:text-gray-100 ml-1">Cloud Integration Stack</span>
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <strong className="text-slate-800 dark:text-gray-200 font-bold">Gemini API</strong>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      Powers the entire task analysis pipeline, from detecting urgent time crises to synthesizing personalized day routines and voice inputs.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Shield className="w-4 h-4" />
                      </div>
                      <strong className="text-slate-800 dark:text-gray-200 font-bold">Firebase Authentication</strong>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      Provides zero-configuration Google OAuth authentication, immediately establishing persistent profiles for productivity dashboards.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <strong className="text-slate-800 dark:text-gray-200 font-bold">Cloud Firestore</strong>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      A real-time database syncing across active browser sessions natively, ensuring seamless data updates on all tasks.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <strong className="text-slate-800 dark:text-gray-200 font-bold">Google Cloud Run</strong>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      A serverless hosting environment that boots compiled Docker containers instantly with near-zero latency execution.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Server className="w-4 h-4" />
                      </div>
                      <strong className="text-slate-800 dark:text-gray-200 font-bold">Google AI Studio</strong>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      Serves as the foundation for testing, prompt prototyping, developer credentials, and backend server proxying.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900/40 p-5 rounded-2xl shadow-3xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                        <Server className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-slate-800 dark:text-gray-200 font-bold">Gmail API</strong>
                        <span className="text-[9px] bg-slate-200 dark:bg-gray-800 text-slate-700 dark:text-gray-300 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                          Demo Ready
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                      Custom simulated background task integrations ready to analyze actual email bodies and sync direct action lists dynamically.
                    </p>
                  </div>
                </div>

              </div>
            </section>

            {/* FOOTER */}
            <div className="text-center pt-8 border-t border-slate-200 dark:border-gray-800 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">
                Built for Google Hackathon 2026
              </p>
              <p className="text-[11px] text-slate-400">
                Life Saver — because deadlines shouldn't be disasters.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
