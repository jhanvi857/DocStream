"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Play, CheckCircle2, MessageSquare, Shield, History, Sparkles } from "lucide-react";

interface HeroSectionProps {
  onGetStarted: () => void;
  onWatchDemo: () => void;
}

export default function HeroSection({ onGetStarted, onWatchDemo }: HeroSectionProps) {
  const [typedText, setTypedText] = useState("");
  const [cursorPos, setCursorPos] = useState({ x: 45, y: 55 });
  const fullText = "Design sprint guidelines & brand roadmap...";

  // Typing effect simulation for the hero illustration
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, index));
      // Move cursor realistically as text is typed
      setCursorPos({
        x: Math.min(45 + index * 4.5, 310),
        y: 65
      });
      index++;
      if (index > fullText.length) {
        setTimeout(() => {
          index = 0;
        }, 2000); // Wait 2s before typing again
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-white py-20 lg:py-32 select-none">
      {/* Decorative background grid and gradient */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      <div className="absolute top-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-crimson-light/40 blur-3xl" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:items-center">
          
          {/* Left Column: CTA Hero Copy */}
          <div className="lg:col-span-6 flex flex-col justify-center text-left">
            {/* Tagline */}
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-crimson-light/80 px-4 py-1.5 text-xs font-semibold text-crimson mb-6 border border-crimson/10 shadow-sm animate-pulse-glow">
              <Sparkles className="h-3 w-3" />
              <span>Introducing DocStream 2.0</span>
            </div>
            
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl font-display leading-[1.1] mb-6">
              Write, collaborate, and share documents <span className="text-crimson underline decoration-crimson-light underline-offset-4 decoration-4">effortlessly.</span>
            </h1>
            
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
              Create documents, collaborate in real time with your team, and keep your ideas synced everywhere. Beautiful workspace minimalism meets high-performance file sharing.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={onGetStarted}
                className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-crimson px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-crimson/20 hover:bg-crimson-hover hover:scale-[1.02] transition-all duration-200 cursor-pointer"
              >
                <span>Get Started Free</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              
              <button
                onClick={onWatchDemo}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-crimson px-6 py-3.5 text-sm font-semibold text-crimson hover:bg-crimson-light/30 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Watch Demo</span>
              </button>
            </div>
            
            {/* Trust Metrics */}
            <div className="pt-6 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Trusted features include</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-crimson shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Real-time collaboration</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-crimson shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Secure sharing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-crimson shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Version history</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Floating document workspace illustration */}
          <div className="lg:col-span-6 relative flex justify-center items-center h-125">
            {/* Main Editor Card */}
            <div className="relative w-full max-w-115 bg-white rounded-2xl border border-slate-100 shadow-2xl p-6 overflow-hidden transition-all duration-500 hover:shadow-crimson/5">
              
              {/* Mock Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-crimson" />
                  <div className="h-3 w-3 rounded-full bg-crimson-hover" />
                  <div className="h-3 w-3 rounded-full bg-crimson-light" />
                </div>
                <div className="h-5 w-40 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 font-mono">docstream.io/p/brand-roadmap</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="h-5 w-5 rounded-full bg-crimson text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white select-none">M</div>
                  <div className="h-5 w-5 rounded-full bg-crimson text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white -ml-2 select-none">S</div>
                </div>
              </div>
              
              {/* Document Title */}
              <div className="space-y-1 mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-crimson tracking-wide uppercase">Workspace</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs text-slate-400">Draft</span>
                </div>
                <h2 className="text-xl font-bold text-slate-800 font-display">Brand Strategy & Roadmap</h2>
              </div>
              
              {/* Content Skeletal Lines & Typing Bot */}
              <div className="space-y-3 font-sans text-sm text-slate-600 mb-6">
                <p className="text-xs leading-relaxed text-slate-600 font-medium">
                  We are aligning the Q3 strategy around collaborative documentation. Here are the core targets:
                </p>
                
                {/* Live typing demo text */}
                <div className="relative p-2 rounded-lg bg-slate-50 border border-dashed border-slate-200/80 min-h-9 flex items-center">
                  <span className="text-slate-800 font-medium text-xs select-none">
                    {typedText}
                  </span>
                  <span 
                    className="absolute h-4 w-0.5 bg-crimson animate-cursor-blink transition-all duration-75"
                    style={{ left: `${cursorPos.x}px` }}
                  />
                  <span 
                    className="absolute bg-crimson text-white font-bold text-[8px] px-1 rounded shadow-sm transition-all duration-75 pointer-events-none whitespace-nowrap"
                    style={{ left: `${cursorPos.x}px`, top: `32px` }}
                  >
                    Sarah K.
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="h-2 w-full rounded bg-slate-100" />
                  <div className="h-2 w-5/6 rounded bg-slate-100" />
                  <div className="h-2 w-4/5 rounded bg-slate-100" />
                </div>
              </div>

              {/* Status bar */}
              <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-100 pt-3 mt-4">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson animate-pulse" />
                  Syncing in real-time...
                </span>
                <span>284 words</span>
              </div>
            </div>

            {/* FLOATING CARD 1: Comment Bubble (Left) */}
            <div className="absolute -left-4 top-24 bg-white p-3.5 rounded-xl border border-slate-100 shadow-xl flex gap-3 animate-float-slow max-w-55 select-none hover:shadow-2xl transition-all duration-300">
              <div className="h-8 w-8 rounded-full bg-crimson text-white font-bold flex items-center justify-center text-xs shrink-0 ring-2 ring-crimson-light mt-0.5">
                MK
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">Marcus K.</span>
                  <span className="text-[9px] text-slate-400">1m ago</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  "I love the clean direction! Let's highlight the primary accent color more here."
                </p>
                <div className="flex items-center gap-1 text-[9px] font-semibold text-crimson mt-0.5">
                  <MessageSquare className="h-2.5 w-2.5" />
                  <span>Reply</span>
                </div>
              </div>
            </div>

            {/* FLOATING CARD 2: Collaboration Badges (Right Top) */}
            <div className="absolute right-0 top-6 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl border border-slate-100 shadow-lg animate-float-medium flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="h-6 w-6 rounded-full bg-crimson-hover ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white select-none">
                  A
                </div>
                <div className="h-6 w-6 rounded-full bg-crimson-light ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-crimson select-none">
                  B
                </div>
                <div className="h-6 w-6 rounded-full bg-crimson ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white select-none">
                  SK
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">3 online now</span>
                <span className="text-[9px] text-slate-400">Editing workspace</span>
              </div>
            </div>

            {/* FLOATING CARD 3: Permissions card (Right Bottom) */}
            <div className="absolute -right-6 bottom-16 bg-white p-3.5 rounded-xl border border-slate-100 shadow-xl animate-float-fast max-w-50 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-crimson-light flex items-center justify-center text-crimson shrink-0">
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Security Check</span>
                <span className="text-[10px] text-slate-500">Link access: Restricted to Domain</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
