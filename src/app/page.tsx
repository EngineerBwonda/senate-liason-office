import type { Metadata } from "next";
import RegisterPage from "./(auth)/register/page";

export const metadata: Metadata = {
  title: "Request Access | Senate Liaison Office",
  description: "Request secure access to the Senate Liaison Office workspace.",
};

export default function Home() {
  return <RegisterPage />;
}
