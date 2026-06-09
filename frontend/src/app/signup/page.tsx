import type { Metadata } from "next";
import AuthPage from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Create your DocStream workspace",
  description: "Start a new DocStream account and create a workspace.",
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}