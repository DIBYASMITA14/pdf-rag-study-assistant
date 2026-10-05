"use client";

import React, { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";
import { ExamMode } from "@/lib/query";

interface SourceItem {
  page: number;
  snippet?: string;
  source?: string;
  distance?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  streaming?: boolean;
  marks?: number;
  mode?: ExamMode;
}

interface ChatWindowProps {
  filename: string | null;
  chunkCount: number;
  onOpenRevisionHub?: () => void;
}

const MARK_OPTIONS = [
  { value: 2, label: "2 Marks", badge: "2M", desc: "Short definition / paragraph + 1–2 key points (~3–5 lines)" },
  { value: 3, label: "3 Marks", badge: "3M", desc: "Definition + brief explanation + 1 example (~5–8 lines)" },
  { value: 5, label: "5 Marks", badge: "5M", desc: "Intro/definition + 4–5 main points (or comparison table) + example + conclusion" },
  { value: 8, label: "8 Marks", badge: "8M", desc: "In-depth explanation + core concepts/steps + text flow diagram + trade-offs" },
  { value: 10, label: "10 Marks", badge: "10M", desc: "Full University Exam: Intro, headings, step-by-step mechanism, diagram, analysis, conclusion" },
  { value: 15, label: "15 Marks", badge: "15M", desc: "Comprehensive Major Essay: Full architecture, numbered procedure, comparison matrix, case study, conclusion" },
  { value: 1, label: "1 Mark", badge: "1M", desc: "1–2 concise sentences / direct definition" },
];

export default function ChatWindow({ filename, chunkCount, onOpenRevisionHub }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedMarks, setSelectedMarks] = useState<number>(5);
  const [activeMode, setActiveMode] = useState<ExamMode>("chat");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sampleQuestions = [
    { text: "Differentiate 2NF and 3NF Normalization", mark: 5, label: "5M Difference" },
    { text: "What is DBMS?", mark: 2, label: "2M Definition" },
    { text: "Explain Normalization in DBMS with its normal forms", mark: 10, label: "10M Long Answer" },
    { text: "Explain Deadlock and the four necessary conditions", mark: 8, label: "8M Process" },
    { text: "Comprehensive breakdown of Relational Database Design", mark: 15, label: "15M Major Essay" },
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Reset messages when a new file is uploaded
  useEffect(() => {
    setMessages([]);
  }, [filename]);

  const handleSend = async (customText?: string, overrideMarks?: number, overrideMode?: ExamMode) => {
    const textToSend = (customText !== undefined ? customText : input).trim();
    const modeToUse = overrideMode || activeMode;
    
    // For specialized modes with empty input, provide a descriptive placeholder prompt
    let queryPrompt = textToSend;
    let userDisplayTitle = textToSend;

    if (!queryPrompt) {
      if (modeToUse === "important_points") {
        queryPrompt = "Extract and structure all Important Exam Points from this document";
        userDisplayTitle = "⭐ Generate Important Exam Points";
      } else if (modeToUse === "quick_revision") {
        queryPrompt = "Generate the Quick Revision Guide for this document";
        userDisplayTitle = "⚡ Generate Quick Revision Guide";
      } else if (modeToUse === "generate_questions") {
        queryPrompt = "Generate categorized exam questions (2M, 5M, 10M) for this document";
        userDisplayTitle = "📝 Generate Exam Question Bank";
      } else {
        return;
      }
    }

    if (isStreaming) return;
    
    const marksForQuery = overrideMarks || selectedMarks;
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: "user", 
      content: userDisplayTitle, 
      marks: modeToUse === "chat" ? marksForQuery : undefined,
      mode: modeToUse,
    };
    const botMsgId = (Date.now() + 1).toString();
    const initialBotMsg: Message = { 
      id: botMsgId, 
      role: "assistant", 
      content: "", 
      streaming: true,
      marks: modeToUse === "chat" ? marksForQuery : undefined,
      mode: modeToUse,
    };
    
    setMessages(prev => [...prev, userMsg, initialBotMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question: queryPrompt,
          marks: marksForQuery,
          mode: modeToUse,
          filename: filename || undefined,
        }),
      });

      if (!res.ok) {
        let errorMsg = "Could not retrieve response from server.";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {}
        throw new Error(errorMsg);
      }

      if (!res.body) throw new Error("No response stream available.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "");
              if (!dataStr.trim()) continue;
              
              try {
                const data = JSON.parse(dataStr);
                if (data.token) {
                  setMessages(prev => prev.map(msg => 
                    msg.id === botMsgId ? { ...msg, content: msg.content + data.token } : msg
                  ));
                }
                if (data.done) {
                  setMessages(prev => prev.map(msg => 
                    msg.id === botMsgId ? { 
                      ...msg, 
                      streaming: false, 
                      sources: data.sources,
                      marks: data.marks || (modeToUse === "chat" ? marksForQuery : undefined),
                      mode: data.mode || modeToUse,
                    } : msg
                  ));
                  setIsStreaming(false);
                }
              } catch (e) {
                console.error("Error parsing SSE data", e);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Chat error", error);
      setIsStreaming(false);
      const errMsg = error?.message || "Could not fetch response from server.";
      setMessages(prev => prev.map(msg => 
        msg.id === botMsgId ? { ...msg, content: `⚠️ ${errMsg}`, streaming: false } : msg
      ));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const currentMarkInfo = MARK_OPTIONS.find(m => m.value === selectedMarks) || MARK_OPTIONS[2];

  if (!filename) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0e1322] relative overflow-hidden">
        {/* Ambient Glowing Background */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative max-w-xl flex flex-col items-center">
          {/* Logo Badge */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 p-0.5 shadow-xl shadow-blue-500/20 mb-6 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-white mb-3">
            Upload Study Material to Begin
          </h2>
          <p className="text-sm text-slate-400 max-w-md leading-relaxed mb-8">
            Upload your syllabus or study PDF in the left sidebar to generate <strong className="text-slate-200">2M–15M exam answers, Important Exam Points, Quick Revision guides, and Question banks</strong>.
          </p>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full text-left">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center text-xs font-bold mb-2">
                🎓
              </div>
              <h4 className="text-xs font-semibold text-slate-200">2M–15M Answers</h4>
              <p className="text-[10px] text-slate-400 mt-1">Automatic tables, steps, paragraphs & keywords</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center text-xs font-bold mb-2">
                ⭐
              </div>
              <h4 className="text-xs font-semibold text-slate-200">Important Points</h4>
              <p className="text-[10px] text-slate-400 mt-1">10-point breakdown with ⭐/🟡/⚪ priority tiers</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold mb-2">
                ⚡
              </div>
              <h4 className="text-xs font-semibold text-slate-200">Quick Revision</h4>
              <p className="text-[10px] text-slate-400 mt-1">Module-wise high-yield exam cheat sheets</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-bold mb-2">
                📝
              </div>
              <h4 className="text-xs font-semibold text-slate-200">Question Bank</h4>
              <p className="text-[10px] text-slate-400 mt-1">Probable 2M, 5M, 10M & 15M questions from PDF</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1322] relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-3 bg-slate-900/70 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
          <div className="min-w-0">
            <span className="text-xs font-medium text-slate-400">Study Corpus: </span>
            <span className="text-xs font-semibold text-slate-200 truncate" title={filename}>{filename}</span>
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {chunkCount} chunks indexed
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Reset Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth z-10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center animate-in fade-in duration-500">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            
            <h3 className="text-lg font-semibold text-slate-200 mb-1">Exam Study Assistant Ready</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed max-w-md">
              Choose an exam tool from below or ask any question from <strong className="text-slate-300 font-medium">"{filename}"</strong>:
            </p>

            {/* Quick Action Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mb-3">
              <button
                onClick={() => handleSend("", undefined, "important_points")}
                className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-500/60 text-left transition-all group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
                  <span>⭐</span>
                  <span>Important Points</span>
                </div>
                <p className="text-[11px] text-slate-400">10-point breakdown with ⭐/🟡/⚪ priority tiers</p>
              </button>

              <button
                onClick={() => handleSend("", undefined, "quick_revision")}
                className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-500/60 text-left transition-all group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 mb-1">
                  <span>⚡</span>
                  <span>Quick Revision</span>
                </div>
                <p className="text-[11px] text-slate-400">High-yield module summary & revision bullets</p>
              </button>

              <button
                onClick={() => handleSend("", undefined, "generate_questions")}
                className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/30 hover:border-emerald-500/60 text-left transition-all group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 mb-1">
                  <span>📝</span>
                  <span>Generate Questions</span>
                </div>
                <p className="text-[11px] text-slate-400">Probable exam questions (2M / 5M / 10M)</p>
              </button>
            </div>

            {/* Direct Quick Revision Hub Launch Banner */}
            {onOpenRevisionHub && (
              <button
                onClick={onOpenRevisionHub}
                className="w-full mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-blue-950/50 to-indigo-950/60 border border-cyan-500/40 hover:border-cyan-400 text-left transition-all flex items-center justify-between group cursor-pointer shadow-lg shadow-cyan-950/40"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-base shadow-md shadow-cyan-500/30 shrink-0">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white">Open Quick Revision & Important Questions Hub</span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300 text-[9px] font-bold border border-cyan-400/30">5-in-1 Tool</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Topics Breakdown, Last-Minute Cheat Sheet, Marks Q&A, Rapid-Fire Flashcards & Priority List
                    </p>
                  </div>
                </div>
                <span className="text-cyan-400 font-bold text-sm group-hover:translate-x-1 transition-transform mr-1">→</span>
              </button>
            )}

            {/* Sample Questions */}
            <div className="w-full text-left">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Starter Exam Questions:</p>
              <div className="flex flex-col gap-2 w-full">
                {sampleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveMode("chat");
                      setSelectedMarks(q.mark);
                      handleSend(q.text, q.mark, "chat");
                    }}
                    className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/40 text-slate-300 hover:text-white text-xs font-medium transition-all flex items-center justify-between group shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold shrink-0">
                        {q.label}
                      </span>
                      <span className="truncate">{q.text}</span>
                    </div>
                    <span className="text-slate-500 group-hover:text-blue-400 transition-colors ml-2 shrink-0">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full pb-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} {...msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Floating Input Area with Mode Selector & Marks Control */}
      <div className="p-4 md:p-6 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/90 to-transparent z-20">
        <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
          {/* Exam Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveMode("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeMode === "chat"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <span>💬</span>
              <span>Ask Question</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("important_points")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeMode === "important_points"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <span>⭐</span>
              <span>Important Exam Points</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("quick_revision")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeMode === "quick_revision"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <span>⚡</span>
              <span>Quick Revision</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("generate_questions")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                activeMode === "generate_questions"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <span>📝</span>
              <span>Generate Questions</span>
            </button>
          </div>

          {/* Mode-Specific Sub-Controls */}
          {activeMode === "chat" && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>🎓</span>
                  <span>Answer for:</span>
                </span>

                {/* Dropdown Selector */}
                <div className="relative inline-block">
                  <select
                    value={selectedMarks}
                    onChange={(e) => setSelectedMarks(Number(e.target.value))}
                    className="appearance-none bg-slate-800 hover:bg-slate-750 text-blue-300 text-xs font-bold pl-3 pr-8 py-1.5 rounded-lg border border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shadow-sm transition-all"
                    aria-label="Select exam answer marks"
                  >
                    {MARK_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                        {opt.label} ({opt.badge})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-blue-400 text-[10px]">
                    ▼
                  </div>
                </div>
              </div>

              {/* Quick-select Mark Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                {MARK_OPTIONS.map((opt) => {
                  const isActive = selectedMarks === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedMarks(opt.value)}
                      title={opt.desc}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-blue-400"
                          : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/50"
                      }`}
                    >
                      {opt.badge}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeMode === "chat" && (
            <div className="px-3 flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <strong className="text-slate-300 font-semibold">{currentMarkInfo.label}:</strong> {currentMarkInfo.desc}
              </span>
            </div>
          )}

          {/* Main Input Textarea & Send Button */}
          <div className="relative flex items-end gap-2.5 p-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeMode === "chat"
                  ? `Ask a question for a ${selectedMarks}-Mark answer (e.g. 'Differentiate 2NF and 3NF', 'What is DBMS?')...`
                  : activeMode === "important_points"
                  ? `Enter specific topic to analyze (or leave empty to analyze full document)...`
                  : activeMode === "quick_revision"
                  ? `Enter module/topic for quick revision (or leave empty for full revision guide)...`
                  : `Enter topic for question generation (or leave empty for complete question bank)...`
              }
              className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none outline-none py-2.5 px-3.5 text-sm text-slate-100 placeholder:text-slate-500"
              rows={1}
              disabled={isStreaming}
            />
            
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || (activeMode === "chat" && !input.trim())}
              className={`mb-1 mr-1 px-3.5 py-2.5 text-white rounded-xl disabled:opacity-40 transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0 font-medium text-xs cursor-pointer ${
                activeMode === "important_points"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
                  : activeMode === "quick_revision"
                  ? "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500"
                  : activeMode === "generate_questions"
                  ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
              }`}
              title={
                activeMode === "chat"
                  ? `Ask question for ${selectedMarks} Marks (Enter)`
                  : activeMode === "important_points"
                  ? `Extract Important Exam Points`
                  : activeMode === "quick_revision"
                  ? `Generate Quick Revision Guide`
                  : `Generate Exam Questions`
              }
            >
              {isStreaming ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : activeMode === "chat" ? (
                <>
                  <span>Ask ({selectedMarks}M)</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </>
              ) : activeMode === "important_points" ? (
                <>
                  <span>⭐ Extract Points</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              ) : activeMode === "quick_revision" ? (
                <>
                  <span>⚡ Quick Revision</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              ) : (
                <>
                  <span>📝 Generate Questions</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              )}
            </button>
          </div>
        </div>
        
        <p className="text-center text-[11px] text-slate-500 mt-2.5 font-medium">
          InsightAI grounds all exam answers, points, and questions strictly in your active PDF document.
        </p>
      </div>
    </div>
  );
}
