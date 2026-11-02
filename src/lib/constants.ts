import type {
  CompanyCategory,
  Market,
  ProductType,
  SkillLevel,
  BillingInterval,
  SocialPlatform,
  ExperienceLevel,
  JobRole,
  JobKind,
  ReportReason,
} from "@/generated/prisma/enums";

export const SITE = {
  name: "TraderTrades",
  tagline: "The marketplace built for traders.",
  description:
    "Trading communities, courses, mentoring, alerts and indicators from trading creators, plus a directory of prop firms, brokers and tools with reviews from real users.",
};

export const MARKETS: { value: Market; label: string }[] = [
  { value: "FUTURES", label: "Futures" },
  { value: "FOREX", label: "Forex" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "STOCKS", label: "Stocks" },
  { value: "OPTIONS", label: "Options" },
];

export const marketLabel = (m: Market) => MARKETS.find((x) => x.value === m)?.label ?? m;

export const EXPERIENCE: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "NEW", label: "Brand new", hint: "Haven't placed a real trade yet" },
  { value: "LEARNING", label: "Learning", hint: "Trading, still finding a strategy" },
  { value: "CONSISTENT", label: "Getting consistent", hint: "Have a plan and follow it most days" },
  { value: "FUNDED", label: "Funded", hint: "Trading a funded or prop account" },
  { value: "PRO", label: "Full time", hint: "Trading is my main income" },
];

export const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "ALL", label: "All levels" },
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

export const skillLabel = (s: SkillLevel) => SKILL_LEVELS.find((x) => x.value === s)?.label ?? s;

export type CategoryInfo = {
  value: CompanyCategory;
  slug: string;
  label: string;
  singular: string;
  blurb: string;
  checkNote: string;
};

export const CATEGORIES: CategoryInfo[] = [
  {
    value: "PROP_FIRM",
    slug: "prop-firms",
    label: "Prop firms",
    singular: "Prop firm",
    blurb: "Firms that fund traders who pass an evaluation.",
    checkNote: "Rules, drawdowns, prices and payout terms change often. Always read the firm's current rules before you buy.",
  },
  {
    value: "BROKER",
    slug: "brokers",
    label: "Brokers",
    singular: "Broker",
    blurb: "Where you open a real account to trade futures, forex, stocks or options.",
    checkNote: "Check the broker's regulation in your country, fees and margin on their site before opening an account.",
  },
  {
    value: "CRYPTO_EXCHANGE",
    slug: "crypto-exchanges",
    label: "Crypto exchanges",
    singular: "Crypto exchange",
    blurb: "Exchanges for buying, selling and trading crypto.",
    checkNote: "Availability depends on where you live. Check fees and what is allowed in your country.",
  },
  {
    value: "PLATFORM",
    slug: "platforms",
    label: "Trading platforms",
    singular: "Trading platform",
    blurb: "The software you chart and place trades with.",
    checkNote: "Check which brokers and prop firms the platform connects to, and what the data costs.",
  },
  {
    value: "JOURNAL",
    slug: "journals",
    label: "Trading journals",
    singular: "Trading journal",
    blurb: "Track every trade and find what is actually working.",
    checkNote: "Check which brokers and platforms can import automatically.",
  },
  {
    value: "BACKTESTING",
    slug: "backtesting",
    label: "Backtesting tools",
    singular: "Backtesting tool",
    blurb: "Practice and test a strategy on past market data.",
    checkNote: "Check which markets and how much history are included in each plan.",
  },
  {
    value: "TRADE_COPIER",
    slug: "trade-copiers",
    label: "Trade copiers",
    singular: "Trade copier",
    blurb: "Copy your own trades across your own accounts.",
    checkNote: "Some prop firms limit copying between accounts. Check the firm's rules first.",
  },
  {
    value: "AUTOMATION",
    slug: "automation",
    label: "Automation and bots",
    singular: "Automation tool",
    blurb: "Turn alerts or rules into automatic orders.",
    checkNote: "Test automation on a simulator first. Check which brokers are supported.",
  },
  {
    value: "CHARTING_DATA",
    slug: "charting-and-data",
    label: "Charting and data",
    singular: "Charting or data tool",
    blurb: "Charts, order flow and market data feeds.",
    checkNote: "Check exchange data fees, which are often charged on top of the plan.",
  },
  {
    value: "SCREENER",
    slug: "screeners",
    label: "Screeners and scanners",
    singular: "Screener",
    blurb: "Find setups across the whole market quickly.",
    checkNote: "Check whether data is real time or delayed on the plan you pick.",
  },
  {
    value: "NEWS_CALENDAR",
    slug: "news-and-calendars",
    label: "News and calendars",
    singular: "News or calendar tool",
    blurb: "Economic calendars, headlines and market news.",
    checkNote: "Check how fast headlines arrive on the plan you pick.",
  },
  {
    value: "VPS",
    slug: "vps",
    label: "Trading VPS",
    singular: "Trading VPS",
    blurb: "Servers that keep your platform running close to the exchange.",
    checkNote: "Check server locations and what specs your platform needs.",
  },
];

/** "How long have you used it?" on directory reviews. */
export const REVIEW_USED_FOR = ["Under 3 months", "3 to 12 months", "1 to 2 years", "Over 2 years"] as const;

export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
export const categoryInfo = (value: CompanyCategory) => CATEGORIES.find((c) => c.value === value)!;

export type ProductTypeInfo = {
  value: ProductType;
  slug: string;
  label: string;
  plural: string;
  blurb: string;
  allowedIntervals: BillingInterval[];
};

