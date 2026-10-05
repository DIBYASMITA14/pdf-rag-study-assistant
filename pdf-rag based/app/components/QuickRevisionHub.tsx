"use client";

import React, { useState, useEffect, useRef } from "react";
import { ExamMode } from "@/lib/query";

interface SourceItem {
  page: number;
  snippet?: string;
  source?: string;
  distance?: number;
}

interface QuickRevisionHubProps {
  filename: string | null;
  chunkCount: number;
  onSwitchToChat?: (initialQuestion?: string, marks?: number) => void;
}

type RevisionSection = 
  | "most_important_topics"
  | "last_minute_revision"
  | "important_questions_answers"
  | "rapid_fire"
  | "important_question_list";

interface SectionContent {
  content: string;
  sources: SourceItem[];
  isLoading: boolean;
  error: string | null;
  lastGeneratedWith?: {
    unit: string;
    marks: string;
  };
}

const SECTION_METADATA: Record<RevisionSection, {
  title: string;
  shortTitle: string;
  icon: string;
  tagline: string;
  badgeColor: string;
  activeColor: string;
}> = {
  most_important_topics: {
    title: "1. Most Important Topics",
    shortTitle: "Important Topics",
    icon: "🔥",
    tagline: "Categorized by Very Important, Important & Moderate with exam reasons",
    badgeColor: "bg-red-500/20 text-red-300 border-red-500/30",
    activeColor: "from-red-600 to-amber-600",
  },
  last_minute_revision: {
    title: "2. Last-Minute Revision Sheet",
    shortTitle: "Revision Sheet",
    icon: "📋",
    tagline: "Definitions, key concepts, formulas, difference tables, keywords & one-liners",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    activeColor: "from-cyan-600 to-blue-600",
  },
  important_questions_answers: {
    title: "3. Important Questions & Answers",
    shortTitle: "Q&A by Marks",
    icon: "📝",
    tagline: "Exam questions with mark-calibrated answers (2M, 5M & 10M)",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    activeColor: "from-blue-600 to-indigo-600",
  },
  rapid_fire: {
    title: "4. Rapid-Fire Revision",
    shortTitle: "Rapid-Fire (10–15 Q&As)",
    icon: "⚡",
    tagline: "10–15 high-speed revision questions for rapid recall & self-quizzing",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    activeColor: "from-amber-600 to-orange-600",
  },
  important_question_list: {
    title: "5. Must-Revise First Question List",
    shortTitle: "Revise First List",
    icon: "🎯",
    tagline: "Prioritized exam questions checklist with marks & weightage",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    activeColor: "from-emerald-600 to-teal-600",
  },
};

