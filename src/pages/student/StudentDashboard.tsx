import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle, XCircle, PlayCircle, BarChart3, Trophy, Code } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStudentPresence } from "@/hooks/usePresence";

export default function StudentDashboard() {
  useStudentPresence();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: tests = [] } = useQuery({
    queryKey: ["student-tests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["student-attempts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("student_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: codingTests = [] } = useQuery({
    queryKey: ["student-coding-tests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coding_tests")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: codingAttempts = [] } = useQuery({
    queryKey: ["student-coding-attempts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coding_attempts")
        .select("*")
        .eq("student_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <DashboardLayout title="Student Dashboard">
      <Tabs defaultValue="mcq" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="mcq">MCQ Tests</TabsTrigger>
          <TabsTrigger value="coding"><Code className="w-4 h-4 mr-1" /> Coding</TabsTrigger>
        </TabsList>

        <TabsContent value="mcq">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.map(test => {
              const attempt = attempts.find(a => a.test_id === test.id);
              const hasAttempted = !!attempt;
              const isCompleted = attempt?.status === "completed" || attempt?.status === "terminated";

              return (
                <Card key={test.id} className="animate-fade-in hover:shadow-md transition-shadow">
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{test.title}</h3>
                      {test.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{test.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {test.duration_minutes} min</span>
                      {hasAttempted && (
                        <Badge variant={attempt.status === "completed" ? "default" : attempt.status === "terminated" ? "destructive" : "secondary"}>
                          {attempt.status === "completed" && <CheckCircle className="w-3 h-3 mr-1" />}
                          {attempt.status === "terminated" && <XCircle className="w-3 h-3 mr-1" />}
                          {attempt.status === "in_progress" ? "In Progress" : attempt.status === "completed" ? "Completed" : "Terminated"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!hasAttempted ? (
                        <Button className="w-full" onClick={() => navigate(`/student/test/${test.id}`)}>
                          <PlayCircle className="w-4 h-4 mr-2" /> Start Test
                        </Button>
                      ) : isCompleted ? (
                        <>
                          <Button variant="outline" className="flex-1" onClick={() => navigate(`/student/result/${attempt.id}`)}>
                            <BarChart3 className="w-4 h-4 mr-2" /> Result
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => navigate(`/leaderboard/${test.id}`)}>
                            <Trophy className="w-4 h-4 text-yellow-500" />
                          </Button>
                          {attempt.score !== null && (
                            <span className="flex items-center text-sm font-semibold text-foreground px-3">
                              {attempt.score}/{attempt.total_marks}
                            </span>
                          )}
                        </>
                      ) : (
                        <Button className="w-full" onClick={() => navigate(`/student/test/${test.id}`)}>
                          <PlayCircle className="w-4 h-4 mr-2" /> Resume Test
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {tests.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No MCQ tests available yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="coding">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {codingTests.map((ct: any) => {
              const attempt = codingAttempts.find((a: any) => a.coding_test_id === ct.id);
              const hasAttempted = !!attempt;
              const isCompleted = attempt?.status === "completed";

              return (
                <Card key={ct.id} className="animate-fade-in hover:shadow-md transition-shadow">
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Code className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-foreground">{ct.title}</h3>
                      </div>
                      {ct.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{ct.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {ct.duration_minutes} min</span>
                      {hasAttempted && (
                        <Badge variant={isCompleted ? "default" : "secondary"}>
                          {isCompleted ? <><CheckCircle className="w-3 h-3 mr-1" /> Completed</> : "In Progress"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!hasAttempted ? (
                        <Button className="w-full" onClick={() => navigate(`/student/coding-test/${ct.id}`)}>
                          <PlayCircle className="w-4 h-4 mr-2" /> Start
                        </Button>
                      ) : isCompleted ? (
                        <div className="flex items-center gap-2 w-full">
                          <Badge variant="outline" className="text-sm">
                            Score: {attempt.score}/{attempt.total_questions}
                          </Badge>
                        </div>
                      ) : (
                        <Button className="w-full" onClick={() => navigate(`/student/coding-test/${ct.id}`)}>
                          <PlayCircle className="w-4 h-4 mr-2" /> Resume
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {codingTests.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Code className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No coding tests available yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
