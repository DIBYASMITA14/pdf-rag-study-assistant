import { embedSingleText } from "./embeddings";
import { queryVectors, getDocumentContext } from "./vectorstore";
import { getEnvVariable } from "./env";
import Groq from "groq-sdk";

export type ExamMarks = 1 | 2 | 3 | 5 | 8 | 10 | 15;
export type ExamMode = 
  | "chat" 
  | "important_points" 
  | "quick_revision" 
  | "generate_questions"
  | "most_important_topics"
  | "last_minute_revision"
  | "important_questions_answers"
  | "rapid_fire"
  | "important_question_list"
  | "question_generator"
  | "question_paper"
  | "answer_checker"
  | "improve_answer"
  | "missing_points";

export interface ExamQueryResult {
  answerStream: any;
  sources: { page: number; snippet: string; source: string }[];
  mode: ExamMode;
  marks?: ExamMarks;
}

// Helper to retrieve document context with optional unit/chapter filter enrichment
async function getContextForRevision(filename?: string, unitFilter?: string, maxChunks = 24): Promise<{ documents: string[]; metadatas: any[] }> {
  if (unitFilter && unitFilter.trim() && !["all", "all units", "entire pdf", "entire document"].includes(unitFilter.trim().toLowerCase())) {
    try {
      console.log(`[Revision Context] Enriching context for unit/topic: "${unitFilter}"...`);
      const queryEmbedding = await embedSingleText(unitFilter.trim());
      const searchRes = await queryVectors(queryEmbedding, maxChunks);
      const docs = searchRes.documents?.[0] || [];
      const metas = searchRes.metadatas?.[0] || [];
      if (docs.length > 0) {
        return { documents: docs as string[], metadatas: metas as any[] };
      }
    } catch (e: any) {
      console.warn(`[Revision Context] Semantic search failed for unit filter, falling back:`, e.message);
    }
  }
  return await getDocumentContext(filename, maxChunks);
}

function getMarkSpecificGuidelines(marks: number): string {
  switch (marks) {
    case 1:
      return `TARGET MARK: 1 MARK
GUIDELINES:
- Length: Exactly 1–2 concise sentences.
- Content: Direct definition or exact core answer only.
- Style: Strictly direct, no introductory filler, no bullet points unless explicitly asked.`;

    case 2:
      return `TARGET MARK: 2 MARKS
GUIDELINES:
- Length: Very short and direct (around 2–4 lines).
- Content: Direct definition or exact concise explanation of the core concept.
- Style: Short, clear paragraph. Strictly do NOT unnecessarily convert simple definitions into bullet points.`;

    case 3:
      return `TARGET MARK: 3 MARKS
GUIDELINES:
- Length: Around 4–7 lines.
- Content: Short explanation paragraph followed by 2–3 crisp, important points or a relevant example.
- Style: Clean, exam-ready structure with clear separation between explanation and key points.`;

    case 5:
      return `TARGET MARK: 5 MARKS
GUIDELINES:
- Length: Moderate length (around 10–15 lines).
- Structure:
  • Short introduction / definition paragraph
  • Main explanation organized into 3–5 distinct points with bold headers (or comparison table if difference question)
  • Practical example or key highlights where relevant
  • Short conclusion or summary
- Style: Well-structured with bold keywords and clearly separated sections.`;

    case 8:
      return `TARGET MARK: 8 MARKS
GUIDELINES:
- Length: Detailed, comprehensive examination answer.
- Structure:
  1. Introduction (concise paragraph setting theoretical background)
  2. Main Explanation (numbered headings with structured explanations)
  3. Key Important Points (bullet list)
  4. Concrete Example / Process Flow
  5. Conclusion / Summary (short paragraph)
- Style: Academic exam presentation with clear section headers.`;

    case 10:
      return `TARGET MARK: 10 MARKS (University Exam Standard)
GUIDELINES:
- Length: Detailed university-grade long answer.
- Structure:
  1. Introduction & Formal Definition / Overview (clear opening paragraph)
  2. Main Detailed Explanation (structured with clear ### Headings and numbered/bulleted sub-points)
  3. Comparison / Mechanism / ASCII Diagram (where applicable)
  4. Important Points to Remember (bullet list)
  5. Real-world Example(s) or Use-Case Walkthrough
  6. Conclusion (short concluding takeaway)
- Style: Highly organized, section-by-section university answer format.`;

    case 15:
    default:
      return `TARGET MARK: 15 MARKS (Comprehensive University Major Question)
GUIDELINES:
- Length: Exhaustive, comprehensive master-level university answer.
- Structure:
  1. Formal Introduction & Theoretical Foundations (short paragraph)
  2. Detailed Conceptual & Architectural Breakdown (with ### Subheadings)
  3. Step-by-Step Procedure / Working Mechanism (numbered sequence)
  4. Comparison Matrix / Markdown Table (if comparison aspects exist)
  5. In-Depth Real-World Example / Case Study
  6. Important Highlights / Best Practices (bullet points)
  7. Final Summary & Conclusion (short paragraph)
- Style: Multi-section exhaustive academic answer layout.`;
  }
}

const QUESTION_FORMAT_RULES = `
QUESTION-SPECIFIC FORMATTING RULES (Choose format strictly based on question type):

1. If the question asks for a DEFINITION ("What is...", "Define..."):
- Give a short, clear paragraph.
- Do NOT unnecessarily convert it into bullet points.
Example:
**Definition:**
Software Engineering is a systematic approach to the development, operation and maintenance of software.

2. If the question asks for DIFFERENCES / COMPARISONS ("Differentiate between...", "Compare...", "Difference between..."):
- Present the comparison as a clean Markdown Comparison Table.
Example:
| Basis / Parameter | Concept A | Concept B |
|---|---|---|
| Meaning | Explanation for A | Explanation for B |
| Purpose | Purpose of A | Purpose of B |
| Application | Use case of A | Use case of B |

3. If the question asks for ADVANTAGES / DISADVANTAGES ("List advantages...", "Pros and cons..."):
- Use clearly separated headings and bullet points on separate lines.
Example:
### Advantages:
• **Point 1**: Explanation...
• **Point 2**: Explanation...
• **Point 3**: Explanation...

### Disadvantages:
• **Point 1**: Explanation...
• **Point 2**: Explanation...
• **Point 3**: Explanation...

4. If the question asks for FEATURES / CHARACTERISTICS ("Features of...", "Properties of..."):
- Use numbered or bullet points with bold keywords.
Example:
### Features:
1. **Feature 1**: Clear explanation...
2. **Feature 2**: Clear explanation...
3. **Feature 3**: Clear explanation...

5. If the question asks to EXPLAIN / DESCRIBE ("Explain...", "Describe..."):
- Use a combination of:
  - Short introduction paragraph
  - Clear sub-headings (### Heading)
  - Numbered/bullet points where appropriate
  - Concrete example if relevant
- Do NOT force the entire answer into bullets.

6. If the question asks for a PROCESS / STEPS / ALGORITHM ("Steps in...", "Explain lifecycle...", "Working of..."):
- Use numbered sequential steps.
Example:
### Steps:
1. **Step 1 Name**: Explanation of first step...
2. **Step 2 Name**: Explanation of second step...
3. **Step 3 Name**: Explanation of third step...

7. For LONG ANSWERS (8, 10, or 15 Marks):
- Use the formal university exam structure:
### Introduction
[Short introductory paragraph]

### Main Explanation
1. **First Dimension / Component**:
   Explanation...

2. **Second Dimension / Component**:
   Explanation...

### Important Points
• Key takeaway 1
• Key takeaway 2

### Example
[Clear concrete example if applicable]

### Conclusion
[Short summarizing paragraph]
`;

