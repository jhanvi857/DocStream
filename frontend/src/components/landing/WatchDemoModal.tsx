"use client";

import React, { useState } from "react";
import { X, ChevronRight, ChevronLeft, Shield, Eye, Settings, FileText, CheckCircle, RefreshCcw, History } from "lucide-react";

interface WatchDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction?: () => void;
  isAuthenticated?: boolean;
}

export default function WatchDemoModal({ isOpen, onClose, onAction, isAuthenticated = false }: WatchDemoModalProps) {
  const [activeStep, setActiveStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: "1. Real-Time Workspace Editing",
      description: "Write and format text while collaborators edit concurrently. Live indicators display active users on specific lines.",
      badge: "Workspace Sync",
      content: (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 font-sans">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-crimson animate-ping" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Live Document</span>
            </div>
            <div className="flex -space-x-1.5">
              <div className="h-5 w-5 rounded-full bg-crimson text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-slate-50 select-none">SK</div>
              <div className="h-5 w-5 rounded-full bg-crimson-hover text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-slate-50 select-none">MK</div>
              <div className="h-5 w-5 rounded-full bg-crimson-light text-[9px] font-bold text-crimson flex items-center justify-center ring-2 ring-slate-50 select-none">TL</div>
            </div>
          </div>
          <h4 className="text-sm font-bold text-slate-800 font-display">Product Specification & Launch Plan</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            The goal of this sprint is to integrate markdown tools seamlessly.
          </p>
          <div className="p-2 rounded bg-white border border-slate-200/70 text-[11px] text-slate-700 relative">
            <span>Collaborator <strong className="text-crimson font-semibold">Marcus K.</strong> updated this section to add API scopes.</span>
            <div className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-crimson-light text-crimson font-bold text-[8px] uppercase">typing</div>
          </div>
        </div>
      )
    },
    {
      title: "2. Premium Sharing & Access Controls",
      description: "Secure sharing with granularity. Toggle between restricted links, password keys, or team domain filters instantly.",
      badge: "Security & Sharing",
      content: (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-4 font-sans text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-crimson" />
              Document Access Settings
            </span>
            <span className="text-[10px] text-crimson font-medium bg-crimson-light px-2 py-0.5 rounded-full">Secure Link</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-700 font-medium">Anyone with link can read</span>
              </div>
              <input type="checkbox" defaultChecked className="accent-crimson h-3.5 w-3.5 cursor-pointer" />
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-700 font-medium">Restricted to domain family.com</span>
              </div>
              <input type="checkbox" defaultChecked className="accent-crimson h-3.5 w-3.5 cursor-pointer" />
            </div>
          </div>
          <div className="flex gap-2">
            <input 
              readOnly 
              value="https://docstream.io/sh/73a98x2n" 
              className="bg-white border border-slate-200 rounded px-2 py-1.5 text-[10px] text-slate-500 font-mono w-full select-all" 
            />
            <button className="bg-crimson text-white px-3 py-1.5 rounded hover:bg-crimson-hover font-semibold text-[10px] whitespace-nowrap">
              Copy Link
            </button>
          </div>
        </div>
      )
    },
    {
      title: "3. Auto-saved Version History",
      description: "Complete security network. Go back in time to compare variations, trace edits per collaborator, and restore text with one click.",
      badge: "Version Control",
      content: (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 font-sans text-xs">
          <div className="flex items-center gap-1.5 text-slate-800 font-bold border-b border-slate-200/60 pb-2 mb-2">
            <History className="h-3.5 w-3.5 text-crimson" />
            Version History Logs
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center p-2 rounded bg-white border-l-2 border-crimson shadow-sm">
              <div className="flex flex-col">
                <span className="font-bold text-slate-800">Version 3.2 (Current)</span>
                <span className="text-[9px] text-slate-400">Edited by Sarah K. • Today, 4:12 PM</span>
              </div>
              <span className="text-[9px] font-semibold text-slate-500">Active</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-white hover:bg-slate-50 transition-colors border-l-2 border-transparent">
              <div className="flex flex-col">
                <span className="font-semibold text-slate-700">Version 3.1</span>
                <span className="text-[9px] text-slate-400">Edited by Marcus K. • Yesterday, 1:04 PM</span>
              </div>
              <button className="text-[9px] font-bold text-crimson hover:underline flex items-center gap-0.5">
                <RefreshCcw className="h-2 w-2" /> Restore
              </button>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-crimson-light flex items-center justify-center text-crimson">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <span className="font-extrabold text-slate-900 font-display">DocStream Demo Tour</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-6">
          <div className="flex items-center gap-2">
            <span className="bg-crimson-light text-crimson font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {steps[activeStep].badge}
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 font-display">{steps[activeStep].title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{steps[activeStep].description}</p>
          </div>

          {/* Interactive Frame */}
          <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-inner flex justify-center items-center" style={{ minHeight: 220 }}>
            <div className="w-full max-w-md">
              {steps[activeStep].content}
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
          {/* Step indicators */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-2 rounded-full transition-all duration-300 ${i === activeStep ? "w-6 bg-crimson" : "w-2 bg-slate-300"}`} 
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              disabled={activeStep === 0}
              onClick={() => setActiveStep(p => p - 1)}
              className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {activeStep < steps.length - 1 ? (
              <button
                onClick={() => setActiveStep(p => p + 1)}
                className="inline-flex items-center justify-center gap-1 bg-crimson hover:bg-crimson-hover text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md shadow-crimson/10 cursor-pointer"
              >
                <span>Next Feature</span>
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
            ) : (
              <button
                onClick={onAction || onClose}
                className="inline-flex items-center justify-center gap-1 bg-crimson hover:bg-crimson-hover text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md shadow-crimson/10 cursor-pointer"
              >
                <CheckCircle className="h-4.5 w-4.5" />
                <span>{isAuthenticated ? "Go to Dashboard" : "Get Started Now"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
