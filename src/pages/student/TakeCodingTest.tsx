import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Send, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export default function TakeCodingTest() {
  const { testId } = useParams<{ testId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [attempt, setAttempt] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [compileResults, setCompileResults] = useState<Record<string, any>>({});
  const [compiling, setCompiling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Load test data
  useEffect(() => {
    if (!testId || !user) return;
    const load = async () => {
      const { data: t } = await supabase.from("coding_tests").select("*").eq("id", testId).single();
      if (!t) { navigate("/student"); return; }
      setTest(t);

      const { data: qs } = await supabase.from("coding_questions").select("*").eq("coding_test_id", testId).order("sort_order");
      setQuestions(qs || []);

      // Check existing attempt
      const { data: existing } = await supabase.from("coding_attempts")
        .select("*").eq("coding_test_id", testId).eq("student_id", user.id).maybeSingle();

      if (existing && (existing.status === "completed" || existing.status === "terminated")) {
        navigate("/student");
        return;
      }

      if (existing) {
        setAttempt(existing);
        const elapsed = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
        setTimeLeft(Math.max(0, t.duration_minutes * 60 - elapsed));
        // Load saved submissions
        const { data: subs } = await supabase.from("coding_submissions").select("*").eq("attempt_id", existing.id);
        if (subs) {
          const codeMap: Record<string, string> = {};
          subs.forEach(s => { codeMap[s.question_id] = s.code; });
          setCodes(codeMap);
        }
      } else {
        const { data: newAttempt } = await supabase.from("coding_attempts")
          .insert({ coding_test_id: testId, student_id: user.id, total_questions: (qs || []).length })
          .select().single();
        setAttempt(newAttempt);
        setTimeLeft(t.duration_minutes * 60);
      }
    };
    load();
  }, [testId, user, navigate]);

  // Timer
  useEffect(() => {
    if (!attempt || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { handleFinalSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [attempt]);

  const currentQuestion = questions[currentIndex];

  const handleCompile = async () => {
    if (!currentQuestion || !attempt) return;
    const code = codes[currentQuestion.id] || "";
    if (!code.trim()) { toast.error("Write some code first"); return; }
    setCompiling(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-code", {
        body: { code, testCases: currentQuestion.test_cases, questionText: currentQuestion.question_text },
      });
      if (error) throw error;
      setCompileResults(prev => ({ ...prev, [currentQuestion.id]: data }));

      // Save submission
      const { data: existingSub } = await supabase.from("coding_submissions")
        .select("id").eq("attempt_id", attempt.id).eq("question_id", currentQuestion.id).maybeSingle();

      if (existingSub) {
        await supabase.from("coding_submissions").update({ code, result: data, status: data.allPassed ? "passed" : "failed" }).eq("id", existingSub.id);
      } else {
        await supabase.from("coding_submissions").insert({ attempt_id: attempt.id, question_id: currentQuestion.id, code, result: data, status: data.allPassed ? "passed" : "failed" });
      }

      if (data.allPassed) toast.success("All test cases passed!");
      else if (data.compilationError) toast.error("Compilation error");
      else toast.warning("Some test cases failed");
    } catch (err: any) {
      toast.error(err.message || "Evaluation failed");
    } finally {
      setCompiling(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleFinalSubmit = useCallback(async () => {
    if (!attempt || submitting) return;
    setSubmitting(true);
    try {
      // Count passed questions
      const { data: subs } = await supabase.from("coding_submissions").select("*").eq("attempt_id", attempt.id);
      const passedCount = (subs || []).filter(s => s.status === "passed").length;

      await supabase.from("coding_attempts").update({
        status: "completed",
        submitted_at: new Date().toISOString(),
        score: passedCount,
      }).eq("id", attempt.id);

      toast.success("Test submitted!");
      navigate("/student");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting, navigate]);

  if (!test || !currentQuestion) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLast = currentIndex === questions.length - 1;
  const result = compileResults[currentQuestion.id];

  return (
    <div className="min-h-screen bg-background flex flex-col select-none" style={{ userSelect: "none" }}>
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-foreground truncate">{test.title}</h1>
        <div className="flex items-center gap-3">
          <Badge variant={timeLeft < 60 ? "destructive" : "secondary"} className="font-mono text-sm">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </Badge>
          <span className="text-sm text-muted-foreground">Q{currentIndex + 1}/{questions.length}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Question panel */}
        <div className="lg:w-2/5 p-4 border-b lg:border-b-0 lg:border-r overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question {currentIndex + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">{currentQuestion.question_text}</p>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Test Cases:</p>
                {(currentQuestion.test_cases as any[]).map((tc: any, i: number) => (
                  <div key={i} className="text-xs p-2 rounded bg-secondary/50 font-mono">
                    <span className="text-muted-foreground">Input:</span> {tc.input}<br />
                    <span className="text-muted-foreground">Expected:</span> {tc.expectedOutput}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Code editor panel */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="font-mono text-xs">C Language</Badge>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCompile} disabled={compiling}>
                {compiling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                {compiling ? "Compiling..." : "Compile & Run"}
              </Button>
            </div>
          </div>

          <textarea
            className="flex-1 w-full rounded-lg border border-input bg-card p-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={`#include <stdio.h>\n\nint main() {\n    // Write your C code here\n    return 0;\n}`}
            value={codes[currentQuestion.id] || ""}
            onChange={e => setCodes(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
            spellCheck={false}
            style={{ minHeight: "200px", tabSize: 4 }}
          />

          {/* Results */}
          {result && (
            <div className="mt-3 space-y-2 max-h-48 overflow-auto">
              {result.compilationError && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-xs font-mono">
                  Compilation Error: {result.compilationError}
                </div>
              )}
              {result.results?.map((r: any, i: number) => (
                <div key={i} className={`p-2 rounded text-xs font-mono flex items-start gap-2 ${r.passed ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                  {r.passed ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <div>
                    <div>Input: {r.input}</div>
                    <div>Expected: {r.expectedOutput}</div>
                    {!r.passed && <div>Got: {r.actualOutput}</div>}
                  </div>
                </div>
              ))}
              {result.summary && <p className="text-xs text-muted-foreground">{result.summary}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="border-t bg-card px-4 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <div className="flex gap-2">
          {isLast ? (
            <Button onClick={handleFinalSubmit} disabled={submitting} variant="destructive">
              <Send className="w-4 h-4 mr-1" /> {submitting ? "Submitting..." : "Submit All"}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
