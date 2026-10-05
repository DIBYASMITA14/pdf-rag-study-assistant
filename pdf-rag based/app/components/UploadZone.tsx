"use client";

import React, { useState, useRef } from "react";

interface UploadZoneProps {
  onUploadComplete: (filename: string, chunkCount: number) => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{ name: string; chunks: number; size: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFile = (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    if (!isPdf) {
      setStatus("error");
      setErrorMsg("Only PDF documents (.pdf) are supported.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setStatus("error");
      setErrorMsg("File exceeds the 20MB maximum size limit.");
      return;
    }
    
    setStatus("uploading");
    setProgress(15);
    setErrorMsg("");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Map 0-100% upload to 15-85% overall progress
        const percent = 15 + Math.round((e.loaded / e.total) * 70);
        setProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (!res.chunkCount || res.chunkCount === 0) {
            setStatus("error");
            setErrorMsg("No readable text chunks could be extracted from this PDF.");
            return;
          }
          setProgress(100);
          setTimeout(() => {
            setStatus("success");
            setUploadedFile({
              name: res.filename || file.name,
              chunks: res.chunkCount,
              size: formatFileSize(file.size),
            });
            onUploadComplete(res.filename || file.name, res.chunkCount);
          }, 300);
        } catch {
          setStatus("error");
          setErrorMsg("Failed to parse server response.");
        }
      } else {
        setStatus("error");
        try {
          const res = JSON.parse(xhr.responseText);
          setErrorMsg(res.error || "Failed to process and ingest PDF.");
        } catch {
          setErrorMsg("An unexpected server error occurred during upload.");
        }
      }
    };

    xhr.onerror = () => {
      setStatus("error");
      setErrorMsg("Network error: Could not reach backend server.");
    };

    const formData = new FormData();
    formData.append("pdf", file);
    xhr.send(formData);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearDoc = async () => {
    setStatus("idle");
    setUploadedFile(null);
    setErrorMsg("");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    try {
      await fetch("/api/clear", { method: "DELETE" });
    } catch (e) {
      console.error("Failed to clear vector store:", e);
    }
    onUploadComplete("", 0);
  };

  if (status === "success" && uploadedFile) {
    return (
      <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-4 bg-gradient-to-br from-emerald-950/50 to-slate-900/60 border border-emerald-500/30 rounded-2xl shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Document Ready</p>
              <p className="text-sm font-medium text-slate-100 truncate mt-0.5" title={uploadedFile.name}>
                {uploadedFile.name}
              </p>
              
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                  {uploadedFile.chunks} vectors
                </span>
                <span className="text-[11px] text-slate-400">
                  {uploadedFile.size}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={clearDoc}
          className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 rounded-xl transition-all duration-150 font-medium text-xs flex items-center justify-center gap-2 shadow-sm hover:border-slate-600 active:scale-[0.98]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Upload Different PDF
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-200 cursor-pointer border-2 ${
          isDragging 
            ? "border-blue-500 bg-blue-500/10 shadow-[0_0_25px_-5px_rgba(59,130,246,0.3)] scale-[1.01]" 
            : "border-dashed border-slate-700/80 bg-slate-900/40 hover:border-blue-500/50 hover:bg-slate-800/40"
        } ${status === "uploading" ? "pointer-events-none opacity-90" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          accept=".pdf,application/pdf" 
          className="hidden" 
          ref={fileInputRef}
          onChange={(e) => e.target.files && e.target.files[0] && handleFile(e.target.files[0])}
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
            isDragging 
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" 
              : "bg-gradient-to-tr from-slate-800 to-slate-700/80 text-blue-400 border border-slate-600/40 group-hover:border-blue-500/40"
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-200">
              {isDragging ? "Drop PDF file here" : "Click or drag PDF to ingest"}
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF documents up to 20MB</p>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {status === "uploading" && (
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                Ingesting document...
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        )}
      </div>

      {status === "error" && (
        <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs font-medium animate-in fade-in slide-in-from-top-1 flex items-start gap-2.5">
          <svg className="shrink-0 mt-0.5 text-red-400" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div className="flex-1 leading-relaxed">{errorMsg}</div>
          <button onClick={() => setStatus("idle")} className="text-red-400 hover:text-red-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      )}
    </div>
  );
}
