"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  Rss,
  MessageSquare,
  UserCheck,
  CalendarDays,
  Bell,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  Search,
  Sun,
  Moon,
  User,
  LogOut,
  Send,
  FileEdit,
} from "lucide-react";
import OnlineUsers from "./(component)/online-users/online-users";
import RecentMessages from "./(component)/recent-messages/recent-messages";
import {
  ATTENTION_CARDS,
  ATTENTION_LAST_OPENED_EVENT,
} from "./(component)/attention-data";
import { createClient } from "../supabase/client";
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

const THEME_STORAGE_KEY = "slo-theme";
const THEME_CHANGE_EVENT = "slo-theme-change";

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function getThemeSnapshot(): "dark" | "light" {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light"
    ? "light"
    : "dark";
}

function getServerThemeSnapshot(): "dark" {
  return "dark";
}

/* ---------------------------------------------------------
   Nav model
--------------------------------------------------------- */

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "../pageb/menu", label: "Dashboard", icon: LayoutDashboard },
    ],
  },

  {
    label: "Communications",
    items: [
      {
        href: "/pageb/minutes",
        label: "Minutes",
        icon: FileText,
        attentionId: "minutes",
      },
      {
        href: "/pageb/incoming-correspondence",
        label: "Incoming Correspondence",
        icon: Mail,
        attentionId: "incoming-correspondence",
      },
      {
        href: "/pageb/outgoing-correspondence",
        label: "Outgoing Correspondence",
        icon: Send,
        attentionId: "outgoing-correspondence",
      },

      { href: "/feeds", label: "Office Feeds", icon: Rss },
      { href: "/pageb/chats", label: "Chats", icon: MessageSquare },
      {
        href: "/pageb/memo",
        label: "Memos",
        icon: StickyNote,
        attentionId: "memos",
      },
    ],
  },

  {
    label: "Meetings & Engagement",
    items: [
      { href: "../pageb/grid", label: "Internal Meetings", icon: Users2 },
      {
        href: "../pageb/delegation",
        label: "External Meetings",
        icon: CalendarDays,
      },
      { href: "/memos", label: "Calendar", icon: CalendarDays },
      { href: "/memos", label: "Delegates", icon: UserCheck },
    ],
  },

  {
    label: "Record",
    items: [
      {
        href: "/pageb/collaborative",
        label: "Collaborative Drafts",
        icon: FileEdit,
      },
      {
        href: "../pageb/monthly-report",
        label: "Monthly Reports",
        icon: BarChart3,
      },
      {
        href: "../pageb/annual-report",
        label: "Quarterly Reports",
        icon: BarChart3,
      },
      {
        href: "../pageb/annual-report",
        label: "Annual Reports",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/meetings", label: "Notification", icon: Bell },
      { href: "/gallery", label: "Settings", icon: Settings },
      { href: "/feed", label: "Profile", icon: User },
    ],
  },
];

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  attentionId?: string;
}

function isPathActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  const destination = new URL(href, `https://sidebar.local${pathname}`)
    .pathname;
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

