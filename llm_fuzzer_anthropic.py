import os
import json
import time
import requests
import random
import anthropic
from dotenv import load_dotenv

# Force load keys from the Next.js .env.local file to override terminal environment
load_dotenv('.env.local', override=True)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BASE_URL = "http://localhost:3000"

if not ANTHROPIC_API_KEY or not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Missing required API keys in .env.local.")
    exit(1)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
MODEL_NAME = "claude-3-haiku-20240307"

AGENT_SYSTEM_PROMPT = f"""
You are a Stanford student using a course discovery app called "Stanford Root."
You have real preferences and opinions. You're opinionated. If you fetch a course and the
description is vague, unhelpful, or the evaluations look bad, you don't just stop — you
go look for something else. You explore, you compare, you change your mind.

Your session should feel like a real human browsing session, not a checklist.
Think out loud through your reasoning. Be curious. Be skeptical of bad data.

AVAILABLE TOOLS (Safe GET requests only):
1. Full Course Catalog:
   {BASE_URL}/api/courses?full=1
   NOTE: This returns 50MB+ of data. You will only see the FIRST 2000 characters, which will contain
   the start of the JSON array with a handful of courses. You MUST extract real course_id values from
   that truncated data (e.g. "CS106A", "MATH51", etc.) and use them in tools 2 and 3.
   ⚠️ CRITICAL: Fetch the catalog at most ONCE. If you already have course IDs from a previous fetch,
   do NOT fetch the catalog again. Extract IDs from what you already saw and move forward.

2. Evaluations for a specific course:
   {SUPABASE_URL}/rest/v1/evaluations?course_id=eq.[COURSE_ID]&select=term,instructor,respondents,comments&limit=3

3. Syllabus submissions for a specific course:
   {SUPABASE_URL}/rest/v1/syllabus_submissions?course_id=eq.[COURSE_ID]&select=url,label,term

DETECTING BUGS:
You must actively look for data inconsistencies. Here are specific bug signals to watch for:
- If you make two different GET requests (e.g. one unfiltered, one with a ?search=art parameter)
  and the response has the same byte count both times, that is a BUG. The filter is being silently
  ignored. Flag this explicitly in your report.
- If evaluations return an empty array [] for a well-known course, that may indicate missing data.
- If a course description says one thing but evaluations say something completely different, note it.

HOW TO RESPOND:
Each turn, output a single JSON object. No markdown. No explanation outside of JSON.

To fetch data:
{{
  "action": "fetch",
  "thought": "Why you're fetching this — what you're looking for or thinking.",
  "url": "the URL"
}}

To end your session (once you've explored enough and have something to say):
{{
  "action": "report",
  "thought": "Your final reflection or summary of what you found.",
  "finding": "A detailed, honest account of your session: what you were looking for, what you found, any data that seemed off or surprising, bugs discovered (especially filter/search not working), and your overall verdict."
}}

IMPORTANT:
- Fetch the catalog ONCE, extract course IDs, then drill into those specific courses.
- Compare response sizes. If adding a search query yields the same byte count as no query, it's a bug.
- Don't rush to report. Explore naturally and be genuinely curious.
"""

# Story seeds — open-ended starting situations, not rigid scripts
STORIES = [
    "It's Week 1 of fall quarter and I have one elective slot left. I want something fun and not too heavy — maybe in the humanities or a creative field. I've heard the evaluations on Stanford Root are actually useful so let me take a look.",

    "I'm a junior CS major who's always wanted to understand the biological side of things. I want to find a class that bridges CS and bio or medicine, look at the actual evaluations to see if students find it worthwhile, and check if anyone posted a syllabus.",

    "My friend and I are planning to take the same class next quarter. We want something in math or stats that isn't a weed-out course. I want to find a few options, look at their evaluations side by side, and pick the best one.",

    "I'm pre-med and I need to find a writing requirement course that won't kill me. Let me search for writing or PWR courses in the catalog and see what students say about the workload in the evaluations. If one has a syllabus posted that would be a huge bonus.",

    "I'm trying to figure out what upper-division CS seminars actually look like in practice. I want to find a 300+ level CS class, read its description carefully, and then cross-check it against student evaluations. If the description is vague, I'll look for another one that's better documented.",

    "I'm advising a friend who transferred here and wants to take something in Econ or Political Science. They're worried about being behind. Let me scout out a couple of intro-level courses, read the descriptions to see if they require prerequisites, and see how students rate them.",
]

