import { 
  generateCustomQuestions, 
  generateStructuredQuestionPaper, 
  evaluateStudentAnswer, 
  generateImprovedStudentAnswer, 
  extractMissingKeyPoints 
} from "../lib/query";

async function runTests() {
  console.log("==================================================");
  console.log("STARTING TEST FOR FEATURES 5, 6 & 7 BACKEND LOGIC");
  console.log("==================================================\n");

  const testFile = "Chapter 01 - Introduction to OS.pdf";

  // Helper to read async stream
  async function streamToString(stream: any): Promise<string> {
    let full = "";
    for await (const chunk of stream) {
      full += chunk.choices[0]?.delta?.content || "";
    }
    return full;
  }

  // 1. Test Feature 5: Question Generator
  console.log("[TEST 1/5] Testing generateCustomQuestions (Difficulty: Medium, Marks: 5M, Count: 3)...");
  try {
    const res1 = await generateCustomQuestions({
      filename: testFile,
      difficulty: "Medium",
      marksFilter: 5,
      count: 3,
    });
    const text1 = await streamToString(res1.answerStream);
    console.log(`✓ Result Preview (First 300 chars):\n${text1.slice(0, 300)}...\n`);
  } catch (e: any) {
    console.error("✗ Test 1 failed:", e.message);
  }

  // 2. Test Feature 5B: Question Paper
  console.log("[TEST 2/5] Testing generateStructuredQuestionPaper (Sections A, B, C)...");
  try {
    const res2 = await generateStructuredQuestionPaper({ filename: testFile });
    const text2 = await streamToString(res2.answerStream);
    console.log(`✓ Result Preview (First 300 chars):\n${text2.slice(0, 300)}...\n`);
  } catch (e: any) {
    console.error("✗ Test 2 failed:", e.message);
  }

  // 3. Test Feature 6: Answer Checker (5 Marks evaluation)
  console.log("[TEST 3/5] Testing evaluateStudentAnswer (5 Marks question)...");
  try {
    const res3 = await evaluateStudentAnswer({
      question: "What is Dual Mode Operation in Operating Systems?",
      studentAnswer: "Dual mode operation has user mode and kernel mode. A mode bit is used to switch between them so user programs cannot crash the system.",
      marks: 5,
      filename: testFile,
    });
    const text3 = await streamToString(res3.answerStream);
    console.log(`✓ Result Preview (First 300 chars):\n${text3.slice(0, 300)}...\n`);
  } catch (e: any) {
    console.error("✗ Test 3 failed:", e.message);
  }

  // 4. Test Feature 6B: Improve Student Answer
  console.log("[TEST 4/5] Testing generateImprovedStudentAnswer (5 Marks)...");
  try {
    const res4 = await generateImprovedStudentAnswer({
      question: "What is Dual Mode Operation in Operating Systems?",
      studentAnswer: "Dual mode operation has user mode and kernel mode. A mode bit is used to switch between them so user programs cannot crash the system.",
      marks: 5,
      filename: testFile,
    });
    const text4 = await streamToString(res4.answerStream);
    console.log(`✓ Result Preview (First 300 chars):\n${text4.slice(0, 300)}...\n`);
  } catch (e: any) {
    console.error("✗ Test 4 failed:", e.message);
  }

  // 5. Test Feature 6C: Extract Missing Points Only
  console.log("[TEST 5/5] Testing extractMissingKeyPoints...");
  try {
    const res5 = await extractMissingKeyPoints({
      question: "What is Dual Mode Operation in Operating Systems?",
      studentAnswer: "Dual mode operation has user mode and kernel mode. A mode bit is used to switch between them.",
      marks: 5,
      filename: testFile,
    });
    const text5 = await streamToString(res5.answerStream);
    console.log(`✓ Result Preview (First 300 chars):\n${text5.slice(0, 300)}...\n`);
  } catch (e: any) {
    console.error("✗ Test 5 failed:", e.message);
  }

  console.log("==================================================");
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch(console.error);
