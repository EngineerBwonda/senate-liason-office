"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Briefcase,
  Phone,
  ArrowRight,
  ShieldCheck,
  FileText,
  CalendarDays,
  MessageSquare,
} from "lucide-react";

import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  position: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState<FormState>({
    fullName: "",
    email: "",
    phone: "",
    position: "",
    password: "",
    confirmPassword: "",
    terms: false,
  });

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!formData.password) {
      setError("Password is required.");
      return;
    }
    if (!formData.terms) {
      setError("Please accept the terms and conditions.");
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/pending`,
          data: {
            full_name: formData.fullName.trim(),
            phone: formData.phone.trim(),
            position: formData.position.trim(),
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError("Unable to create account. Please try again.");
        return;
      }

      // Trigger handles the profile insert, but we upsert as a safety net.
      // const { error: profileError } = await supabase.from("profilec").insert({
      //   id: authData.user.id,
      //   user_id: authData.user.id,
      //   full_name: formData.fullName.trim(),
      //   email: formData.email.trim(),
      //   phone: formData.phone.trim(),
      //   position: formData.position.trim(),
      //   is_approved: false,
      // });

      // if (profileError) {
      //   console.error(profileError);
      //   setError(
      //     "Your account was created, but access could not be set up. Please contact support.",
      //   );
      //   return;
      // }

      const ADMIN_ROLES = [
        "director",
        "deputy director",
        "administrator",
        "admin",
      ];

      const isAdminPosition = (position: string) =>
        ADMIN_ROLES.includes(position.trim().toLowerCase());

      const { error: profileError } = await supabase.from("profilec").insert({
        id: authData.user.id,
        user_id: authData.user.id,
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        position: formData.position.trim(),
        is_approved: false,
      });

      // 23505 = unique_violation (row already created by trigger) → fine
      if (profileError && profileError.code !== "23505") {
        console.error("profilec insert failed:", profileError);
        setError(
          "Your account was created, but access could not be set up. Please contact support.",
        );
        return;
      }

      if (isAdminPosition(formData.position)) {
        setSuccess("Account created. Taking you to the dashboard...");
        router.push("../../page/dashboard");
      } else {
        setSuccess("Your account has been created and is awaiting approval.");
        router.push("../../page/pending");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
              Secure Access Request
            </div>

            <h1>
              Secure governance,
              <span> delivered digitally.</span>
            </h1>

            <p>
              Request access to the Senate Liaison Office Management System.
              Manage official correspondence, committee reports, meetings, and
              internal collaboration from one secure workspace.
            </p>

            <div className={styles.benefits}>
              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <FileText size={18} />
                </div>
                <div>
                  <strong>Secure Document Management</strong>
                  <span>Handle official correspondence with full control.</span>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <CalendarDays size={18} />
                </div>
                <div>
                  <strong>Meetings &amp; Committee Work</strong>
                  <span>Track reports, minutes, and agendas in one place.</span>
                </div>
              </div>

              <div className={styles.benefit}>
                <div className={styles.benefitIcon}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <strong>Internal Collaboration</strong>
                  <span>Stay connected with office teams and delegates.</span>
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

      {/* FORM */}
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
            <span className={styles.formEyebrow}>Request access</span>
            <h2>Create your account</h2>
            <p>All registrations are reviewed before access is granted.</p>
          </motion.div>

          {error && (
            <div className={styles.errorAlert} role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className={styles.successAlert} role="alert">
              <strong>Registration submitted!</strong>
              <br />
              {success}
            </div>
          )}

          <motion.form
            onSubmit={handleSubmit}
            className={styles.form}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {/* FULL NAME */}
            <div className={styles.inputGroup}>
              <label htmlFor="fullName">Full name</label>
              <div className={styles.inputWrapper}>
                <User size={18} />
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Dr. Jane Kamau"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            {/* EMAIL */}
            <div className={styles.inputGroup}>
              <label htmlFor="email">Email address</label>
              <div className={styles.inputWrapper}>
                <Mail size={18} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@senate.go.ke"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* PHONE */}
            <div className={styles.inputGroup}>
              <label htmlFor="phone">Phone number</label>
              <div className={styles.inputWrapper}>
                <Phone size={18} />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+254 700 000 000"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* POSITION */}
            <div className={styles.inputGroup}>
              <label htmlFor="position">Position / Title</label>
              <div className={styles.inputWrapper}>
                <Briefcase size={18} />
                <input
                  id="position"
                  name="position"
                  type="text"
                  placeholder="Senior Legislative Officer"
                  value={formData.position}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordButton}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword">Confirm password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordButton}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {/* TERMS */}
            <label className={styles.termsCheck}>
              <input
                type="checkbox"
                name="terms"
                checked={formData.terms}
                onChange={handleChange}
              />
              <span>
                I agree to the Senate Liaison Office&apos;s terms and privacy
                policy.
              </span>
            </label>

            {/* BUTTON */}
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} />
                  Creating account...
                </>
              ) : (
                <>
                  Request access
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </motion.form>

          <div className={styles.loginPrompt}>
            <span>Already have an account?</span>
            <Link href="/login">Sign in</Link>
          </div>

          <div className={styles.securityNote}>
            <ShieldCheck size={15} />
            <span>All registrations are verified for security purposes.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