const SPACING_AND_GROUNDING_RULES = `
CRITICAL FORMATTING & SPACING RULES:
1. Double Spacing: Always separate headings, paragraphs, bullet lists, and tables with double newlines (\\n\\n). Never merge headings and list items on adjacent lines.
2. Separate Lines: Keep each bullet point (• ) and numbered step (1. ) on its own separate line.
3. No Dense Paragraphs: Do NOT combine multiple distinct points into one long unbroken wall of text.
4. Bold Keywords: Highlight key technical terms using **bold**.
5. No Redundancy: Avoid filler, do not repeat points, and ensure every line adds exam value.
6. Strict Grounding: Ground all statements 100% in the provided Study Material Context. Do NOT hallucinate or extrapolate beyond what is supported.
`;

export async function answerQuestion(question: string, rawMarks: number | string = 5): Promise<ExamQueryResult> {
  const parsed = typeof rawMarks === "string" ? parseInt(rawMarks, 10) : rawMarks;
  const validTiers: ExamMarks[] = [1, 2, 3, 5, 8, 10, 15];
  const marks: ExamMarks = validTiers.includes(parsed as ExamMarks) ? (parsed as ExamMarks) : 5;
  return answerPdfQuestionStream(question, marks);
}

export async function answerPdfQuestionStream(question: string, marks: ExamMarks = 5): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[QUERY START] Question: "${question}" (Exam Marks: ${marks})`);
  console.log(`========================================`);

  // Scale retrieval depth according to marks
  let retrieveCount = 5;
  if (marks <= 2) {
    retrieveCount = 4;
  } else if (marks <= 5) {
    retrieveCount = 6;
  } else if (marks <= 8) {
    retrieveCount = 8;
  } else if (marks <= 10) {
    retrieveCount = 10;
  } else {
    retrieveCount = 14;
  }

  // ----------------------------------------------------
  // STAGE 1: EMBED QUESTION
  // ----------------------------------------------------
  console.log(`[QUERY: EMBED] Generating query embedding...`);
  const queryEmbedding = await embedSingleText(question);
  console.log(`[QUERY: EMBED] Query embedding generated (length: ${queryEmbedding.length}).`);

  // ----------------------------------------------------
  // STAGE 2: RETRIEVE MATCHING VECTORS
  // ----------------------------------------------------
  console.log(`[QUERY: RETRIEVAL] Searching vector store for top ${retrieveCount} matches...`);
  const results = await queryVectors(queryEmbedding, retrieveCount);

  const retrievedDocs = results.documents?.[0] || [];
  const retrievedMetadata = results.metadatas?.[0] || [];
  const distances = results.distances?.[0] || [];

  console.log(`[QUERY: RETRIEVAL] Retrieved ${retrievedDocs.length} matching chunk(s).`);

  // ----------------------------------------------------
  // STAGE 3: BUILD CONTEXT STRING & CITATIONS
  // ----------------------------------------------------
  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string; distance?: number }> = [];
  const distinctPageSet = new Set<string>();

  for (let i = 0; i < retrievedDocs.length; i++) {
    const text = retrievedDocs[i] as string;
    const metadata = retrievedMetadata[i] as { source: string; page: number; chunkIndex: number };
    const distance = distances[i] !== undefined ? distances[i] : undefined;

    if (text && metadata) {
      context += `[Source: ${metadata.source}, Page: ${metadata.page}]\n${text}\n\n`;
      
      const pageKey = `${metadata.source}-p${metadata.page}`;
      if (!distinctPageSet.has(pageKey)) {
        distinctPageSet.add(pageKey);
        sources.push({
          page: metadata.page,
          source: metadata.source,
          snippet: text.substring(0, 140) + "...",
          distance: typeof distance === "number" ? parseFloat(distance.toFixed(4)) : undefined,
        });
      }
    }
  }

  if (sources.length === 0) {
    const fallbackStream = (async function* () {
      yield { 
        choices: [{ 
          delta: { 
            content: "I could not find any relevant information in the uploaded document. Please make sure a PDF document has been uploaded." 
          } 
        }] 
      };
    })();
    return { answerStream: fallbackStream, sources: [], marks, mode: "chat" };
  }

  const uniquePages = Array.from(new Set(sources.map(s => s.page))).sort((a, b) => a - b);
  const primaryDocName = sources[0]?.source || "Uploaded Document";
  const sourceCitationText = uniquePages.length > 0 
    ? `${primaryDocName}, Page ${uniquePages.join(", ")}` 
    : primaryDocName;

  // ----------------------------------------------------
  // STAGE 4: GENERATE ANSWER
  // ----------------------------------------------------
  const groqApiKey = getEnvVariable("GROQ_API_KEY");
  const markGuidelines = getMarkSpecificGuidelines(marks);

  if (groqApiKey && groqApiKey.trim().length > 5) {
    console.log(`[QUERY: LLM] Querying Groq with ${marks} Marks exam instructions...`);
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an expert university examination assistant and academic evaluator.
Your goal is to generate a high-scoring, cleanly structured, exam-oriented answer based ONLY on the provided Study Material Context.

The student requires an answer worth ${marks} MARKS.

${markGuidelines}

${QUESTION_FORMAT_RULES}

${SPACING_AND_GROUNDING_RULES}

ADDITIONAL GUIDANCE:
1. Tone & Format: The answer should look exactly like what a top-ranking student would write in an exam paper.
2. Structure Selection: Automatically detect the question type (definition, difference, advantages/disadvantages, features, process, explanation, or long answer) and strictly follow the corresponding format rule. Do NOT force every answer into bullet points.
3. Insufficient Context: If the uploaded study material does not contain complete details for a ${marks}-mark answer, provide what is verified in the context and append:
   "*(Note: The available study material has limited detail on this topic for a full ${marks}-mark answer.)*"
4. Source Attribution: At the very end of your answer, include the citation line:
   **Source:** ${sourceCitationText}

Study Material Context:
${context}`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Question (${marks} Marks): ${question}` }
      ],
      temperature: 0.1,
      stream: true,
    });

    return { answerStream, sources, marks, mode: "chat" };
  }

  // Fallback if GROQ_API_KEY is not configured: Extractive synthesis
  console.log(`[QUERY: EXTRACTIVE] GROQ_API_KEY not configured. Generating extractive synthesis (${marks} Marks)...`);
  
  let formattedFallback = "";
  if (marks <= 2) {
    formattedFallback = `**Definition / Core Concept:**\n\n${(retrievedDocs[0] || "").trim()}\n\n**Source:** ${sourceCitationText}`;
  } else if (marks <= 5) {
    formattedFallback = `### Core Explanation\n\n${(retrievedDocs[0] || "").trim()}\n\n### Key Points\n\n` +
      retrievedDocs.slice(1, 4).map((doc, idx) => `• **Point ${idx + 1}:** ${(doc || "").trim().slice(0, 160)}...`).join("\n") +
      `\n\n**Source:** ${sourceCitationText}`;
  } else {
    formattedFallback = `### Introduction\n\n${(retrievedDocs[0] || "").trim().slice(0, 220)}...\n\n` +
      `### Main Explanation\n\n` +
      retrievedDocs.slice(1, 4).map((doc, idx) => `${idx + 1}. **Concept ${idx + 1}:**\n   ${(doc || "").trim().slice(0, 200)}...`).join("\n\n") +
      `\n\n### Important Points\n\n` +
      retrievedDocs.slice(4, 7).map((doc, idx) => `• ${(doc || "").trim().slice(0, 140)}...`).join("\n") +
      `\n\n### Conclusion\n\nThe concepts outlined above form the fundamental framework for this topic.\n\n` +
      `**Source:** ${sourceCitationText}`;
  }

  const extractiveStream = (async function* () {
    const tokens = formattedFallback.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, marks, mode: "chat" };
}