export const PRODUCT_TYPES: ProductTypeInfo[] = [
  {
    value: "COMMUNITY",
    slug: "communities",
    label: "Community",
    plural: "Communities",
    blurb: "A members area with chat channels, live sessions and resources.",
    allowedIntervals: ["MONTH", "YEAR", "ONE_TIME"],
  },
  {
    value: "COURSE",
    slug: "courses",
    label: "Course",
    plural: "Courses",
    blurb: "Video lessons in modules, with files and progress tracking.",
    allowedIntervals: ["ONE_TIME"],
  },
  {
    value: "MENTORING",
    slug: "mentoring",
    label: "Mentoring",
    plural: "Mentoring",
    blurb: "One to one calls booked on the mentor's calendar.",
    allowedIntervals: ["ONE_TIME"],
  },
  {
    value: "ALERTS",
    slug: "alert-rooms",
    label: "Alert room",
    plural: "Alert rooms",
    blurb: "Time stamped trade ideas with the reasoning. Locked once posted.",
    allowedIntervals: ["MONTH", "YEAR"],
  },
  {
    value: "INDICATOR",
    slug: "indicators",
    label: "Indicator",
    plural: "Indicators and scripts",
    blurb: "Indicators and scripts for TradingView, NinjaTrader and more.",
    allowedIntervals: ["ONE_TIME", "MONTH", "YEAR"],
  },
  {
    value: "DOWNLOAD",
    slug: "downloads",
    label: "Download",
    plural: "Downloads",
    blurb: "Playbooks, templates, journals and checklists.",
    allowedIntervals: ["ONE_TIME"],
  },
  {
    value: "EVENT",
    slug: "events",
    label: "Live event",
    plural: "Live events",
    blurb: "A one off live workshop or class with a set date.",
    allowedIntervals: ["ONE_TIME"],
  },
];

export const productTypeInfo = (t: ProductType) => PRODUCT_TYPES.find((p) => p.value === t)!;
export const productTypeBySlug = (slug: string) => PRODUCT_TYPES.find((p) => p.slug === slug);

export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  ONE_TIME: "one time",
  MONTH: "per month",
  YEAR: "per year",
};

export const INTERVAL_SHORT: Record<BillingInterval, string> = {
  ONE_TIME: "",
  MONTH: "/mo",
  YEAR: "/yr",
};

export const SOCIALS: { value: SocialPlatform; label: string; placeholder: string }[] = [
  { value: "YOUTUBE", label: "YouTube", placeholder: "https://youtube.com/@yourname" },
  { value: "INSTAGRAM", label: "Instagram", placeholder: "https://instagram.com/yourname" },
  { value: "TIKTOK", label: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  { value: "X", label: "X", placeholder: "https://x.com/yourname" },
  { value: "DISCORD", label: "Discord", placeholder: "https://discord.gg/invite" },
  { value: "TWITCH", label: "Twitch", placeholder: "https://twitch.tv/yourname" },
  { value: "TELEGRAM", label: "Telegram", placeholder: "https://t.me/yourname" },
  { value: "WEBSITE", label: "Website", placeholder: "https://yoursite.com" },
];

export const socialLabel = (p: SocialPlatform) => SOCIALS.find((s) => s.value === p)?.label ?? p;

export const PLATFORMS = [
  "TradingView",
  "NinjaTrader",
  "Tradovate",
  "Sierra Chart",
  "Quantower",
  "MetaTrader 4",
  "MetaTrader 5",
  "cTrader",
  "thinkorswim",
  "TopstepX",
  "Rithmic",
  "ATAS",
  "Bookmap",
  "MotiveWave",
];

export const JOB_ROLES: { value: JobRole; label: string }[] = [
  { value: "VIDEO_EDITOR", label: "Video editor" },
  { value: "MODERATOR", label: "Moderator" },
  { value: "COMMUNITY_MANAGER", label: "Community manager" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "DESIGNER", label: "Designer" },
  { value: "ANALYST", label: "Analyst" },
  { value: "SALES", label: "Sales" },
  { value: "MARKETING", label: "Marketing" },
  { value: "OTHER", label: "Other" },
];

export const JOB_KINDS: { value: JobKind; label: string }[] = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "GIG", label: "One off gig" },
];

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SCAM", label: "Scam or fraud" },
  { value: "MISLEADING_CLAIMS", label: "Misleading profit or results claims" },
  { value: "BANNED_PRODUCT", label: "Not allowed on TraderTrades" },
  { value: "HARASSMENT", label: "Harassment or hate" },
  { value: "SPAM", label: "Spam" },
  { value: "IMPERSONATION", label: "Pretending to be someone else" },
  { value: "COPYRIGHT", label: "Copied or stolen content" },
  { value: "OTHER", label: "Something else" },
];

/** What can never be sold here. Shown on the rules page and checked on every listing. */
export const BANNED_PRODUCTS = [
  {
    title: "Copy trading of your trades",
    detail: "Selling access to trades that are placed in buyers' accounts automatically. Trade copiers for your own accounts are fine.",
  },
  {
    title: "Account management",
    detail: "Trading someone else's account or money for them, in any form.",
  },
  {
    title: "Profit sharing",
    detail: "Taking a cut of a buyer's trading profits, or offering them a cut of yours.",
  },
  {
    title: "Challenge passing services",
    detail: "Passing a prop firm evaluation for someone else. It breaks every firm's rules.",
  },
  {
    title: "Profit promises",
    detail: "Any promise of income, guaranteed wins, 'risk free' trading or fixed returns.",
  },
];

export const ALLOWED_PRODUCTS = [
  "Courses and video lessons",
  "Paid communities and memberships",
  "One to one mentoring calls",
  "Alert rooms with time stamped, locked posts",
  "Indicators and scripts",
  "Playbooks, templates and journals",
  "Live workshops and classes",
];

export const SUPPORT_TOPICS = ["Buying or a refund", "Selling or payouts", "My account", "A business listing", "Reporting a problem", "Something else"] as const;
