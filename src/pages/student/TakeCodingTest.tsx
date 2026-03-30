import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Send, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, Clock } from "lucide-react";

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
  const [started, setStarted] = useState(false);
  const terminatedRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);

  // Load test data (before start)
  useEffect(() => {
    if (!testId) return;
    const load = async () => {
      const { data: t } = await supabase.from("coding_tests").select("*").eq("id", testId).single();
      if (!t) { navigate("/student"); return; }
      setTest(t);
    };
    load();
  }, [testId, navigate]);

  const recordViolation = useCallback(async (type: string, desc: string) => {
    const aId = attemptIdRef.current;
    if (!aId) return;
    await supabase.from("coding_violations").insert({
      coding_attempt_id: aId,
      violation_type: type,
      description: desc,
    });
  }, []);

  const handleFinalSubmit = useCallback(async (status: "completed" | "terminated" = "completed") => {
    const aId = attemptIdRef.current;
    if (!aId || terminatedRef.current) return;
    terminatedRef.current = true;
    setSubmitting(true);
    try {
      const { data: subs } = await supabase.from("coding_submissions").select("*").eq("attempt_id", aId);
      const passedCount = (subs || []).filter(s => s.status === "passed").length;

      await supabase.from("coding_attempts").update({
        status,
        submitted_at: new Date().toISOString(),
        score: passedCount,
      }).eq("id", aId);

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      toast.success(status === "completed" ? "Test submitted!" : "Test terminated due to violation");
      navigate("/student");
    } catch (err: any) {
      toast.error(err.message);
      terminatedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [navigate]);

  // Security monitoring
  useEffect(() => {
    if (!started) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !terminatedRef.current) {
        recordViolation("Exited Fullscreen", "Student exited fullscreen mode");
        handleFinalSubmit("terminated");
      }
    };

    const handleVisibility = () => {
      if (document.hidden && !terminatedRef.current) {
        recordViolation("Tab Switch", "Student switched tabs or minimized");
        handleFinalSubmit("terminated");
      }
    };

    const handleBlur = () => {
      if (!terminatedRef.current) {
        recordViolation("Window Blur", "Student switched to another application");
        handleFinalSubmit("terminated");
      }
    };

    const preventCopy = (e: Event) => {
      e.preventDefault();
      toast.error("Copying is not allowed during the test");
    };

    const preventDrop = (e: Event) => {
      e.preventDefault();
      toast.error("Drag and drop is not allowed during the test");
    };

    const preventScreenshot = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.key === "PrtSc" || e.key === "PrtScn") {
        e.preventDefault();
        recordViolation("Screenshot Attempt", "Student attempted to take a screenshot");
        toast.error("Screenshots are not allowed");
      }
      // Block Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A everywhere
      if (e.ctrlKey && ["c","C","v","V","x","X","a","A"].includes(e.key)) {
        e.preventDefault();
        toast.error("This action is not allowed during the test");
      }
      // Block Cmd+C/V/X on Mac
      if (e.metaKey && ["c","C","v","V","x","X","a","A"].includes(e.key)) {
        e.preventDefault();
        toast.error("This action is not allowed during the test");
      }
      if (
        (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s" || e.key === "I" || e.key === "i")) ||
        (e.ctrlKey && (e.key === "p" || e.key === "P" || e.key === "u" || e.key === "U"))
      ) {
        e.preventDefault();
        toast.error("This action is not allowed during the test");
      }
    };

    const preventContextMenu = (e: Event) => { e.preventDefault(); };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("paste", preventCopy);
    document.addEventListener("drop", preventDrop);
    document.addEventListener("dragover", preventDrop);
    document.addEventListener("keydown", preventScreenshot);
    document.addEventListener("contextmenu", preventContextMenu);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("paste", preventCopy);
      document.removeEventListener("drop", preventDrop);
      document.removeEventListener("dragover", preventDrop);
      document.removeEventListener("keydown", preventScreenshot);
      document.removeEventListener("contextmenu", preventContextMenu);
    };
  }, [started, recordViolation, handleFinalSubmit]);

  // Timer
  useEffect(() => {
    if (!started || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { handleFinalSubmit("completed"); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started, timeLeft, handleFinalSubmit]);

  const startTest = async () => {
    if (!user || !test || !testId) return;
    try {
      await document.documentElement.requestFullscreen();

      // Check existing attempt
      const { data: existing } = await supabase.from("coding_attempts")
        .select("*").eq("coding_test_id", testId).eq("student_id", user.id).maybeSingle();

      if (existing && (existing.status === "completed" || existing.status === "terminated")) {
        navigate("/student");
        return;
      }

      const { data: qs } = await supabase.from("coding_questions").select("*").eq("coding_test_id", testId).order("sort_order");
      setQuestions(qs || []);

      if (existing) {
        setAttempt(existing);
        attemptIdRef.current = existing.id;
        const elapsed = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
        setTimeLeft(Math.max(0, test.duration_minutes * 60 - elapsed));
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
        attemptIdRef.current = newAttempt!.id;
        setTimeLeft(test.duration_minutes * 60);
      }

      setStarted(true);
    } catch {
      toast.error("Could not start test. Please allow fullscreen.");
    }
  };

  const currentQuestion = questions[currentIndex];

  const handleCompile = async () => {
    if (!currentQuestion || !attempt) return;
    const code = codes[currentQuestion.id] || "";
    if (!code.trim()) { toast.error("Write some code first"); return; }
    setCompiling(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-code", {
        body: { code, testCases: currentQuestion.test_cases, questionText: currentQuestion.question_text, language: (test as any).language || "c" },
      });
      if (error) throw error;
      setCompileResults(prev => ({ ...prev, [currentQuestion.id]: data }));

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

  if (!test) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Pre-start screen
  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full animate-fade-in">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2">{test.title}</h2>
              {test.description && <p className="text-sm text-muted-foreground">{test.description}</p>}
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-yellow-600 font-medium text-sm">
                <AlertTriangle className="w-4 h-4" /> Important Rules
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• The test will open in <strong>fullscreen mode</strong></li>
                <li>• Exiting fullscreen will <strong>terminate</strong> your test</li>
                <li>• Switching tabs or apps will <strong>terminate</strong> your test</li>
                <li>• Duration: <strong>{test.duration_minutes} minutes</strong></li>
                <li>• All violations are reported to the teacher</li>
              </ul>
            </div>
            <Button className="w-full" size="lg" onClick={startTest}>
              Start Coding Test
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLast = currentIndex === questions.length - 1;
  const result = compileResults[currentQuestion?.id];

  return (
    <div className="min-h-screen bg-background flex flex-col select-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground truncate">{test.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={timeLeft < 60 ? "destructive" : "secondary"} className={`font-mono text-sm ${timeLeft < 60 ? "animate-pulse" : ""}`}>
            <Clock className="w-3.5 h-3.5 mr-1" />
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </Badge>
          <span className="text-sm text-muted-foreground">Q{currentIndex + 1}/{questions.length}</span>
        </div>
      </div>

      {currentQuestion && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Question panel */}
          <div className="md:w-2/5 p-3 md:p-4 border-b md:border-b-0 md:border-r overflow-auto max-h-[30vh] md:max-h-none">
            <Card>
              <CardHeader className="p-3 md:p-6">
                <CardTitle className="text-sm md:text-base">Question {currentIndex + 1}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <p className="text-xs md:text-sm text-foreground whitespace-pre-wrap">{currentQuestion.question_text}</p>
                <div className="mt-3 md:mt-4 space-y-1.5 md:space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Test Cases:</p>
                  {(currentQuestion.test_cases as any[]).map((tc: any, i: number) => (
                    <div key={i} className="text-xs p-1.5 md:p-2 rounded bg-secondary/50 font-mono">
                      <span className="text-muted-foreground">Input:</span> {tc.input}<br />
                      <span className="text-muted-foreground">Expected:</span> {tc.expectedOutput}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Code editor panel */}
          <div className="flex-1 flex flex-col p-3 md:p-4 overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <Badge variant="outline" className="font-mono text-xs shrink-0">
                {{ c: "C", cpp: "C++", java: "Java", python: "Python" }[(test as any).language || "c"] || "C"}
              </Badge>
              <Button size="sm" onClick={handleCompile} disabled={compiling} className="shrink-0 text-xs md:text-sm">
                {compiling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                {compiling ? "Running..." : "Compile & Run"}
              </Button>
            </div>

            <textarea
              className="flex-1 w-full rounded-lg border border-input bg-card p-2 md:p-3 font-mono text-xs md:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={
                {
                  c: `#include <stdio.h>\n\nint main() {\n    // Write your C code here\n    return 0;\n}`,
                  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}`,
                  java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your Java code here\n    }\n}`,
                  python: `# Write your Python code here\n`,
                }[(test as any).language || "c"] || `#include <stdio.h>\n\nint main() {\n    return 0;\n}`
              }
              value={codes[currentQuestion.id] || ""}
              onChange={e => setCodes(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              inputMode="text"
              onPaste={e => e.preventDefault()}
              onCopy={e => e.preventDefault()}
              onCut={e => e.preventDefault()}
              onDrop={e => e.preventDefault()}
              onDragOver={e => e.preventDefault()}
              style={{ minHeight: "150px", tabSize: 4, WebkitTextSecurity: "none" as any }}
            />

            {result && (
              <div className="mt-2 md:mt-3 space-y-1.5 md:space-y-2 max-h-32 md:max-h-48 overflow-auto">
                {result.compilationError && (
                  <div className="p-1.5 md:p-2 rounded bg-destructive/10 text-destructive text-xs font-mono">
                    Error: {result.compilationError}
                  </div>
                )}
                {result.results?.map((r: any, i: number) => (
                  <div key={i} className={`p-1.5 md:p-2 rounded text-xs font-mono flex items-start gap-1.5 md:gap-2 ${r.passed ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                    {r.passed ? <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3 h-3 md:w-3.5 md:h-3.5 mt-0.5 shrink-0" />}
                    <div className="min-w-0 break-all">
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
      )}

      {/* Footer navigation */}
      <div className="border-t bg-card px-4 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <div className="flex gap-2">
          {isLast ? (
            <Button onClick={() => handleFinalSubmit("completed")} disabled={submitting} variant="destructive">
              <Send className="w-4 h-4 mr-1" /> {submitting ? "Submitting..." : "Submit All"}
            </Button>
          ) : (
            <Button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