// ----------------------------------------------------
// SECTION 1: MOST IMPORTANT TOPICS
// ----------------------------------------------------
export async function generateMostImportantTopics(filename?: string, unitFilter?: string): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[SECTION 1: MOST IMPORTANT TOPICS] Generating for "${filename || 'Active Corpus'}" (Unit: ${unitFilter || 'All'})...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "most_important_topics" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an expert university academic strategist and exam evaluator.
Your task is to identify and categorize the MOST IMPORTANT TOPICS from the provided Study Material Context.

RULES:
1. Identify all key topics strictly present in the uploaded PDF.
2. Categorize every topic into exactly one of three categories:
   - 🔥 VERY IMPORTANT (Fundamental concepts, recurring examination pillars, high-weightage topics)
   - ⭐ IMPORTANT (Key conceptual mechanisms, standard comparison themes, vital sub-modules)
   - 🔹 MODERATE (Supporting definitions, secondary characteristics, supplementary topics)
3. For EACH topic, provide:
   - **Topic Title**
   - **Category Tag** (Very Important / Important / Moderate)
   - **Why It Is Important**: A clear, short 1–2 sentence reason explaining its exam significance based on the PDF.
   - **Key Concepts Covered**: 2–3 crisp bullet points.
   - **Probable Question Types**: e.g., "5 Marks Difference Table", "10 Marks Process Walkthrough", "2 Marks Definition".
