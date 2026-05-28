import type { Metadata } from "next";
import AuthPage from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Log in to DocStream",
  description: "Sign in to access your DocStream workspace.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}