/* ---------------------------------------------------------
   Layout
--------------------------------------------------------- */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const pathname = usePathname();
  const [attentionCounts, setAttentionCounts] = useState<
    Record<string, number>
  >({});
  const activeNavItem = NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => isPathActive(item.href, pathname),
  );

  useEffect(() => {
    const item = NAV_SECTIONS.flatMap((section) => section.items).find(
      (navItem) => navItem.attentionId && isPathActive(navItem.href, pathname),
    );
    const config = ATTENTION_CARDS.find(
      (attentionCard) => attentionCard.id === item?.attentionId,
    );
    if (!config) return;

    window.localStorage.setItem(config.key, new Date().toISOString());
    window.dispatchEvent(
      new CustomEvent(ATTENTION_LAST_OPENED_EVENT, {
        detail: { key: config.key },
      }),
    );
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/pageb/chats") return;

    const supabase = createClient();
    let cancelled = false;
    const attentionItems = NAV_SECTIONS.flatMap((section) => section.items)
      .filter((item) => item.attentionId)
      .map((item) => item.attentionId);
    const configs = ATTENTION_CARDS.filter((config) =>
      attentionItems.includes(config.id),
    );

    const loadCount = async (config: (typeof configs)[number]) => {
      const lastOpenedAt = window.localStorage.getItem(config.key);
      let query = supabase
        .from(config.table)
        .select("id", { count: "exact", head: true });

      if (lastOpenedAt) query = query.gt("created_at", lastOpenedAt);

      const { count, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error(`Error loading attention count for ${config.id}:`, error);
        return;
      }

      setAttentionCounts((current) => ({
        ...current,
        [config.id]: count ?? 0,
      }));
    };

    configs.forEach((config) => void loadCount(config));

    const channels = configs.map((config) =>
      supabase
        .channel(`${config.id}-sidebar-attention-changes`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: config.table },
          () => void loadCount(config),
        )
        .subscribe(),
    );

    const refreshForKey = (key: string | null | undefined) => {
      if (!key) return;
      const config = configs.find((item) => item.key === key);
      if (config) void loadCount(config);
    };
    const onStorage = (event: StorageEvent) => refreshForKey(event.key);
    const onLastOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string }>;
      refreshForKey(customEvent.detail?.key);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ATTENTION_LAST_OPENED_EVENT, onLastOpened);

    return () => {
      cancelled = true;
      channels.forEach((channel) => void supabase.removeChannel(channel));
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ATTENTION_LAST_OPENED_EVENT, onLastOpened);
    };
  }, [pathname]);

  // Keep Bootstrap's own color-mode attribute in sync so components
  // rendered outside this shell (modals, toasts, portals) match too.
  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  if (pathname === "/pageb/chats") {
    return (
      <div
        className={`${styles.chatStandalone} ${display.variable} ${body.variable}`}
        data-bs-theme={theme}
        suppressHydrationWarning
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`${styles.shell} ${display.variable} ${body.variable}`}
      data-bs-theme={theme}
      suppressHydrationWarning
    >
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
                const active = item === activeNavItem;
                const Icon = item.icon;
                const attentionCount = item.attentionId
                  ? (attentionCounts[item.attentionId] ?? 0)
                  : 0;
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                    title={
                      sidebarOpen
                        ? undefined
                        : `${item.label}${attentionCount > 0 ? ` (${attentionCount} new)` : ""}`
                    }
                    aria-label={
                      attentionCount > 0
                        ? `${item.label}, ${attentionCount} new documents`
                        : undefined
                    }
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      size={18}
                      className={styles.navIcon}
                      aria-hidden="true"
                    />
                    {sidebarOpen && <span>{item.label}</span>}
                    {attentionCount > 0 && (
                      <span className={styles.navBadge} aria-hidden="true">
                        {attentionCount > 99 ? "99+" : attentionCount}
                      </span>
                    )}
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
            className={styles.iconButton}
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
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
            className={styles.iconButton}
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className={styles.notificationButton}
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className={styles.notificationDot} aria-hidden="true" />
          </button>
          <ProfileMenu />
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

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState("User");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        setProfileName("User");
        return;
      }

      const metadataName =
        (typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name.trim()) ||
        (typeof user.user_metadata?.name === "string" &&
          user.user_metadata.name.trim());
      const fallbackName = metadataName || user.email?.split("@")[0] || "User";
      const { data } = await supabase
        .from("profilec")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setProfileName(data?.full_name?.trim() || fallbackName);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const initials = profileName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={styles.profileMenu} ref={menuRef}>
      <button
        className={styles.profileTrigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials || "U"}
        </span>
        <span className={styles.profileName}>{profileName}</span>
        <ChevronDown
          size={14}
          className={styles.profileChevron}
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div className={styles.profileDropdown} role="menu">
          <Link
            href="/profile"
            className={styles.profileDropdownItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <User size={16} aria-hidden="true" />
            Profile
          </Link>
          <button
            type="button"
            className={`${styles.profileDropdownItem} ${styles.profileDropdownDanger}`}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              // TODO: wire to Supabase signOut
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Right rail sections
--------------------------------------------------------- */

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