4. Strict Grounding: Use ONLY information from the PDF. If a topic is not in the PDF, do NOT mention it.
5. End with the citation line:
   **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Extract and categorize the Most Important Topics focusing on: "${unitFilter}".`
      : `Extract and categorize the Most Important Topics from the entire study material.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, mode: "most_important_topics" };
  }

  // Fallback
  const synthesis = `## 🎯 Most Important Topics Breakdown (${docName})\n\n` +
    `### 🔥 VERY IMPORTANT TOPICS\n\n` +
    `1. **Core Fundamental Concept 1**\n` +
    `   - **Category:** Very Important\n` +
    `   - **Why It Is Important:** Forms the theoretical backbone of this syllabus; essential for 5M and 10M long answers.\n` +
    `   - **Key Concepts:** ${(documents[0] || "").slice(0, 150)}...\n\n` +
    `2. **Core Fundamental Concept 2**\n` +
    `   - **Category:** Very Important\n` +
    `   - **Why It Is Important:** Crucial for understanding key algorithms and comparison questions.\n` +
    `   - **Key Concepts:** ${(documents[1] || "").slice(0, 150)}...\n\n` +
    `### ⭐ IMPORTANT TOPICS\n\n` +
    `1. **Key Sub-System / Mechanism**\n` +
    `   - **Category:** Important\n` +
    `   - **Why It Is Important:** Frequently asked in 5-Mark explanatory questions.\n` +
    `   - **Key Concepts:** ${(documents[2] || "").slice(0, 140)}...\n\n` +
    `### 🔹 MODERATE TOPICS\n\n` +
    `1. **Supporting Definitions & Terminology**\n` +
    `   - **Category:** Moderate\n` +
    `   - **Why It Is Important:** Essential for 2-Mark definition-based questions.\n` +
    `   - **Key Concepts:** ${(documents[3] || "").slice(0, 140)}...\n\n` +
    `**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "most_important_topics" };
}

// ----------------------------------------------------
// SECTION 2: LAST-MINUTE REVISION SHEET
// ----------------------------------------------------
export async function generateLastMinuteRevision(filename?: string, unitFilter?: string): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[SECTION 2: LAST-MINUTE REVISION] Generating for "${filename || 'Active Corpus'}" (Unit: ${unitFilter || 'All'})...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "last_minute_revision" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are a premier university exam revision coach.
Generate a concise, high-yield "LAST-MINUTE REVISION SHEET" strictly from the provided study material.
Keep this sheet short, crisp, highly structured, and easy for students to revise 15 minutes before an examination.

STRUCTURE THE REVISION SHEET INTO THESE 7 EXACT SECTIONS:

## 1. 📌 Important Definitions
- Provide 4–6 crisp, exact formal definitions.
- Format: "• **[Term]**: Concise definition (1–2 sentences)."

## 2. 🧠 Key Concepts
- Provide 4–6 high-impact core concept summaries.
- Format: "• **[Concept Name]**: Core principle and mechanism."

## 3. 📐 Important Formulas / Rules (if applicable)
- Provide all mathematical formulas, syntax, transition rules, or theorems found in the PDF.
- If no formulas exist in the PDF, state "• *No mathematical formulas present in this chapter/document; focus on procedural rules.*"

## 4. ⚖️ Important Differences (Comparison Table)
- Present the most critical differences as a clean Markdown Table.
| Basis / Feature | Concept A | Concept B |
|---|---|---|
| Definition | ... | ... |
| Key Mechanism | ... | ... |
| Advantage | ... | ... |

## 5. 🔑 Key Points to Remember
- 5–8 punchy, high-scoring exam takeaway bullets with bold keywords.

## 6. 🏷️ Important Keywords
- List 6–10 technical terms with one-line meanings.

## 7. 💡 One-Line Explanations
- 5–8 fast single-sentence memory hooks for quick recall before entering the exam hall.

RULES:
- Use bullet points, bold keywords, and clean markdown tables.
- Ground 100% of facts in the provided PDF. Do not invent formulas or definitions.
- Conclude with:
  **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Generate the complete Last-Minute Revision Sheet focusing on: "${unitFilter}".`
      : `Generate the complete Last-Minute Revision Sheet for this study material.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, mode: "last_minute_revision" };
  }

  // Fallback
  const synthesis = `## ⚡ Last-Minute Exam Revision Sheet (${docName})\n\n` +
    `### 1. 📌 Important Definitions\n` +
    `• **Core Concept:** ${(documents[0] || "").slice(0, 160)}...\n\n` +
    `### 2. 🧠 Key Concepts\n` +
    `• **Primary Architecture:** ${(documents[1] || "").slice(0, 160)}...\n\n` +
    `### 3. 📐 Important Formulas / Rules\n` +
    `• *Check procedural equations and algorithms in syllabus.* \n\n` +
    `### 4. ⚖️ Important Differences\n` +
    `| Parameter | Primary Method | Secondary Method |\n` +
    `|---|---|---|\n` +
    `| Basis | Concept 1 | Concept 2 |\n` +
    `| Application | Standard use case | Specialized use case |\n\n` +
    `### 5. 🔑 Key Points to Remember\n` +
    documents.slice(2, 5).map(d => `• **Takeaway:** ${d.slice(0, 130)}...`).join("\n") +
    `\n\n### 6. 🏷️ Important Keywords\n` +
    `• **Keyword 1:** Core technical term.\n` +
    `• **Keyword 2:** Secondary parameter.\n\n` +
    `### 7. 💡 One-Line Explanations\n` +
    `• **Core Recall:** Fundamental theoretical foundation for university exams.\n\n` +
    `**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "last_minute_revision" };
}

// ----------------------------------------------------
// SECTION 3: IMPORTANT QUESTIONS WITH ANSWERS
// ----------------------------------------------------
export async function generateImportantQuestionsWithAnswers(
  filename?: string, 
  unitFilter?: string,
  marksFilter?: number | "all" | string
): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[SECTION 3: QUESTIONS WITH ANSWERS] Generating for "${filename || 'Active Corpus'}" (Unit: ${unitFilter || 'All'}, Marks Filter: ${marksFilter || 'All'})...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "important_questions_answers" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  const normalizedMarks = marksFilter ? String(marksFilter).toLowerCase() : "all";

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are a senior university professor and exam paper evaluator.
Your task is to generate exam-oriented QUESTIONS WITH MODEL ANSWERS strictly derived from the provided Study Material.

CRITICAL RULES FOR ANSWERS BY MARKS:
1. 2 MARKS QUESTIONS (Definition / Fact-based):
   - Answer length: Exactly 2–4 lines.
   - Direct, crisp definition or exact fact. Do NOT write unnecessary long bullets.
2. 5 MARKS QUESTIONS (Conceptual / Difference / Explanatory):
   - Answer length: Around 10–15 lines.
   - Pointwise structured answers (Introduction paragraph, 3–4 points with bold headers, or a Markdown comparison table, brief example).
3. 10 MARKS QUESTIONS (Comprehensive Long Answers / Processes / Architecture):
   - Structured university answer with:
     - ### Introduction & Formal Definition
     - ### Main Detailed Breakdown (numbered/bulleted sections)
     - ### Process Flow / ASCII Diagram / Comparison Matrix
     - ### Important Highlights / Examples
     - ### Conclusion
4. Grounding: All answers must be strictly 100% grounded in the PDF. Do NOT hallucinate.
5. Marks Calibration: Answers MUST match the marks allotted. Do not write essay answers for 2-mark questions.

ORGANIZATION:
${
  normalizedMarks === "2"
    ? "Generate 4–6 targeted 2-Mark questions with concise 2-4 line answers."
    : normalizedMarks === "5"
    ? "Generate 3–5 targeted 5-Mark questions with pointwise structured model answers."
    : normalizedMarks === "10"
    ? "Generate 2–3 comprehensive 10-Mark questions with full university-grade structured answers."
    : `Organize the questions and answers into 3 clear mark categories:
## 📝 2 MARKS QUESTIONS (Short & Direct Answers)
(Generate 3–4 questions with direct 2–4 line answers)

## 📝 5 MARKS QUESTIONS (Pointwise Conceptual Answers)
(Generate 2–3 questions with structured pointwise answers or comparison tables)

