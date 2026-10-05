"use client";

import React, { useState, useEffect } from "react";
import { getStudyProgress, StudyProgressState } from "@/lib/studyProgress";

interface StudyDashboardProps {
  filename: string | null;
  chunkCount: number;
  onNavigateToView?: (view: "chat" | "quick_revision" | "question_generator" | "answer_checker", topic?: string) => void;
}

export default function StudyDashboard({
  filename,
  chunkCount,
  onNavigateToView,
}: StudyDashboardProps) {
  const [progressState, setProgressState] = useState<StudyProgressState>(getStudyProgress());

  // Listen for real-time progress updates across the application
  useEffect(() => {
    const handleProgressUpdate = () => {
      setProgressState(getStudyProgress());
    };

    window.addEventListener("insightai_study_progress_updated", handleProgressUpdate);
    window.addEventListener("storage", handleProgressUpdate);
    return () => {
      window.removeEventListener("insightai_study_progress_updated", handleProgressUpdate);
      window.removeEventListener("storage", handleProgressUpdate);
    };
  }, []);

  const chapters = Object.values(progressState.chapters || {});
  const strongTopics = chapters.filter(c => c.status === "strong" || c.averageScorePercent >= 75);
  const practiceTopics = chapters.filter(c => c.status === "practice" || (c.averageScorePercent >= 50 && c.averageScorePercent < 75));
  const revisionTopics = chapters.filter(c => c.status === "revision" || c.averageScorePercent < 50);

  // Determine the primary topic needing immediate attention for the Recommended Step
  const nextTargetTopic = revisionTopics[0] || practiceTopics[0] || chapters[0] || { name: "Foundational Concepts" };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1322] relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center text-purple-400 font-bold text-lg">
              📊
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Chapter-Wise Study Dashboard</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Feature 7
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time exam readiness analytics, weak-topic detection, and adaptive study recommendations
            </p>
          </div>
        </div>

        {filename && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Document: <strong className="text-slate-200">{filename}</strong> ({chunkCount} Chunks)</span>
          </div>
        )}
      </div>

      {/* Main Dashboard Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Overall Progress Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-950/40 via-slate-900/60 to-slate-900 border border-blue-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Overall Progress</span>
              <span className="text-blue-400 text-base">📈</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{progressState.overallProgress}%</span>
              <span className="text-xs text-emerald-400 font-medium">Exam Ready</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progressState.overallProgress}%` }}
              ></div>
            </div>
          </div>

          {/* Quiz Accuracy Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900 border border-purple-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Quiz & Recall Accuracy</span>
              <span className="text-purple-400 text-base">🎯</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{progressState.quizAccuracy}%</span>
              <span className="text-xs text-slate-400">
                {progressState.questionsCorrect} / {progressState.questionsAttempted} Correct
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${progressState.quizAccuracy}%` }}
              ></div>
            </div>
          </div>

          {/* Answer-Checking Performance Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-900 border border-emerald-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Answer Evaluation Avg</span>
              <span className="text-emerald-400 text-base">✍️</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{progressState.averageAnswerScorePercent}%</span>
              <span className="text-xs text-emerald-400">
                {progressState.answersCheckedCount} answers checked
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${progressState.averageAnswerScorePercent}%` }}
              ></div>
            </div>
          </div>

          {/* Revision Sheet Mastery Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-slate-900 border border-cyan-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Revision Checklist</span>
              <span className="text-cyan-400 text-base">⚡</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                {Math.round((progressState.revisionItemsMastered / (progressState.totalRevisionItems || 20)) * 100)}%
              </span>
              <span className="text-xs text-slate-400">
                {progressState.revisionItemsMastered} / {progressState.totalRevisionItems || 20} Mastered
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${(progressState.revisionItemsMastered / (progressState.totalRevisionItems || 20)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Recommended Next Step Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-purple-950/50 to-slate-900 border border-indigo-500/40 shadow-2xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
              ⚡ Recommended Next Step
            </span>
            <span className="text-xs text-slate-300 font-medium">
              Based on your lowest mastery score in <strong className="text-indigo-300">"{nextTargetTopic.name}"</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">Revise {nextTargetTopic.name}</p>
                <p className="text-[10px] text-slate-400">Review key definitions & difference tables</p>
              </div>
            </div>

            <span className="text-slate-500 font-bold text-sm hidden md:block">→</span>

            <div className="flex-1 min-w-[200px] p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">View Important Topics</p>
                <p className="text-[10px] text-slate-400">Identify high-yield 5M & 10M questions</p>
              </div>
            </div>

            <span className="text-slate-500 font-bold text-sm hidden md:block">→</span>

            <div className="flex-1 min-w-[200px] p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                3
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">Practice & Check Answers</p>
                <p className="text-[10px] text-slate-400">Self-evaluate against PDF criteria</p>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
            <button
              onClick={() => onNavigateToView && onNavigateToView("quick_revision", nextTargetTopic.name)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>⚡ Open Revision Sheet</span>
            </button>
            <button
              onClick={() => onNavigateToView && onNavigateToView("question_generator", nextTargetTopic.name)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700 flex items-center gap-1.5"
            >
              <span>📝 Generate Practice Questions</span>
            </button>
          </div>
        </div>

        {/* 3-Pillar Topic Analysis: Strong, Practice, Revision */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Strong Topics Card */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🌟 Strong Topics</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                {strongTopics.length} Topics
              </span>
            </div>
            <div className="space-y-2">
              {strongTopics.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No topics marked strong yet.</p>
              ) : (
                strongTopics.map((t) => (
                  <div key={t.name} className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/20 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 truncate">✓ {t.name}</p>
                      <p className="text-[10px] text-emerald-400">{t.averageScorePercent}% Mastery Score</p>
                    </div>
                    <button
                      onClick={() => onNavigateToView && onNavigateToView("question_generator", t.name)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold cursor-pointer"
                    >
                      Quiz
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Needs Practice Card */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️ Needs Practice</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                {practiceTopics.length} Topics
              </span>
            </div>
            <div className="space-y-2">
              {practiceTopics.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No topics currently in practice tier.</p>
              ) : (
                practiceTopics.map((t) => (
                  <div key={t.name} className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/20 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 truncate">• {t.name}</p>
                      <p className="text-[10px] text-amber-400">{t.averageScorePercent}% Mastery Score</p>
                    </div>
                    <button
                      onClick={() => onNavigateToView && onNavigateToView("answer_checker", t.name)}
                      className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold cursor-pointer"
                    >
                      Practice
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Needs Revision Card */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🚨 Needs Revision</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold">
                {revisionTopics.length} Topics
              </span>
            </div>
            <div className="space-y-2">
              {revisionTopics.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No critical weak topics detected.</p>
              ) : (
                revisionTopics.map((t) => (
                  <div key={t.name} className="p-2.5 rounded-xl bg-slate-950/80 border border-red-500/20 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 truncate">🚨 {t.name}</p>
                      <p className="text-[10px] text-red-400">{t.averageScorePercent}% Mastery Score</p>
                    </div>
                    <button
                      onClick={() => onNavigateToView && onNavigateToView("quick_revision", t.name)}
                      className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-semibold cursor-pointer"
                    >
                      Revise
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Chapter Progress Breakdown Table */}
        <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Chapter-Wise Preparation Matrix</h3>
              <p className="text-xs text-slate-400">Detailed breakdown of questions attempted, answer scores, and revision readiness</p>
            </div>
            <span className="text-xs text-slate-400">
              {chapters.length} Active Modules
            </span>
          </div>

          <div className="space-y-4">
            {chapters.map((chapter) => (
              <div key={chapter.name} className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                    <span className="text-xs md:text-sm font-bold text-slate-100">{chapter.name}</span>
                    <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${
                      chapter.status === "strong"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : chapter.status === "practice"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-red-500/15 text-red-300 border-red-500/30"
                    }`}>
                      {chapter.status === "strong" ? "Strong" : chapter.status === "practice" ? "Needs Practice" : "Revise"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-extrabold text-white">{chapter.progressPercent}%</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onNavigateToView && onNavigateToView("quick_revision", chapter.name)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        ⚡ Revise
                      </button>
                      <button
                        onClick={() => onNavigateToView && onNavigateToView("question_generator", chapter.name)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        📝 Questions
                      </button>
                      <button
                        onClick={() => onNavigateToView && onNavigateToView("answer_checker", chapter.name)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 text-xs font-medium cursor-pointer"
                      >
                        ✍️ Check Answer
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      chapter.status === "strong"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : chapter.status === "practice"
                        ? "bg-gradient-to-r from-amber-500 to-orange-400"
                        : "bg-gradient-to-r from-red-500 to-pink-500"
                    }`}
                    style={{ width: `${chapter.progressPercent}%` }}
                  ></div>
                </div>

                {/* Bottom stats row */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Questions Attempted: <strong className="text-slate-200">{chapter.questionsAttempted}</strong></span>
                  <span>Accuracy: <strong className="text-slate-200">{chapter.questionsAttempted > 0 ? Math.round((chapter.questionsCorrect / chapter.questionsAttempted) * 100) : 0}%</strong></span>
                  <span>Evaluations: <strong className="text-slate-200">{chapter.answersChecked}</strong></span>
                  <span>Avg Answer Score: <strong className="text-slate-200">{chapter.averageScorePercent}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
