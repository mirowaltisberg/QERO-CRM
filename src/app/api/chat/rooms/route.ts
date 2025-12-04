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

    const { data: memberships, error: membershipError } = await adminSupabase
      .from("chat_room_members")
      .select("room_id, last_read_at, room:chat_rooms(id, type, name, team_id, created_at)")
      .eq("user_id", user.id);

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError);
      return respondError("Failed to fetch chat rooms", 500);
    }

    const rooms = await Promise.all(
      (memberships || []).map(async (m) => {
        const room = m.room as any;
        if (!room) return null;

        const { count: unreadCount } = await adminSupabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", room.id)
          .neq("sender_id", user.id)
          .gt("created_at", m.last_read_at || "1970-01-01");

        const { data: lastMessage } = await adminSupabase
          .from("chat_messages")
          .select("id, content, created_at, sender:profiles!sender_id(full_name)")
          .eq("room_id", room.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        let dmUser = null;
        if (room.type === "dm") {
          const { data: otherMember } = await adminSupabase
            .from("chat_room_members")
            .select("user:profiles!user_id(id, full_name, avatar_url, team_id)")
            .eq("room_id", room.id)
            .neq("user_id", user.id)
            .single();
          
          if (otherMember?.user) {
            dmUser = otherMember.user as any;
            if (dmUser.team_id) {
              const { data: team } = await adminSupabase
                .from("teams")
                .select("name, color")
                .eq("id", dmUser.team_id)
                .single();
              dmUser.team = team;
            }
          }
        }

        return {
          ...room,
          unread_count: unreadCount || 0,
          last_message: lastMessage,
          dm_user: dmUser,
        };
      })
    );

    const sortedRooms = rooms
      .filter(Boolean)
      .sort((a, b) => {
        const typePriority: Record<string, number> = { all: 0, team: 1, dm: 2 };
        const aPriority = typePriority[a!.type] ?? 3;
        const bPriority = typePriority[b!.type] ?? 3;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aTime = a!.last_message?.created_at || a!.created_at;
        const bTime = b!.last_message?.created_at || b!.created_at;
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

    const { data: existingRooms } = await adminSupabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", user.id);

    const myRoomIds = (existingRooms || []).map(r => r.room_id);

    if (myRoomIds.length > 0) {
      const { data: sharedRoom } = await adminSupabase
        .from("chat_room_members")
        .select("room_id, room:chat_rooms!inner(id, type)")
        .eq("user_id", targetUserId)
        .in("room_id", myRoomIds)
        .eq("room.type", "dm")
        .limit(1)
        .single();

      if (sharedRoom) {
        return respondSuccess({ id: sharedRoom.room_id, existing: true });
      }
    }

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

async function ensureUserRoomMemberships(adminSupabase: any, userId: string, teamId: string | null) {
  let { data: allRoom } = await adminSupabase
    .from("chat_rooms")
    .select("id")
    .eq("type", "all")
    .single();

  if (!allRoom) {
    const { data: newAllRoom } = await adminSupabase
      .from("chat_rooms")
      .insert({ type: "all", name: "Alle" })
      .select()
      .single();
    allRoom = newAllRoom;
  }

  if (allRoom) {
    await adminSupabase
      .from("chat_room_members")
      .upsert({ room_id: allRoom.id, user_id: userId }, { onConflict: "room_id,user_id" });
  }

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
        const { data: newTeamRoom } = await adminSupabase
          .from("chat_rooms")
          .insert({ type: "team", name: team.name, team_id: teamId })
          .select()
          .single();
        teamRoom = newTeamRoom;
      }

      if (teamRoom) {
        await adminSupabase
          .from("chat_room_members")
          .upsert({ room_id: teamRoom.id, user_id: userId }, { onConflict: "room_id,user_id" });
      }
    }
  }
}
