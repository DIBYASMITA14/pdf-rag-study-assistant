"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  getStudyProgress, 
  saveQuestionToBank, 
  removeSavedQuestion, 
  SavedQuestion 
} from "@/lib/studyProgress";

interface SourceItem {
  page: number;
  snippet?: string;
  source?: string;
  distance?: number;
}

interface QuestionGeneratorProps {
  filename: string | null;
  chunkCount: number;
  onPracticeQuestion?: (question: string, marks: number, topic?: string) => void;
  onSwitchToChat?: (question?: string, marks?: number) => void;
  initialTopic?: string;
}

interface ParsedQuestion {
  id: string;
  rawText: string;
  number: number;
  question: string;
  marks: number;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  topic: string;
  type: string;
  source: string;
  guidelines: string;
}

export default function QuestionGenerator({
  filename,
  chunkCount,
  onPracticeQuestion,
  onSwitchToChat,
  initialTopic,
}: QuestionGeneratorProps) {
  // Config state
  const [unitFilter, setUnitFilter] = useState<string>(initialTopic || "All Units");
  const [customUnitInput, setCustomUnitInput] = useState<string>("");
  const [showCustomUnit, setShowCustomUnit] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [marksFilter, setMarksFilter] = useState<"all" | "2" | "5" | "10">("all");
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [generatorMode, setGeneratorMode] = useState<"questions" | "paper">("questions");

  // Output & stream state
  const [rawContent, setRawContent] = useState<string>("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showSavedModal, setShowSavedModal] = useState<boolean>(false);
  const [savedList, setSavedList] = useState<SavedQuestion[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);

  // Sync saved questions
  const refreshSavedQuestions = () => {
    const prog = getStudyProgress();
    setSavedList(prog.savedQuestions || []);
    const idSet = new Set((prog.savedQuestions || []).map(q => q.question.toLowerCase().trim()));
    setSavedIds(idSet);
  };

  useEffect(() => {
    refreshSavedQuestions();
  }, []);

  const effectiveUnit = showCustomUnit && customUnitInput.trim() 
    ? customUnitInput.trim() 
    : unitFilter;

  // Handle Question Generation
  const handleGenerate = async (overrideCount?: number, overrideMode?: "questions" | "paper") => {
    if (!filename) {
      setError("Please upload a study document (PDF) first.");
      return;
    }

    const countToUse = overrideCount || questionCount;
    const modeToUse = overrideMode || generatorMode;
    const examMode = modeToUse === "paper" ? "question_paper" : "question_generator";

    setIsLoading(true);
    setError(null);
    setRawContent("");
    setSources([]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: examMode,
          filename: filename || undefined,
          unitFilter: effectiveUnit === "All Units" ? undefined : effectiveUnit,
          difficulty,
          marksFilter: marksFilter === "all" ? "all" : parseInt(marksFilter, 10),
          count: countToUse,
          question: `Generate ${difficulty} questions for ${effectiveUnit}`,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to generate questions.";
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
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
                  setRawContent(prev => prev + data.token);
                }
                if (data.done) {
                  setIsLoading(false);
                  if (data.sources) setSources(data.sources);
                }
              } catch (e) {
                console.error("Error parsing question stream", e);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Question generator error:", err);
      setError(err?.message || "An unexpected error occurred while generating questions.");
    } finally {
      setIsLoading(false);
    }
  };

  // Parse questions from raw markdown
  const parseQuestions = (content: string): ParsedQuestion[] => {
    if (!content.trim()) return [];
    
    // Split by ### Q or Q[0-9]+:
    const rawBlocks = content.split(/(?=###\s*Q\d+|###\s*Question\s*\d+|\*\*Q\d+:\*\*)/i);
    const parsed: ParsedQuestion[] = [];

    rawBlocks.forEach((block, idx) => {
      if (!block.trim() || (!block.includes("Marks:") && !block.includes("Difficulty:") && !block.includes("Q"))) {
        return;
      }

      const qMatch = block.match(/(?:###\s*Q\d+:?|###\s*Question\s*\d+:?|\*\*Q\d+:\*\*)\s*([^\n\r]+)/i);
      const questionText = qMatch ? qMatch[1].replace(/[*#]/g, "").trim() : `Exam Question #${idx + 1}`;

      const marksMatch = block.match(/Marks:?\s*\*?\*?(\d+)M?/i);
      const marks = marksMatch ? parseInt(marksMatch[1], 10) : (marksFilter === "all" ? 5 : parseInt(marksFilter, 10));

      const diffMatch = block.match(/Difficulty:?\s*\*?\*?(Easy|Medium|Hard)/i);
      const diff = diffMatch ? diffMatch[1] : difficulty;

      const topicMatch = block.match(/Topic\s*(?:\/\s*Chapter)?:?\s*\*?\*?([^\n\r*]+)/i);
      const topic = topicMatch ? topicMatch[1].trim() : effectiveUnit;

      const typeMatch = block.match(/Question\s*Type:?\s*\*?\*?([^\n\r*]+)/i);
      const qType = typeMatch ? typeMatch[1].trim() : "Exam-Oriented";

      const sourceMatch = block.match(/Source\s*(?:Reference)?:?\s*\*?\*?([^\n\r*]+)/i);
      const source = sourceMatch ? sourceMatch[1].trim() : (filename || "Study Material");

      const guidelinesMatch = block.match(/(?:Key\s*Answer\s*Guidelines|Guidelines|Hint):?\s*\*?\*?([^\n\r*]+)/i);
      const guidelines = guidelinesMatch ? guidelinesMatch[1].trim() : "State core definition and structured points.";

      parsed.push({
        id: `q_${idx}_${questionText.slice(0, 20)}`,
        rawText: block,
        number: idx + 1,
        question: questionText,
        marks,
        difficulty: diff,
        topic,
        type: qType,
        source,
        guidelines,
      });
    });

    return parsed;
  };

  const parsedQuestions = parseQuestions(rawContent);

  const handleSave = (q: ParsedQuestion) => {
    saveQuestionToBank({
      question: q.question,
      marks: q.marks,
      difficulty: q.difficulty,
      topic: q.topic,
      source: q.source,
    });
    refreshSavedQuestions();
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1322] relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center text-emerald-400 font-bold text-lg">
              📝
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Automatic Question Generator</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Feature 5
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Exam-oriented question banks & university test papers grounded in {filename || "your document"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              refreshSavedQuestions();
              setShowSavedModal(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <span>💾 Saved Questions</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
              {savedList.length}
            </span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!rawContent}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>🖨️ Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Controls Card */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl shadow-xl space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGeneratorMode("questions")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  generatorMode === "questions"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <span>📋 Question Bank</span>
                <span className="text-[10px] font-normal opacity-80">(Custom count & marks)</span>
              </button>
              <button
                onClick={() => setGeneratorMode("paper")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  generatorMode === "paper"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <span>📜 Question Paper (100M)</span>
                <span className="text-[10px] font-normal opacity-80">(Sections A, B, C)</span>
              </button>
            </div>

            {filename && (
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Active PDF: <strong className="text-slate-200">{filename}</strong> ({chunkCount} Chunks)</span>
              </div>
            )}
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Unit / Topic Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Unit / Chapter
              </label>
              {!showCustomUnit ? (
                <div className="flex gap-1.5">
                  <select
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="All Units">All Units / Entire Document</option>
                    <option value="Chapter 1: Foundations & Core Concepts">Chapter 1: Foundations & Core Concepts</option>
                    <option value="Chapter 2: Architecture & Mechanisms">Chapter 2: Architecture & Mechanisms</option>
                    <option value="Chapter 3: Algorithms & Procedures">Chapter 3: Algorithms & Procedures</option>
                    <option value="Chapter 4: Advanced Principles & Differences">Chapter 4: Advanced Principles & Differences</option>
                  </select>
                  <button
                    onClick={() => setShowCustomUnit(true)}
                    title="Enter custom topic name"
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
                  >
                    ✏️
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customUnitInput}
                    onChange={(e) => setCustomUnitInput(e.target.value)}
                    placeholder="Type topic / chapter name..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500/60 text-xs text-slate-200 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setShowCustomUnit(false);
                      setCustomUnitInput("");
                    }}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Difficulty Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Difficulty Level
              </label>
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-700/80">
                {(["Easy", "Medium", "Hard"] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      difficulty === diff
                        ? diff === "Easy"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : diff === "Medium"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-red-500/20 text-red-300 border border-red-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Marks Filter (for questions mode) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Marks Weightage
              </label>
              <select
                disabled={generatorMode === "paper"}
                value={marksFilter}
                onChange={(e) => setMarksFilter(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 disabled:opacity-50 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All / Mixed Marks (2M, 5M & 10M)</option>
                <option value="2">2 Marks Only (Definition / Fact)</option>
                <option value="5">5 Marks Only (Conceptual / Table)</option>
                <option value="10">10 Marks Only (Comprehensive Essay)</option>
              </select>
            </div>

            {/* Number of Questions */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Number of Questions
              </label>
              <select
                disabled={generatorMode === "paper"}
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 disabled:opacity-50 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={5}>5 Questions (Quick Set)</option>
                <option value={10}>10 Questions (Standard Bank)</option>
                <option value={20}>20 Questions (Exhaustive Bank)</option>
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <div className="pt-2 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {generatorMode === "questions" ? (
                <span>Generating <strong className="text-emerald-400">{questionCount} {difficulty}</strong> questions from <strong className="text-slate-300">{effectiveUnit}</strong></span>
              ) : (
                <span>Generating a complete <strong className="text-emerald-400">3-Hour 100-Mark Question Paper</strong> (Sections A, B, C)</span>
              )}
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={isLoading || !filename}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Generating from PDF...</span>
                </>
              ) : (
                <>
                  <span>⚡ Generate {generatorMode === "paper" ? "Question Paper" : "Questions"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Output Section */}
        {!rawContent && !isLoading && (
          <div className="p-12 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800 text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl">
              📝
            </div>
            <h3 className="text-base font-bold text-slate-200">No Questions Generated Yet</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Select your desired difficulty (Easy, Medium, Hard), marks, and question count above, then click <strong>Generate Questions</strong> to extract university-grade exam questions from your PDF.
            </p>
            <button
              onClick={() => handleGenerate(5, "questions")}
              disabled={!filename}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>🚀 Quick Generate 5 Questions</span>
            </button>
          </div>
        )}

        {/* Streaming / Output Results */}
        {rawContent && (
          <div ref={outputRef} className="space-y-5">
            {/* Header Result Summary */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Generated Results</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  {parsedQuestions.length > 0 ? `${parsedQuestions.length} Questions` : "Generated Paper"}
                </span>
              </div>
              <button
                onClick={() => handleGenerate()}
                disabled={isLoading}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>🔄 Generate More</span>
              </button>
            </div>

            {/* Parsed Question Cards View (when in questions mode) */}
            {generatorMode === "questions" && parsedQuestions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {parsedQuestions.map((q) => {
                  const isSaved = savedIds.has(q.question.toLowerCase().trim());
                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 hover:border-slate-700/90 transition-all shadow-lg space-y-3.5 group"
                    >
                      {/* Card Header & Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                            {q.number}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            q.marks === 2 
                              ? "bg-blue-500/15 text-blue-300 border-blue-500/30" 
                              : q.marks === 5
                              ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                              : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          }`}>
                            {q.marks} Marks
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            q.difficulty === "Easy"
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : q.difficulty === "Medium"
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-red-500/15 text-red-300 border-red-500/30"
                          }`}>
                            {q.difficulty}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-medium">
                            {q.type}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 font-medium">
                          📍 {q.topic}
                        </div>
                      </div>

                      {/* Question Text */}
                      <h4 className="text-sm md:text-base font-semibold text-slate-100 leading-snug">
                        {q.question}
                      </h4>

                      {/* Guidelines / Model Hint */}
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Examiner Expectation & Key Points:
                        </div>
                        <p className="text-slate-300 leading-relaxed">{q.guidelines}</p>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="text-[11px] text-slate-400">
                          {q.source}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(q.question, q.id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                          >
                            {copiedId === q.id ? "✓ Copied" : "📋 Copy"}
                          </button>

                          <button
                            onClick={() => handleSave(q)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                              isSaved
                                ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                            }`}
                          >
                            {isSaved ? "✓ Saved in Bank" : "💾 Save Question"}
                          </button>

                          {onPracticeQuestion && (
                            <button
                              onClick={() => onPracticeQuestion(q.question, q.marks, q.topic)}
                              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span>✍️ Practice This Question</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Full Raw / Question Paper Markdown Render */
              <div className="p-6 md:p-8 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl space-y-4 font-sans leading-relaxed">
                <div className="prose prose-invert max-w-none prose-headings:text-slate-100 prose-strong:text-emerald-300 prose-p:text-slate-300 prose-li:text-slate-300 whitespace-pre-wrap">
                  {rawContent}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved Questions Modal Drawer */}
      {showSavedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">💾 Saved Questions Bank</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  {savedList.length} Questions
                </span>
              </div>
              <button
                onClick={() => setShowSavedModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {savedList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No saved questions yet. Click "Save Question" on any generated item to store it here.
                </div>
              ) : (
                savedList.map((q) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 space-y-2.5 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {q.marks}M
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                          {q.difficulty}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {q.topic}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          removeSavedQuestion(q.id);
                          refreshSavedQuestions();
                        }}
                        title="Remove question"
                        className="text-xs text-red-400 hover:text-red-300 cursor-pointer p-1"
                      >
                        🗑️ Remove
                      </button>
                    </div>

                    <p className="text-sm font-semibold text-slate-200">{q.question}</p>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleCopy(q.question, q.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        {copiedId === q.id ? "✓ Copied" : "📋 Copy"}
                      </button>
                      {onPracticeQuestion && (
                        <button
                          onClick={() => {
                            setShowSavedModal(false);
                            onPracticeQuestion(q.question, q.marks, q.topic);
                          }}
                          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                        >
                          ✍️ Practice Now
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <button
                onClick={() => {
                  const text = savedList.map((q, i) => `${i + 1}. [${q.marks}M] ${q.question} (${q.topic})`).join("\n");
                  handleCopy(text, "all_saved");
                }}
                disabled={savedList.length === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {copiedId === "all_saved" ? "✓ All Copied" : "📋 Copy All Questions"}
              </button>
              <button
                onClick={() => setShowSavedModal(false)}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
