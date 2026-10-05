"use client";

import React, { useState, useEffect } from "react";
import UploadZone from "./UploadZone";
import ChatWindow from "./ChatWindow";
import QuickRevisionHub from "./QuickRevisionHub";
import QuestionGenerator from "./QuestionGenerator";
import AnswerChecker from "./AnswerChecker";
import StudyDashboard from "./StudyDashboard";

interface SystemStatus {
  status: "ready" | "configuration_required" | "loading";
  database: {
    status: string;
    collection: string;
    totalChunksIndexed: number;
    error: string | null;
  };
  environment: {
    hasGroqKey: boolean;
    hasHuggingFaceKey: boolean;
    chromaPath: string;
  };
}

export type MainStudyView = 
  | "chat" 
  | "quick_revision" 
  | "question_generator" 
  | "answer_checker" 
  | "study_dashboard";

export default function ClientWrapper() {
  const [filename, setFilename] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMainView, setActiveMainView] = useState<MainStudyView>("chat");

  // Shared state for seamless cross-component workflows
  const [practiceContext, setPracticeContext] = useState<{ question: string; marks: number; topic?: string } | null>(null);
  const [targetedTopic, setTargetedTopic] = useState<string | null>(null);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groqApiKey: keyInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("✓ Saved to .env.local and activated!");
        setKeyInput("");
        fetchStatus();
      } else {
        setSaveMessage("✗ " + (data.error || "Failed to save key."));
      }
    } catch (err: any) {
      setSaveMessage("✗ Network error saving key.");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/status?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSysStatus(data);
        if (!filename && data.database?.sources && data.database.sources.length > 0) {
          const primaryDoc = data.database.sources[0];
          setFilename(primaryDoc);
          setChunkCount(data.database.totalChunksIndexed || 0);
        }
      }
    } catch (e) {
      console.error("Failed to fetch system status:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [filename]);

  const handleUploadComplete = (name: string, chunks: number) => {
    setFilename(name || null);
    setChunkCount(chunks);
    fetchStatus();
  };

  const isConfigured = sysStatus?.environment?.hasGroqKey && sysStatus?.database?.status === "connected";

  // Handlers for cross-navigation
  const handlePracticeQuestion = (question: string, marks: number, topic?: string) => {
    setPracticeContext({ question, marks, topic });
    setActiveMainView("answer_checker");
  };

  const handleDashboardNavigate = (view: "chat" | "quick_revision" | "question_generator" | "answer_checker", topic?: string) => {
    if (topic) setTargetedTopic(topic);
    if (view === "answer_checker" && topic) {
      setPracticeContext({ question: `Explain the key concepts of ${topic}`, marks: 5, topic });
    }
    setActiveMainView(view);
  };

  return (
    <div className="flex h-screen w-full bg-[#0b0f19] text-slate-100 font-sans overflow-hidden antialiased">
      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-800/80 bg-[#0f172a]/60 backdrop-blur-xl flex flex-col justify-between shadow-2xl z-30 relative">
        {/* Top Header */}
        <div className="p-5 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 p-0.5 shadow-md shadow-blue-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center text-blue-400 font-bold text-sm">
                  ⚡
                </div>
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                  InsightAI
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">RAG</span>
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Exam & Revision Suite</p>
              </div>
            </div>

            {/* Health Status Indicator */}
            <button
              onClick={() => setShowConfigModal(true)}
              title="Click for System & Environment Diagnostics"
              className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 text-[11px] font-medium cursor-pointer ${
                isConfigured 
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/50" 
                  : "bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/50 animate-pulse"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isConfigured ? "bg-emerald-400" : "bg-amber-400"}`}></span>
              <span className="text-[10px]">{isConfigured ? "Ready" : "Setup"}</span>
            </button>
          </div>
        </div>

        {/* Middle Content */}
        <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
          {/* Navigation View Switcher (5 Study Modes) */}
          <div>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Study Modes</h2>
            <div className="flex flex-col gap-1 p-1 bg-slate-900/80 rounded-2xl border border-slate-800">
              {/* 1. Ask Exam Questions */}
              <button
                onClick={() => setActiveMainView("chat")}
                className={`w-full p-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer text-left ${
                  activeMainView === "chat"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span className="text-sm">💬</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-tight">Ask Exam Questions</p>
                  <p className={`text-[10px] font-normal truncate mt-0.5 ${activeMainView === "chat" ? "text-blue-100" : "text-slate-400"}`}>
                    2M–15M graded answers
                  </p>
                </div>
              </button>

              {/* 2. Quick Revision Hub */}
              <button
                onClick={() => setActiveMainView("quick_revision")}
                className={`w-full p-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer text-left ${
                  activeMainView === "quick_revision"
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span className="text-sm">⚡</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-tight flex items-center gap-1.5">
                    <span>Quick Revision Hub</span>
                  </p>
                  <p className={`text-[10px] font-normal truncate mt-0.5 ${activeMainView === "quick_revision" ? "text-cyan-100" : "text-slate-400"}`}>
                    Topics, cheat-sheets & Q&A
                  </p>
                </div>
              </button>

              {/* 3. Automatic Question Generator (Feature 5) */}
              <button
                onClick={() => setActiveMainView("question_generator")}
                className={`w-full p-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer text-left ${
                  activeMainView === "question_generator"
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span className="text-sm">📝</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-tight flex items-center gap-1.5">
                    <span>Question Generator</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-200 text-[9px] font-bold">New</span>
                  </p>
                  <p className={`text-[10px] font-normal truncate mt-0.5 ${activeMainView === "question_generator" ? "text-emerald-100" : "text-slate-400"}`}>
                    Exam banks & 100M test papers
                  </p>
                </div>
              </button>

              {/* 4. Answer Improvement & Checker (Feature 6) */}
              <button
                onClick={() => setActiveMainView("answer_checker")}
                className={`w-full p-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer text-left ${
                  activeMainView === "answer_checker"
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span className="text-sm">✍️</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-tight flex items-center gap-1.5">
                    <span>Answer Checker</span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-400/20 text-indigo-200 text-[9px] font-bold">New</span>
                  </p>
                  <p className={`text-[10px] font-normal truncate mt-0.5 ${activeMainView === "answer_checker" ? "text-indigo-100" : "text-slate-400"}`}>
                    Evaluate & improve student answers
                  </p>
                </div>
              </button>

              {/* 5. Chapter-Wise Study Dashboard (Feature 7) */}
              <button
                onClick={() => setActiveMainView("study_dashboard")}
                className={`w-full p-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer text-left ${
                  activeMainView === "study_dashboard"
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span className="text-sm">📊</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-tight flex items-center gap-1.5">
                    <span>Study Dashboard</span>
                    <span className="px-1.5 py-0.2 rounded bg-purple-400/20 text-purple-200 text-[9px] font-bold">New</span>
                  </p>
                  <p className={`text-[10px] font-normal truncate mt-0.5 ${activeMainView === "study_dashboard" ? "text-purple-100" : "text-slate-400"}`}>
                    Progress, weak topics & stats
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Document Ingestion</h2>
            <UploadZone onUploadComplete={handleUploadComplete} />
          </div>

          {/* Active Document Card */}
          {filename && (
            <div className="p-3.5 bg-gradient-to-br from-blue-950/30 via-slate-900/60 to-slate-900/80 border border-blue-500/20 rounded-2xl shadow-md">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold tracking-wider text-blue-400 uppercase">Active Corpus</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                  {chunkCount} Chunks
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-200 truncate" title={filename}>
                {filename}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                <span>Semantic Index Active</span>
              </div>
            </div>
          )}

          {/* Pipeline Info Card */}
          <div className="mt-auto p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Model:</span>
              <span className="text-slate-200 font-mono text-[10px]">openai/gpt-oss-120b</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Embeddings:</span>
              <span className="text-slate-200 font-mono text-[10px]">all-MiniLM-L6-v2</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Vector DB:</span>
              <span className="text-slate-200 font-mono text-[10px]">ChromaDB / LocalStore</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400 pl-14">
          <span className="font-medium text-slate-400">InsightAI v2.0</span>
          <button 
            onClick={() => setShowConfigModal(true)} 
            className="text-blue-400 hover:text-blue-300 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
          >
            Diagnostics ⚙️
          </button>
        </div>
      </aside>

      {/* Main Content Area: Switch between all 5 study views */}
      {activeMainView === "chat" && (
        <ChatWindow 
          filename={filename} 
          chunkCount={chunkCount} 
          onOpenRevisionHub={() => setActiveMainView("quick_revision")}
        />
      )}

      {activeMainView === "quick_revision" && (
        <QuickRevisionHub 
          filename={filename} 
          chunkCount={chunkCount}
          onSwitchToChat={() => setActiveMainView("chat")}
        />
      )}

      {activeMainView === "question_generator" && (
        <QuestionGenerator
          filename={filename}
          chunkCount={chunkCount}
          initialTopic={targetedTopic || undefined}
          onPracticeQuestion={handlePracticeQuestion}
          onSwitchToChat={(q, m) => setActiveMainView("chat")}
        />
      )}

      {activeMainView === "answer_checker" && (
        <AnswerChecker
          filename={filename}
          chunkCount={chunkCount}
          initialQuestion={practiceContext?.question || ""}
          initialMarks={practiceContext?.marks || 5}
          initialTopic={practiceContext?.topic || targetedTopic || "General Unit"}
          onSwitchToRevision={(t) => {
            if (t) setTargetedTopic(t);
            setActiveMainView("quick_revision");
          }}
        />
      )}

      {activeMainView === "study_dashboard" && (
        <StudyDashboard
          filename={filename}
          chunkCount={chunkCount}
          onNavigateToView={handleDashboardNavigate}
        />
      )}

      {/* System Diagnostics Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg bg-slate-800"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>⚙️</span> System & Environment Status
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Real-time connectivity report for Vector DB & LLM inference services.
            </p>

            <div className="space-y-3 text-xs mb-5">
              {/* Groq Key */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div>
                  <p className="font-semibold text-slate-200">Groq API Key (LLM)</p>
                  <p className="text-[10px] text-slate-400 font-mono">GROQ_API_KEY</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                  sysStatus?.environment?.hasGroqKey 
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}>
                  {sysStatus?.environment?.hasGroqKey ? "Configured ✓" : "Missing ✗"}
                </span>
              </div>

              {/* HuggingFace Key */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div>
                  <p className="font-semibold text-slate-200">HuggingFace Embeddings</p>
                  <p className="text-[10px] text-slate-400 font-mono">HUGGINGFACE_API_KEY</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                  sysStatus?.environment?.hasHuggingFaceKey 
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}>
                  {sysStatus?.environment?.hasHuggingFaceKey ? "Configured ✓" : "Optional (Rate Limited)"}
                </span>
              </div>

              {/* ChromaDB Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div>
                  <p className="font-semibold text-slate-200">ChromaDB Vector Store</p>
                  <p className="text-[10px] text-slate-400 font-mono">{sysStatus?.environment?.chromaPath || "http://127.0.0.1:8000"}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                  sysStatus?.database?.status === "connected"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}>
                  {sysStatus?.database?.status === "connected" ? `Connected (${sysStatus.database.totalChunksIndexed} chunks)` : "Disconnected"}
                </span>
              </div>
            </div>

            {/* Quick Key Configuration */}
            {!sysStatus?.environment?.hasGroqKey && (
              <form onSubmit={handleSaveKey} className="mb-4 p-3.5 bg-slate-800/80 border border-blue-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-blue-300">Set GROQ_API_KEY</span>
                  <a 
                    href="https://console.groq.com/keys" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-blue-400 hover:underline"
                  >
                    Get free key ↗
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste gsk_..."
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isSaving || !keyInput.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-all shadow-md cursor-pointer"
                  >
                    {isSaving ? "Saving..." : "Save Key"}
                  </button>
                </div>
                {saveMessage && (
                  <p className={`text-[10px] ${saveMessage.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                    {saveMessage}
                  </p>
                )}
              </form>
            )}

            <div className="p-3 bg-blue-950/40 border border-blue-500/20 rounded-xl text-[11px] text-blue-300 leading-relaxed mb-4">
              💡 <strong>Configuration Guide:</strong> Open <code className="px-1.5 py-0.5 bg-slate-800 text-blue-200 font-mono rounded text-[10px]">pdf-chatbot/.env.local</code> and set <code className="px-1.5 py-0.5 bg-slate-800 text-emerald-300 font-mono rounded text-[10px]">GROQ_API_KEY=gsk_your_key_here</code>.
            </div>

            <div className="flex gap-2">
              <button
                onClick={fetchStatus}
                disabled={isRefreshing}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <span>{isRefreshing ? "⏳" : "🔄"}</span>
                <span>{isRefreshing ? "Checking..." : "Refresh Status"}</span>
              </button>
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition-colors cursor-pointer"
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
