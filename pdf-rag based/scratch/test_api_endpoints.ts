async function testEndpoint() {
  const modes = [
    { mode: 'chat', question: 'Explain 3NF with an example', marks: 5 },
    { mode: 'important_points', filename: 'DBMS_Unit2_Notes.pdf' },
    { mode: 'quick_revision', filename: 'DBMS_Unit2_Notes.pdf' },
    { mode: 'generate_questions', filename: 'DBMS_Unit2_Notes.pdf' }
  ];

  for (const test of modes) {
    console.log(`\n========================================`);
    console.log(`Testing HTTP POST /api/chat with mode="${test.mode}"...`);
    console.log(`========================================`);

    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(test)
    });

    if (!res.ok) {
      console.error(`HTTP error ${res.status}: ${res.statusText}`);
      continue;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let doneMetadata: any = null;

    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) fullText += data.token;
              if (data.done) doneMetadata = data;
            } catch (e) {}
          }
        }
      }
    }

    console.log(`[API Response Preview - Mode ${test.mode}]:`);
    console.log(fullText.slice(0, 300) + '...\n');
    console.log(`Done Metadata:`, doneMetadata);
  }
}

testEndpoint().catch(console.error);
