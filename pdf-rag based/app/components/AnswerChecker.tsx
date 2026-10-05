"use client";

import React, { useState, useEffect, useRef } from "react";
import { recordAnswerEvaluation, EvaluatedAnswerRecord } from "@/lib/studyProgress";

interface SourceItem {
  page: number;
  snippet?: string;
  source?: string;
  distance?: number;
}

interface AnswerCheckerProps {
  filename: string | null;
  chunkCount: number;
  initialQuestion?: string;
  initialMarks?: number;
  initialTopic?: string;
  onSwitchToRevision?: (topic?: string) => void;
}

export default function AnswerChecker({
  filename,
  chunkCount,
  initialQuestion = "",
  initialMarks = 5,
  initialTopic = "General Unit",
  onSwitchToRevision,
}: AnswerCheckerProps) {
  // Inputs
  const [question, setQuestion] = useState<string>(initialQuestion);
  const [marks, setMarks] = useState<number>(initialMarks);
  const [studentAnswer, setStudentAnswer] = useState<string>("");
  const [topic, setTopic] = useState<string>(initialTopic);

  // Status & Streaming
  const [evaluationMarkdown, setEvaluationMarkdown] = useState<string>("");
  const [improvedAnswer, setImprovedAnswer] = useState<string>("");
  const [missingPointsOnly, setMissingPointsOnly] = useState<string>("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImproving, setIsImproving] = useState<boolean>(false);
  const [isExtractingMissing, setIsExtractingMissing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active view tab in results
  const [activeResultTab, setActiveResultTab] = useState<"evaluation" | "improved" | "missing">("evaluation");
  const [copied, setCopied] = useState<boolean>(false);

  // Sync if initial props change
  useEffect(() => {
    if (initialQuestion) setQuestion(initialQuestion);
    if (initialMarks) setMarks(initialMarks);
    if (initialTopic) setTopic(initialTopic);
  }, [initialQuestion, initialMarks, initialTopic]);

  const handleEvaluate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!question.trim()) {
      setError("Please enter an exam question to evaluate.");
      return;
    }
    if (!studentAnswer.trim()) {
      setError("Please write or paste your answer for evaluation.");
      return;
    }
    if (!filename) {
      setError("Please upload a study document (PDF) first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setEvaluationMarkdown("");
    setImprovedAnswer("");
    setMissingPointsOnly("");
    setSources([]);
    setActiveResultTab("evaluation");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "answer_checker",
          question: question.trim(),
          studentAnswer: studentAnswer.trim(),
          marks,
          filename: filename || undefined,
          unitFilter: topic || undefined,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to evaluate answer.";
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
      let accumulated = "";

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
                  accumulated += data.token;
                  setEvaluationMarkdown(prev => prev + data.token);
                }
                if (data.done) {
                  setIsLoading(false);
                  if (data.sources) setSources(data.sources);

                  // Extract score from text e.g. "Estimated Score: 7 / 10"
                  const scoreMatch = accumulated.match(/(?:Estimated\s*Score|Score):\s*\*?\*?(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i);
                  const parsedScore = scoreMatch ? parseFloat(scoreMatch[1]) : Math.round(marks * 0.7);

                  // Save into study progress tracking
                  recordAnswerEvaluation({
                    question: question.trim(),
                    marks,
                    score: parsedScore,
                    topic: topic || "General Study Document",
                    strengths: ["Captures core concept"],
                    missingPoints: [],
                    corrections: [],
                    keywords: [],
                    filename: filename || undefined,
                  });
                }
              } catch (e) {
                console.error("Error parsing evaluation stream", e);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Evaluation error:", err);
      setError(err?.message || "Could not evaluate answer. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate Improved Answer
  const handleImproveAnswer = async () => {
    if (!question.trim() || !studentAnswer.trim()) return;
    setIsImproving(true);
    setActiveResultTab("improved");
    setImprovedAnswer("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "improve_answer",
          question: question.trim(),
          studentAnswer: studentAnswer.trim(),
          marks,
          filename: filename || undefined,
          unitFilter: topic || undefined,
        }),
      });

      if (!res.ok) throw new Error("Could not generate improved answer.");
      if (!res.body) throw new Error("No response stream.");

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
                  setImprovedAnswer(prev => prev + data.token);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Improve answer error:", err);
    } finally {
      setIsImproving(false);
    }
  };

  // Show Missing Points Only
  const handleShowMissingPoints = async () => {
    if (!question.trim() || !studentAnswer.trim()) return;
    setIsExtractingMissing(true);
    setActiveResultTab("missing");
    setMissingPointsOnly("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "missing_points",
          question: question.trim(),
          studentAnswer: studentAnswer.trim(),
          marks,
          filename: filename || undefined,
          unitFilter: topic || undefined,
        }),
      });

      if (!res.ok) throw new Error("Could not extract missing points.");
      if (!res.body) throw new Error("No response stream.");

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
                  setMissingPointsOnly(prev => prev + data.token);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Missing points error:", err);
    } finally {
      setIsExtractingMissing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1322] relative overflow-hidden">
      {/* Header Bar */}
      <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center text-blue-400 font-bold text-lg">
              ✍️
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Answer Checker & Improver</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Feature 6
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Evaluates your exam answer against <strong className="text-slate-300">{filename || "uploaded PDF"}</strong> with mark-specific scoring & model improvements
            </p>
          </div>
        </div>

        {filename && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>RAG Grounding: <strong className="text-slate-200">{filename}</strong></span>
          </div>
        )}
      </div>

      {/* Main Form & Results Layout */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Input Card */}
        <form onSubmit={handleEvaluate} className="p-5 md:p-6 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-xl shadow-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Question Input */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>1. Exam Question</span>
                <span className="text-slate-400 font-normal text-[10px]">What question were you asked?</span>
              </label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Explain Dual Mode Operation in Operating Systems with diagram..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Target Marks Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                2. Target Marks
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([2, 5, 10] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMarks(m)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      marks === m
                        ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/20"
                        : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-700/80"
                    }`}
                  >
                    {m} Marks
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student Answer Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                3. Your Written Answer
              </label>
              <div className="text-[11px] text-slate-400">
                <span>{studentAnswer.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span className="mx-1.5">•</span>
                <span className="text-blue-400">
                  {marks === 2 ? "Rubric: 2–4 lines definition & core fact" : marks === 5 ? "Rubric: 4–5 structured points + example" : "Rubric: University long answer (intro, explanation, diagram/steps, conclusion)"}
                </span>
              </div>
            </div>
            <textarea
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              rows={6}
              placeholder="Type or paste your answer here. Our RAG evaluator checks correctness against the PDF, points covered, keywords, and suggests mark-specific improvements without penalizing natural wording..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700/80 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 leading-relaxed transition-colors font-sans"
            />
          </div>

          {/* Submit Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400">
              ⚡ Evaluated strictly against verified content in <strong className="text-slate-300">{filename || "Document"}</strong>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                disabled={isLoading || !question.trim() || !studentAnswer.trim() || !filename}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Evaluating Against PDF...</span>
                  </>
                ) : (
                  <>
                    <span>🔍 Check My Answer ({marks}M)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Evaluation Output Section */}
        {evaluationMarkdown && (
          <div className="p-6 md:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-2xl space-y-6">
            {/* Action Bar / Result Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveResultTab("evaluation")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeResultTab === "evaluation"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <span>📊 Evaluation Report</span>
                </button>

                <button
                  onClick={() => {
                    if (!improvedAnswer) handleImproveAnswer();
                    else setActiveResultTab("improved");
                  }}
                  disabled={isImproving}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeResultTab === "improved"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/30"
                  }`}
                >
                  {isImproving ? (
                    <span>⏳ Generating Model Answer...</span>
                  ) : (
                    <span>⚡ Improve My Answer</span>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (!missingPointsOnly) handleShowMissingPoints();
                    else setActiveResultTab("missing");
                  }}
                  disabled={isExtractingMissing}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeResultTab === "missing"
                      ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                      : "text-amber-300 hover:bg-amber-950/40 border border-amber-500/30"
                  }`}
                >
                  {isExtractingMissing ? (
                    <span>⏳ Extracting Points...</span>
                  ) : (
                    <span>⚠️ Show Missing Points</span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = activeResultTab === "improved" 
                      ? improvedAnswer 
                      : activeResultTab === "missing" 
                      ? missingPointsOnly 
                      : evaluationMarkdown;
                    handleCopy(text);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
            </div>

            {/* Tab 1: Full Evaluation Report */}
            {activeResultTab === "evaluation" && (
              <div className="space-y-6">
                <div className="prose prose-invert max-w-none prose-headings:text-slate-100 prose-strong:text-blue-300 prose-p:text-slate-300 prose-li:text-slate-300 whitespace-pre-wrap leading-relaxed text-sm">
                  {evaluationMarkdown}
                </div>

                {/* Bottom Model Actions */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    Want to see how an examiner would write this for maximum marks?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImproveAnswer}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 cursor-pointer hover:from-emerald-500 hover:to-teal-500 transition-all"
                    >
                      ⚡ Generate Perfect {marks}M Model Answer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Improved Model Answer */}
            {activeResultTab === "improved" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
                  <span>✨ <strong>Full Marks Exam Model Answer ({marks} Marks)</strong> — Preserved your original structure while integrating missing points and technical keywords.</span>
                  <button
                    onClick={() => handleCopy(improvedAnswer)}
                    className="px-2.5 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-100 text-xs font-semibold cursor-pointer"
                  >
                    Copy Answer
                  </button>
                </div>
                <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-100 prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                  {improvedAnswer || "Generating improved answer..."}
                </div>
              </div>
            )}

            {/* Tab 3: Missing Points Only */}
            {activeResultTab === "missing" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs">
                  <span>⚠️ <strong>Points Omitted in Your Submission</strong> — Focus on these definitions and keywords to maximize your score.</span>
                </div>
                <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-100 prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                  {missingPointsOnly || "Extracting missing points..."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
