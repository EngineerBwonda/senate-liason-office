"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, House } from "lucide-react";
import styles from "./not-found.module.css";

const REDIRECT_DELAY = 8;

export default function NotFoundActions() {
  const [returnUrl, setReturnUrl] = useState("/");
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY);

  useEffect(() => {
    let destination = "/";

    try {
      const previousPage = new URL(document.referrer);
      if (
        previousPage.origin === window.location.origin &&
        previousPage.pathname !== window.location.pathname
      ) {
        destination = previousPage.href;
        setHasPreviousPage(true);
      }
    } catch {
      setHasPreviousPage(false);
    }

    setReturnUrl(destination);

    let seconds = REDIRECT_DELAY;
    const countdown = window.setInterval(() => {
      seconds -= 1;
      setSecondsLeft(Math.max(seconds, 0));
    }, 1000);
    const redirect = window.setTimeout(
      () => window.location.replace(destination),
      REDIRECT_DELAY * 1000,
    );

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(redirect);
    };
  }, []);

  const destinationLabel = hasPreviousPage
    ? "the previous page"
    : "the home page";

  return (
    <div className={styles.actionGroup}>
      <div className={styles.actions}>
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => window.location.replace(returnUrl)}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          Return to {hasPreviousPage ? "previous page" : "home"}
        </button>
        <a className={styles.secondaryAction} href="/">
          <House size={16} aria-hidden="true" />
          Go to home
        </a>
      </div>
      <p className={styles.redirectNote} aria-live="polite">
        Taking you to {destinationLabel} in <strong>{secondsLeft}</strong>s
        <span className={styles.redirectTrack} aria-hidden="true">
          <span
            className={styles.redirectProgress}
            style={{
              transform: `scaleX(${(REDIRECT_DELAY - secondsLeft) / REDIRECT_DELAY})`,
            }}
          />
        </span>
      </p>
    </div>
  );
}
