"use client";

import React from "react";
import { Users, History, ShieldAlert, MessageCircle, ArrowRight } from "lucide-react";

export default function FeaturesSection() {
  const features = [
    {
      title: "Real-time Collaboration",
      description: "Work together in the exact same workspace. See colleague cursors move, character selections highlight, and paragraphs update instantly with zero latency.",
      gradient: "from-crimson-light/70 to-white border-crimson/10",
      icon: Users,
      iconBg: "bg-crimson",
      pillText: "Ultra Sync",
      pillBg: "bg-crimson-light text-crimson border-crimson/20",
      visual: (
        <div className="flex -space-x-2 overflow-hidden py-1">
          <div className="h-7 w-7 rounded-full bg-crimson border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm">SK</div>
          <div className="h-7 w-7 rounded-full bg-crimson-hover border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm">MK</div>
          <div className="h-7 w-7 rounded-full bg-crimson-light border-2 border-white flex items-center justify-center text-[8px] font-bold text-crimson shadow-sm">A</div>
          <div className="h-7 w-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-500 shadow-sm">+4</div>
        </div>
      )
    },
    {
      title: "Granular Version History",
      description: "Never lose an edit. Track every single keystroke. Review and compare versions side-by-side, check which team member added which line, and restore versions easily.",
      gradient: "from-crimson-light/60 to-white border-crimson/10",
      icon: History,
      iconBg: "bg-crimson-hover",
      pillText: "Auto-Backup",
      pillBg: "bg-crimson-light text-crimson border-crimson/20",
      visual: (
        <div className="bg-white border border-slate-100 rounded-lg p-2 shadow-xs space-y-1.5 w-full max-w-40">
          <div className="flex justify-between items-center text-[8px] font-bold text-slate-700">
            <span>v2.4 (Active)</span>
            <span className="text-[7px] text-crimson">Restore</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded" />
          <div className="h-1.5 w-4/5 bg-slate-100 rounded" />
        </div>
      )
    },
    {
      title: "Secure Domain Sharing",
      description: "Restricted sharing configuration. Control access via domain filters, generate temporary password-protected links, or disable sharing completely with one toggle.",
      gradient: "from-crimson-light/50 to-white border-crimson/10",
      icon: ShieldAlert,
      iconBg: "bg-crimson",
      pillText: "Enterprise Grade",
      pillBg: "bg-crimson-light text-crimson border-crimson/20",
      visual: (
        <div className="flex items-center gap-1 bg-white border border-slate-100 px-2.5 py-1.5 rounded-lg shadow-xs max-w-37.5">
          <div className="h-2 w-2 rounded-full bg-crimson animate-pulse" />
          <span className="text-[9px] font-bold text-slate-700">SSL Encrypted</span>
        </div>
      )
    },
    {
      title: "Comments & Mentions",
      description: "Create rich inline comment threads. Highlight any text paragraph, mention teammates using @tags to notify them, and resolve threads right inside the margins.",
      gradient: "from-crimson-light/50 to-white border-crimson/10",
      icon: MessageCircle,
      iconBg: "bg-crimson-hover",
      pillText: "Social Work",
      pillBg: "bg-crimson-light text-crimson border-crimson/20",
      visual: (
        <div className="bg-white border border-slate-100 p-2 rounded-lg shadow-xs max-w-37.5 space-y-1">
          <div className="flex gap-1.5 items-center">
            <span className="h-4.5 w-4.5 rounded-full bg-crimson text-[8px] text-white flex items-center justify-center font-bold">MK</span>
            <span className="text-[8px] font-bold text-slate-700">@sarah review it</span>
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="py-20 bg-slate-50/40 border-t border-slate-100 select-none">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        
        {/* Title Block */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl font-display">
            Built for modern collaboration teams
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            A seamless environment that provides all the performance speed of Notion combined with the formatting robustness of Google Docs.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-linear-to-br ${feature.gradient} p-8 shadow-xs hover:shadow-xl hover:scale-[1.01] transition-all duration-300`}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between mb-6">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${feature.iconBg} text-white shadow-md`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className={`text-[9px] font-extrabold px-3 py-1 rounded-full border ${feature.pillBg}`}>
                      {feature.pillText}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 font-display mb-3">
                    {feature.title}
                  </h3>
                  
                  <p className="text-slate-600 text-xs leading-relaxed mb-6 max-w-md">
                    {feature.description}
                  </p>
                </div>

                {/* Interactive Visual Overlay */}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-crimson group-hover:text-crimson-hover transition-colors">
                    <span>Learn how it works</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                    {feature.visual}
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
