import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Sparkles } from "lucide-react";

type AuthMode = "login" | "signup";

interface AuthPageProps {
  mode: AuthMode;
}

const copy = {
  login: {
    title: "Sign in to your DocStream workspace",
    primaryCta: "Sign in",
    switchLabel: "Need an account?",
    switchCta: "Create one",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your DocStream account",
    primaryCta: "Create workspace",
    switchLabel: "Already have an account?",
    switchCta: "Sign in",
    switchHref: "/login",
  },
} satisfies Record<
  AuthMode,
  {
    title: string;
    primaryCta: string;
    switchLabel: string;
    switchCta: string;
    switchHref: string;
  }
>;

export default function AuthPage({ mode }: AuthPageProps) {
  const content = copy[mode];
  const isLogin = mode === "login";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8f3f1] text-slate-900">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(147,3,46,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.08),transparent_28%),linear-gradient(180deg,#fff8f6_0%,#f8f3f1_55%,#ffffff_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-size-[72px_72px] opacity-40" />

      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-8 lg:px-8">
        <section className="w-full max-w-md rounded-4xl border border-white/80 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8">
            <div className="mb-8">
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900">
                {content.title}
              </h2>
            </div>

            <form className="space-y-4">
              {!isLogin && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>First name</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-crimson focus-within:bg-white focus-within:ring-2 focus-within:ring-crimson/20">
                      <Sparkles className="h-4.5 w-4.5 text-slate-400" />
                      <input type="text" name="firstName" placeholder="Sarah" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Workspace name</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-crimson focus-within:bg-white focus-within:ring-2 focus-within:ring-crimson/20">
                      <Sparkles className="h-4.5 w-4.5 text-slate-400" />
                      <input type="text" name="workspace" placeholder="Northstar Studio" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                    </div>
                  </label>
                </div>
              )}

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Email address</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-crimson focus-within:bg-white focus-within:ring-2 focus-within:ring-crimson/20">
                  <Mail className="h-4.5 w-4.5 text-slate-400" />
                  <input type="email" name="email" placeholder="you@company.com" className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                </div>
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-crimson focus-within:bg-white focus-within:ring-2 focus-within:ring-crimson/20">
                  <LockKeyhole className="h-4.5 w-4.5 text-slate-400" />
                  <input type="password" name="password" placeholder={isLogin ? "Enter your password" : "Create a secure password"} className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
                </div>
              </label>

              <button
                type="submit"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl mt-4 bg-crimson px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-crimson/20 transition-all hover:bg-crimson-hover hover:shadow-crimson/30"
              >
                <span>{content.primaryCta}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {content.switchLabel} <Link href={content.switchHref} className="font-semibold text-crimson hover:text-crimson-hover">{content.switchCta}</Link>
            </p>
        </section>
      </div>
    </main>
  );
}