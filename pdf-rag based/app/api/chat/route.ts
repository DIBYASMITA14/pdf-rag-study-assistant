import { NextRequest } from "next/server";
import { executeExamQuery, ExamMode } from "@/lib/query";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      question = "", 
      marks = 5, 
      mode = "chat",
      filename,
      unitFilter,
      marksFilter,
      difficulty,
      count,
      studentAnswer,
    } = body;

    const examMode = (mode as ExamMode) || "chat";

    if (examMode === "chat" && (!question || typeof question !== "string" || !question.trim())) {
      return new Response(JSON.stringify({ error: "No question provided" }), { 
        status: 400, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    const numericMarks = typeof marks === "number" ? marks : parseInt(String(marks), 10) || 5;

    console.log(`[API /api/chat] Mode: ${examMode}, Question: "${question.trim().slice(0, 60)}" (Marks: ${numericMarks}, File: ${filename || "Default"}, Unit: ${unitFilter || "All"}, Diff: ${difficulty || "Default"}, Count: ${count || "Default"})`);
    const result = await executeExamQuery({
      mode: examMode,
      question: question.trim(),
      marks: numericMarks,
      filename,
      unitFilter,
      marksFilter,
      difficulty,
      count: typeof count === "number" ? count : undefined,
      studentAnswer: typeof studentAnswer === "string" ? studentAnswer.trim() : undefined,
    });

    const { answerStream, sources, marks: resolvedMarks, mode: resolvedMode } = result;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of answerStream) {
            const token = chunk.choices[0]?.delta?.content || "";
            if (token) {
              const data = JSON.stringify({ token });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
          }
          // Final chunk with done: true, marks, mode, and sources
          const finalData = JSON.stringify({ 
            done: true, 
            sources, 
            marks: resolvedMarks || numericMarks,
            mode: resolvedMode || examMode,
          });
          controller.enqueue(new TextEncoder().encode(`data: ${finalData}\n\n`));
          controller.close();
        } catch (streamError: any) {
          console.error("[API /api/chat ERROR] Streaming error:", streamError);
          const errorData = JSON.stringify({ 
            token: `\n\n[Error during generation: ${streamError.message}]`, 
            done: true, 
            sources: [],
            marks: resolvedMarks || numericMarks,
            mode: resolvedMode || examMode,
          });
          controller.enqueue(new TextEncoder().encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[API /api/chat ERROR] Request failed:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process exam query." }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
