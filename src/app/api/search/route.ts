import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { geocodeSwissLocation, getBoundingBox, haversineDistance } from "@/lib/geo";

export interface SearchResultContact {
  id: string;
  type: "contact";
  company_name: string;
  contact_name: string | null;
  email: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
  distance_km?: number;
}

export interface SearchResultTma {
  id: string;
  type: "tma";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position_title: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
  status_tags: string[] | null;
  activity: string | null;
  distance_km?: number;
}

export interface SearchResultEmail {
  id: string;
  type: "email";
  thread_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string;
  body_preview: string | null;
  sent_at: string | null;
}

export interface SearchResultChat {
  id: string;
  type: "chat";
  room_id: string;
  room_name: string | null;
  room_type: "all" | "team" | "dm";
  content: string;
  sender_name: string | null;
  created_at: string;
}

export interface SearchResultChatRoom {
  id: string;
  type: "chat_room";
  room_id: string;
  room_type: "dm";
  user_name: string;
  user_avatar: string | null;
}

export type SearchResult = SearchResultContact | SearchResultTma | SearchResultEmail | SearchResultChat | SearchResultChatRoom;

interface LocationInfo {
  name: string;
  plz: string;
  lat: number;
  lng: number;
}

const MAX_RESULTS_PER_TYPE = 10;
const DEFAULT_RADIUS_KM = 25;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const locationQuery = searchParams.get("location")?.trim();
    const radiusKm = parseFloat(searchParams.get("radius") || String(DEFAULT_RADIUS_KM));

    // Location-based search
    if (locationQuery && locationQuery.length >= 2) {
      return handleLocationSearch(supabase, locationQuery, radiusKm);
    }

    // Text-based search
    if (!query || query.length < 2) {
      return respondSuccess({ contacts: [], tma: [], emails: [], chat: [] });
    }

    return handleTextSearch(supabase, query, user.id);
  } catch (error) {
    console.error("[Search] Unexpected error:", error);
    return respondError("Search failed", 500);
  }
}

