import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const adminSupabase = createAdminClient();

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, team_id, full_name, avatar_url")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return respondError("Profile not found", 404);
    }

    await ensureUserRoomMemberships(adminSupabase, user.id, profile.team_id);

    // Get user's room memberships
    const { data: memberships, error: membershipError } = await adminSupabase
      .from("chat_room_members")
      .select("room_id, last_read_at")
      .eq("user_id", user.id);

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError);
      return respondError("Failed to fetch chat rooms", 500);
    }

    if (!memberships || memberships.length === 0) {
      return respondSuccess([]);
    }

    const roomIds = memberships.map(m => m.room_id);
    const membershipMap = new Map(memberships.map(m => [m.room_id, m.last_read_at]));

    // Get rooms
    const { data: roomsData } = await adminSupabase
      .from("chat_rooms")
      .select("id, type, name, team_id, created_at")
      .in("id", roomIds);

    if (!roomsData) {
      return respondSuccess([]);
    }

    // Get all profiles for DM user lookup
    const { data: allProfiles } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url, team_id");
    const profilesMap = new Map((allProfiles || []).map(p => [p.id, p]));

    // Get all teams
    const { data: allTeams } = await adminSupabase
      .from("teams")
      .select("id, name, color");
    const teamsMap = new Map((allTeams || []).map(t => [t.id, t]));

    const rooms = await Promise.all(
      roomsData.map(async (room) => {
        const lastReadAt = membershipMap.get(room.id) || "1970-01-01";

        // Get unread count
        const { count: unreadCount } = await adminSupabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", room.id)
          .neq("sender_id", user.id)
          .gt("created_at", lastReadAt);

        // Check for mentions in unread messages
        let hasMention = false;
        if (unreadCount && unreadCount > 0) {
          const { data: unreadMsgs } = await adminSupabase
            .from("chat_messages")
            .select("mentions")
            .eq("room_id", room.id)
            .neq("sender_id", user.id)
            .gt("created_at", lastReadAt)
            .limit(20);
          
          if (unreadMsgs) {
            for (const msg of unreadMsgs) {
              const mentions = msg.mentions || [];
              // Check if user is mentioned directly or @everyone
              if (mentions.includes(user.id) || mentions.includes("everyone")) {
                hasMention = true;
                break;
              }
            }
          }
        }

        // Get last message
        const { data: lastMessageData } = await adminSupabase
          .from("chat_messages")
          .select("id, content, created_at, sender_id")
          .eq("room_id", room.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        let lastMessage = null;
        if (lastMessageData) {
          const sender = profilesMap.get(lastMessageData.sender_id);
          lastMessage = {
            id: lastMessageData.id,
            content: lastMessageData.content,
            created_at: lastMessageData.created_at,
            sender: sender ? { full_name: sender.full_name } : null,
          };
        }

        // Get DM user if this is a DM
        let dmUser = null;
        if (room.type === "dm") {
          const { data: otherMembers } = await adminSupabase
            .from("chat_room_members")
            .select("user_id")
            .eq("room_id", room.id)
            .neq("user_id", user.id)
            .limit(1);

          if (otherMembers && otherMembers[0]) {
            const otherProfile = profilesMap.get(otherMembers[0].user_id);
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
          unread_count: unreadCount || 0,
          has_mention: hasMention,
          last_message: lastMessage,
          dm_user: dmUser,
        };
      })
    );

    const sortedRooms = rooms.sort((a, b) => {
      const typePriority: Record<string, number> = { all: 0, team: 1, dm: 2 };
      const aPriority = typePriority[a.type] ?? 3;
      const bPriority = typePriority[b.type] ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = a.last_message?.created_at || a.created_at;
      const bTime = b.last_message?.created_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return respondSuccess(sortedRooms);

  } catch (err) {
    console.error("GET /api/chat/rooms error:", err);
    return respondError("Failed to fetch chat rooms", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json();
    const { user_id: targetUserId } = body;

    if (!targetUserId) {
      return respondError("user_id is required", 400);
    }

    const adminSupabase = createAdminClient();

    // Check if DM already exists
    const { data: existingRooms } = await adminSupabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", user.id);

    const myRoomIds = (existingRooms || []).map(r => r.room_id);

    if (myRoomIds.length > 0) {
      // Find rooms where target user is also a member
      const { data: targetMemberships } = await adminSupabase
        .from("chat_room_members")
        .select("room_id")
        .eq("user_id", targetUserId)
        .in("room_id", myRoomIds);

      if (targetMemberships && targetMemberships.length > 0) {
        const sharedRoomIds = targetMemberships.map(m => m.room_id);
        
        // Check if any shared room is a DM
        const { data: dmRooms } = await adminSupabase
          .from("chat_rooms")
          .select("id")
          .in("id", sharedRoomIds)
          .eq("type", "dm")
          .limit(1);

        if (dmRooms && dmRooms[0]) {
          return respondSuccess({ id: dmRooms[0].id, existing: true });
        }
      }
    }

    // Create new DM room
    const { data: newRoom, error: roomError } = await adminSupabase
      .from("chat_rooms")
      .insert({ type: "dm", name: null })
      .select()
      .single();

    if (roomError || !newRoom) {
      return respondError("Failed to create chat room", 500);
    }

    await adminSupabase
      .from("chat_room_members")
      .insert([
        { room_id: newRoom.id, user_id: user.id },
        { room_id: newRoom.id, user_id: targetUserId },
      ]);

    return respondSuccess({ id: newRoom.id, existing: false }, { status: 201 });

  } catch (err) {
    console.error("POST /api/chat/rooms error:", err);
    return respondError("Failed to create chat room", 500);
  }
}

async function ensureUserRoomMemberships(adminSupabase: ReturnType<typeof createAdminClient>, userId: string, teamId: string | null) {
  // Check "Alle" room - use limit(1) to avoid error when not found
  const { data: allRooms } = await adminSupabase
    .from("chat_rooms")
    .select("id")
    .eq("type", "all")
    .limit(1);

  let allRoomId = allRooms?.[0]?.id;

  if (!allRoomId) {
    const { data } = await adminSupabase
      .from("chat_rooms")
      .insert({ type: "all", name: "Alle" })
      .select("id")
      .single();
    allRoomId = data?.id;
  }

  if (allRoomId) {
    await adminSupabase
      .from("chat_room_members")
      .upsert({ room_id: allRoomId, user_id: userId }, { onConflict: "room_id,user_id" });
  }

  // Check team room
  if (teamId) {
    const { data: team } = await adminSupabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .single();

    if (team) {
      const { data: teamRooms } = await adminSupabase
        .from("chat_rooms")
        .select("id")
        .eq("type", "team")
        .eq("team_id", teamId)
        .limit(1);

      let teamRoomId = teamRooms?.[0]?.id;

      if (!teamRoomId) {
        const { data } = await adminSupabase
          .from("chat_rooms")
          .insert({ type: "team", name: team.name, team_id: teamId })
          .select("id")
          .single();
        teamRoomId = data?.id;
      }

      if (teamRoomId) {
        await adminSupabase
          .from("chat_room_members")
          .upsert({ room_id: teamRoomId, user_id: userId }, { onConflict: "room_id,user_id" });
      }
    }
  }
}
