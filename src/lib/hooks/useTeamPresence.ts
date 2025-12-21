"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface OnlineUser {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  joined_at: string;
}

interface PresenceState {
  [key: string]: OnlineUser[];
}

interface UseTeamPresenceOptions {
  teamId: string | null;
  currentUser: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

interface UseTeamPresenceReturn {
  onlineUsers: OnlineUser[];
  isOnline: (userId: string) => boolean;
  onlineCount: number;
  isConnected: boolean;
}

/**
 * Hook to track team presence using Supabase Realtime Presence
 * 
 * Usage:
 * const { onlineUsers, isOnline, onlineCount } = useTeamPresence({
 *   teamId: profile?.team_id,
 *   currentUser: { id: user.id, full_name: profile.full_name, avatar_url: profile.avatar_url }
 * });
 */
export function useTeamPresence({
  teamId,
  currentUser,
}: UseTeamPresenceOptions): UseTeamPresenceReturn {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());

  // Sync presence state to our onlineUsers array
  const syncPresenceState = useCallback((state: PresenceState) => {
    // Flatten all presence entries into a single array
    // Each key can have multiple entries (for multiple tabs), we take the first one
    const users: OnlineUser[] = [];
    const seenUserIds = new Set<string>();

    for (const key of Object.keys(state)) {
      const presences = state[key];
      if (presences && presences.length > 0) {
        const presence = presences[0];
        // Avoid duplicates (user with multiple tabs)
        if (!seenUserIds.has(presence.user_id)) {
          seenUserIds.add(presence.user_id);
          users.push(presence);
        }
      }
    }

    // Sort by joined_at (earliest first)
    users.sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
    
    setOnlineUsers(users);
  }, []);

  useEffect(() => {
    // Don't connect if we don't have required data
    if (!teamId || !currentUser) {
      setOnlineUsers([]);
      setIsConnected(false);
      return;
    }

    const supabase = supabaseRef.current;
    const channelName = `presence-team-${teamId}`;

    // Create the presence channel
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    channelRef.current = channel;

    // Handle presence sync (initial state + updates)
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<OnlineUser>();
      syncPresenceState(state);
    });

    // Handle user joining
    channel.on("presence", { event: "join" }, ({ newPresences }) => {
      console.log("[Presence] User(s) joined:", newPresences);
      const state = channel.presenceState<OnlineUser>();
      syncPresenceState(state);
    });

    // Handle user leaving
    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      console.log("[Presence] User(s) left:", leftPresences);
      const state = channel.presenceState<OnlineUser>();
      syncPresenceState(state);
    });

    // Subscribe and track our presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        
        // Track our presence
        await channel.track({
          user_id: currentUser.id,
          full_name: currentUser.full_name,
          avatar_url: currentUser.avatar_url,
          joined_at: new Date().toISOString(),
        });

        console.log("[Presence] Connected to channel:", channelName);
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        setIsConnected(false);
        console.log("[Presence] Channel status:", status);
      }
    });

    // Cleanup on unmount or when deps change
    return () => {
      console.log("[Presence] Cleaning up channel:", channelName);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [teamId, currentUser?.id, currentUser?.full_name, currentUser?.avatar_url, syncPresenceState]);

  // Helper to check if a specific user is online
  const isOnline = useCallback(
    (userId: string): boolean => {
      return onlineUsers.some((u) => u.user_id === userId);
    },
    [onlineUsers]
  );

  const onlineCount = useMemo(() => onlineUsers.length, [onlineUsers]);

  return {
    onlineUsers,
    isOnline,
    onlineCount,
    isConnected,
  };
}

