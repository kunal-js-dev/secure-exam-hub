import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Users, AlertTriangle, Eye, Trash2, Code } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const { data: codingTests = [] } = useQuery({
    queryKey: ["teacher-coding-tests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coding_tests")
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
        toast.error("⚠️ Violation detected!", { description: payload.new.violation_type });
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

  const handleDeleteTest = async (testId: string) => {
    try {
      // Delete related data first
      const { data: testAttempts } = await supabase.from("test_attempts").select("id").eq("test_id", testId);
      if (testAttempts && testAttempts.length > 0) {
        const attemptIds = testAttempts.map(a => a.id);
        await supabase.from("violations").delete().in("attempt_id", attemptIds);
        await supabase.from("student_answers").delete().in("attempt_id", attemptIds);
        await supabase.from("test_attempts").delete().eq("test_id", testId);
      }
      await supabase.from("questions").delete().eq("test_id", testId);
      await supabase.from("tests").delete().eq("id", testId);
      toast.success("Test deleted");
      queryClient.invalidateQueries({ queryKey: ["teacher-tests"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteCodingTest = async (testId: string) => {
    try {
      await supabase.from("coding_tests").delete().eq("id", testId);
      toast.success("Coding test deleted");
      queryClient.invalidateQueries({ queryKey: ["teacher-coding-tests"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const totalStudents = new Set(attempts.map(a => a.student_id)).size;
  const terminatedAttempts = attempts.filter(a => a.status === "terminated").length;

  return (
    <DashboardLayout
      title="Teacher Dashboard"
      actions={
        <div className="flex gap-2">
          <Button onClick={() => navigate("/teacher/create-test")}>
            <Plus className="w-4 h-4 mr-2" /> MCQ Test
          </Button>
          <Button variant="outline" onClick={() => navigate("/teacher/create-coding-test")}>
            <Code className="w-4 h-4 mr-2" /> Coding Test
          </Button>
        </div>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "MCQ Tests", value: tests.length, icon: FileText, color: "text-primary" },
          { label: "Coding Tests", value: codingTests.length, icon: Code, color: "text-accent" },
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

      {/* MCQ Tests */}
      <h2 className="text-lg font-semibold text-foreground mb-3">MCQ Tests</h2>
      <div className="space-y-3 mb-8">
        {tests.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm">No MCQ tests yet</p>
          </Card>
        ) : (
          tests.map(test => {
            const testAttempts = attempts.filter(a => a.test_id === test.id);
            return (
              <Card key={test.id} className="animate-fade-in hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{test.title}</h3>
                      <Badge variant={test.is_published ? "default" : "secondary"}>
                        {test.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {test.duration_minutes} min · {testAttempts.length} attempts
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/test/${test.id}`)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/test/${test.id}/edit`)}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{test.title}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this test, all questions, student attempts, and results. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteTest(test.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Coding Tests */}
      <h2 className="text-lg font-semibold text-foreground mb-3">Coding Tests</h2>
      <div className="space-y-3">
        {codingTests.length === 0 ? (
          <Card className="p-8 text-center">
            <Code className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm">No coding tests yet</p>
          </Card>
        ) : (
          codingTests.map((ct: any) => (
            <Card key={ct.id} className="animate-fade-in hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground truncate">{ct.title}</h3>
                    <Badge variant={ct.is_published ? "default" : "secondary"}>
                      {ct.is_published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{ct.duration_minutes} min</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{ct.title}"?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete this coding test and all related data.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteCodingTest(ct.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
