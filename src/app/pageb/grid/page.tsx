"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  animate,
  type Variants,
} from "framer-motion";
import {
  FileText,
  Mail,
  Users,
  MessageSquare,
  FileEdit,
  Newspaper,
  Image,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Send,
  FileBarChart,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

type Accent =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "cyan"
  | "indigo"
  | "amber"
  | "red";
type TrendDirection = "up" | "down" | "neutral";

interface StatItem {
  id: string;
  icon: LucideIcon;
  value: number;
  label: string;
  secondary: string;
  trendDirection: TrendDirection;
  accent: Accent;
  href: string;
  progress?: number;
  onClick?: () => void;
}

const stats: StatItem[] = [
  {
    id: "minutes",
    icon: FileText,
    value: 24,
    label: "Minutes Received",
    secondary: "receive and share minutes from other offices",
    trendDirection: "up",
    accent: "blue",
    href: "/pages/minutes",
  },
  {
    id: "incoming-correspondence",
    icon: Mail,
    value: 18,
    label: "Incoming Correspondence",
    secondary: "receive correspondence from other offices",
    trendDirection: "neutral",
    accent: "green",
    href: "/pages/incoming-correspondence",
  },
  {
    id: "outgoing-correspondence",
    icon: Send,
    value: 7,
    label: "Outgoing Correspondence",
    secondary: "send correspondence to other offices",
    trendDirection: "neutral",
    accent: "purple",
    href: "/pages/outgoing-correspondence",
    progress: 62,
  },
  {
    id: "monthly-reports",
    icon: FileBarChart,
    value: 5,
    label: "Monthly-Reports",
    secondary: "Next at 2:00 PM",
    trendDirection: "neutral",
    accent: "orange",
    href: "/pages/monthly-reports",
  },
  {
    id: "annual-reports",
    icon: Users,
    value: 5,
    label: "receive and share annual reports",
    secondary: "Next at 2:00 PM",
    trendDirection: "neutral",
    accent: "orange",
    href: "/pages/annual-reports",
  },
  {
    id: "quarterly-reports",
    icon: CalendarCheck,
    value: 5,
    label: "receive and share quarterly reports",
    secondary: "Next at 2:00 PM",
    trendDirection: "neutral",
    accent: "orange",
    href: "/pages/quarterly-reports",
  },
  {
    id: "chats",
    icon: MessageSquare,
    value: 11,
    label: "Unread Chats",
    secondary: "Team conversation and active threads",
    trendDirection: "up",
    accent: "cyan",
    href: "../firebase-chat/login",
  },
  {
    id: "calendar",
    icon: CalendarCheck,
    value: 3,
    label: "Calendar of Events",
    secondary: "Confirmed",
    trendDirection: "neutral",
    accent: "indigo",
    href: "/pages/event-b",
  },
  {
    id: "memos",
    icon: FileEdit,
    value: 9,
    label: "Memos",
    secondary: "receive and share memos from other offices",
    trendDirection: "down",
    accent: "amber",
    href: "/pages/memo",
  },
  {
    id: "feed",
    icon: Newspaper,
    value: 14,
    label: "Office Feed",
    secondary: "receive and share updates from other offices",
    trendDirection: "neutral",
    accent: "red",
    href: "/feed",
  },
  {
    id: "gallery",
    icon: Image,
    value: 14,
    label: "Gallery",
    secondary: "photos and albums from recent events",
    trendDirection: "neutral",
    accent: "red",
    href: "/pages/gallery-b",
  },
];

const trendIconMap = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: null,
} as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const MotionLink = motion.create(Link);
const MEMO_LAST_OPENED_KEY = "memo:last-opened-at";
const INCOMING_LAST_OPENED_KEY = "incoming-correspondence:last-opened-at";
const OUTGOING_LAST_OPENED_KEY = "outgoing-correspondence:last-opened-at";
const MONTHLY_LAST_OPENED_KEY = "monthly-reports:last-opened-at";
const ANNUAL_LAST_OPENED_KEY = "annual-reports:last-opened-at";
const QUARTERLY_LAST_OPENED_KEY = "quarterly-reports:last-opened-at";
const MINUTES_LAST_OPENED_KEY = "minutes:last-opened-at";
const ATTENTION_LAST_OPENED_EVENT = "attention:last-opened-updated";

type AttentionCardConfig = {
  id: string;
  table: string;
  key: string;
  singular: string;
  plural: string;
};

const ATTENTION_CARDS: AttentionCardConfig[] = [
  {
    id: "memos",
    table: "boss doc",
    key: MEMO_LAST_OPENED_KEY,
    singular: "Needs Attention",
    plural: "Need Attention",
  },
  {
    id: "incoming-correspondence",
    table: "incoming_correspondence",
    key: INCOMING_LAST_OPENED_KEY,
    singular: "New Correspondence",
    plural: "New Correspondence",
  },
  {
    id: "outgoing-correspondence",
    table: "outgoing_correspondence",
    key: OUTGOING_LAST_OPENED_KEY,
    singular: "New Outgoing",
    plural: "New Outgoing",
  },
  {
    id: "monthly-reports",
    table: "monthly_reports",
    key: MONTHLY_LAST_OPENED_KEY,
    singular: "New Monthly Report",
    plural: "New Monthly Reports",
  },
  {
    id: "annual-reports",
    table: "annual_reports",
    key: ANNUAL_LAST_OPENED_KEY,
    singular: "New Annual Report",
    plural: "New Annual Reports",
  },
  {
    id: "quarterly-reports",
    table: "quarterlyb_reports",
    key: QUARTERLY_LAST_OPENED_KEY,
    singular: "Needs Attention",
    plural: "Need Attention",
  },
  {
    id: "minutes",
    table: "minutes",
    key: MINUTES_LAST_OPENED_KEY,
    singular: "New Minute",
    plural: "New Minutes",
  },
];

