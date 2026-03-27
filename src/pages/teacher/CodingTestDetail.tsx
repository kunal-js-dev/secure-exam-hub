import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, XCircle, Code } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export default function CodingTestDetail() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

  const { data: test } = useQuery({
    queryKey: ["coding-test", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("coding_tests").select("*").eq("id", testId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["coding-test-questions", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("coding_questions").select("*").eq("coding_test_id", testId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["coding-test-attempts", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("coding_attempts").select("*").eq("coding_test_id", testId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["coding-attempt-profiles", attempts.map(a => a.student_id)],
    queryFn: async () => {
      const studentIds = [...new Set(attempts.map(a => a.student_id))];
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("*").in("user_id", studentIds);
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["coding-test-submissions", attempts.map(a => a.id)],
    queryFn: async () => {
      const attemptIds = attempts.map(a => a.id);
      if (attemptIds.length === 0) return [];
      const { data, error } = await supabase.from("coding_submissions").select("*").in("attempt_id", attemptIds);
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["coding-test-violations", testId],
    queryFn: async () => {
      const attemptIds = attempts.map(a => a.id);
      if (attemptIds.length === 0) return [];
      const { data, error } = await supabase.from("coding_violations").select("*").in("coding_attempt_id", attemptIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  const markSeen = async () => {
    const unseenIds = violations.filter((v: any) => !v.seen_by_teacher).map((v: any) => v.id);
    if (unseenIds.length > 0) {
      await supabase.from("coding_violations").update({ seen_by_teacher: true }).in("id", unseenIds);
    }
  };

  if (!test) return null;

  const avgScore = attempts.filter(a => a.score !== null).length > 0
    ? (attempts.filter(a => a.score !== null).reduce((s, a) => s + (a.score ?? 0), 0) / attempts.filter(a => a.score !== null).length).toFixed(1)
    : "—";

  return (
    <DashboardLayout
      title={test.title}
      actions={
        <Button variant="ghost" onClick={() => navigate("/teacher")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{attempts.length}</p>
              <p className="text-xs text-muted-foreground">Attempts</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{avgScore}/{questions.length}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{violations.length}</p>
              <p className="text-xs text-muted-foreground">Violations</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{questions.length}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </CardContent></Card>
          </div>

          {/* Student attempts */}
          <Card>
            <CardHeader><CardTitle className="text-base">Student Attempts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No attempts yet</p>
              ) : (
                attempts.map(attempt => {
                  const profile = profiles.find(p => p.user_id === attempt.student_id);
                  const attemptSubs = submissions.filter(s => s.attempt_id === attempt.id);
                  const attemptViolations = violations.filter((v: any) => v.coding_attempt_id === attempt.id);
                  const isExpanded = expandedAttempt === attempt.id;
                  const statusIcon = attempt.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : attempt.status === "terminated" ? <XCircle className="w-4 h-4 text-destructive" />
                    : <Clock className="w-4 h-4 text-yellow-500" />;

                  return (
                    <div key={attempt.id} className="rounded-lg border bg-card">
                      <button
                        className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors rounded-lg"
                        onClick={() => setExpandedAttempt(isExpanded ? null : attempt.id)}
                      >
                        <div className="flex items-center gap-3">
                          {statusIcon}
                          <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {attempt.submitted_at ? format(new Date(attempt.submitted_at), "MMM d, HH:mm") : "In progress"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {attemptViolations.length > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" /> {attemptViolations.length}
                            </Badge>
                          )}
                          <span className="text-sm font-semibold text-foreground">
                            {attempt.score !== null ? `${attempt.score}/${attempt.total_questions}` : "—"}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t p-4 space-y-4">
                          {questions.map((q, qi) => {
                            const sub = attemptSubs.find(s => s.question_id === q.id);
                            return (
                              <div key={q.id} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-foreground">Q{qi + 1}: {q.question_text.substring(0, 80)}...</p>
                                  <Badge variant={sub?.status === "passed" ? "default" : sub ? "destructive" : "secondary"}>
                                    {sub?.status === "passed" ? "Passed" : sub ? "Failed" : "No submission"}
                                  </Badge>
                                </div>
                                {sub && (
                                  <pre className="text-xs bg-secondary/50 p-3 rounded-lg overflow-auto max-h-48 font-mono text-foreground">
                                    {sub.code}
                                  </pre>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Violations sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Violations</CardTitle>
              {violations.some((v: any) => !v.seen_by_teacher) && (
                <Button variant="ghost" size="sm" onClick={markSeen} className="text-xs">Mark all seen</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {violations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No violations</p>
              ) : (
                violations.map((v: any) => {
                  const attempt = attempts.find(a => a.id === v.coding_attempt_id);
                  const profile = profiles.find(p => p.user_id === attempt?.student_id);
                  return (
                    <div key={v.id} className={`p-3 rounded-lg text-sm ${!v.seen_by_teacher ? "bg-destructive/10 border border-destructive/20" : "bg-secondary/50"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3 h-3 text-destructive" />
                        <span className="font-medium text-foreground">{v.violation_type}</span>
                        {!v.seen_by_teacher && <Badge className="text-[10px] h-4 bg-destructive">New</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{profile?.full_name} · {format(new Date(v.created_at), "HH:mm:ss")}</p>
                      {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
