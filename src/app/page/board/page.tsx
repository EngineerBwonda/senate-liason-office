"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fraunces, Inter } from "next/font/google";
import {
  LayoutDashboard,
  FileText,
  Mail,
  BarChart3,
  Users2,
  StickyNote,
  Image as ImageIcon,
  Rss,
  MessageSquare,
  UserCheck,
  CalendarDays,
  Bell,
  Settings,
  Menu,
  X,
  ChevronLeft,
  Search,
} from "lucide-react";
import styles from "./styles.module.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

/* ---------------------------------------------------------
   Nav model
--------------------------------------------------------- */

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Records",
    items: [
      { href: "../../page/user", label: "Minutes", icon: FileText },
      { href: "/correspondence", label: "Correspondence", icon: Mail },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/memos", label: "Memos", icon: StickyNote },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/meetings", label: "Meetings", icon: Users2 },
      { href: "/gallery", label: "Gallery", icon: ImageIcon },
      { href: "/feed", label: "Office Feed", icon: Rss },
      { href: "/chats", label: "Chats", icon: MessageSquare },
      { href: "/delegates", label: "Delegates", icon: UserCheck },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
];

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/* ---------------------------------------------------------
   Layout
--------------------------------------------------------- */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className={`${styles.shell} ${display.variable} ${body.variable}`}>
      {/* ---------------- SIDEBAR ---------------- */}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? "" : styles.sidebarCollapsed} ${
          mobileNavOpen ? styles.sidebarMobileOpen : ""
        }`}
      >
        <div className={styles.sidebarHeader}>
          <SenateEmblem className={styles.emblemMark} />
          {sidebarOpen && (
            <div className={styles.emblemText}>
              <span className={styles.emblemTitle}>Senate Liaison Office</span>
              <span className={styles.emblemSubtitle}>Management System</span>
            </div>
          )}
          <button
            className={styles.mobileCloseButton}
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className={styles.navSection}>
              {sidebarOpen && (
                <span className={styles.navSectionLabel}>{section.label}</span>
              )}
              {section.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                    title={sidebarOpen ? undefined : item.label}
                  >
                    <Icon
                      size={18}
                      className={styles.navIcon}
                      aria-hidden="true"
                    />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/settings" className={styles.navLink}>
            <Settings size={18} className={styles.navIcon} aria-hidden="true" />
            {sidebarOpen && <span>Settings</span>}
          </Link>
          <button
            className={styles.collapseButton}
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft
              size={16}
              style={{ transform: sidebarOpen ? "none" : "rotate(180deg)" }}
            />
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div
          className={styles.mobileScrim}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------------- MIDDLE: PAGE OUTLET ---------------- */}
      <div className={styles.contentColumn}>
        <header className={styles.topBar}>
          <button
            className={styles.mobileMenuButton}
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className={styles.searchBar}>
            <Search
              size={16}
              className={styles.searchIcon}
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search records, memos, delegates…"
              className={styles.searchInput}
            />
          </div>
          <button
            className={styles.notificationButton}
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className={styles.notificationDot} aria-hidden="true" />
          </button>
        </header>

        <main className={styles.pageOutlet}>{children}</main>
      </div>

      {/* ---------------- RIGHT RAIL ---------------- */}
      <aside className={styles.rightRail}>
        <OnlineUsers />
        <RecentMessages />
        <MiniCalendar />
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------
   Right rail sections
--------------------------------------------------------- */

const ONLINE_USERS = [
  { name: "Amb. Wanjiru Kamau", role: "Clerk of the Senate" },
  { name: "Hon. David Otieno", role: "Delegate, Nairobi" },
  { name: "Faith Mutiso", role: "Correspondence Officer" },
  { name: "Peter Kiptoo", role: "Delegate, Uasin Gishu" },
];

function OnlineUsers() {
  return (
    <section className={styles.railCard}>
      <div className={styles.railCardHeader}>
        <h2 className={styles.railCardTitle}>Online now</h2>
        <span className={styles.railCardCount}>{ONLINE_USERS.length}</span>
      </div>
      <ul className={styles.userList}>
        {ONLINE_USERS.map((user) => (
          <li key={user.name} className={styles.userRow}>
            <span className={styles.avatar} aria-hidden="true">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .slice(-2)
                .join("")}
              <span className={styles.presenceDot} />
            </span>
            <span className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.role}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MESSAGES = [
  {
    name: "Faith Mutiso",
    snippet: "The March minutes are ready for review.",
    time: "2m",
  },
  {
    name: "Hon. David Otieno",
    snippet: "Can we move Thursday's meeting?",
    time: "18m",
  },
  {
    name: "Clerk's Office",
    snippet: "New memo posted to the Reports folder.",
    time: "1h",
  },
];

function RecentMessages() {
  return (
    <section className={styles.railCard}>
      <div className={styles.railCardHeader}>
        <h2 className={styles.railCardTitle}>New messages</h2>
        <Link href="/chats" className={styles.railCardLink}>
          View all
        </Link>
      </div>
      <ul className={styles.messageList}>
        {MESSAGES.map((m) => (
          <li key={m.name + m.time} className={styles.messageRow}>
            <span className={styles.avatar} aria-hidden="true">
              {m.name
                .split(" ")
                .map((p) => p[0])
                .slice(-2)
                .join("")}
            </span>
            <span className={styles.messageBody}>
              <span className={styles.messageTop}>
                <span className={styles.userName}>{m.name}</span>
                <span className={styles.messageTime}>{m.time}</span>
              </span>
              <span className={styles.messageSnippet}>{m.snippet}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = today.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className={styles.railCard}>
      <div className={styles.railCardHeader}>
        <h2 className={styles.railCardTitle}>Calendar</h2>
        <Link href="/calendar" className={styles.railCardLink}>
          Open
        </Link>
      </div>
      <p className={styles.calendarMonth}>{monthLabel}</p>
      <div className={styles.calendarGrid}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}-${i}`} className={styles.calendarWeekday}>
            {d}
          </span>
        ))}
        {cells.map((day, i) => (
          <span
            key={i}
            className={`${styles.calendarDay} ${
              day === today.getDate() ? styles.calendarDayToday : ""
            } ${day === null ? styles.calendarDayEmpty : ""}`}
          >
            {day ?? ""}
          </span>
        ))}
      </div>
      <div className={styles.upcomingEvent}>
        <span className={styles.upcomingDot} aria-hidden="true" />
        <span>
          <strong>Full Senate Sitting</strong> — Thu, 10:00 AM
        </span>
      </div>
    </section>
  );
}

function SenateEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="22.5" stroke="currentColor" strokeWidth="1" />
      <circle
        cx="24"
        cy="24"
        r="18"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.6"
      />
      <path
        d="M24 12L26.35 19.53H34.26L27.95 24.24L30.3 31.77L24 27.06L17.7 31.77L20.05 24.24L13.74 19.53H21.65L24 12Z"
        fill="currentColor"
      />
    </svg>
  );
}
