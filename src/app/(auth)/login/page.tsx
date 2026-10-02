"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

interface FormState {
  email: string;
  password: string;
  remember: boolean;
}

type FormErrors = Partial<Record<"email" | "password", string>>;

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<FormState>({
    email: "",
    password: "",
    remember: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "email" || key === "password") {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    if (serverError) setServerError("");
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.email.trim()) next.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "Please enter a valid email address";
    if (!form.password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    setIsLoading(true);
    setServerError("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

      if (error) {
        setServerError(
          error.message === "Invalid login credentials"
            ? "Incorrect email or password."
            : error.message,
        );
        return;
      }

      if (!data.user) {
        setServerError("Unable to sign in. Please try again.");
        return;
      }

      // Look up the profile to decide where to send the user
      const { data: profile, error: profileError } = await supabase
        .from("profilec")
        .select("is_approved")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("profilec lookup failed:", profileError);
        setServerError("Could not verify your account. Please try again.");
        return;
      }

      if (!profile) {
        // Auth user exists but profilec row is missing. Sign them out and
        // tell them to re-register or contact support.
        await supabase.auth.signOut();
        setServerError(
          "Your account has no profile record. Please contact an administrator.",
        );
        return;
      }

      if (!profile.is_approved) {
        // Not approved yet → pending page (which will also guard them)
        router.replace("../../page/pending");
        return;
      }

      // Approved → dashboard (admins and regular approved users both land here;
      // the dashboard can then link to /dashboard/users for admins)
      router.replace("../../pageb/try");
    } catch (err) {
      console.error(err);
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        {/* LEFT VISUAL PANEL */}
        <aside className={styles.visualPanel} aria-hidden="true">
          <div className={styles.visualOverlay} />
          <div className={styles.visualContent}>
            <div className={styles.visualTop}>
              <div className={styles.brand}>
                <span className={styles.brandMark}>S</span>
                <span>SENATE LIAISON OFFICE</span>
              </div>
              <span className={styles.secureBadge}>SECURE PLATFORM</span>
            </div>

            <div className={styles.visualBottom}>
              <h2 className={styles.visualHeading}>
                Connecting People.
                <br />
                Managing Information.
                <br />
                Building Better Systems.
              </h2>
              <p className={styles.visualDescription}>
                A secure digital platform designed for modern organizational
                operations and collaboration.
              </p>
              <div className={styles.visualLine} />
            </div>
          </div>
        </aside>

        {/* RIGHT FORM PANEL */}
        <main className={styles.formPanel}>
          <header className={styles.formHeader}>
            <h1 className={styles.formTitle}>Welcome Back</h1>
            <p className={styles.formSubtitle}>
              Sign in to access your account
            </p>
          </header>

          {serverError && (
            <div className={styles.errorAlert} role="alert">
              <AlertCircle size={16} />
              <span>{serverError}</span>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.inputGroup}>
              <label htmlFor="login-email" className={styles.inputLabel}>
                Email Address
              </label>
              <div className={styles.inputWrapper}>
                <Mail
                  size={17}
                  className={styles.inputIcon}
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                  placeholder="you@senate.go.ke"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  aria-invalid={!!errors.email}
                  disabled={isLoading}
                />
              </div>
              {errors.email && (
                <p className={styles.errorMessage} role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="login-password" className={styles.inputLabel}>
                Password
              </label>
              <div className={styles.inputWrapper}>
                <LockKeyhole
                  size={17}
                  className={styles.inputIcon}
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  aria-invalid={!!errors.password}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && (
                <p className={styles.errorMessage} role="alert">
                  {errors.password}
                </p>
              )}
            </div>

            <div className={styles.formOptions}>
              <label className={styles.rememberLabel}>
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => update("remember", e.target.checked)}
                  disabled={isLoading}
                />
                Remember me
              </label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={17} />
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className={styles.dividerRow}>
              <span className={styles.dividerText}>Or continue with</span>
            </div>

            <div className={styles.socialButtons}>
              <button
                type="button"
                className={styles.socialButton}
                disabled={isLoading}
              >
                Google
              </button>
              <button
                type="button"
                className={styles.socialButton}
                disabled={isLoading}
              >
                Microsoft
              </button>
            </div>
          </form>

          <p className={styles.authFooter}>
            Don&apos;t have an account?{" "}
            <Link href="/register">Create an account</Link>
          </p>
        </main>
      </div>
    </div>
  );
}

// "use client";

// import { useState, type FormEvent } from "react";
// import Link from "next/link";
// import {
//   Mail,
//   LockKeyhole,
//   Eye,
//   EyeOff,
//   LogIn,
//   ArrowRight,
// } from "lucide-react";
// import styles from "./styles.module.css";

// interface FormState {
//   email: string;
//   password: string;
//   remember: boolean;
// }

// type FormErrors = Partial<Record<"email" | "password", string>>;

// export default function LoginForm() {
//   const [form, setForm] = useState<FormState>({
//     email: "",
//     password: "",
//     remember: false,
//   });
//   const [errors, setErrors] = useState<FormErrors>({});
//   const [showPassword, setShowPassword] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);

//   const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
//     setForm((prev) => ({ ...prev, [key]: value }));
//     if (key === "email" || key === "password") {
//       setErrors((prev) => ({ ...prev, [key]: undefined }));
//     }
//   };

//   const validate = (): boolean => {
//     const next: FormErrors = {};
//     if (!form.email.trim()) next.email = "Email address is required";
//     else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
//       next.email = "Please enter a valid email address";
//     if (!form.password) next.password = "Password is required";
//     setErrors(next);
//     return Object.keys(next).length === 0;
//   };

//   const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     if (!validate() || isLoading) return;

//     setIsLoading(true);
//     try {
//       // TODO: Supabase signInWithPassword
//       await new Promise((r) => setTimeout(r, 1200));
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <div className={styles.authPage}>
//       <div className={styles.authCard}>
//         {/* LEFT VISUAL PANEL */}
//         <aside className={styles.visualPanel} aria-hidden="true">
//           <div className={styles.visualOverlay} />
//           <div className={styles.visualContent}>
//             <div className={styles.visualTop}>
//               <div className={styles.brand}>
//                 <span className={styles.brandMark}>Y</span>
//                 <span>SENATE LIASON OFFICE</span>
//               </div>
//               <span className={styles.secureBadge}>SECURE PLATFORM</span>
//             </div>

//             <div className={styles.visualBottom}>
//               <h2 className={styles.visualHeading}>
//                 Connecting People.
//                 <br />
//                 Managing Information.
//                 <br />
//                 Building Better Systems.
//               </h2>
//               <p className={styles.visualDescription}>
//                 A secure digital platform designed for modern organizational
//                 operations and collaboration.
//               </p>
//               <div className={styles.visualLine} />
//             </div>
//           </div>
//         </aside>

//         {/* RIGHT FORM PANEL */}
//         <main className={styles.formPanel}>
//           <header className={styles.formHeader}>
//             <h1 className={styles.formTitle}>Welcome Back</h1>
//             <p className={styles.formSubtitle}>
//               Sign in to access your account
//             </p>
//           </header>

//           <form className={styles.form} onSubmit={handleSubmit} noValidate>
//             <div className={styles.inputGroup}>
//               <label htmlFor="login-email" className={styles.inputLabel}>
//                 Email Address
//               </label>
//               <div className={styles.inputWrapper}>
//                 <Mail
//                   size={17}
//                   className={styles.inputIcon}
//                   aria-hidden="true"
//                 />
//                 <input
//                   id="login-email"
//                   type="email"
//                   autoComplete="email"
//                   className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
//                   placeholder="you@organization.com"
//                   value={form.email}
//                   onChange={(e) => update("email", e.target.value)}
//                   aria-invalid={!!errors.email}
//                 />
//               </div>
//               {errors.email && (
//                 <p className={styles.errorMessage} role="alert">
//                   {errors.email}
//                 </p>
//               )}
//             </div>

//             <div className={styles.inputGroup}>
//               <label htmlFor="login-password" className={styles.inputLabel}>
//                 Password
//               </label>
//               <div className={styles.inputWrapper}>
//                 <LockKeyhole
//                   size={17}
//                   className={styles.inputIcon}
//                   aria-hidden="true"
//                 />
//                 <input
//                   id="login-password"
//                   type={showPassword ? "text" : "password"}
//                   autoComplete="current-password"
//                   className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
//                   placeholder="Enter your password"
//                   value={form.password}
//                   onChange={(e) => update("password", e.target.value)}
//                   aria-invalid={!!errors.password}
//                 />
//                 <button
//                   type="button"
//                   className={styles.passwordToggle}
//                   onClick={() => setShowPassword((v) => !v)}
//                   aria-label={showPassword ? "Hide password" : "Show password"}
//                 >
//                   {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
//                 </button>
//               </div>
//               {errors.password && (
//                 <p className={styles.errorMessage} role="alert">
//                   {errors.password}
//                 </p>
//               )}
//             </div>

//             <div className={styles.formOptions}>
//               <label className={styles.rememberLabel}>
//                 <input
//                   type="checkbox"
//                   checked={form.remember}
//                   onChange={(e) => update("remember", e.target.checked)}
//                 />
//                 Remember me
//               </label>
//               <Link href="/forgot-password" className={styles.forgotLink}>
//                 Forgot password?
//               </Link>
//             </div>

//             <button
//               type="submit"
//               className={styles.primaryButton}
//               disabled={isLoading}
//               aria-busy={isLoading}
//             >
//               {isLoading ? (
//                 <>
//                   <span className={styles.spinner} aria-hidden="true" />
//                   Signing in...
//                 </>
//               ) : (
//                 <>
//                   <LogIn size={17} />
//                   Sign In
//                   <ArrowRight size={16} />
//                 </>
//               )}
//             </button>

//             <div className={styles.dividerRow}>
//               <span className={styles.dividerText}>Or continue with</span>
//             </div>

//             <div className={styles.socialButtons}>
//               <button type="button" className={styles.socialButton}>
//                 Google
//               </button>
//               <button type="button" className={styles.socialButton}>
//                 Microsoft
//               </button>
//             </div>
//           </form>

//           <p className={styles.authFooter}>
//             Don&apos;t have an account?{" "}
//             <Link href="/register">Create an account</Link>
//           </p>
//         </main>
//       </div>
//     </div>
//   );
// }