def execute_session(story):
    print(f"\n🎓 [STUDENT SESSION STARTED]")
    print(f"Situation: {story[:100]}...")

    messages = [
        {"role": "user", "content": f"You are a Stanford student. Here is your situation:\n\n{story}\n\nStart browsing. Output JSON only."}
    ]

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }

    turn = 0
    while True:
        turn += 1
        print(f"\n   🔄 Turn {turn}")

        response = client.messages.create(
            model=MODEL_NAME,
            max_tokens=1000,
            system=AGENT_SYSTEM_PROMPT,
            messages=messages,
            temperature=0.8  # Higher temperature = more human-feeling exploration
        )

        raw_reply = response.content[0].text.strip()

        # Strip any markdown Claude sneaks in
        if raw_reply.startswith("```json"): raw_reply = raw_reply[7:].strip()
        if raw_reply.startswith("```"): raw_reply = raw_reply[3:].strip()
        if raw_reply.endswith("```"): raw_reply = raw_reply[:-3].strip()

        try:
            action_data = json.loads(raw_reply)
        except Exception:
            print(f"   ❌ Couldn't parse JSON. Raw: {raw_reply[:200]}")
            # Give the LLM one more chance to recover
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({"role": "user", "content": "That wasn't valid JSON. Please output only a raw JSON object, no markdown."})
            continue

        action = action_data.get("action")
        thought = action_data.get("thought", "")

        if thought:
            print(f"   💭 {thought}")

        if action == "report":
            finding = action_data.get("finding", "No finding.")
            print(f"\n   ✅ SESSION COMPLETE (after {turn} turns)")
            print(f"   📝 {finding}")
            return {"turns": turn, "finding": finding}

        elif action == "fetch":
            url = action_data.get("url")
            if not url:
                print("   ❌ No URL provided in fetch action.")
                messages.append({"role": "assistant", "content": raw_reply})
                messages.append({"role": "user", "content": "You forgot to include the 'url' field. Please try again."})
                continue

            print(f"   🌐 Fetching: {url}")
            try:
                req_headers = headers if "supabase.co" in url else {}
                res = requests.get(url, headers=req_headers, timeout=8)
                text = res.text
                if len(text) > 2000:
                    text = text[:2000] + "\n... [TRUNCATED — more data exists]"
                byte_count = len(res.text)
                result_str = f"HTTP {res.status_code} | Response size: {byte_count} bytes\n{text}"
                print(f"      → {res.status_code} ({byte_count} bytes total)")
            except Exception as e:
                result_str = f"Request failed: {str(e)}"
                print(f"      ❌ {e}")

            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({"role": "user", "content": f"API RESULT:\n{result_str}\n\nContinue your session. Output JSON only."})

        else:
            print(f"   ❌ Unknown action '{action}'. Asking the LLM to retry.")
            messages.append({"role": "assistant", "content": raw_reply})
            messages.append({"role": "user", "content": "Unknown action. Only use 'fetch' or 'report'. Output JSON only."})


def run():
    print("🚀 Starting Agentic Student Session Fuzzer")
    print("   Press Ctrl+C to stop at any time.\n")

    iteration = 1
    with open("agentic_fuzzer.log", "w") as f:
        f.write(f"Session started: {time.ctime()}\n\n")

    while True:
        print(f"\n{'='*65}")
        print(f"  SESSION {iteration}")
        print(f"{'='*65}")

        story = random.choice(STORIES)
        result = execute_session(story)

        with open("agentic_fuzzer.log", "a") as f:
            f.write(f"--- Session {iteration} ({result['turns']} turns) ---\n")
            f.write(f"Story: {story}\n")
            f.write(f"Finding: {result['finding']}\n\n")

        print(f"\n⏳ Resting 5 seconds before next session...")
        time.sleep(5)
        iteration += 1


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\n\n🛑 Fuzzer stopped. Check agentic_fuzzer.log for the full session transcripts.")
