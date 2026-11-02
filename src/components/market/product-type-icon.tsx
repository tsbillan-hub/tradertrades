import { BookOpen, CalendarClock, ChartLine, Download, Megaphone, Users, Video, type LucideProps } from "lucide-react";
import type { ProductType } from "@/generated/prisma/enums";

const MAP: Record<ProductType, React.ComponentType<LucideProps>> = {
  COURSE: BookOpen,
  COMMUNITY: Users,
  MENTORING: Video,
  ALERTS: Megaphone,
  INDICATOR: ChartLine,
  DOWNLOAD: Download,
  EVENT: CalendarClock,
};

export function ProductTypeIcon({ type, className }: { type: ProductType; className?: string }) {
  const Icon = MAP[type];
  return <Icon className={className} />;
}