## 📝 10 MARKS QUESTIONS (Comprehensive University Long Answers)
(Generate 1–2 detailed questions with complete structured answers)`
}

Conclude with:
**Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    let promptUser = `Generate exam questions with complete model answers strictly based on the uploaded material.`;
    if (unitFilter && unitFilter.trim().toLowerCase() !== "all") {
      promptUser += ` Focus specifically on unit/topic: "${unitFilter}".`;
    }
    if (normalizedMarks !== "all") {
      promptUser += ` Focus specifically on ${normalizedMarks} Marks questions.`;
    }

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, mode: "important_questions_answers" };
  }

  // Fallback
  const synthesis = `## 📝 Important Exam Questions & Model Answers (${docName})\n\n` +
    `### 🔹 2 MARKS QUESTIONS (Short & Direct Answers)\n\n` +
    `#### Q1. Define the fundamental concept described in this document.\n` +
    `**Answer (2 Marks):**\n` +
    `${(documents[0] || "").trim().slice(0, 180)}.\n\n` +
    `### 🔹 5 MARKS QUESTIONS (Pointwise Conceptual Answers)\n\n` +
    `#### Q2. Explain the key characteristics and advantages of the primary system.\n` +
    `**Answer (5 Marks):**\n` +
    `**Introduction:**\n` +
    `${(documents[1] || "").trim().slice(0, 140)}...\n\n` +
    `**Key Points:**\n` +
    `• **Point 1:** ${(documents[2] || "").trim().slice(0, 120)}...\n` +
    `• **Point 2:** ${(documents[3] || "").trim().slice(0, 120)}...\n\n` +
    `### 🔹 10 MARKS QUESTIONS (Comprehensive Structured Answers)\n\n` +
    `#### Q3. Describe in detail the complete architecture and step-by-step mechanism.\n` +
    `**Answer (10 Marks):**\n` +
    `### Introduction\n` +
    `${(documents[0] || "").trim().slice(0, 180)}...\n\n` +
    `### Detailed Breakdown\n` +
    `1. **Component A:** ${(documents[1] || "").trim().slice(0, 160)}...\n` +
    `2. **Component B:** ${(documents[2] || "").trim().slice(0, 160)}...\n\n` +
    `### Conclusion\n` +
    `These core mechanisms ensure systemic reliability and efficiency.\n\n` +
    `**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "important_questions_answers" };
}

// ----------------------------------------------------
// SECTION 4: RAPID-FIRE REVISION (10-20 Q&As)
// ----------------------------------------------------
export async function generateRapidFireRevision(filename?: string, unitFilter?: string): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[SECTION 4: RAPID-FIRE REVISION] Generating for "${filename || 'Active Corpus'}" (Unit: ${unitFilter || 'All'})...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "rapid_fire" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are a high-speed exam preparation coach.
Generate between 10 to 15 RAPID-FIRE QUESTIONS WITH DIRECT ANSWERS strictly derived from the provided study material.

FORMATTING RULES:
- Generate 10 to 15 fast-paced, crisp questions for quick self-quizzing.
- Every item MUST follow this exact format:
  **Q[number]: [Clear, direct question]**
  **Answer:** [Concise 1–2 sentence factual answer directly addressing the question]

- Cover diverse core concepts, definitions, acronyms, key differences, and vital principles from across the document.
- Zero fluff, 100% grounded in the PDF.
- End with:
  **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Generate 10–15 Rapid-Fire revision Q&As focusing on: "${unitFilter}".`
      : `Generate 10–15 Rapid-Fire revision Q&As covering the entire document.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.2,
      stream: true,
    });

    return { answerStream, sources, mode: "rapid_fire" };
  }

  // Fallback
  const synthesis = `## ⚡ Rapid-Fire Exam Revision (10 Quick Q&As) (${docName})\n\n` +
    Array.from({ length: 10 }).map((_, i) => {
      const doc = documents[i % documents.length] || "Core concept";
      return `**Q${i + 1}: What is key concept #${i + 1} described in ${docName}?**\n` +
             `**Answer:** ${doc.slice(0, 120).trim()}...\n`;
    }).join("\n") +
    `\n**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "rapid_fire" };
}

// ----------------------------------------------------
// SECTION 5: IMPORTANT QUESTION LIST (Revise First)
// ----------------------------------------------------
export async function generateImportantQuestionList(filename?: string, unitFilter?: string): Promise<ExamQueryResult> {
  console.log(`\n========================================`);
  console.log(`[SECTION 5: IMPORTANT QUESTION LIST] Generating for "${filename || 'Active Corpus'}" (Unit: ${unitFilter || 'All'})...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "important_question_list" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an expert academic advisor and examination strategist.
Generate a prioritized "REVISE FIRST" QUESTION LIST strictly from the provided study material.
This list guides students on exactly which questions they must master first for maximum exam marks.

STRUCTURE THE LIST INTO 3 CLEAR PRIORITY TIERS WITH CHECKBOXES:

## 🥇 TIER 1: MUST-REVISE FIRST (Core High-Yield Pillars)
- Questions that form the core theoretical foundation and carry maximum marks (10M / 5M / vital 2M).
- Format: "- [ ] **[[Marks]M]** [Question statement] *(Core Pillar)*"

## 🥈 TIER 2: SECOND PRIORITY (Essential Conceptual & Difference Questions)
- Key mechanism, comparison, advantages, and lifecycle questions (5M / 2M).
- Format: "- [ ] **[[Marks]M]** [Question statement] *(Key Concept)*"

## 🥉 TIER 3: THIRD PRIORITY (Supporting & Fact-Based Questions)
- Specific definitions, acronyms, property listings, and short factual questions (2M).
- Format: "- [ ] **[[Marks]M]** [Question statement] *(Fact-Based)*"