async function handleTextSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  userId: string
) {
  const searchPattern = `%${query}%`;
  const adminSupabase = createAdminClient();

  // Split query into words for multi-word name matching
  const words = query.split(/\s+/).filter(w => w.length >= 2);

  // Search contacts across ALL teams
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select(`
      id,
      company_name,
      contact_name,
      email,
      canton,
      team_id
    `)
    .or(`company_name.ilike.${searchPattern},contact_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
    .limit(MAX_RESULTS_PER_TYPE);

  if (contactsError) {
    console.error("[Search] Contacts error:", contactsError);
  }

  // Search TMA candidates across ALL teams
  // For multi-word queries like "Luka Djuric", we need to match each word
  let tma: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    position_title: string | null;
    canton: string | null;
    team_id: string | null;
    status_tags: string[] | null;
    activity: string | null;
  }> = [];

  if (words.length > 1) {
    // Multi-word search: fetch all and filter in JS
    const { data: allTma } = await supabase
      .from("tma_candidates")
      .select(`id, first_name, last_name, email, phone, position_title, canton, team_id, status_tags, activity`)
      .limit(500);
    
    tma = (allTma || []).filter(t => {
      const fullName = `${t.first_name} ${t.last_name}`.toLowerCase();
      const email = (t.email || "").toLowerCase();
      const phone = (t.phone || "").toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Check if full name contains the query
      if (fullName.includes(queryLower)) return true;
      
      // Check if all words match first_name or last_name
      return words.every(word => {
        const wordLower = word.toLowerCase();
        return (
          t.first_name?.toLowerCase().includes(wordLower) ||
          t.last_name?.toLowerCase().includes(wordLower) ||
          email.includes(wordLower) ||
          phone.includes(wordLower)
        );
      });
    }).slice(0, MAX_RESULTS_PER_TYPE);
  } else {
    // Single word search: use original pattern
    const { data, error } = await supabase
      .from("tma_candidates")
      .select(`id, first_name, last_name, email, phone, position_title, canton, team_id, status_tags, activity`)
      .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
      .limit(MAX_RESULTS_PER_TYPE);
    
    if (error) {
      console.error("[Search] TMA error:", error);
    }
    tma = data || [];
  }

  // Search emails (user's own emails only via RLS)
  const { data: emails, error: emailsError } = await supabase
    .from("email_messages")
    .select(`
      id,
      thread_id,
      subject,
      sender_name,
      sender_email,
      body_preview,
      sent_at
    `)
    .or(`subject.ilike.${searchPattern},sender_name.ilike.${searchPattern},sender_email.ilike.${searchPattern},body_preview.ilike.${searchPattern}`)
    .order("sent_at", { ascending: false })
    .limit(MAX_RESULTS_PER_TYPE);

  if (emailsError) {
    console.error("[Search] Emails error:", emailsError);
  }

  // Search chat - DM rooms by user name + messages by content
  let chatResults: SearchResultChat[] = [];
  let chatRoomResults: SearchResultChatRoom[] = [];
  try {
    // Get user's room memberships
    const { data: memberships } = await adminSupabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", userId);

    if (memberships && memberships.length > 0) {
      const roomIds = memberships.map(m => m.room_id);

      // Get all rooms user is member of
      const { data: rooms } = await adminSupabase
        .from("chat_rooms")
        .select("id, name, type")
        .in("id", roomIds);
      const roomsMap = new Map((rooms || []).map(r => [r.id, r]));

      // Find DM rooms
      const dmRoomIds = (rooms || []).filter(r => r.type === "dm").map(r => r.id);

      // Search for DM rooms by other user's name
      if (dmRoomIds.length > 0) {
        // Get all members of DM rooms (excluding current user)
        const { data: dmMembers } = await adminSupabase
          .from("chat_room_members")
          .select("room_id, user_id")
          .in("room_id", dmRoomIds)
          .neq("user_id", userId);

        if (dmMembers && dmMembers.length > 0) {
          const otherUserIds = [...new Set(dmMembers.map(m => m.user_id))];
          
          // Get profiles of other users
          const { data: otherProfiles } = await adminSupabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", otherUserIds);

          // Filter profiles matching the search query
          const matchingProfiles = (otherProfiles || []).filter(p => {
            const fullName = (p.full_name || "").toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Check if full name contains query or all words match
            if (fullName.includes(queryLower)) return true;
            
            return words.every(word => fullName.includes(word.toLowerCase()));
          });

          // Map matching profiles to their DM rooms
          const profileToRoom = new Map<string, string>();
          dmMembers.forEach(m => {
            profileToRoom.set(m.user_id, m.room_id);
          });

          chatRoomResults = matchingProfiles.map(p => ({
            id: `room-${profileToRoom.get(p.id)}`,
            type: "chat_room" as const,
            room_id: profileToRoom.get(p.id)!,
            room_type: "dm" as const,
            user_name: p.full_name || "Unknown",
            user_avatar: p.avatar_url,
          })).filter(r => r.room_id);
        }
      }

      // Search messages in user's rooms
      const { data: messages, error: messagesError } = await adminSupabase
        .from("chat_messages")
        .select(`
          id,
          room_id,
          content,
          sender_id,
          created_at
        `)
        .in("room_id", roomIds)
        .ilike("content", searchPattern)
        .order("created_at", { ascending: false })
        .limit(MAX_RESULTS_PER_TYPE);

      if (messagesError) {
        console.error("[Search] Chat error:", messagesError);
      }

      if (messages && messages.length > 0) {
        // Get sender info
        const senderIds = [...new Set(messages.map(m => m.sender_id))];
        const { data: profiles } = await adminSupabase
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds);
        const profilesMap = new Map((profiles || []).map(p => [p.id, p]));

        chatResults = messages.map((m) => {
          const room = roomsMap.get(m.room_id);
          const sender = profilesMap.get(m.sender_id);
          return {
            id: m.id,
            type: "chat" as const,
            room_id: m.room_id,
            room_name: room?.name || null,
            room_type: (room?.type || "dm") as "all" | "team" | "dm",
            content: m.content,
            sender_name: sender?.full_name || null,
            created_at: m.created_at,
          };
        });
      }
    }
  } catch (err) {
    console.error("[Search] Chat search error:", err);
  }

  // Get team info
  const teamsMap = await fetchTeamsMap(supabase, contacts || [], tma || []);

  // Transform results
  const contactResults: SearchResultContact[] = (contacts || []).map((c) => ({
    id: c.id,
    type: "contact" as const,
    company_name: c.company_name,
    contact_name: c.contact_name,
    email: c.email,
    canton: c.canton,
    team_id: c.team_id,
    team: c.team_id ? teamsMap[c.team_id] || null : null,
  }));

  const tmaResults: SearchResultTma[] = (tma || []).map((t) => ({
    id: t.id,
    type: "tma" as const,
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email,
    phone: t.phone,
    position_title: t.position_title,
    canton: t.canton,
    team_id: t.team_id,
    team: t.team_id ? teamsMap[t.team_id] || null : null,
    status_tags: t.status_tags,
    activity: t.activity,
  }));

  const emailResults: SearchResultEmail[] = (emails || []).map((e) => ({
    id: e.id,
    type: "email" as const,
    thread_id: e.thread_id,
    subject: e.subject,
    sender_name: e.sender_name,
    sender_email: e.sender_email,
    body_preview: e.body_preview,
    sent_at: e.sent_at,
  }));

  return respondSuccess({
    contacts: contactResults,
    tma: tmaResults,
    emails: emailResults,
    chat: chatResults,
    chat_rooms: chatRoomResults,
  });
}

async function handleLocationSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationQuery: string,
  radiusKm: number
) {
  // Geocode the location
  const location = geocodeSwissLocation(locationQuery);
  if (!location) {
    return respondSuccess({
      contacts: [],
      tma: [],
      location: null,
      radius_km: radiusKm,
    });
  }

  // Get bounding box for efficient DB filtering
  const bbox = getBoundingBox(location.lat, location.lng, radiusKm);

  // Search contacts within bounding box
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select(`
      id,
      company_name,
      contact_name,
      email,
      canton,
      team_id,
      latitude,
      longitude
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bbox.minLat)
    .lte("latitude", bbox.maxLat)
    .gte("longitude", bbox.minLng)
    .lte("longitude", bbox.maxLng)
    .limit(100); // Fetch more, filter by exact distance

  if (contactsError) {
    console.error("[Search] Location contacts error:", contactsError);
  }

  // Search TMA candidates within bounding box
  const { data: tma, error: tmaError } = await supabase
    .from("tma_candidates")
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      position_title,
      canton,
      team_id,
      latitude,
      longitude,
      status_tags,
      activity
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bbox.minLat)
    .lte("latitude", bbox.maxLat)
    .gte("longitude", bbox.minLng)
    .lte("longitude", bbox.maxLng)
    .limit(100);

  if (tmaError) {
    console.error("[Search] Location TMA error:", tmaError);
  }

  // Calculate exact distances and filter by radius
  const contactsWithDistance = (contacts || [])
    .map((c) => ({
      ...c,
      distance_km: haversineDistance(
        location.lat,
        location.lng,
        c.latitude!,
        c.longitude!
      ),
    }))
    .filter((c) => c.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, MAX_RESULTS_PER_TYPE);

  const tmaWithDistance = (tma || [])
    .map((t) => ({
      ...t,
      distance_km: haversineDistance(
        location.lat,
        location.lng,
        t.latitude!,
        t.longitude!
      ),
    }))
    .filter((t) => t.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, MAX_RESULTS_PER_TYPE);

  // Get team info
  const teamsMap = await fetchTeamsMap(supabase, contactsWithDistance, tmaWithDistance);

  // Transform results
  const contactResults: SearchResultContact[] = contactsWithDistance.map((c) => ({
    id: c.id,
    type: "contact" as const,
    company_name: c.company_name,
    contact_name: c.contact_name,
    email: c.email,
    canton: c.canton,
    team_id: c.team_id,
    team: c.team_id ? teamsMap[c.team_id] || null : null,
    distance_km: Math.round(c.distance_km * 10) / 10, // Round to 1 decimal
  }));

  const tmaResults: SearchResultTma[] = tmaWithDistance.map((t) => ({
    id: t.id,
    type: "tma" as const,
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email,
    phone: t.phone,
    position_title: t.position_title,
    canton: t.canton,
    team_id: t.team_id,
    team: t.team_id ? teamsMap[t.team_id] || null : null,
    status_tags: t.status_tags,
    activity: t.activity,
    distance_km: Math.round(t.distance_km * 10) / 10,
  }));

  const locationInfo: LocationInfo = {
    name: location.name,
    plz: location.plz,
    lat: location.lat,
    lng: location.lng,
  };

  return respondSuccess({
    contacts: contactResults,
    tma: tmaResults,
    location: locationInfo,
    radius_km: radiusKm,
  });
}

async function fetchTeamsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contacts: Array<{ team_id: string | null }>,
  tma: Array<{ team_id: string | null }>
): Promise<Record<string, { name: string; color: string }>> {
  const teamIds = new Set<string>();
  for (const c of contacts) {
    if (c.team_id) teamIds.add(c.team_id);
  }
  for (const t of tma) {
    if (t.team_id) teamIds.add(t.team_id);
  }

  if (teamIds.size === 0) {
    return {};
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color")
    .in("id", Array.from(teamIds));

  if (!teams) {
    return {};
  }

  return Object.fromEntries(
    teams.map((t) => [t.id, { name: t.name, color: t.color || "#6B7280" }])
  );
}
