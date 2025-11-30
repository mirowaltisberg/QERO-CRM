import { statsService } from "@/lib/data/data-service";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MiniTrend } from "@/components/dashboard/MiniTrend";
import { TopLists } from "@/components/dashboard/TopLists";
import { FollowUpsList } from "@/components/dashboard/FollowUpsList";

export default async function DashboardPage() {
  const stats = await statsService.getDashboardStats();

  return (
    <div className="h-full bg-gray-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard label="Calls Today" value={stats.callsToday} />
          <StatsCard label="Calls This Week" value={stats.callsThisWeek} />
          <StatsCard label="Follow-ups Due" value={stats.followUpsDue} />
          <StatsCard
            label="Conversion Rate"
            value={`${stats.conversionRate}%`}
            hint="Interested + meeting set over total calls"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MiniTrend
            title="Call Volume (14d)"
            subtitle="Trend of total calls"
            data={stats.callTrend}
          />
          <TopLists items={stats.topLists} />
          <FollowUpsList contacts={stats.followUps} />
        </div>
      </div>
    </div>
  );
}