RULES:
- Every question must specify its target marks tag: **[2M]**, **[5M]**, or **[10M]**.
- Questions must be derived 100% from content present in the PDF.
- Do NOT hallucinate questions on missing topics.
- Conclude with:
  **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Generate the prioritized "Revise First" question list focusing on: "${unitFilter}".`
      : `Generate the complete prioritized "Revise First" question list for this document.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, mode: "important_question_list" };
  }

  // Fallback
  const synthesis = `## 🎯 Priority Revision List: Questions to Revise First (${docName})\n\n` +
    `### 🥇 TIER 1: MUST-REVISE FIRST (Core High-Yield Pillars)\n` +
    `- [ ] **[10M]** Explain the detailed architectural design and core mechanisms of ${docName}.\n` +
    `- [ ] **[5M]** Differentiate the primary components with a comparison table.\n` +
    `- [ ] **[2M]** Define the fundamental concept.\n\n` +
    `### 🥈 TIER 2: SECOND PRIORITY (Essential Conceptual Questions)\n` +
    `- [ ] **[5M]** Discuss the key advantages and procedural steps.\n` +
    `- [ ] **[2M]** State the 3 main characteristics of the primary system.\n\n` +
    `### 🥉 TIER 3: THIRD PRIORITY (Supporting & Fact-Based Questions)\n` +
    `- [ ] **[2M]** State the necessary conditions and terminology.\n\n` +
    `**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "important_question_list" };
}

// ----------------------------------------------------
// SECTION 6: AUTOMATIC QUESTION GENERATOR (Feature 5)
// ----------------------------------------------------
export async function generateCustomQuestions(params: {
  filename?: string;
  unitFilter?: string;
  difficulty?: "Easy" | "Medium" | "Hard" | string;
  marksFilter?: number | "all" | string;
  count?: number;
}): Promise<ExamQueryResult> {
  const { filename, unitFilter, difficulty = "Medium", marksFilter = "all", count = 5 } = params;
  console.log(`\n========================================`);
  console.log(`[SECTION 6: QUESTION GENERATOR] Generating ${count} ${difficulty} questions (Marks: ${marksFilter}) for "${filename || 'Active Corpus'}"...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "question_generator" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const marksRule = marksFilter !== "all" 
      ? `All generated questions MUST be worth exactly ${marksFilter} Marks.`
      : `Distribute questions across 2 Marks (Short), 5 Marks (Medium), and 10 Marks (Long).`;

    const systemPrompt = `You are a university examination board chairperson and senior paper setter.
Generate exactly ${count} exam-oriented questions strictly from the provided study material.

SPECIFICATIONS:
- Number of Questions: Exactly ${count}
- Target Difficulty: ${difficulty} (Easy = direct definitions/facts, Medium = conceptual/comparison, Hard = architectural/analytical/application-based)
- Marks Weightage: ${marksRule}
- Variety: Include a balanced mix of:
  • Definition-based questions
  • Conceptual & mechanism questions
  • Short-answer questions
  • Descriptive & process questions
  • Application-based & scenario questions
  • Exam-oriented questions

CRITICAL FORMATTING FOR EVERY QUESTION:
Format each question strictly as follows:

### Q[number]: [Clear, grammatically correct exam question statement]
- **Marks:** [2M / 5M / 10M]
- **Difficulty:** ${difficulty}
- **Topic / Chapter:** [Topic name identified from context]
- **Question Type:** [Definition-based / Conceptual / Short-answer / Descriptive / Application-based]
- **Source Reference:** ${docName}, Page [specific page number]
- **Key Answer Guidelines:** [1–2 sentence summary of what an examiner expects in the answer]

RULES:
- Zero duplication: Ensure each question tests a distinct concept.
- Strict grounding: Derive all questions 100% from the provided PDF. Do NOT invent content not in the context.
- Conclude with:
  **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Generate ${count} ${difficulty} exam questions focusing on: "${unitFilter}".`
      : `Generate ${count} ${difficulty} exam questions covering the entire study material.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.2,
      stream: true,
    });

    return { answerStream, sources, mode: "question_generator" };
  }

  // Fallback
  const synthesis = `## 📝 Generated Exam Question Bank (${docName})\n\n` +
    Array.from({ length: count }).map((_, i) => {
      const doc = documents[i % documents.length] || "Core theoretical principle";
      const m = marksFilter === "all" ? (i % 3 === 0 ? "2M" : i % 3 === 1 ? "5M" : "10M") : `${marksFilter}M`;
      return `### Q${i + 1}: Explain the key concept #${i + 1} described in ${docName}?\n` +
             `- **Marks:** ${m}\n` +
             `- **Difficulty:** ${difficulty}\n` +
             `- **Topic / Chapter:** Chapter Overview\n` +
             `- **Question Type:** Conceptual\n` +
             `- **Source Reference:** ${docName}, Page 1\n` +
             `- **Key Answer Guidelines:** State the definition and 2 key properties based on context: "${doc.slice(0, 80)}..."\n`;
    }).join("\n") +
    `\n**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "question_generator" };
}

// ----------------------------------------------------
// SECTION 6B: STRUCTURED QUESTION PAPER GENERATOR
// ----------------------------------------------------
export async function generateStructuredQuestionPaper(params: {
  filename?: string;
  unitFilter?: string;
}): Promise<ExamQueryResult> {
  const { filename, unitFilter } = params;
  console.log(`\n========================================`);
  console.log(`[SECTION 6B: QUESTION PAPER] Generating formal exam paper for "${filename || 'Active Corpus'}"...`);
  console.log(`========================================`);

  const { documents, metadatas } = await getContextForRevision(filename, unitFilter, 24);

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], mode: "question_paper" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are a university examination board paper setter.
Generate a complete, standard UNIVERSITY EXAMINATION QUESTION PAPER strictly derived from the provided study material.

STRUCTURE THE QUESTION PAPER EXACTLY AS FOLLOWS:

# 📜 UNIVERSITY SEMESTER EXAMINATION QUESTION PAPER
**Course / Subject:** ${docName.replace(/\.pdf$/i, "")}
**Time Allowed:** 3 Hours | **Maximum Marks:** 100
**General Instructions:**
1. Answer ALL questions in Section A.
2. Answer any FOUR questions in Section B.
3. Answer any THREE questions in Section C.
---

## SECTION A (Short Answer Questions — 2 Marks each)
*(Compulsory — 10 Questions x 2 Marks = 20 Marks)*
- Generate 10 crisp 2-Mark definition, terminology, and direct-fact questions labeled Q1(a) to Q1(j).
- Format: "1. (a) [Question statement] **[2M]** *(Source: Page X)*"

## SECTION B (Medium Answer / Conceptual Questions — 5 Marks each)
*(Answer any 6 questions out of 8 — 6 Questions x 5 Marks = 30 Marks)*
- Generate 8 distinct 5-Mark explanation, mechanism, difference, and advantage questions labeled Q2 to Q9.
- Format: "Q[number]. [Question statement] **[5M]** *(Source: Page X)*"

## SECTION C (Long Answer / Comprehensive Essays — 10 Marks each)
*(Answer any 5 questions out of 6 — 5 Questions x 10 Marks = 50 Marks)*
- Generate 6 in-depth 10-Mark comprehensive essay, architectural, and lifecycle questions labeled Q10 to Q15.
- Format: "Q[number]. [Detailed question statement] **[10M]** *(Source: Page X)*"

---
RULES:
- All questions must be strictly grounded in the provided PDF.
- Conclude with:
  **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = unitFilter && unitFilter.trim().toLowerCase() !== "all"
      ? `Generate the complete university question paper focusing on: "${unitFilter}".`
      : `Generate the complete university question paper for this study material.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, mode: "question_paper" };
  }

  // Fallback
  const synthesis = `# 📜 UNIVERSITY SEMESTER EXAMINATION QUESTION PAPER\n` +
    `**Course / Subject:** ${docName}\n` +
    `**Time Allowed:** 3 Hours | **Maximum Marks:** 100\n\n` +
    `## SECTION A (Short Answer Questions — 2 Marks each)\n` +
    `1. (a) Define the fundamental concept in ${docName}. **[2M]**\n` +
    `1. (b) State the primary objective of the system. **[2M]**\n\n` +
    `## SECTION B (Medium Answer Questions — 5 Marks each)\n` +
    `Q2. Explain the functional architecture and workflow. **[5M]**\n` +
    `Q3. Differentiate between primary components with a comparison table. **[5M]**\n\n` +
    `## SECTION C (Long Answer Questions — 10 Marks each)\n` +
    `Q4. Provide an exhaustive analysis of the core mechanisms and design principles. **[10M]**\n\n` +
    `**Source:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, mode: "question_paper" };
}

// ----------------------------------------------------
// SECTION 7: ANSWER IMPROVEMENT & CHECKER (Feature 6)
// ----------------------------------------------------
export async function evaluateStudentAnswer(params: {
  question: string;
  studentAnswer: string;
  marks: number;
  filename?: string;
  unitFilter?: string;
}): Promise<ExamQueryResult> {
  const { question, studentAnswer, marks = 5, filename, unitFilter } = params;
  console.log(`\n========================================`);
  console.log(`[SECTION 7: ANSWER CHECKER] Evaluating answer for "${question}" (${marks} Marks)...`);
  console.log(`========================================`);

  // Search context using both question and student answer for high precision retrieval
  const queryText = `${question} ${studentAnswer}`.slice(0, 500);
  const queryEmbedding = await embedSingleText(queryText);
  const searchRes = await queryVectors(queryEmbedding, 10);
  
  let documents = (searchRes.documents?.[0] || []) as string[];
  let metadatas = (searchRes.metadatas?.[0] || []) as any[];

  if (documents.length === 0) {
    const docCtx = await getContextForRevision(filename, unitFilter, 12);
    documents = docCtx.documents;
    metadatas = docCtx.metadatas;
  }

  if (documents.length === 0) {
    const fallbackStream = (async function* () {
      yield { choices: [{ delta: { content: "No study document found in vector database. Please upload a PDF first." } }] };
    })();
    return { answerStream: fallbackStream, sources: [], marks: marks as ExamMarks, mode: "answer_checker" };
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an expert university examiner evaluating a student's answer.
Your evaluation MUST BE BASED ONLY on the provided Study Material Context from the uploaded PDF.

EXAMINATION RUBRIC (${marks} MARKS):
- If 2 Marks: Evaluate definition precision, core factual point, and brevity (2–4 lines).
- If 5 Marks: Evaluate introduction/definition, 3–5 main points or comparison table, relevant example, and clear structure.
- If 10 Marks: Evaluate formal introduction, exhaustive detailed explanation with subheadings, comparison/steps/diagram description, key points, and conclusion.

CRITICAL FAIRNESS GUIDELINES:
1. Conceptual Correctness: Do NOT penalize answers merely because they use different wording, synonyms, or natural explanations. Evaluate whether the underlying concept is correct.
2. No Memorization Bias: Do not demand verbatim recitation of textbook sentences.
3. Strict PDF Grounding: Check for verified facts from the context. If the student includes factually incorrect statements contradicting the PDF, note the correction.

STRUCTURE YOUR EVALUATION EXACTLY IN THIS CLEAN MARKDOWN FORMAT:

## 📊 Exam Evaluation Report

**Estimated Score:** [Awarded Score] / ${marks} Marks

### ✅ What You Did Well
- [Bullet 1: Concrete accurate concept identified in student answer]
- [Bullet 2: Good structural or explanation aspect]

### ⚠️ Missing Important Points
- [Bullet 1: Essential point or dimension from the PDF that was omitted]
- [Bullet 2: Missing formula, classification, or sub-component]

### 🔧 Corrections Needed
- [Bullet: Specific conceptual mistake to fix, or "• None! Your answer is conceptually accurate."]

### 🏷️ Important Keywords to Include
- Highlight 4–6 vital technical keywords from the PDF: **[Keyword 1]**, **[Keyword 2]**, **[Keyword 3]**, **[Keyword 4]**

### 💡 How to Improve (Mark-Specific Guidance)
- [Actionable advice on structure, presentation, bulleting, or example inclusion to reach full marks in ${marks}M question]

**Source Reference:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = `QUESTION (${marks} MARKS):
${question}

