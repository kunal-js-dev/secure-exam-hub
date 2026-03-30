import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const languageNames: Record<string, string> = {
  c: "C",
  cpp: "C++",
  java: "Java",
  python: "Python",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, testCases, questionText, language = "c" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langName = languageNames[language] || "C";

    const systemPrompt = `You are a ${langName} programming evaluator. You will be given a ${langName} code snippet, a question, and test cases.
Your job is to mentally execute the ${langName} code for each test case input and determine the expected output.
Compare the actual output of the code with the expected output for each test case.

IMPORTANT: You must respond ONLY with a valid JSON object, no markdown, no code blocks. The format:
{
  "results": [
    { "input": "...", "expectedOutput": "...", "actualOutput": "...", "passed": true/false }
  ],
  "allPassed": true/false,
  "compilationError": null or "error message if code won't compile/run",
  "summary": "brief explanation"
}

Be strict about output matching. Trim whitespace for comparison. If the code has compilation/syntax errors, set compilationError and mark all tests as failed.`;

    const userPrompt = `Question: ${questionText}

${langName} Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases:
${JSON.stringify(testCases, null, 2)}

Evaluate this ${langName} code against each test case. For each test case, the "input" field contains stdin input and "expectedOutput" contains the expected stdout output.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI evaluation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      result = { results: [], allPassed: false, compilationError: null, summary: content };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
