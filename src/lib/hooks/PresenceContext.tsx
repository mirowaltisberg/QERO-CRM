"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTeamPresence, type OnlineUser } from "./useTeamPresence";

interface PresenceContextValue {
  onlineUsers: OnlineUser[];
  isOnline: (userId: string) => boolean;
  onlineCount: number;
  isConnected: boolean;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

interface PresenceProviderProps {
  teamId: string | null;
  currentUser: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  children: ReactNode;
}

export function PresenceProvider({
  teamId,
  currentUser,
  children,
}: PresenceProviderProps) {
  const presence = useTeamPresence({ teamId, currentUser });

  return (
    <PresenceContext.Provider value={presence}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextValue {
  const context = useContext(PresenceContext);
  if (!context) {
    // Return a default value if context is not available
    // This allows components to work even outside the provider
    return {
      onlineUsers: [],
      isOnline: () => false,
      onlineCount: 0,
      isConnected: false,
    };
  }
  return context;
}

/**
 * Hook to check if a specific user is online
 * Can be used without having the full presence context
 */
export function useIsUserOnline(userId: string | undefined): boolean {
  const { isOnline } = usePresence();
  return useMemo(() => {
    if (!userId) return false;
    return isOnline(userId);
  }, [userId, isOnline]);
}

