import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

import { executeExamQuery } from '../lib/query';
import { localStore } from '../lib/vectorstore';

async function streamToString(stream: any): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || '';
    result += token;
  }
  return result;
}

async function runTests() {
  console.log('=== Checking Local Vectorstore Stats ===');
  const count = await localStore.count();
  const sources = localStore.getDistinctSources();
  console.log(`Local store chunks: ${count}, Sources: ${sources.join(', ')}`);

  const testDoc = sources[0] || 'DBMS_Unit2_Notes.pdf';
  console.log(`Using active test document: ${testDoc}\n`);

  // Test 1: 2-Mark Definition Answer
  console.log('--- TEST 1: 2-Mark Definition Question ("What is 2NF?") ---');
  const res2M = await executeExamQuery({
    mode: 'chat',
    question: 'What is 2NF?',
    marks: 2,
    filename: testDoc,
  });
  const text2M = await streamToString(res2M.answerStream);
  console.log('Response (2M):\n', text2M);
  console.log('Sources:', res2M.sources);
  console.log('\n------------------------------------------------------------\n');

  // Test 2: 5-Mark Difference Question (Testing Comparison Table)
  console.log('--- TEST 2: 5-Mark Difference Question ("Differentiate 2NF and 3NF") ---');
  const res5M = await executeExamQuery({
    mode: 'chat',
    question: 'Differentiate between 2NF and 3NF',
    marks: 5,
    filename: testDoc,
  });
  const text5M = await streamToString(res5M.answerStream);
  console.log('Response (5M Difference):\n', text5M);
  console.log('\n------------------------------------------------------------\n');

  // Test 3: Important Exam Points Mode
  console.log('--- TEST 3: Important Exam Points Mode ---');
  const resImp = await executeExamQuery({
    mode: 'important_points',
    filename: testDoc,
  });
  const textImp = await streamToString(resImp.answerStream);
  console.log('Important Exam Points:\n', textImp);
  console.log('\n------------------------------------------------------------\n');

  // Test 4: Quick Revision Mode
  console.log('--- TEST 4: Quick Revision Mode ---');
  const resRev = await executeExamQuery({
    mode: 'quick_revision',
    filename: testDoc,
  });
  const textRev = await streamToString(resRev.answerStream);
  console.log('Quick Revision:\n', textRev);
  console.log('\n------------------------------------------------------------\n');

  // Test 5: Generate Questions Mode
  console.log('--- TEST 5: Generate Questions Mode ---');
  const resGen = await executeExamQuery({
    mode: 'generate_questions',
    filename: testDoc,
  });
  const textGen = await streamToString(resGen.answerStream);
  console.log('Generated Exam Questions:\n', textGen);
  console.log('\n============================================================');
  console.log('ALL EXAM FEATURES TEST PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
