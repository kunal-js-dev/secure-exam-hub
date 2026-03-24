import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trophy, Medal, Clock } from "lucide-react";

export default function Leaderboard() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const { data: test } = useQuery({
    queryKey: ["leaderboard-test", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").eq("id", testId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["leaderboard-attempts", testId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("test_id", testId!)
        .in("status", ["completed", "terminated"])
        .order("score", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["leaderboard-profiles", attempts.map(a => a.student_id)],
    queryFn: async () => {
      const ids = [...new Set(attempts.map(a => a.student_id))];
      if (!ids.length) return [];
      const { data, error } = await supabase.from("profiles").select("*").in("user_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: attempts.length > 0,
  });

  const ranked = attempts
    .sort((a, b) => {
      if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
      const aTime = a.submitted_at && a.started_at ? new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime() : Infinity;
      const bTime = b.submitted_at && b.started_at ? new Date(b.submitted_at).getTime() - new Date(b.started_at).getTime() : Infinity;
      return aTime - bTime;
    });

  const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-700"];

  if (!test) return null;

  return (
    <DashboardLayout
      title="Leaderboard"
      actions={<Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>}
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-muted-foreground text-sm mb-2">{test.title}</p>

        {ranked.length === 0 ? (
          <Card className="p-12 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No completed attempts yet</p>
          </Card>
        ) : (
          ranked.map((attempt, i) => {
            const profile = profiles.find(p => p.user_id === attempt.student_id);
            const timeTaken = attempt.submitted_at && attempt.started_at
              ? Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
              : null;

            return (
              <Card key={attempt.id} className={`animate-fade-in ${i < 3 ? "border-primary/20 shadow-sm" : ""}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    {i < 3 ? (
                      <Medal className={`w-5 h-5 ${medalColors[i]}`} />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{profile?.full_name || "Unknown"}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {timeTaken !== null && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeTaken} min</span>
                      )}
                      {attempt.status === "terminated" && (
                        <span className="text-destructive">Terminated</span>
                      )}
                    </div>
                  </div>
                  <span className="text-lg font-bold text-foreground">
                    {attempt.score ?? 0}<span className="text-sm text-muted-foreground">/{attempt.total_marks ?? 0}</span>
                  </span>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
