import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function TestDetail() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const { data: test } = useQuery({
    queryKey: ["test", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").eq("id", testId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["test-questions", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").eq("test_id", testId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["test-attempts", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("test_attempts").select("*").eq("test_id", testId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["attempt-profiles", attempts.map(a => a.student_id)],
    queryFn: async () => {
      const studentIds = [...new Set(attempts.map(a => a.student_id))];
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("*").in("user_id", studentIds);
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["test-violations", testId],
    queryFn: async () => {
      const attemptIds = attempts.map(a => a.id);
      if (attemptIds.length === 0) return [];
      const { data, error } = await supabase.from("violations").select("*").in("attempt_id", attemptIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  // Mark violations as seen
  const markSeen = async () => {
    const unseenIds = violations.filter(v => !v.seen_by_teacher).map(v => v.id);
    if (unseenIds.length > 0) {
      await supabase.from("violations").update({ seen_by_teacher: true }).in("id", unseenIds);
    }
  };

  if (!test) return null;

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const avgScore = attempts.filter(a => a.score !== null).length > 0
    ? Math.round(attempts.filter(a => a.score !== null).reduce((s, a) => s + (a.score ?? 0), 0) / attempts.filter(a => a.score !== null).length)
    : 0;

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
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{attempts.length}</p>
              <p className="text-xs text-muted-foreground">Attempts</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{avgScore}/{totalMarks}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{violations.length}</p>
              <p className="text-xs text-muted-foreground">Violations</p>
            </CardContent></Card>
          </div>

          {/* Student attempts */}
          <Card>
            <CardHeader><CardTitle className="text-base">Student Attempts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No attempts yet</p>
              ) : (
                attempts.map(attempt => {
                  const profile = profiles.find(p => p.user_id === attempt.student_id);
                  const attemptViolations = violations.filter(v => v.attempt_id === attempt.id);
                  const statusIcon = attempt.status === "completed" ? <CheckCircle className="w-4 h-4 text-success" />
                    : attempt.status === "terminated" ? <XCircle className="w-4 h-4 text-destructive" />
                    : <Clock className="w-4 h-4 text-warning" />;

                  return (
                    <div key={attempt.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-3">
                        {statusIcon}
                        <div>
                          <p className="text-sm font-medium text-foreground">{profile?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {attempt.submitted_at ? format(new Date(attempt.submitted_at), "MMM d, HH:mm") : "In progress"}
                            {attempt.started_at && attempt.submitted_at && (
                              <> · {Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)} min</>
                            )}
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
                          {attempt.score !== null ? `${attempt.score}/${attempt.total_marks}` : "—"}
                        </span>
                      </div>
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
              {violations.some(v => !v.seen_by_teacher) && (
                <Button variant="ghost" size="sm" onClick={markSeen} className="text-xs">Mark all seen</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {violations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No violations</p>
              ) : (
                violations.map(v => {
                  const attempt = attempts.find(a => a.id === v.attempt_id);
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
