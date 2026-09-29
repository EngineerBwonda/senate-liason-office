"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Users,
  User,
  ChevronRight,
  Landmark,
  GraduationCap,
  Globe,
  MapPin,
  Briefcase,
  FileSignature,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";
import styles from "./styles.module.css";

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

type Accent =
  | "blue"
  | "teal"
  | "green"
  | "purple"
  | "indigo"
  | "orange"
  | "cyan"
  | "amber"
  | "pink"
  | "red";
type PillTone = "neutral" | "info" | "success" | "warning" | "danger";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const MotionLink = motion.create(Link);

/* ================================================================== */
/*  Shared card                                                        */
/* ================================================================== */

interface QuickAccessItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  pillLabel: string;
  pillTone: PillTone;
  accent: Accent;
  href: string;
}

function QuickAccessCard({
  icon: Icon,
  title,
  description,
  pillLabel,
  pillTone,
  accent,
  href,
}: QuickAccessItem) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <MotionLink
      href={href}
      className={styles.card}
      data-accent={accent}
      aria-label={`${title}: ${description}. ${pillLabel}. View details`}
      variants={prefersReducedMotion ? undefined : item}
      whileHover={prefersReducedMotion ? undefined : { y: -6, scale: 1.025 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <span className={styles.glow} aria-hidden="true" />

      <span className={styles.topRow}>
        <span className={styles.iconWrap}>
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className={styles.pill} data-tone={pillTone}>
          {pillLabel}
        </span>
      </span>

      <span className={styles.title}>{title}</span>
      <span className={styles.description}>{description}</span>

      <span className={styles.footer}>
        View details <ChevronRight size={13} strokeWidth={2.5} />
      </span>
    </MotionLink>
  );
}

/* ================================================================== */
/*  Visiting Delegation section                                        */
/* ================================================================== */

const delegationItems: QuickAccessItem[] = [
  {
    id: "county-assembly",
    icon: Landmark,
    title: "County Assembly",
    description: "Visits from county assembly members and staff",
    pillLabel: "2 Scheduled",
    pillTone: "info",
    accent: "blue",
    href: "../pages/delegation",
  },
  {
    id: "schools",
    icon: GraduationCap,
    title: "Schools",
    description: "Educational visits and student tours",
    pillLabel: "1 Upcoming",
    pillTone: "info",
    accent: "teal",
    href: "../pages/schools",
  },
  {
    id: "organised-groups",
    icon: Users,
    title: "Organised Groups",
    description: "Community and organisation group visits",
    pillLabel: "3 Confirmed",
    pillTone: "success",
    accent: "purple",
    href: "/delegation/organised-groups",
  },
  {
    id: "individuals",
    icon: User,
    title: "Individuals",
    description: "Single-visitor appointments and walk-ins",
    pillLabel: "Open",
    pillTone: "neutral",
    accent: "indigo",
    href: "/delegation/individuals",
  },
  {
    id: "international-delegates",
    icon: Globe,
    title: "International Delegates",
    description: "Visiting delegations from other countries",
    pillLabel: "1 Pending",
    pillTone: "warning",
    accent: "red",
    href: "/delegation/international",
  },
  {
    id: "local-delegates",
    icon: MapPin,
    title: "Local Delegates",
    description: "Delegations from within the county",
    pillLabel: "Confirmed",
    pillTone: "success",
    accent: "amber",
    href: "/delegation/local",
  },
  {
    id: "internship",
    icon: Briefcase,
    title: "Internship",
    description: "Internship placements and inquiries",
    pillLabel: "4 Active",
    pillTone: "info",
    accent: "cyan",
    href: "../pages/internship",
  },
  {
    id: "attachment",
    icon: FileSignature,
    title: "Attachment",
    description: "Industrial attachment placements",
    pillLabel: "2 Active",
    pillTone: "info",
    accent: "pink",
    href: "../pages/attachment",
  },
  {
    id: "volunteers",
    icon: HeartHandshake,
    title: "Volunteers",
    description: "Volunteer sign-ups and coordination",
    pillLabel: "6 Active",
    pillTone: "success",
    accent: "green",
    href: "/delegation/volunteers",
  },
];

export function VisitingDelegationGrid() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Visiting Delegation</h2>
      </div>
      <motion.div
        className={styles.grid}
        role="list"
        aria-label="Visiting delegation shortcuts"
        variants={prefersReducedMotion ? undefined : container}
        initial={prefersReducedMotion ? undefined : "hidden"}
        whileInView={prefersReducedMotion ? undefined : "show"}
        viewport={{ once: true, amount: 0.3 }}
      >
        {delegationItems.map((entry) => (
          <div role="listitem" key={entry.id} className={styles.gridItem}>
            <QuickAccessCard {...entry} />
          </div>
        ))}
      </motion.div>
    </section>
  );
}

/* ================================================================== */
/*  Default export                                                     */
/* ================================================================== */

export default function DashboardCards() {
  return <VisitingDelegationGrid />;
}
