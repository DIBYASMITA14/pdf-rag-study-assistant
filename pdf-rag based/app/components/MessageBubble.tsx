"use client";

import React, { useState } from "react";

interface SourceItem {
  page: number;
  snippet?: string;
  source?: string;
  distance?: number;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  streaming?: boolean;
  marks?: number;
  mode?: string;
}

export default function MessageBubble({ role, content, sources, streaming, marks, mode }: MessageBubbleProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  const getHeaderBadge = () => {
    if (mode === "most_important_topics") {
      return { icon: "🔥", label: "Most Important Topics", color: "bg-red-500/20 text-red-300 border-red-500/40" };
    }
    if (mode === "last_minute_revision") {
      return { icon: "📋", label: "Last-Minute Revision Sheet", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" };
    }
    if (mode === "important_questions_answers") {
      return { icon: "📝", label: "Important Questions & Answers", color: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
    }
    if (mode === "rapid_fire") {
      return { icon: "⚡", label: "Rapid-Fire Revision (10-15 Q&As)", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
    }
    if (mode === "important_question_list") {
      return { icon: "🎯", label: "Must-Revise First Question List", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
    }
    if (mode === "important_points") {
      return { icon: "⭐", label: "Important Exam Points", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
    }
    if (mode === "quick_revision") {
      return { icon: "⚡", label: "Quick Revision Guide", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" };
    }
    if (mode === "generate_questions") {
      return { icon: "📝", label: "Probable Exam Questions", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
    }
    if (marks) {
      switch (marks) {
        case 1:
          return { icon: "🎓", label: "1 Mark (Concise)", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
        case 2:
          return { icon: "🎓", label: "2 Marks (Short)", color: "bg-teal-500/20 text-teal-300 border-teal-500/30" };
        case 3:
          return { icon: "🎓", label: "3 Marks (Brief + Example)", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" };
        case 5:
          return { icon: "🎓", label: "5 Marks (Structured)", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
        case 8:
          return { icon: "🎓", label: "8 Marks (Detailed + Flow)", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
        case 10:
          return { icon: "🎓", label: "10 Marks (University Exam)", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
        case 15:
          return { icon: "🎓", label: "15 Marks (Comprehensive Essay)", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
        default:
          return { icon: "🎓", label: `${marks} Marks Exam Answer`, color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      }
    }
    return null;
  };

  const badgeInfo = getHeaderBadge();

  // Parse markdown tables
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
      <div key={key} className="my-3 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-950/60 shadow-md">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/80 text-blue-300">
              {headers.map((h, hIdx) => (
                <th key={hIdx} className="px-3.5 py-2 font-semibold tracking-wide">
                  {renderInlineFormatting(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-slate-900/30" : "bg-slate-900/70"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3.5 py-2 text-slate-300 leading-relaxed">
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

  // Formatting for bold, lists, headings, tables, and code blocks
  const formatContent = (text: string) => {
    if (!text) return null;

    // Check for fenced code blocks first
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const blocks: Array<{ type: "text" | "code"; content: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      blocks.push({ type: "code", content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      blocks.push({ type: "text", content: text.slice(lastIndex) });
    }

    return blocks.map((block, bIdx) => {
      if (block.type === "code") {
        return (
          <div key={bIdx} className="my-2.5 p-3 rounded-xl bg-slate-950/90 border border-slate-700/60 overflow-x-auto text-[11px] font-mono text-emerald-300 leading-relaxed shadow-inner">
            <pre className="whitespace-pre">{block.content.trim()}</pre>
          </div>
        );
      }

      // Pre-process text to ensure clean boundary separation for headings and lists
      const normalizedContent = block.content
        .replace(/([^\n])\n(#{1,4}\s)/g, "$1\n\n$2")
        .replace(/(#{1,4}[^\n]+)\n([-*•]|\d+\.)/g, "$1\n\n$2");

      const rawParagraphs = normalizedContent.split(/\n\n+/);
      const paragraphs: string[] = [];

      // Split paragraphs if they contain a header/label followed directly by lists
      for (const p of rawParagraphs) {
        const trimmed = p.trim();
        if (!trimmed) continue;

        // Check if paragraph starts with a label line like "Advantages:" or "**Advantages:**" followed by bullet lines
        const lines = trimmed.split("\n");
        if (lines.length > 1 && !trimmed.startsWith("|") && !trimmed.startsWith("#")) {
          const firstLineIsList = /^[-*•]|\d+\./.test(lines[0].trim());
          const otherLinesAreList = lines.slice(1).some((l) => /^[-*•]|\d+\./.test(l.trim()));

          if (!firstLineIsList && otherLinesAreList) {
            paragraphs.push(lines[0].trim());
            paragraphs.push(lines.slice(1).join("\n").trim());
            continue;
          }
        }
        paragraphs.push(trimmed);
      }

      return paragraphs.map((para, pIdx) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Check if paragraph is a markdown table
        if (trimmed.startsWith("|") && trimmed.includes("\n|")) {
          return renderMarkdownTable(trimmed, `${bIdx}-${pIdx}`);
        }

        // Headings (####, ###, ##, #)
        if (trimmed.startsWith("#### ") || trimmed.startsWith("### ")) {
          const headingText = trimmed.replace(/^#{3,4}\s+/, "");
          const isImportantSection = headingText.includes("Important Points") || headingText.includes("📌");
          const isKeywordsSection = headingText.includes("Keywords") || headingText.includes("🔑");

          return (
            <h4 
              key={`${bIdx}-${pIdx}`} 
              className={`text-xs font-bold mt-4 mb-2 uppercase tracking-wide flex items-center gap-1.5 ${
                isImportantSection 
                  ? "text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20" 
                  : isKeywordsSection
                  ? "text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
                  : "text-blue-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
              {renderInlineFormatting(headingText)}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={`${bIdx}-${pIdx}`} className="text-sm font-bold text-white mt-4 mb-2 pb-1 border-b border-slate-700/60">
              {renderInlineFormatting(trimmed.replace(/^##\s+/, ""))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={`${bIdx}-${pIdx}`} className="text-base font-extrabold text-white mt-4 mb-2 pb-1 border-b border-slate-700/60">
              {renderInlineFormatting(trimmed.replace(/^#\s+/, ""))}
            </h2>
          );
        }

        // Bullet lists
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ") || /^\s*[-*•]\s+/m.test(trimmed)) {
          const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
          return (
            <ul key={`${bIdx}-${pIdx}`} className="list-disc list-outside space-y-1.5 my-2.5 pl-4 text-slate-200">
              {lines.map((line, lIdx) => {
                const cleaned = line.replace(/^\s*[-*•]\s+/, "");
                return (
                  <li key={lIdx} className="leading-relaxed">
                    {renderInlineFormatting(cleaned)}
                  </li>
                );
              })}
            </ul>
          );
        }

        // Numbered lists (1. , 2. )
        if (/^\s*\d+\.\s+/m.test(trimmed)) {
          const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
          return (
            <ol key={`${bIdx}-${pIdx}`} className="list-decimal list-outside space-y-2 my-2.5 pl-4 text-slate-200">
              {lines.map((line, lIdx) => {
                const cleaned = line.replace(/^\s*\d+\.\s+/, "");
                return (
                  <li key={lIdx} className="leading-relaxed">
                    {renderInlineFormatting(cleaned)}
                  </li>
                );
              })}
            </ol>
          );
        }

        // Source line highlighting
        if (trimmed.startsWith("**Source:**") || trimmed.startsWith("Source:")) {
          return (
            <div key={`${bIdx}-${pIdx}`} className="mt-3.5 pt-2.5 border-t border-slate-800 text-[11px] text-blue-300 font-medium flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span>{renderInlineFormatting(trimmed)}</span>
            </div>
          );
        }

        return (
          <p key={`${bIdx}-${pIdx}`} className="leading-relaxed mb-2.5 last:mb-0 text-slate-200">
            {renderInlineFormatting(trimmed)}
          </p>
        );
      });
    });
  };

  const renderInlineFormatting = (text: string) => {
    // Split by priority tags, inline code, bold, italics
    const parts = text.split(/(⭐\s*HIGH\s*PRIORITY|🟡\s*MEDIUM\s*PRIORITY|⚪\s*LOW\s*PRIORITY|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/gi);
    return parts.map((part, index) => {
      const upper = part.toUpperCase();
      if (upper.includes("HIGH PRIORITY") || upper.includes("HIGH") && part.includes("⭐")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold mx-1">
            ⭐ HIGH PRIORITY
          </span>
        );
      }
      if (upper.includes("MEDIUM PRIORITY") || upper.includes("MEDIUM") && part.includes("🟡")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px] font-bold mx-1">
            🟡 MEDIUM PRIORITY
          </span>
        );
      }
      if (upper.includes("LOW PRIORITY") || upper.includes("LOW") && part.includes("⚪")) {
        return (
          <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-700/40 text-slate-300 border border-slate-600/30 text-[10px] font-medium mx-1">
            ⚪ LOW PRIORITY
          </span>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={index} className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 font-mono text-xs border border-slate-700/60">
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

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6 animate-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[90%] md:max-w-[82%] flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-md ${
          isUser 
            ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white" 
            : "bg-slate-800 border border-slate-700 text-blue-400"
        }`}>
          {isUser ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 4.42 7 12 8 12s8-7.58 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
          )}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"} min-w-0 flex-1`}>
          {/* Header Badge */}
          {badgeInfo && (
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badgeInfo.color} shadow-sm`}>
              <span>{badgeInfo.icon}</span>
              <span>{badgeInfo.label}</span>
            </div>
          )}

          <div 
            className={`relative px-5 py-3.5 rounded-2xl shadow-lg text-sm group w-full ${
              isUser 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm" 
                : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-sm backdrop-blur-md"
            }`}
          >
            {content ? formatContent(content) : (streaming ? "" : "...")}
            
            {streaming && (
              <span className="inline-flex items-center gap-1 ml-2 translate-y-0.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
              </span>
            )}

            {!isUser && content && !streaming && (
              <button 
                onClick={handleCopy}
                title="Copy response"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/50 cursor-pointer"
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400"><path d="M20 6 9 17l-5-5"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                )}
              </button>
            )}
          </div>
          
          {/* Citation Badges */}
          {sources && sources.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1 max-w-full">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400 font-medium flex items-center gap-1 mr-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  Citations:
                </span>
                {sources.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setExpandedSource(expandedSource === idx ? null : idx)}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                      expandedSource === idx
                        ? "bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-sm"
                        : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-slate-700/60"
                    }`}
                  >
                    <span>Page {s.page}</span>
                    {s.distance !== undefined && (
                      <span className="text-[9px] opacity-60">({Math.round((1 - s.distance) * 100)}% match)</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Expanded Snippet Preview */}
              {expandedSource !== null && sources[expandedSource]?.snippet && (
                <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-500/30 text-[11px] text-slate-300 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between font-semibold text-blue-400 mb-1">
                    <span>Source Excerpt (Page {sources[expandedSource].page})</span>
                    <button onClick={() => setExpandedSource(null)} className="text-slate-400 hover:text-slate-200">✕</button>
                  </div>
                  <p className="italic text-slate-300 leading-relaxed font-mono text-[10px]">
                    "{sources[expandedSource].snippet}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
