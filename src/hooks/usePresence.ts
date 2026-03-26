import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface OnlineUser {
  userId: string;
  fullName: string;
  onlineSince: string; // ISO timestamp
}

const CHANNEL_NAME = "online-users";

/**
 * For students: broadcasts presence so teachers can see them.
 * For teachers: subscribes and returns list of online students.
 */
export function useStudentPresence() {
  const { user, profile } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "student") return;

    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {})
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: user.id,
            fullName: profile?.full_name || "Student",
            onlineSince: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [user, profile]);
}

export function useOnlineStudents() {
  const { user, profile } = useAuth();
  const [onlineStudents, setOnlineStudents] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!user || profile?.role !== "teacher") return;

    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: `teacher-${user.id}` } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const students: OnlineUser[] = [];
        for (const key of Object.keys(state)) {
          if (key.startsWith("teacher-")) continue;
          const presences = state[key] as any[];
          if (presences.length > 0) {
            students.push({
              userId: presences[0].userId,
              fullName: presences[0].fullName,
              onlineSince: presences[0].onlineSince,
            });
          }
        }
        setOnlineStudents(students);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  return onlineStudents;
}
