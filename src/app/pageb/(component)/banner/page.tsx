"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import styles from "./styles.module.css";

interface WelcomeBannerProps {
  name: string;
  role?: string;
  agendaHref?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeBanner({
  name,
  role = "Correspondence Officer",
  agendaHref = "/calendar",
}: WelcomeBannerProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className={styles.banner}>
      <div className={styles.texture} aria-hidden="true" />
      <SenateEmblem className={styles.watermark} />

      <div className={styles.content}>
        <span className={styles.eyebrow}>
          <CalendarDays size={13} aria-hidden="true" />
          {today}
        </span>
        <h1 className={styles.heading}>
          {getGreeting()}, {name.split(" ")[0]}
        </h1>
        <p className={styles.subtitle}>
          {role} · Senate Liaison Office Management System
        </p>
      </div>

      <Link href={agendaHref} className={styles.cta}>
        View today&rsquo;s agenda
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
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
