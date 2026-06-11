# Auto-Answer MCQ Questions with Claude.ai

Automatically identify correct answers for MCQ questions in the 11+ website by using Claude.ai via the browser. No API credits needed.

## Steps

### 1. Get available papers

Use Bash to log in as admin and fetch the list of papers:

```bash
# Login to get JWT
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@elevenplus.local","password":"Admin@123!"}' \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).token)")

# Fetch papers
curl -s http://localhost:5000/api/papers \
  -H "Authorization: Bearer $TOKEN" \
  | node -e "
    const d=require('fs').readFileSync('/dev/stdin','utf8');
    const papers=JSON.parse(d);
    papers.forEach((p,i) => console.log(i+1+'. ['+p.id+'] '+p.title+' ('+p.question_count+' questions)'));
  "
```

Show the list to the user and ask which paper they want to process. If `$ARGUMENTS` contains a paperId, use that directly and skip asking.

### 2. Fetch MCQ questions for the chosen paper

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@elevenplus.local","password":"Admin@123!"}' \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).token)")

curl -s "http://localhost:5000/api/questions?paperId=PAPER_ID_HERE" \
  -H "Authorization: Bearer $TOKEN"
```

Filter to only `question_type === 'mcq'` questions that have options. Note which ones already have a correct answer (`options.some(o => o.isCorrect)`) — by default process ALL MCQ questions (overwriting existing answers), unless the user specifically says "only unanswered".

### 3. Build the prompt and send it to Claude.ai via Chrome MCP

Build a prompt string in this exact format:

```
I have MCQ questions from an 11+ exam paper. Identify the correct answer for each.
Return ONLY valid JSON, no explanation, no markdown:
{"answers":[{"q":1,"correct":"B"},{"q":2,"correct":"D"}]}

Q1: <question_text>
  A. <option_text>
  B. <option_text>
  C. <option_text>
  D. <option_text>
  E. <option_text>

Q2: ...
```

Use the Chrome MCP tools (`mcp__Claude_in_Chrome__*`) to:
1. Navigate to https://claude.ai — if not logged in, tell the user to log in first and wait
2. Start a new conversation (look for "New chat" button or navigate to https://claude.ai/new)
3. Type/paste the full prompt into the message input
4. Submit and wait for the complete response (poll until the response stops streaming — check that the stop button has disappeared)
5. Read the full response text from the page

### 4. Parse the response and apply answers

Parse the JSON from Claude's response. It will be in the form:
`{"answers":[{"q":1,"correct":"B"},{"q":2,"correct":"C"},...]}` 

Strip any markdown code fences if present.

For each answer, find the matching question and the option with that label, then PATCH it:

```bash
curl -s -X PATCH http://localhost:5000/api/questions/QUESTION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"correctOptionId":"OPTION_UUID"}'
```

### 5. Report results

After all PATCHes complete, report:
- How many questions were processed
- How many were successfully answered
- Any that failed or had unexpected option labels

Example: "✅ Applied correct answers to 28/30 MCQ questions in 'QE Barnet Practice Test 2'. 2 questions had ambiguous options and were skipped."

## Notes

- Admin credentials: email `admin@elevenplus.local`, password `Admin@123!`
- API base: `http://localhost:5000/api`
- If Claude.ai is slow or streaming, wait until the send button reappears before reading the response
- Send questions in batches of 30 max if the paper has more (to stay within context)
- If the user passes a paperId as `$ARGUMENTS`, skip the paper selection step
