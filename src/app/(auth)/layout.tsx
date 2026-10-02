import type { ReactNode } from "react";

<<<<<<< HEAD
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
=======
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
>>>>>>> parent of 2b99ade (login page hydration issue fixed)
}

// import type { ReactNode } from "react";

// export default function RootLayout({ children }: { children: ReactNode }) {
//   return children;
// }
