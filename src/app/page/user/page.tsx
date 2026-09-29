"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Users as UsersIcon, Loader2, AlertCircle } from "lucide-react";

import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_approved: boolean | null;
  created_at?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Gate: only admins can access this page
  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        router.replace("../../../app/(auth)/login");
        return;
      }

      const { data: adminRow } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (!adminRow) {
        router.replace("../../page/dashboard");
        return;
      }

      setReady(true);
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  // Load users once we know the viewer is an admin
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("profilec")
        .select("*")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) setError(error.message);
      else setUsers(data || []);

      setLoading(false);
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [ready, supabase]);

  const toggleApproval = async (userId: string, currentStatus: boolean) => {
    setUpdatingId(userId);
    const nextApproved = !currentStatus;

    const { error } = await supabase
      .from("profilec")
      .update({ is_approved: nextApproved })
      .eq("id", userId);

    if (error) {
      setError(error.message);
      setUpdatingId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, is_approved: nextApproved } : u,
      ),
    );

    setUpdatingId(null);
  };

  const filteredUsers = users.filter((user) => {
    const q = search.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      user.position?.toLowerCase().includes(q)
    );
  });

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loadingWrapper}>
            <Loader2 className={styles.loadingSpinner} size={28} />
            <p>Verifying access...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* HEADER */}
        <motion.header
          className={styles.header}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className={styles.headerText}>
            <h1 className={styles.title}>Registered Users</h1>
            <p className={styles.subtitle}>
              {loading
                ? "Loading users..."
                : `${filteredUsers.length} user${
                    filteredUsers.length !== 1 ? "s" : ""
                  } found`}
            </p>
          </div>

          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by name, email, or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
        </motion.header>

        {error && (
          <div className={styles.errorAlert} role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className={styles.loadingWrapper}>
            <Loader2 className={styles.loadingSpinner} size={28} />
            <p>Loading users...</p>
          </div>
        )}

        {!loading && !error && filteredUsers.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <UsersIcon size={22} />
            </div>
            <strong>No users found</strong>
            <span>
              {search
                ? "Try adjusting your search."
                : "No registrations have been submitted yet."}
            </span>
          </div>
        )}

        {!loading && !error && filteredUsers.length > 0 && (
          <motion.div
            className={styles.tableCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colIndex}>#</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Position</th>
                    <th>Status</th>
                    <th className={styles.colAccess}>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, index) => (
                    <tr key={user.id}>
                      <td className={styles.cellIndex}>{index + 1}</td>
                      <td className={styles.cellName}>
                        {user.full_name || "—"}
                      </td>
                      <td className={styles.cellMuted}>{user.email || "—"}</td>
                      <td>{user.phone || "—"}</td>
                      <td>{user.position || "—"}</td>
                      <td>
                        {user.is_approved ? (
                          <span
                            className={`${styles.badge} ${styles.badgeApproved}`}
                          >
                            <span className={styles.badgeDot} />
                            Approved
                          </span>
                        ) : (
                          <span
                            className={`${styles.badge} ${styles.badgePending}`}
                          >
                            <span className={styles.badgeDot} />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className={styles.cellAccess}>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={!!user.is_approved}
                            disabled={updatingId === user.id}
                            onChange={() =>
                              toggleApproval(user.id, !!user.is_approved)
                            }
                            aria-label={
                              user.is_approved
                                ? `Revoke access for ${user.full_name}`
                                : `Grant access for ${user.full_name}`
                            }
                          />
                          <span className={styles.switchSlider}>
                            {updatingId === user.id && (
                              <Loader2
                                size={10}
                                className={styles.switchSpinner}
                              />
                            )}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <p className={styles.footer}>
          © 2026 Senate Liaison Office. All rights reserved.
        </p>
      </div>
    </main>
  );
}

// "use client";

// import { useEffect, useState } from "react";
// import { motion } from "framer-motion";
// import { Search, Users as UsersIcon, Loader2, AlertCircle } from "lucide-react";

// import { createClient } from "../../supabase/client";
// import styles from "./styles.module.css";

// interface Profile {
//   id: string;
//   full_name: string | null;
//   email: string | null;
//   phone: string | null;
//   position: string | null;
//   is_approved: boolean | null;
//   created_at?: string;
// }

// export default function UsersPage() {
//   const supabase = createClient();

//   const [users, setUsers] = useState<Profile[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const [search, setSearch] = useState("");
//   const [updatingId, setUpdatingId] = useState<string | null>(null);

//   useEffect(() => {
//     const fetchUsers = async () => {
//       setLoading(true);
//       setError("");

//       const { data, error } = await supabase
//         .from("profilec")
//         .select("*")
//         .order("created_at", { ascending: false });

//       if (error) setError(error.message);
//       else setUsers(data || []);

//       setLoading(false);
//     };

//     fetchUsers();
//   }, [supabase]);

//   const toggleApproval = async (userId: string, currentStatus: boolean) => {
//     setUpdatingId(userId);
//     const nextApproved = !currentStatus;

//     const { error } = await supabase
//       .from("profilec")
//       .update({ is_approved: nextApproved })
//       .eq("id", userId);

//     if (error) {
//       setError(error.message);
//       setUpdatingId(null);
//       return;
//     }

//     setUsers((prev) =>
//       prev.map((u) =>
//         u.id === userId ? { ...u, is_approved: nextApproved } : u,
//       ),
//     );

//     setUpdatingId(null);
//   };

//   const filteredUsers = users.filter((user) => {
//     const q = search.toLowerCase();
//     return (
//       user.full_name?.toLowerCase().includes(q) ||
//       user.email?.toLowerCase().includes(q) ||
//       user.position?.toLowerCase().includes(q)
//     );
//   });

//   return (
//     <main className={styles.page}>
//       <div className={styles.container}>
//         {/* HEADER */}
//         <motion.header
//           className={styles.header}
//           initial={{ opacity: 0, y: 15 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.4 }}
//         >
//           <div className={styles.headerText}>
//             <h1 className={styles.title}>Registered Users</h1>
//             <p className={styles.subtitle}>
//               {loading
//                 ? "Loading users..."
//                 : `${filteredUsers.length} user${
//                     filteredUsers.length !== 1 ? "s" : ""
//                   } found`}
//             </p>
//           </div>

//           <div className={styles.searchWrapper}>
//             <Search size={16} className={styles.searchIcon} />
//             <input
//               type="search"
//               className={styles.searchInput}
//               placeholder="Search by name, email, or position..."
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               aria-label="Search users"
//             />
//           </div>
//         </motion.header>

//         {/* ERROR */}
//         {error && (
//           <div className={styles.errorAlert} role="alert">
//             <AlertCircle size={18} />
//             <span>{error}</span>
//           </div>
//         )}

//         {/* LOADING */}
//         {loading && (
//           <div className={styles.loadingWrapper}>
//             <Loader2 className={styles.loadingSpinner} size={28} />
//             <p>Loading users...</p>
//           </div>
//         )}

//         {/* EMPTY */}
//         {!loading && !error && filteredUsers.length === 0 && (
//           <div className={styles.emptyState}>
//             <div className={styles.emptyIcon}>
//               <UsersIcon size={22} />
//             </div>
//             <strong>No users found</strong>
//             <span>
//               {search
//                 ? "Try adjusting your search."
//                 : "No registrations have been submitted yet."}
//             </span>
//           </div>
//         )}

//         {/* TABLE */}
//         {!loading && !error && filteredUsers.length > 0 && (
//           <motion.div
//             className={styles.tableCard}
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.4, delay: 0.1 }}
//           >
//             <div className={styles.tableScroll}>
//               <table className={styles.table}>
//                 <thead>
//                   <tr>
//                     <th className={styles.colIndex}>#</th>
//                     <th>Full Name</th>
//                     <th>Email</th>
//                     <th>Phone</th>
//                     <th>Position</th>
//                     <th>Status</th>
//                     <th className={styles.colAccess}>Access</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filteredUsers.map((user, index) => (
//                     <tr key={user.id}>
//                       <td className={styles.cellIndex}>{index + 1}</td>
//                       <td className={styles.cellName}>
//                         {user.full_name || "—"}
//                       </td>
//                       <td className={styles.cellMuted}>{user.email || "—"}</td>
//                       <td>{user.phone || "—"}</td>
//                       <td>{user.position || "—"}</td>
//                       <td>
//                         {user.is_approved ? (
//                           <span
//                             className={`${styles.badge} ${styles.badgeApproved}`}
//                           >
//                             <span className={styles.badgeDot} />
//                             Approved
//                           </span>
//                         ) : (
//                           <span
//                             className={`${styles.badge} ${styles.badgePending}`}
//                           >
//                             <span className={styles.badgeDot} />
//                             Pending
//                           </span>
//                         )}
//                       </td>
//                       <td className={styles.cellAccess}>
//                         <label className={styles.switch}>
//                           <input
//                             type="checkbox"
//                             checked={!!user.is_approved}
//                             disabled={updatingId === user.id}
//                             onChange={() =>
//                               toggleApproval(user.id, !!user.is_approved)
//                             }
//                             aria-label={
//                               user.is_approved
//                                 ? `Revoke access for ${user.full_name}`
//                                 : `Grant access for ${user.full_name}`
//                             }
//                           />
//                           <span className={styles.switchSlider}>
//                             {updatingId === user.id && (
//                               <Loader2
//                                 size={10}
//                                 className={styles.switchSpinner}
//                               />
//                             )}
//                           </span>
//                         </label>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           </motion.div>
//         )}

//         {/* FOOTER */}
//         <p className={styles.footer}>
//           © 2026 Senate Liaison Office. All rights reserved.
//         </p>
//       </div>
//     </main>
//   );
// }
