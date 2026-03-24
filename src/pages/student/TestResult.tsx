import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Trophy, Clock } from "lucide-react";
import { format } from "date-fns";

export default function TestResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const { data: attempt } = useQuery({
    queryKey: ["attempt-result", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase.from("test_attempts").select("*").eq("id", attemptId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: test } = useQuery({
    queryKey: ["result-test", attempt?.test_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").eq("id", attempt!.test_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!attempt,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["result-questions", attempt?.test_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").eq("test_id", attempt!.test_id).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!attempt,
  });

  const { data: studentAnswers = [] } = useQuery({
    queryKey: ["result-answers", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_answers").select("*").eq("attempt_id", attemptId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["result-violations", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase.from("violations").select("*").eq("attempt_id", attemptId!);
      if (error) throw error;
      return data;
    },
  });

  if (!attempt || !test) return null;

  const percentage = attempt.total_marks ? Math.round((attempt.score ?? 0) / attempt.total_marks * 100) : 0;
  const timeTaken = attempt.submitted_at && attempt.started_at
    ? Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
    : 0;

  return (
    <DashboardLayout
      title="Test Result"
      actions={<Button variant="ghost" onClick={() => navigate("/student")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>}
    >
      <div className="max-w-3xl space-y-6">
        {/* Score card */}
        <Card className="overflow-hidden">
          <div className={`p-6 text-center ${attempt.status === "terminated" ? "bg-destructive/10" : percentage >= 50 ? "bg-success/10" : "bg-warning/10"}`}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 border-4 border-current">
              {attempt.status === "terminated" ? (
                <XCircle className="w-10 h-10 text-destructive" />
              ) : (
                <Trophy className="w-10 h-10 text-foreground" />
              )}
            </div>
            <h2 className="text-3xl font-bold text-foreground">{attempt.score ?? 0}/{attempt.total_marks ?? 0}</h2>
            <p className="text-lg text-muted-foreground">{percentage}%</p>
            <Badge variant={attempt.status === "terminated" ? "destructive" : "default"} className="mt-2">
              {attempt.status === "terminated" ? "Terminated" : "Completed"}
            </Badge>
          </div>
          <CardContent className="p-4 flex justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {timeTaken} min</span>
            {violations.length > 0 && (
              <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="w-4 h-4" /> {violations.length} violation{violations.length > 1 ? "s" : ""}</span>
            )}
          </CardContent>
        </Card>

        {/* Violations */}
        {violations.length > 0 && (
          <Card className="border-destructive/20">
            <CardHeader><CardTitle className="text-base text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Violations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {violations.map(v => (
                <div key={v.id} className="p-3 rounded-lg bg-destructive/5 text-sm">
                  <span className="font-medium text-foreground">{v.violation_type}</span>
                  <span className="text-muted-foreground"> · {format(new Date(v.created_at), "HH:mm:ss")}</span>
                  {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Answer review */}
        {test.allow_result_review && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Answer Analysis</h3>
            {questions.map((q, i) => {
              const answer = studentAnswers.find(a => a.question_id === q.id);
              const isCorrect = answer?.selected_option === q.correct_option;
              const wasAnswered = !!answer?.selected_option;

              return (
                <Card key={q.id} className={`animate-fade-in ${isCorrect ? "border-success/30" : wasAnswered ? "border-destructive/30" : "border-warning/30"}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      {isCorrect ? <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">Q{i + 1}. {q.question_text}</p>
                        <p className="text-xs text-muted-foreground">{q.marks} mark{q.marks > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-7">
                      {(["A","B","C","D"] as const).map(opt => {
                        const text = (q as any)[`option_${opt.toLowerCase()}`];
                        const isAnswer = answer?.selected_option === opt;
                        const isCorrectOpt = q.correct_option === opt;
                        let className = "p-2 rounded-lg text-xs flex items-center gap-2 ";
                        if (isCorrectOpt) className += "bg-success/10 border border-success/30 text-success";
                        else if (isAnswer && !isCorrectOpt) className += "bg-destructive/10 border border-destructive/30 text-destructive";
                        else className += "bg-secondary text-secondary-foreground";
                        return (
                          <div key={opt} className={className}>
                            <span className="font-bold">{opt}.</span> {text}
                            {isCorrectOpt && <CheckCircle className="w-3 h-3 ml-auto" />}
                            {isAnswer && !isCorrectOpt && <XCircle className="w-3 h-3 ml-auto" />}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
