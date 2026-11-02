import {
  Bitcoin,
  Bot,
  Building2,
  ChartCandlestick,
  Copy,
  HandCoins,
  History,
  Monitor,
  Newspaper,
  NotebookPen,
  ScanSearch,
  Server,
  type LucideProps,
} from "lucide-react";
import type { CompanyCategory } from "@/generated/prisma/enums";

const MAP: Record<CompanyCategory, React.ComponentType<LucideProps>> = {
  PROP_FIRM: HandCoins,
  BROKER: Building2,
  CRYPTO_EXCHANGE: Bitcoin,
  PLATFORM: Monitor,
  JOURNAL: NotebookPen,
  BACKTESTING: History,
  TRADE_COPIER: Copy,
  AUTOMATION: Bot,
  CHARTING_DATA: ChartCandlestick,
  SCREENER: ScanSearch,
  NEWS_CALENDAR: Newspaper,
  VPS: Server,
};

export function CategoryIcon({ category, className }: { category: CompanyCategory; className?: string }) {
  const Icon = MAP[category];
  return <Icon className={className} />;
}
