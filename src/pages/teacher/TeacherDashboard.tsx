import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Users, AlertTriangle, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unseenViolations, setUnseenViolations] = useState(0);

  const { data: tests = [] } = useQuery({
    queryKey: ["teacher-tests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["teacher-attempts", user?.id],
    queryFn: async () => {
      const testIds = tests.map(t => t.id);
      if (testIds.length === 0) return [];
      const { data, error } = await supabase
        .from("test_attempts")
        .select("*")
        .in("test_id", testIds);
      if (error) throw error;
      return data;
    },
    enabled: tests.length > 0,
  });

  // Realtime violations
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("violations-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "violations" }, (payload) => {
        setUnseenViolations(prev => prev + 1);
        import("sonner").then(({ toast }) => {
          toast.error("⚠️ Violation detected!", { description: payload.new.violation_type });
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Count unseen violations
  useQuery({
    queryKey: ["unseen-violations", user?.id],
    queryFn: async () => {
      const testIds = tests.map(t => t.id);
      if (testIds.length === 0) return 0;
      const attemptIds = attempts.map(a => a.id);
      if (attemptIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .in("attempt_id", attemptIds)
        .eq("seen_by_teacher", false);
      if (error) throw error;
      setUnseenViolations(count ?? 0);
      return count;
    },
    enabled: attempts.length > 0,
  });

  const totalStudents = new Set(attempts.map(a => a.student_id)).size;
  const terminatedAttempts = attempts.filter(a => a.status === "terminated").length;

  return (
    <DashboardLayout
      title="Teacher Dashboard"
      actions={
        <Button onClick={() => navigate("/teacher/create-test")}>
          <Plus className="w-4 h-4 mr-2" /> Create Test
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Tests", value: tests.length, icon: FileText, color: "text-primary" },
          { label: "Total Students", value: totalStudents, icon: Users, color: "text-accent" },
          { label: "Violations", value: unseenViolations, icon: AlertTriangle, color: "text-destructive" },
          { label: "Terminated", value: terminatedAttempts, icon: AlertTriangle, color: "text-warning" },
        ].map(stat => (
          <Card key={stat.label} className="animate-fade-in">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tests list */}
      <div className="space-y-3">
        {tests.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No tests created yet</p>
            <Button className="mt-4" onClick={() => navigate("/teacher/create-test")}>
              <Plus className="w-4 h-4 mr-2" /> Create your first test
            </Button>
          </Card>
        ) : (
          tests.map(test => {
            const testAttempts = attempts.filter(a => a.test_id === test.id);
            return (
              <Card key={test.id} className="animate-fade-in hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{test.title}</h3>
                      <Badge variant={test.is_published ? "default" : "secondary"}>
                        {test.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {test.duration_minutes} min · {testAttempts.length} attempts
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/test/${test.id}`)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/test/${test.id}/edit`)}>
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
