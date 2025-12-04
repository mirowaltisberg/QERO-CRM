// Global chat cache for instant loading
type CachedMessages = Map<string, { messages: any[]; timestamp: number }>;

const messageCache: CachedMessages = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const chatCache = {
  // Get cached messages for a room
  get(roomId: string) {
    const cached = messageCache.get(roomId);
    if (!cached) return null;
    // Return even if stale - we'll refresh in background
    return cached.messages;
  },

  // Set messages for a room
  set(roomId: string, messages: any[]) {
    messageCache.set(roomId, { messages, timestamp: Date.now() });
  },

  // Check if cache is stale
  isStale(roomId: string) {
    const cached = messageCache.get(roomId);
    if (!cached) return true;
    return Date.now() - cached.timestamp > CACHE_TTL;
  },

  // Add a single message to cache
  addMessage(roomId: string, message: any) {
    const cached = messageCache.get(roomId);
    if (cached) {
      // Avoid duplicates
      if (!cached.messages.some(m => m.id === message.id)) {
        cached.messages = [...cached.messages, message];
        cached.timestamp = Date.now();
      }
    }
  },

  // Pre-fetch all rooms' messages
  async prefetchAll(roomIds: string[]) {
    const promises = roomIds.map(async (roomId) => {
      if (chatCache.isStale(roomId)) {
        try {
          const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=30`);
          const json = await res.json();
          if (json.data) {
            chatCache.set(roomId, json.data);
          }
        } catch (e) {
          console.error(`[ChatCache] Failed to prefetch ${roomId}:`, e);
        }
      }
    });
    await Promise.all(promises);
  },

  // Clear all cache
  clear() {
    messageCache.clear();
  }
};
