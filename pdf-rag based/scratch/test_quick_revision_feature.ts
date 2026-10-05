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
  console.log(`Using test document: ${testDoc}\n`);

  // Test 1: Most Important Topics
  console.log('--- TEST 1: Most Important Topics ---');
  const res1 = await executeExamQuery({
    mode: 'most_important_topics',
    filename: testDoc,
  });
  const text1 = await streamToString(res1.answerStream);
  console.log('Output preview (first 400 chars):\n', text1.slice(0, 400));
  console.log('Sources count:', res1.sources.length);
  console.log('\n------------------------------------------------------------\n');

  // Test 2: Last-Minute Revision
  console.log('--- TEST 2: Last-Minute Revision ---');
  const res2 = await executeExamQuery({
    mode: 'last_minute_revision',
    filename: testDoc,
  });
  const text2 = await streamToString(res2.answerStream);
  console.log('Output preview (first 400 chars):\n', text2.slice(0, 400));
  console.log('\n------------------------------------------------------------\n');

  // Test 3: Important Questions with Answers (with 5M filter)
  console.log('--- TEST 3: Questions with Answers (5 Marks filter) ---');
  const res3 = await executeExamQuery({
    mode: 'important_questions_answers',
    marksFilter: 5,
    filename: testDoc,
  });
  const text3 = await streamToString(res3.answerStream);
  console.log('Output preview (first 400 chars):\n', text3.slice(0, 400));
  console.log('\n------------------------------------------------------------\n');

  // Test 4: Rapid-Fire Revision
  console.log('--- TEST 4: Rapid-Fire Revision ---');
  const res4 = await executeExamQuery({
    mode: 'rapid_fire',
    filename: testDoc,
  });
  const text4 = await streamToString(res4.answerStream);
  console.log('Output preview (first 400 chars):\n', text4.slice(0, 400));
  console.log('\n------------------------------------------------------------\n');

  // Test 5: Important Question List
  console.log('--- TEST 5: Important Question List ---');
  const res5 = await executeExamQuery({
    mode: 'important_question_list',
    filename: testDoc,
  });
  const text5 = await streamToString(res5.answerStream);
  console.log('Output preview (first 400 chars):\n', text5.slice(0, 400));
  console.log('\n------------------------------------------------------------\n');

  console.log('ALL 5 QUICK REVISION BACKEND TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
