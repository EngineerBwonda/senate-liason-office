"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Clock,
  Mail,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

export default function PendingPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    const route = (approved: boolean | undefined | null) => {
      if (cancelled) return;
      if (approved) {
        router.replace("/dashboard");
      }
    };

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profilec")
        .select("is_approved")
        .eq("id", user.id)
        .maybeSingle();

      route(profile?.is_approved);

      // Live updates — as soon as the admin flips the switch
      const channel = supabase
        .channel(`profile-approval-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profilec",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const next = payload.new as { is_approved?: boolean };
            route(next.is_approved);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanupPromise = init();

    return () => {
      cancelled = true;
      cleanupPromise.then((fn) => fn && fn());
    };
  }, [router, supabase]);

  return (
    <main className={styles.page}>
      {/* LEFT INFORMATION PANEL */}
      <section className={styles.visualSection}>
        <div className={styles.visualOverlay} />

        <div className={styles.visualContent}>
          <Link href="/" className={styles.logo}>
            <div className={styles.logoMark}>S</div>
            <div>
              <strong>SENATE LIAISON</strong>
              <span>OFFICE MANAGEMENT</span>
            </div>
          </Link>

          <motion.div
            className={styles.heroContent}
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className={styles.badge}>
              <ShieldCheck size={15} />
              Almost there
            </div>

            <h1>
              You&apos;re on the
              <span> right track.</span>
            </h1>

            <p>
              Your registration has been received. Our team is reviewing your
              details to make sure everything is set up correctly before
              granting access to the platform.
            </p>

            <div className={styles.benefits}>
              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <strong>Registration received</strong>
                  <span>Your account has been created successfully.</span>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <Clock size={18} />
                </div>
                <div>
                  <strong>Awaiting review</strong>
                  <span>
                    An administrator is currently verifying your account.
                  </span>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <strong>You&apos;ll be notified</strong>
                  <span>You can sign in as soon as you&apos;re approved.</span>
                </div>
              </div>
            </div>
          </motion.div>

          <div className={styles.bottomMessage}>
            <span />
            <p>Connect. Manage. Deliver. Serve.</p>
          </div>
        </div>
      </section>

      {/* STATUS PANEL */}
      <section className={styles.formSection}>
        <div className={styles.formContainer}>
          <Link href="/" className={styles.mobileLogo}>
            <div className={styles.logoMark}>S</div>
            <div>
              <strong>SENATE LIAISON</strong>
              <span>OFFICE MANAGEMENT</span>
            </div>
          </Link>

          <motion.div
            className={styles.formHeader}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className={styles.formEyebrow}>Account status</span>
            <h2>Awaiting approval</h2>
            <p>
              Your account has been created. You&apos;ll have full access once
              an administrator approves your registration.
            </p>
          </motion.div>

          <motion.div
            className={styles.statusCard}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <div className={styles.statusSpinnerWrapper}>
              <span className={styles.statusSpinner} />
            </div>
            <div className={styles.statusText}>
              <strong>Review in progress</strong>
              <span>This usually takes less than 24 hours.</span>
            </div>
          </motion.div>

          <motion.div
            className={styles.infoList}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className={styles.infoItem}>
              <ShieldCheck size={18} className={styles.infoIcon} />
              <div>
                <strong>Secure review</strong>
                <span>
                  Only administrators can see your registration details.
                </span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Mail size={18} className={styles.infoIcon} />
              <div>
                <strong>Check your email</strong>
                <span>
                  We may contact you if additional information is needed.
                </span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Users size={18} className={styles.infoIcon} />
              <div>
                <strong>Need help?</strong>
                <span>
                  Reach out to your office administrator for assistance.
                </span>
              </div>
            </div>
          </motion.div>

          <Link href="/login" className={styles.submitButton}>
            Login to your account
            <ArrowRight size={18} />
          </Link>

          <div className={styles.securityNote}>
            <ShieldCheck size={15} />
            <span>Your account information is securely protected.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
