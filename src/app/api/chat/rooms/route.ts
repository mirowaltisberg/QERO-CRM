import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, team_id")
      .eq("id", user.id)
      .single();

    if (!profile) return respondError("Profile not found", 404);

    await ensureUserRoomMemberships(adminSupabase, user.id, profile.team_id);

    // Get memberships
    const { data: memberships } = await adminSupabase
      .from("chat_room_members")
      .select("room_id, last_read_at")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) return respondSuccess([]);

    const roomIds = memberships.map(m => m.room_id);

    // Batch fetch: rooms, profiles, teams, all room members for DMs
    const [roomsRes, profilesRes, teamsRes, allMembersRes] = await Promise.all([
      adminSupabase.from("chat_rooms").select("id, type, name, team_id, created_at").in("id", roomIds),
      adminSupabase.from("profiles").select("id, full_name, avatar_url, team_id"),
      adminSupabase.from("teams").select("id, name, color"),
      adminSupabase.from("chat_room_members").select("room_id, user_id").in("room_id", roomIds),
    ]);

    const rooms = roomsRes.data || [];
    const profilesMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
    const teamsMap = new Map((teamsRes.data || []).map(t => [t.id, t]));
    const membershipMap = new Map(memberships.map(m => [m.room_id, m.last_read_at]));

    // Group members by room for DM lookup
    const membersByRoom = new Map<string, string[]>();
    (allMembersRes.data || []).forEach(m => {
      const existing = membersByRoom.get(m.room_id) || [];
      existing.push(m.user_id);
      membersByRoom.set(m.room_id, existing);
    });

    // Build response without additional queries (skip unread count and last message for speed)
    const result = rooms.map(room => {
      let dmUser = null;
      if (room.type === "dm") {
        const roomMembers = membersByRoom.get(room.id) || [];
        const otherUserId = roomMembers.find(id => id !== user.id);
        if (otherUserId) {
          const otherProfile = profilesMap.get(otherUserId);
          if (otherProfile) {
            dmUser = {
              id: otherProfile.id,
              full_name: otherProfile.full_name,
              avatar_url: otherProfile.avatar_url,
              team: otherProfile.team_id ? teamsMap.get(otherProfile.team_id) : null,
            };
          }
        }
      }

      return {
        ...room,
        unread_count: 0, // Skip for speed
        last_message: null, // Skip for speed
        dm_user: dmUser,
      };
    });

    // Sort: all first, then team, then dm
    result.sort((a, b) => {
      const priority = { all: 0, team: 1, dm: 2 } as Record<string, number>;
      return (priority[a.type] ?? 3) - (priority[b.type] ?? 3);
    });

    return respondSuccess(result);
  } catch (err) {
    console.error("GET /api/chat/rooms error:", err);
    return respondError("Failed to fetch chat rooms", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const { user_id: targetUserId } = await request.json();
    if (!targetUserId) return respondError("user_id is required", 400);

    const adminSupabase = createAdminClient();

    // Check if DM exists
    const { data: myRooms } = await adminSupabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", user.id);

    if (myRooms && myRooms.length > 0) {
      const myRoomIds = myRooms.map(r => r.room_id);
      const { data: shared } = await adminSupabase
        .from("chat_room_members")
        .select("room_id")
        .eq("user_id", targetUserId)
        .in("room_id", myRoomIds);

      if (shared && shared.length > 0) {
        const { data: dmRoom } = await adminSupabase
          .from("chat_rooms")
          .select("id")
          .in("id", shared.map(s => s.room_id))
          .eq("type", "dm")
          .limit(1)
          .single();

        if (dmRoom) return respondSuccess({ id: dmRoom.id, existing: true });
      }
    }

    // Create new DM
    const { data: newRoom } = await adminSupabase
      .from("chat_rooms")
      .insert({ type: "dm", name: null })
      .select()
      .single();

    if (!newRoom) return respondError("Failed to create room", 500);

    await adminSupabase.from("chat_room_members").insert([
      { room_id: newRoom.id, user_id: user.id },
      { room_id: newRoom.id, user_id: targetUserId },
    ]);

    return respondSuccess({ id: newRoom.id, existing: false }, { status: 201 });
  } catch (err) {
    console.error("POST /api/chat/rooms error:", err);
    return respondError("Failed to create room", 500);
  }
}

async function ensureUserRoomMemberships(adminSupabase: ReturnType<typeof createAdminClient>, userId: string, teamId: string | null) {
  // Check/create "Alle" room
  let { data: allRoom } = await adminSupabase
    .from("chat_rooms")
    .select("id")
    .eq("type", "all")
    .single();

  if (!allRoom) {
    const { data } = await adminSupabase
      .from("chat_rooms")
      .insert({ type: "all", name: "Alle" })
      .select()
      .single();
    allRoom = data;
  }

  if (allRoom) {
    await adminSupabase
      .from("chat_room_members")
      .upsert({ room_id: allRoom.id, user_id: userId }, { onConflict: "room_id,user_id" });
  }

  // Check/create team room
  if (teamId) {
    const { data: team } = await adminSupabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .single();

    if (team) {
      let { data: teamRoom } = await adminSupabase
        .from("chat_rooms")
        .select("id")
        .eq("type", "team")
        .eq("team_id", teamId)
        .single();

      if (!teamRoom) {
        const { data } = await adminSupabase
          .from("chat_rooms")
          .insert({ type: "team", name: team.name, team_id: teamId })
          .select()
          .single();
        teamRoom = data;
      }

      if (teamRoom) {
        await adminSupabase
          .from("chat_room_members")
          .upsert({ room_id: teamRoom.id, user_id: userId }, { onConflict: "room_id,user_id" });
      }
    }
  }
}
