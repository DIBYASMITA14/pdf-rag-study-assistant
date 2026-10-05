import { executeExamQuery } from "../lib/query";
import { config } from "dotenv";
import path from "path";

// Load .env.local
config({ path: path.join(__dirname, "../.env.local") });

async function runTests() {
  console.log("==================================================");
  console.log("STARTING TEST SUITE FOR RAG EXAM FORMATTING");
  console.log("==================================================\n");

  const testCases = [
    {
      name: "TEST 1: 2-Mark Definition Question (Operating System)",
      marks: 2,
      question: "Define Operating System",
    },
    {
      name: "TEST 2: 5-Mark Difference Question (Network Topologies / Star vs Ring or OS Kernels)",
      marks: 5,
      question: "Differentiate between Star Topology and Ring Topology",
    },
    {
      name: "TEST 3: 5-Mark Advantages & Disadvantages Question (Multiprogramming / Multiprocessing)",
      marks: 5,
      question: "What are the advantages and disadvantages of multiprogramming systems?",
    },
    {
      name: "TEST 4: 10-Mark Long Answer Question (Operating System Goals and Functions)",
      marks: 10,
      question: "Explain the main functions and architectural goals of an Operating System in detail",
    },
  ];

  for (const tc of testCases) {
    console.log(`\n--------------------------------------------------`);
    console.log(`RUNNING: ${tc.name}`);
    console.log(`Question: "${tc.question}" | Marks: ${tc.marks}`);
    console.log(`--------------------------------------------------`);

    try {
      const result = await executeExamQuery({
        question: tc.question,
        marks: tc.marks,
        mode: "chat",
      });

      let fullAnswer = "";
      for await (const chunk of result.answerStream) {
        const token = chunk.choices?.[0]?.delta?.content || "";
        fullAnswer += token;
      }

      console.log("\n[GENERATED ANSWER]:\n");
      console.log(fullAnswer);
      console.log("\n[SOURCES]:", JSON.stringify(result.sources.map(s => ({ page: s.page, source: s.source })), null, 2));
      console.log(`\n>>> ${tc.name} COMPLETED SUCCESSFULY`);
    } catch (err: any) {
      console.error(`ERROR running ${tc.name}:`, err.message || err);
    }
  }

  console.log("\n==================================================");
  console.log("ALL TESTS FINISHED");
  console.log("==================================================");
}

runTests().catch(console.error);
