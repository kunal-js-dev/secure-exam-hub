import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, PlayCircle, BarChart3, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StudentDashboard() {
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

  return (
    <DashboardLayout title="Available Tests">
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
                        <BarChart3 className="w-4 h-4 mr-2" /> View Result
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
            <p className="text-muted-foreground">No tests available yet</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
