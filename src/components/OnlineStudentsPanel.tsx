import { useOnlineStudents } from "@/hooks/usePresence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Circle } from "lucide-react";
import { useEffect, useState } from "react";

function formatDuration(since: string) {
  const diff = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function OnlineStudentsPanel() {
  const onlineStudents = useOnlineStudents();
  const [, setTick] = useState(0);

  // Update durations every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Online Students
          <Badge variant="secondary" className="ml-auto">
            {onlineStudents.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {onlineStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No students online
          </p>
        ) : (
          onlineStudents.map((student) => (
            <div
              key={student.userId}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500 shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">
                  {student.fullName}
                </span>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                {formatDuration(student.onlineSince)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
