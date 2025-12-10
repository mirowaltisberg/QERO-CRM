import { getTranslations } from "next-intl/server";
import { statsService } from "@/lib/data/data-service";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MiniTrend } from "@/components/dashboard/MiniTrend";
import { TopLists } from "@/components/dashboard/TopLists";
import { FollowUpsList } from "@/components/dashboard/FollowUpsList";

export default async function DashboardPage() {
  const stats = await statsService.getDashboardStats();
  const t = await getTranslations("dashboard");

  return (
    <div className="h-full bg-gray-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard label={t("callsToday")} value={stats.callsToday} />
          <StatsCard label={t("callsThisWeek")} value={stats.callsThisWeek} />
          <StatsCard label={t("followUpsDue")} value={stats.followUpsDue} />
          <StatsCard
            label={t("conversionRate")}
            value={`${stats.conversionRate}%`}
            hint={t("conversionHint")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MiniTrend
            title={t("callVolume")}
            subtitle={t("trendOfCalls")}
            data={stats.callTrend}
          />
          <TopLists items={stats.topLists} />
          <FollowUpsList contacts={stats.followUps} />
        </div>
      </div>
    </div>
  );
}

