import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Clock, AlertTriangle, Send, ShieldCheck } from "lucide-react";

export default function TakeTest() {
  const { testId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const terminatedRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);

  const { data: test } = useQuery({
    queryKey: ["take-test", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").eq("id", testId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["take-test-questions", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").eq("test_id", testId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Check existing attempt
  const { data: existingAttempt } = useQuery({
    queryKey: ["existing-attempt", testId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("test_id", testId!)
        .eq("student_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user && !!testId,
  });

  useEffect(() => {
    if (existingAttempt) {
      if (existingAttempt.status === "completed" || existingAttempt.status === "terminated") {
        navigate(`/student/result/${existingAttempt.id}`, { replace: true });
      }
    }
  }, [existingAttempt, navigate]);

  const recordViolation = useCallback(async (type: string, desc: string) => {
    const aId = attemptIdRef.current;
    if (!aId) return;
    await supabase.from("violations").insert({ attempt_id: aId, violation_type: type, description: desc });
  }, []);

  const submitTest = useCallback(async (status: "completed" | "terminated") => {
    const aId = attemptIdRef.current;
    if (!aId || terminatedRef.current) return;
    terminatedRef.current = true;
    setSubmitting(true);

    try {
      // Save all answers
      const answersToInsert = Object.entries(answers).map(([qId, opt]) => ({
        attempt_id: aId, question_id: qId, selected_option: opt,
      }));
      if (answersToInsert.length > 0) {
        await supabase.from("student_answers").upsert(answersToInsert, { onConflict: "attempt_id,question_id" });
      }

      // Calculate score
      let score = 0;
      let totalMarks = 0;
      questions.forEach(q => {
        totalMarks += q.marks;
        if (answers[q.id] === q.correct_option) score += q.marks;
      });

      await supabase.from("test_attempts").update({
        status, submitted_at: new Date().toISOString(), score, total_marks: totalMarks,
      }).eq("id", aId);

      // Exit fullscreen
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      toast.success(status === "completed" ? "Test submitted!" : "Test terminated due to violation");
      navigate(`/student/result/${aId}`, { replace: true });
    } catch (err: any) {
      toast.error("Error submitting: " + err.message);
      terminatedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [answers, questions, navigate]);

  // Fullscreen and violation monitoring
  useEffect(() => {
    if (!started) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !terminatedRef.current) {
        recordViolation("Exited Fullscreen", "Student exited fullscreen mode");
        submitTest("terminated");
      }
    };

    const handleVisibility = () => {
      if (document.hidden && !terminatedRef.current) {
        recordViolation("Tab Switch", "Student switched tabs or minimized");
        submitTest("terminated");
      }
    };

    const handleBlur = () => {
      if (!terminatedRef.current) {
        recordViolation("Window Blur", "Student switched to another application");
        submitTest("terminated");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [started, recordViolation, submitTest]);

  // Timer
  useEffect(() => {
    if (!started || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          submitTest("completed");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started, timeLeft, submitTest]);

  const startTest = async () => {
    if (!user || !test) return;
    try {
      // Enter fullscreen
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);

      // Create attempt
      const { data: attempt, error } = await supabase
        .from("test_attempts")
        .insert({ test_id: test.id, student_id: user.id })
        .select()
        .single();
      if (error) throw error;

      setAttemptId(attempt.id);
      attemptIdRef.current = attempt.id;
      setTimeLeft(test.duration_minutes * 60);
      setStarted(true);
    } catch (err: any) {
      toast.error("Could not start test. Please allow fullscreen.");
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!test) return null;

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
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-warning font-medium text-sm">
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
              Start Test
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const question = questions[currentQ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground text-sm">{test.title}</span>
        </div>
        <div className={`flex items-center gap-2 text-sm font-mono font-bold ${timeLeft < 60 ? "text-destructive animate-pulse" : "text-foreground"}`}>
          <Clock className="w-4 h-4" />
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-2xl mx-auto w-full">
        {question && (
          <div className="w-full space-y-6 animate-fade-in" key={question.id}>
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Question {currentQ + 1} of {questions.length}</span>
              <span>{question.marks} mark{question.marks > 1 ? "s" : ""}</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
            </div>

            {/* Question */}
            <h2 className="text-lg font-semibold text-foreground">{question.question_text}</h2>

            {/* Options */}
            <div className="space-y-3">
              {(["A", "B", "C", "D"] as const).map(opt => {
                const optionText = (question as any)[`option_${opt.toLowerCase()}`];
                const isSelected = answers[question.id] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswers({ ...answers, [question.id]: opt })}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30 bg-card"
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    }`}>{opt}</span>
                    <span className="text-sm text-foreground">{optionText}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
                Previous
              </Button>
              <div className="flex gap-2">
                {/* Question dots */}
                {questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                      i === currentQ ? "bg-primary text-primary-foreground" :
                      answers[questions[i].id] ? "bg-success/20 text-success" : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              {currentQ === questions.length - 1 ? (
                <Button onClick={() => submitTest("completed")} disabled={submitting}>
                  <Send className="w-4 h-4 mr-2" /> Submit
                </Button>
              ) : (
                <Button onClick={() => setCurrentQ(currentQ + 1)}>Next</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