function StatValue({
  value,
  animateIn,
}: {
  value: number;
  animateIn: boolean;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!animateIn) return;
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(0, value, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate(v) {
        node.textContent = Math.round(v).toString();
      },
    });

    return () => controls.stop();
  }, [value, animateIn]);

  if (!animateIn) return <span>{value}</span>;
  return <span ref={nodeRef}>0</span>;
}

function StatCard({
  icon: Icon,
  value,
  label,
  secondary,
  trendDirection,
  accent,
  href,
  progress,
  onClick,
}: StatItem) {
  const prefersReducedMotion = useReducedMotion();
  const TrendIcon = trendIconMap[trendDirection];

  return (
    <MotionLink
      href={href}
      className={styles.card}
      data-accent={accent}
      aria-label={`${label}: ${value}. ${secondary}. View details`}
      variants={prefersReducedMotion ? undefined : item}
      whileHover={prefersReducedMotion ? undefined : { y: -6, scale: 1.025 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      onClick={onClick}
    >
      <span className={styles.glow} aria-hidden="true" />

      <span className={styles.iconWrap}>
        <Icon size={20} strokeWidth={2} />
      </span>

      <span className={styles.value}>
        <StatValue value={value} animateIn={!prefersReducedMotion} />
      </span>

      <span className={styles.label}>{label}</span>

      <span className={styles.secondary} data-trend={trendDirection}>
        {TrendIcon && <TrendIcon size={12} strokeWidth={2.5} />}
        {secondary}
      </span>

      {typeof progress === "number" && (
        <span className={styles.progressTrack} aria-hidden="true">
          <span
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </span>
      )}

      <span className={styles.footer}>
        View details <ChevronRight size={13} strokeWidth={2.5} />
      </span>
    </MotionLink>
  );
}

export default function StatsGrid() {
  const prefersReducedMotion = useReducedMotion();
  const [attentionCounts, setAttentionCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const supabase = createClient();

    const loadCount = async ({ id, table, key }: AttentionCardConfig) => {
      const lastOpenedAt = localStorage.getItem(key);

      let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true });

      if (lastOpenedAt) {
        query = query.gt("created_at", lastOpenedAt);
      }

      const { count, error } = await query;

      if (error) {
        console.error(`Error loading attention count for ${id}:`, error);
        return;
      }

      setAttentionCounts((current) => ({
        ...current,
        [id]: count ?? 0,
      }));
    };

    ATTENTION_CARDS.forEach((config) => {
      void loadCount(config);
    });

    const channels = ATTENTION_CARDS.map((config) =>
      supabase
        .channel(`${config.id}-attention-changes`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: config.table },
          (payload) => {
            const lastOpenedAt = localStorage.getItem(config.key);
            const createdAt = (payload.new as { created_at?: string })
              .created_at;

            if (!createdAt) return;

            if (!lastOpenedAt || new Date(createdAt) > new Date(lastOpenedAt)) {
              setAttentionCounts((current) => ({
                ...current,
                [config.id]: (current[config.id] ?? 0) + 1,
              }));
            }
          },
        )
        .subscribe(),
    );

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      const config = ATTENTION_CARDS.find((item) => item.key === event.key);
      if (!config) return;
      void loadCount(config);
    };

    const onAttentionLastOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string }>;
      const key = customEvent.detail?.key;
      if (!key) return;

      const config = ATTENTION_CARDS.find((item) => item.key === key);
      if (!config) return;
      void loadCount(config);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ATTENTION_LAST_OPENED_EVENT, onAttentionLastOpened);

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        ATTENTION_LAST_OPENED_EVENT,
        onAttentionLastOpened,
      );
    };
  }, []);

  const handleOpenAttentionPage = (id: string, key: string) => {
    localStorage.setItem(key, new Date().toISOString());
    window.dispatchEvent(
      new CustomEvent(ATTENTION_LAST_OPENED_EVENT, { detail: { key } }),
    );
    setAttentionCounts((current) => ({
      ...current,
      [id]: 0,
    }));
  };

  const cards = stats.map((stat) => {
    const attentionCard = ATTENTION_CARDS.find((card) => card.id === stat.id);

    if (!attentionCard) {
      return stat;
    }

    const count = attentionCounts[attentionCard.id] ?? 0;

    return {
      ...stat,
      value: count,
      secondary:
        count === 1
          ? `1 ${attentionCard.singular}`
          : `${count} ${attentionCard.plural}`,
      trendDirection: count > 0 ? ("up" as const) : ("neutral" as const),
      onClick: () =>
        handleOpenAttentionPage(attentionCard.id, attentionCard.key),
    };
  });

  return (
    <motion.div
      className={styles.grid}
      role="list"
      aria-label="Dashboard statistics"
      variants={prefersReducedMotion ? undefined : container}
      initial={prefersReducedMotion ? undefined : "hidden"}
      animate={prefersReducedMotion ? undefined : "show"}
    >
      {cards.map((stat) => (
        <div role="listitem" key={stat.id} className={styles.gridItem}>
          <StatCard {...stat} />
        </div>
      ))}
    </motion.div>
  );
}
