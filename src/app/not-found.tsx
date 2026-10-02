import type { Metadata } from "next";
import { ArrowUpRight, FileQuestion, Landmark } from "lucide-react";
import NotFoundActions from "./not-found-actions";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page Not Found | Senate Liaison Office",
  description: "This page is not available yet and is still in development.",
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.texture} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Landmark size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className={styles.brandText}>
              <strong>Senate Liaison Office</strong>
              <small>STAFF WORKSPACE</small>
            </span>
          </div>
          <span className={styles.headerLabel}>DIGITAL SERVICES</span>
        </header>

        <section className={styles.content} aria-labelledby="not-found-title">
          <div className={styles.visual} aria-hidden="true">
            <div className={styles.visualTopline}>
              <span className={styles.visualIcon}>
                <FileQuestion size={18} strokeWidth={1.8} />
              </span>
              <span>ROUTE NOT FOUND</span>
            </div>
            <p className={styles.number}>404</p>
            <div className={styles.visualFoot}>
              <span className={styles.footLine} />
              <span>STATUS / IN PROGRESS</span>
            </div>
          </div>

          <div className={styles.copy}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              THIS PAGE IS STILL IN DEVELOPMENT
            </p>
            <h1 id="not-found-title">
              Not quite ready
              <br />
              for the record.
            </h1>
            <p className={styles.description}>
              The page you were looking for isn’t available just yet. We’re
              working on it, and you’ll be on your way shortly.
            </p>

            <NotFoundActions />
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Senate Liaison Office</span>
          <span className={styles.footerStatus}>
            SERVICE STATUS <span className={styles.statusDot} /> OPERATIONAL
          </span>
          <a className={styles.footerLink} href="/">
            Workspace home <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