STUDENT'S SUBMITTED ANSWER:
${studentAnswer || "(No answer text submitted)"}`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.1,
      stream: true,
    });

    return { answerStream, sources, marks: marks as ExamMarks, mode: "answer_checker" };
  }

  // Fallback
  const scoreEstimate = Math.max(1, Math.round(marks * 0.7));
  const synthesis = `## 📊 Exam Evaluation Report\n\n` +
    `**Estimated Score:** ${scoreEstimate} / ${marks} Marks\n\n` +
    `### ✅ What You Did Well\n` +
    `• You captured the core concept of the question.\n` +
    `• Your answer addresses the fundamental topic.\n\n` +
    `### ⚠️ Missing Important Points\n` +
    `• Important sub-mechanisms and formal definitions found in ${docName}.\n` +
    `• Comparison aspects or structured point-by-point breakdown.\n\n` +
    `### 🔧 Corrections Needed\n` +
    `• Ensure exact technical terminology is used.\n\n` +
    `### 🏷️ Important Keywords to Include\n` +
    `• **Core Term**, **Architecture**, **Process**, **Protocol**\n\n` +
    `### 💡 How to Improve\n` +
    `• Use structured bold headings and include an example to maximize marks.\n\n` +
    `**Source Reference:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, marks: marks as ExamMarks, mode: "answer_checker" };
}

// ----------------------------------------------------
// SECTION 7B: IMPROVE MY ANSWER (Feature 6)
// ----------------------------------------------------
export async function generateImprovedStudentAnswer(params: {
  question: string;
  studentAnswer: string;
  marks: number;
  filename?: string;
  unitFilter?: string;
}): Promise<ExamQueryResult> {
  const { question, studentAnswer, marks = 5, filename, unitFilter } = params;
  console.log(`\n========================================`);
  console.log(`[SECTION 7B: IMPROVE ANSWER] Generating improved answer for "${question}" (${marks} Marks)...`);
  console.log(`========================================`);

  const queryText = `${question} ${studentAnswer}`.slice(0, 500);
  const queryEmbedding = await embedSingleText(queryText);
  const searchRes = await queryVectors(queryEmbedding, 10);
  
  let documents = (searchRes.documents?.[0] || []) as string[];
  let metadatas = (searchRes.metadatas?.[0] || []) as any[];

  if (documents.length === 0) {
    const docCtx = await getContextForRevision(filename, unitFilter, 12);
    documents = docCtx.documents;
    metadatas = docCtx.metadatas;
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an elite academic examiner.
Your job is to rewrite and upgrade the student's answer into a PERFECT, FULL-MARKS EXAM MODEL ANSWER (${marks} Marks).

RULES:
1. Preserve Meaning: Preserve the student's original intent, perspective, and core reasoning.
2. Fill Gaps: Add all missed technical details, formal definitions, and vital keywords from the Study Material Context.
3. Structure for ${marks} Marks:
   - 2 Marks: Crisp definition / 2–4 lines.
   - 5 Marks: Definition, 3–4 bullet points with bold headers (or comparison table), short example.
   - 10 Marks: Formal introduction, numbered headings, key points, example, and conclusion.
4. Highlight Upgrades: Clearly distinguish the final model answer.
5. End with:
   **Source:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = `QUESTION (${marks} MARKS):