export default function QuickRevisionHub({ filename, chunkCount, onSwitchToChat }: QuickRevisionHubProps) {
  const [activeTab, setActiveTab] = useState<RevisionSection>("most_important_topics");
  const [unitFilter, setUnitFilter] = useState<string>("All Units");
  const [customUnitInput, setCustomUnitInput] = useState<string>("");
  const [showCustomUnit, setShowCustomUnit] = useState<boolean>(false);
  const [marksFilter, setMarksFilter] = useState<"all" | "2" | "5" | "10">("all");
  const [copied, setCopied] = useState<boolean>(false);
  
  // Interactive Rapid-Fire Flashcard State
  const [rapidFireViewMode, setRapidFireViewMode] = useState<"flashcards" | "list">("flashcards");
  const [flashcardIndex, setFlashcardIndex] = useState<number>(0);
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);
  const [masteredCards, setMasteredCards] = useState<Set<number>>(new Set());

  // Interactive Checklist State for Tab 5
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());

  // Store contents per section
  const [sectionData, setSectionData] = useState<Record<RevisionSection, SectionContent>>({
    most_important_topics: { content: "", sources: [], isLoading: false, error: null },
    last_minute_revision: { content: "", sources: [], isLoading: false, error: null },
    important_questions_answers: { content: "", sources: [], isLoading: false, error: null },
    rapid_fire: { content: "", sources: [], isLoading: false, error: null },
    important_question_list: { content: "", sources: [], isLoading: false, error: null },
  });

  // Keep track of abort controllers for streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset when document changes
  useEffect(() => {
    setSectionData({
      most_important_topics: { content: "", sources: [], isLoading: false, error: null },
      last_minute_revision: { content: "", sources: [], isLoading: false, error: null },
      important_questions_answers: { content: "", sources: [], isLoading: false, error: null },
      rapid_fire: { content: "", sources: [], isLoading: false, error: null },
      important_question_list: { content: "", sources: [], isLoading: false, error: null },
    });
    setFlashcardIndex(0);
    setRevealAnswer(false);
    setMasteredCards(new Set());
    setCheckedQuestions(new Set());
  }, [filename]);

  // Generate content for a section
  const generateSection = async (section: RevisionSection, overrideUnit?: string, overrideMarks?: string) => {
    if (!filename) return;

    // Abort existing in-flight request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const unitToUse = overrideUnit !== undefined ? overrideUnit : (showCustomUnit ? customUnitInput : unitFilter);
    const marksToUse = overrideMarks !== undefined ? overrideMarks : marksFilter;

    setSectionData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        content: "",
        sources: [],
        isLoading: true,
        error: null,
        lastGeneratedWith: { unit: unitToUse, marks: marksToUse },
      }
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          mode: section,
          filename: filename || undefined,
          unitFilter: unitToUse === "All Units" ? "" : unitToUse,
          marksFilter: marksToUse === "all" ? undefined : marksToUse,
        }),
      });

      if (!res.ok) {
        let errorMsg = "Server error generating revision content.";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {}
        throw new Error(errorMsg);
      }

      if (!res.body) throw new Error("No response stream received.");

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
              const dataStr = line.replace("data: ", "").trim();
              if (!dataStr) continue;

              try {
                const data = JSON.parse(dataStr);
                if (data.token) {
                  setSectionData(prev => ({
                    ...prev,
                    [section]: {
                      ...prev[section],
                      content: prev[section].content + data.token,
                    }
                  }));
                }
                if (data.done) {
                  setSectionData(prev => ({
                    ...prev,
                    [section]: {
                      ...prev[section],
                      isLoading: false,
                      sources: data.sources || [],
                    }
                  }));
                }
              } catch (e) {
                console.error("SSE parse error", e);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error(`Error generating ${section}:`, err);
      setSectionData(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          isLoading: false,
          error: err.message || "Failed to generate content.",
        }
      }));
    }
  };

  // Auto-generate active tab if empty when user switches to it
  useEffect(() => {
    if (filename && !sectionData[activeTab].content && !sectionData[activeTab].isLoading && !sectionData[activeTab].error) {
      generateSection(activeTab);
    }
  }, [activeTab, filename]);

  const handleCopySection = async () => {
    const text = sectionData[activeTab].content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentSectionMeta = SECTION_METADATA[activeTab];
  const currentData = sectionData[activeTab];

  // Parse Rapid-Fire Q&A pairs for Flashcard mode
  const parseRapidFireQA = (text: string): Array<{ q: string; a: string }> => {
    if (!text) return [];
    const items: Array<{ q: string; a: string }> = [];
    
    // Match patterns like **Q1: ...** or Q1. ... followed by **Answer:** or Answer:
    const regex = /(?:\*\*Q\d+[:.]?\s*|\bQ\d+[:.]?\s*)([^*]+?)(?:\*\*|\n)\s*(?:\*\*Answer[:.]?\s*|\bAnswer[:.]?\s*)([\s\S]+?)(?=(?:\*\*Q\d+|\bQ\d+[:.]|\n\n\*\*Source:|$))/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const q = match[1].trim();
      const a = match[2].trim().replace(/\*\*Source:[\s\S]*$/, "").trim();
      if (q && a) {
        items.push({ q, a });
      }
    }

    if (items.length === 0) {
      // Fallback split on question marks
      const lines = text.split("\n").filter(l => l.trim().length > 0);
      let currentQ = "";
      for (const line of lines) {
        if (line.includes("Q:") || line.includes("Q.") || line.startsWith("**Q") || line.startsWith("1.") || line.startsWith("2.")) {
          currentQ = line.replace(/^\W+/, "");
        } else if (line.includes("A:") || line.includes("Answer:") || line.startsWith("**A")) {
          if (currentQ) {
            items.push({ q: currentQ, a: line.replace(/^\W+/, "") });
            currentQ = "";
          }
        }
      }
    }

    return items;
  };

  const rapidFireCards = parseRapidFireQA(sectionData.rapid_fire.content);

  // Markdown Table Renderer
  const renderMarkdownTable = (tableText: string, key: string) => {
    const lines = tableText.trim().split("\n");
    if (lines.length < 2) return <p key={key}>{tableText}</p>;

    const parseRow = (line: string) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

    const headers = parseRow(lines[0]);
    const isDivider = (line: string) => /^[|\s\-:]+$/.test(line);
    const bodyStartIndex = isDivider(lines[1]) ? 2 : 1;
    const bodyRows = lines.slice(bodyStartIndex).map((l) => parseRow(l));

    return (
      <div key={key} className="my-4 overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-lg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/90 text-cyan-300">
              {headers.map((h, hIdx) => (
                <th key={hIdx} className="px-4 py-3 font-bold tracking-wide">
                  {renderInlineFormatting(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/80 hover:bg-slate-800/50 transition-colors"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-2.5 text-slate-300 leading-relaxed font-normal">
                    {renderInlineFormatting(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Inline formatting helper
  const renderInlineFormatting = (text: string) => {
    const parts = text.split(/(🔥\s*VERY\s*IMPORTANT|⭐\s*IMPORTANT|🔹\s*MODERATE|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/gi);
    return parts.map((part, index) => {
      const upper = part.toUpperCase();
      if (upper.includes("VERY IMPORTANT") || part.includes("🔥")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold mx-1 shadow-sm">
            🔥 VERY IMPORTANT
          </span>
        );
      }
      if (upper.includes("IMPORTANT") && !upper.includes("VERY") && !upper.includes("POINTS") && !upper.includes("QUESTIONS") || part.includes("⭐")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold mx-1 shadow-sm">
            ⭐ IMPORTANT
          </span>
        );
      }
      if (upper.includes("MODERATE") || part.includes("🔹")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold mx-1 shadow-sm">
            🔹 MODERATE
          </span>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={index} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-xs border border-slate-700/60">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={index} className="italic text-slate-300">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  // Full Rich Content Renderer with Topic Cards, Checklist toggles & formatting
  const formatRevisionContent = (text: string) => {
    if (!text) return null;

    const normalizedContent = text
      .replace(/([^\n])\n(#{1,4}\s)/g, "$1\n\n$2")
      .replace(/(#{1,4}[^\n]+)\n([-*•]|\d+\.)/g, "$1\n\n$2");

    const rawParagraphs = normalizedContent.split(/\n\n+/);

    return rawParagraphs.map((para, pIdx) => {
      const trimmed = para.trim();
      if (!trimmed) return null;

      // Table detection
      if (trimmed.startsWith("|") && trimmed.includes("\n|")) {
        return renderMarkdownTable(trimmed, `p-${pIdx}`);
      }

      // Checkbox list items for "Must-Revise First" (Tab 5)
      if (trimmed.includes("- [ ]") || trimmed.includes("- [x]")) {
        const lines = trimmed.split("\n");
        return (
          <div key={`check-${pIdx}`} className="space-y-2 my-3">
            {lines.map((line, lIdx) => {
              const cleaned = line.replace(/^-\s*\[[ x]\]\s*/, "");
              const qId = `${pIdx}-${lIdx}-${cleaned.slice(0, 30)}`;
              const isChecked = checkedQuestions.has(qId);

              return (
                <div 
                  key={lIdx}
                  onClick={() => {
                    setCheckedQuestions(prev => {
                      const next = new Set(prev);
                      if (next.has(qId)) next.delete(qId);
                      else next.add(qId);
                      return next;
                    });
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 group ${
                    isChecked 
                      ? "bg-emerald-950/30 border-emerald-500/40 text-slate-300 line-through opacity-85" 
                      : "bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-emerald-500/40 text-slate-100 shadow-sm"
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={isChecked}
                    onChange={() => {}}
                    className="mt-1 w-4 h-4 rounded text-emerald-600 bg-slate-800 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="flex-1 text-xs leading-relaxed">
                    {renderInlineFormatting(cleaned)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      // Main Major Headers (# or ##)
      if (trimmed.startsWith("# ") || trimmed.startsWith("## ")) {
        const title = trimmed.replace(/^#{1,2}\s+/, "");
        const isTier1 = title.includes("TIER 1") || title.includes("VERY IMPORTANT") || title.includes("2 MARKS");
        const isTier2 = title.includes("TIER 2") || title.includes("IMPORTANT") || title.includes("5 MARKS");
        const isTier3 = title.includes("TIER 3") || title.includes("MODERATE") || title.includes("10 MARKS");

        return (
          <div key={`h2-${pIdx}`} className="mt-6 mb-3 pt-3 border-t border-slate-800/80 first:mt-2 first:pt-0 first:border-0">
            <h3 className={`text-sm md:text-base font-extrabold tracking-tight flex items-center gap-2 ${
              isTier1 ? "text-red-300" : isTier2 ? "text-amber-300" : isTier3 ? "text-blue-300" : "text-white"
            }`}>
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              {renderInlineFormatting(title)}
            </h3>
          </div>
        );
      }

      // Sub-Headers (### or ####)
      if (trimmed.startsWith("### ") || trimmed.startsWith("#### ")) {
        const title = trimmed.replace(/^#{3,4}\s+/, "");
        return (
          <h4 key={`h3-${pIdx}`} className="text-xs md:text-sm font-bold text-slate-200 mt-4 mb-2 flex items-center gap-1.5">
            <span className="text-cyan-400">▸</span>
            {renderInlineFormatting(title)}
          </h4>
        );
      }

      // Bullet Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
        const lines = trimmed.split("\n").filter(l => l.trim().length > 0);
        return (
          <ul key={`ul-${pIdx}`} className="list-disc list-outside space-y-2 my-3 pl-5 text-xs text-slate-200">
            {lines.map((l, lIdx) => (
              <li key={lIdx} className="leading-relaxed">
                {renderInlineFormatting(l.replace(/^[-*•]\s+/, ""))}
              </li>
            ))}
          </ul>
        );
      }

      // Numbered Lists
      if (/^\d+\.\s+/.test(trimmed)) {
        const lines = trimmed.split("\n").filter(l => l.trim().length > 0);
        return (
          <ol key={`ol-${pIdx}`} className="list-decimal list-outside space-y-2.5 my-3 pl-5 text-xs text-slate-200">
            {lines.map((l, lIdx) => (
              <li key={lIdx} className="leading-relaxed">
                {renderInlineFormatting(l.replace(/^\d+\.\s+/, ""))}
              </li>
            ))}
          </ol>
        );
      }

      // Source Citations
      if (trimmed.startsWith("**Source:**") || trimmed.startsWith("Source:")) {
        return (
          <div key={`src-${pIdx}`} className="mt-5 pt-3 border-t border-slate-800 text-[11px] text-cyan-300 font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span>{renderInlineFormatting(trimmed)}</span>
          </div>
        );
      }

      // Standard Paragraph
      return (
        <p key={`p-${pIdx}`} className="text-xs leading-relaxed mb-3 text-slate-200 font-normal">
          {renderInlineFormatting(trimmed)}
        </p>
      );
    });
  };

  if (!filename) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0e1322]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 shadow-xl shadow-cyan-500/20 mb-5 flex items-center justify-center">
          <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-cyan-400 font-bold text-2xl">
            ⚡
          </div>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Quick Revision & Important Questions</h3>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          Please upload a PDF study material or syllabus in the left sidebar to generate topics, cheat-sheets, marks-based question banks, and rapid-fire flashcards.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1322] relative overflow-hidden text-slate-100">
      {/* Top Header & Filter Bar */}
      <div className="px-6 py-3.5 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-20">
        {/* Left: Active Corpus & Feature Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white text-sm shadow-md shadow-cyan-500/20 shrink-0">
            ⚡
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">Quick Revision Hub</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                Exam Ready
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-xs md:max-w-md" title={filename}>
              {filename} ({chunkCount} chunks)
            </p>
          </div>
        </div>

        {/* Right: Unit / Chapter & Marks Filters + Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit / Chapter Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold pl-2">Unit:</span>
            {!showCustomUnit ? (
              <select
                value={unitFilter}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setShowCustomUnit(true);
                  } else {
                    setUnitFilter(e.target.value);
                    generateSection(activeTab, e.target.value);
                  }
                }}
                className="bg-slate-900 text-cyan-300 text-xs font-semibold px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="All Units">All Units / Entire PDF</option>
                <option value="Unit 1">Unit 1</option>
                <option value="Unit 2">Unit 2</option>
                <option value="Unit 3">Unit 3</option>
                <option value="Unit 4">Unit 4</option>
                <option value="Unit 5">Unit 5</option>
                <option value="custom">Custom Chapter / Topic ✏️</option>
              </select>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customUnitInput}
                  onChange={(e) => setCustomUnitInput(e.target.value)}
                  placeholder="e.g. Normalization, ER Model..."
                  className="bg-slate-900 text-cyan-300 text-xs px-2 py-1 rounded-lg border border-cyan-500/50 focus:outline-none w-36"
                />
                <button
                  onClick={() => {
                    if (customUnitInput.trim()) {
                      setUnitFilter(customUnitInput.trim());
                      generateSection(activeTab, customUnitInput.trim());
                    }
                  }}
                  className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    setShowCustomUnit(false);
                    setUnitFilter("All Units");
                    generateSection(activeTab, "All Units");
                  }}
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Marks Filter (for Questions tab) */}
          {activeTab === "important_questions_answers" && (
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <span className="text-[11px] text-slate-400 font-semibold pl-2">Marks:</span>
              <select
                value={marksFilter}
                onChange={(e) => {
                  const val = e.target.value as "all" | "2" | "5" | "10";
                  setMarksFilter(val);
                  generateSection("important_questions_answers", undefined, val);
                }}
                className="bg-slate-900 text-blue-300 text-xs font-bold px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Marks (2M, 5M, 10M)</option>
                <option value="2">2 Marks Only (Short)</option>
                <option value="5">5 Marks Only (Pointwise)</option>
                <option value="10">10 Marks Only (Detailed)</option>
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <button
            onClick={handleCopySection}
            disabled={!currentData.content || currentData.isLoading}
            title="Copy current revision section"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 disabled:opacity-40 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
          >
            {copied ? (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">✓ Copied!</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span className="hidden sm:inline font-medium">Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            disabled={!currentData.content || currentData.isLoading}
            title="Print or Save as PDF"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 disabled:opacity-40 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
            <span className="hidden sm:inline font-medium">Print PDF</span>
          </button>

          <button
            onClick={() => generateSection(activeTab)}
            disabled={currentData.isLoading}
            className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            <span>{currentData.isLoading ? "⏳" : "🔄"}</span>
            <span>{currentData.isLoading ? "Generating..." : "Regenerate"}</span>
          </button>
        </div>
      </div>

      {/* 5 Primary Navigation Tabs */}
      <div className="px-6 pt-3 bg-slate-900/60 border-b border-slate-800/80 backdrop-blur-md z-10 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max pb-3">
          {(Object.keys(SECTION_METADATA) as RevisionSection[]).map((key) => {
            const meta = SECTION_METADATA[key];
            const isActive = activeTab === key;
            const hasData = Boolean(sectionData[key].content);

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer relative ${
                  isActive
                    ? `bg-gradient-to-r ${meta.activeColor} text-white shadow-lg shadow-cyan-500/20 scale-[1.02]`
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.shortTitle}</span>
                {hasData && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="max-w-4xl mx-auto">
          {/* Section Description Card */}
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950 border border-slate-800/90 shadow-xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{currentSectionMeta.icon}</span>
                <h3 className="text-base font-extrabold text-white">{currentSectionMeta.title}</h3>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${currentSectionMeta.badgeColor}`}>
                  {unitFilter}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {currentSectionMeta.tagline}
              </p>
            </div>

            {/* Specialized Sub-controls for Rapid-Fire (Flashcards vs List Mode) */}
            {activeTab === "rapid_fire" && rapidFireCards.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
                <button
                  onClick={() => setRapidFireViewMode("flashcards")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    rapidFireViewMode === "flashcards"
                      ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🃏 Flashcards Mode
                </button>
                <button
                  onClick={() => setRapidFireViewMode("list")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    rapidFireViewMode === "list"
                      ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📄 Full Q&A List
                </button>
              </div>
            )}

            {/* Checklist Progress for Tab 5 */}
            {activeTab === "important_question_list" && currentData.content && (
              <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs text-emerald-300">
                <span className="font-bold">✓ Progress:</span>
                <span>{checkedQuestions.size} Questions Mastered</span>
              </div>
            )}
          </div>

          {/* Loading Skeleton */}
          {currentData.isLoading && !currentData.content && (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-spin">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Analyzing Study Material & Generating...</h4>
                <p className="text-xs text-slate-400 mt-1">Grounding questions, definitions, and high-yield topics directly in {filename}...</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {currentData.error && (
            <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs mb-4 flex items-start gap-3">
              <span className="text-base">⚠️</span>
              <div>
                <p className="font-bold">Generation failed</p>
                <p className="mt-0.5 opacity-90">{currentData.error}</p>
                <button
                  onClick={() => generateSection(activeTab)}
                  className="mt-2.5 px-3 py-1 bg-red-800/80 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
                >
                  Retry Generation
                </button>
              </div>
            </div>
          )}

          {/* Specialized Interactive Flashcard View for Rapid Fire */}
          {activeTab === "rapid_fire" && rapidFireViewMode === "flashcards" && rapidFireCards.length > 0 ? (
            <div className="flex flex-col items-center gap-6 py-4 animate-in fade-in duration-300">
              {/* Progress Indicator */}
              <div className="w-full flex items-center justify-between text-xs text-slate-400 font-semibold px-2">
                <span>Question {flashcardIndex + 1} of {rapidFireCards.length}</span>
                <span className="text-amber-400">Mastered: {masteredCards.size} / {rapidFireCards.length}</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${((flashcardIndex + 1) / rapidFireCards.length) * 100}%` }}
                />
              </div>

              {/* Active Flashcard Card */}
              <div className="w-full min-h-[260px] rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border-2 border-amber-500/40 p-6 md:p-8 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                      ⚡ Rapid Question #{flashcardIndex + 1}
                    </span>
                    {masteredCards.has(flashcardIndex) && (
                      <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                        ✓ Mastered
                      </span>
                    )}
                  </div>

                  <h3 className="text-base md:text-lg font-bold text-white leading-relaxed">
                    {rapidFireCards[flashcardIndex].q}
                  </h3>

                  {/* Answer Section */}
                  {revealAnswer ? (
                    <div className="mt-6 p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-slate-200 text-sm leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200 font-medium">
                      <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">Model Answer:</p>
                      {rapidFireCards[flashcardIndex].a}
                    </div>
                  ) : (
                    <div className="mt-8 text-center py-6">
                      <button
                        onClick={() => setRevealAnswer(true)}
                        className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95"
                      >
                        👁️ Reveal Answer (Self-Test)
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Controls */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-800/80 mt-4 flex-wrap gap-2">
                  <button
                    disabled={flashcardIndex === 0}
                    onClick={() => {
                      setFlashcardIndex(prev => Math.max(0, prev - 1));
                      setRevealAnswer(false);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {revealAnswer && (
                      <button
                        onClick={() => {
                          setMasteredCards(prev => {
                            const next = new Set(prev);
                            if (next.has(flashcardIndex)) next.delete(flashcardIndex);
                            else next.add(flashcardIndex);
                            return next;
                          });
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          masteredCards.has(flashcardIndex)
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 hover:bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {masteredCards.has(flashcardIndex) ? "✓ Mastered" : "Mark as Mastered ✅"}
                      </button>
                    )}

                    <button
                      disabled={flashcardIndex >= rapidFireCards.length - 1}
                      onClick={() => {
                        setFlashcardIndex(prev => Math.min(rapidFireCards.length - 1, prev + 1));
                        setRevealAnswer(false);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold disabled:opacity-30 transition-all shadow-md cursor-pointer"
                    >
                      Next Question →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Standard Content View */
            currentData.content && (
              <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-2xl relative">
                {formatRevisionContent(currentData.content)}

                {currentData.isLoading && (
                  <div className="flex items-center gap-1.5 mt-4 text-cyan-400 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                    <span>Streaming revision notes...</span>
                  </div>
                )}
              </div>
            )
          )}

          {/* Citations Footer */}
          {currentData.sources && currentData.sources.length > 0 && (
            <div className="mt-6 p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                PDF Verified Citations:
              </span>
              {currentData.sources.map((s, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-500/30 text-[10px] font-medium"
                >
                  Page {s.page}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