${question}

ORIGINAL STUDENT ANSWER:
${studentAnswer}

Please rewrite this into an exemplary, full-scoring ${marks}-Mark answer.`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.15,
      stream: true,
    });

    return { answerStream, sources, marks: marks as ExamMarks, mode: "improve_answer" };
  }

  // Fallback
  return await answerQuestion(question, marks);
}

// ----------------------------------------------------
// SECTION 7C: EXTRACT MISSING POINTS ONLY (Feature 6)
// ----------------------------------------------------
export async function extractMissingKeyPoints(params: {
  question: string;
  studentAnswer: string;
  marks: number;
  filename?: string;
  unitFilter?: string;
}): Promise<ExamQueryResult> {
  const { question, studentAnswer, marks = 5, filename, unitFilter } = params;

  const queryText = `${question} ${studentAnswer}`.slice(0, 500);
  const queryEmbedding = await embedSingleText(queryText);
  const searchRes = await queryVectors(queryEmbedding, 10);
  
  let documents = (searchRes.documents?.[0] || []) as string[];
  let metadatas = (searchRes.metadatas?.[0] || []) as any[];

  if (documents.length === 0) {
    const docCtx = await getContextForRevision(filename, unitFilter, 12);
    documents = docCtx.documents;
    metadatas = docCtx.metadatas;
  }

  let context = "";
  const sources: Array<{ page: number; snippet: string; source: string }> = [];
  const distinctPages = new Set<number>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const meta = metadatas[i] || { source: filename || "Document", page: 1 };
    context += `[Page ${meta.page} — ${meta.source}]\n${doc}\n\n`;
    if (!distinctPages.has(meta.page)) {
      distinctPages.add(meta.page);
      sources.push({ page: meta.page, source: meta.source, snippet: doc.slice(0, 120) + "..." });
    }
  }

  const docName = sources[0]?.source || "Uploaded Document";
  const groqApiKey = getEnvVariable("GROQ_API_KEY");

  if (groqApiKey && groqApiKey.trim().length > 5) {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an examination evaluator.
Analyze the student's answer against the study material and extract ONLY THE MISSING IMPORTANT POINTS.

Output format:
## ⚠️ Key Points Omitted in Your Answer
- Provide 4–6 crisp, high-yield bullet points containing the exact definitions, mechanisms, or keywords the student missed.
- Format: "• **[Missing Concept]**: [Explanation from PDF]"
- Conclude with:
  **Source Reference:** ${docName}, Pages ${Array.from(distinctPages).sort((a,b)=>a-b).join(", ")}

Study Material Context:
${context}`;

    const promptUser = `QUESTION (${marks} MARKS): ${question}\n\nSTUDENT'S ANSWER: ${studentAnswer}`;

    const answerStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptUser }
      ],
      temperature: 0.1,
      stream: true,
    });

    return { answerStream, sources, marks: marks as ExamMarks, mode: "missing_points" };
  }

  // Fallback
  const synthesis = `## ⚠️ Key Points Omitted in Your Answer\n\n` +
    documents.slice(0, 4).map((d, i) => `• **Missing Point ${i + 1}:** ${d.slice(0, 150)}...`).join("\n") +
    `\n\n**Source Reference:** ${docName}`;

  const extractiveStream = (async function* () {
    const tokens = synthesis.split(/(\s+)/);
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 12));
      yield { choices: [{ delta: { content: token } }] };
    }
  })();

  return { answerStream: extractiveStream, sources, marks: marks as ExamMarks, mode: "missing_points" };
}

// ----------------------------------------------------
// UNIFIED DISPATCHER
// ----------------------------------------------------
export async function executeExamQuery(params: {
  mode?: ExamMode;
  question?: string;
  marks?: number | string;
  filename?: string;
  unitFilter?: string;
  marksFilter?: number | "all" | string;
  difficulty?: "Easy" | "Medium" | "Hard" | string;
  count?: number;
  studentAnswer?: string;
}): Promise<ExamQueryResult> {
  const mode = params.mode || "chat";

  switch (mode) {
    case "question_generator":
      return await generateCustomQuestions({
        filename: params.filename,
        unitFilter: params.unitFilter || params.question,
        difficulty: params.difficulty,
        marksFilter: params.marksFilter,
        count: params.count,
      });
    case "question_paper":
      return await generateStructuredQuestionPaper({
        filename: params.filename,
        unitFilter: params.unitFilter || params.question,
      });
    case "answer_checker":
      return await evaluateStudentAnswer({
        question: params.question || "Explain the core concept",
        studentAnswer: params.studentAnswer || "",
        marks: typeof params.marks === "number" ? params.marks : parseInt(String(params.marks || 5), 10) || 5,
        filename: params.filename,
        unitFilter: params.unitFilter,
      });
    case "improve_answer":
      return await generateImprovedStudentAnswer({
        question: params.question || "Explain the core concept",
        studentAnswer: params.studentAnswer || "",
        marks: typeof params.marks === "number" ? params.marks : parseInt(String(params.marks || 5), 10) || 5,
        filename: params.filename,
        unitFilter: params.unitFilter,
      });
    case "missing_points":
      return await extractMissingKeyPoints({
        question: params.question || "Explain the core concept",
        studentAnswer: params.studentAnswer || "",
        marks: typeof params.marks === "number" ? params.marks : parseInt(String(params.marks || 5), 10) || 5,
        filename: params.filename,
        unitFilter: params.unitFilter,
      });
    case "most_important_topics":
      return await generateMostImportantTopics(params.filename, params.unitFilter || params.question);
    case "last_minute_revision":
      return await generateLastMinuteRevision(params.filename, params.unitFilter || params.question);
    case "important_questions_answers":
      return await generateImportantQuestionsWithAnswers(params.filename, params.unitFilter || params.question, params.marksFilter || params.marks);
    case "rapid_fire":
      return await generateRapidFireRevision(params.filename, params.unitFilter || params.question);
    case "important_question_list":
      return await generateImportantQuestionList(params.filename, params.unitFilter || params.question);
    case "important_points":
    case "quick_revision":
      return await generateLastMinuteRevision(params.filename, params.unitFilter || params.question);
    case "generate_questions":
      return await generateImportantQuestionsWithAnswers(params.filename, params.unitFilter || params.question, params.marksFilter || params.marks);
    case "chat":
    default:
      return await answerQuestion(params.question || "Explain the core concepts", params.marks || 5);
  }
}



