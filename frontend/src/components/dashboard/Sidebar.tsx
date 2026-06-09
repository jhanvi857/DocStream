"use client";

import React from "react";
import { FileText, Users, Star, Trash2, Folder, Plus, ChevronRight, HelpCircle, HardDrive } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  favoritesCount: number;
  trashCount: number;
  sharedCount: number;
  myDocsCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  favoritesCount,
  trashCount,
  sharedCount,
  myDocsCount,
  isOpen,
  onClose
}: SidebarProps) {
  const menuItems = [
    { id: "mydocs", label: "My Docs", icon: FileText, count: myDocsCount },
    { id: "shared", label: "Shared", icon: Users, count: sharedCount },
    { id: "favorites", label: "Favorites", icon: Star, count: favoritesCount },
    { id: "trash", label: "Trash", icon: Trash2, count: trashCount },
  ];

  const workspaceFolders = [
    { name: "Product Specs", color: "text-crimson" },
    { name: "Marketing Briefs", color: "text-crimson-hover" },
    { name: "Sprint Planning", color: "text-crimson/80" },
    { name: "Brand Assets", color: "text-slate-500" },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-40 flex w-64 flex-col border-r border-slate-100 bg-slate-50/70 backdrop-blur-md px-4 py-6 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:static lg:flex"
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-2 px-2.5 pb-6 mb-4 border-b border-slate-200/50">
          <div className="h-8 w-8 rounded-xl bg-crimson flex items-center justify-center shadow-lg shadow-crimson/10">
            <svg 
              className="h-4.5 w-4.5 text-white" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="3"
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </div>
          <span className="font-extrabold text-lg text-slate-900 tracking-tight font-display">DocStream</span>
        </div>

        {/* Main Navigation Menu */}
        <div className="space-y-1">
          <p className="px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Workspace</p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose(); // Auto close on mobile
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 group cursor-pointer ${
                  isActive 
                    ? "bg-crimson text-white shadow-md shadow-crimson/10" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 transition-transform ${
                    isActive ? "text-white" : "text-slate-400 group-hover:scale-105"
                  }`} />
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-200/60 text-slate-500"
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Workspace Folders */}
        <div className="mt-8 flex-1">
          <div className="flex items-center justify-between px-2.5 mb-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Folders</p>
            <button className="text-slate-400 hover:text-crimson transition-colors p-0.5 rounded hover:bg-slate-100 cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {workspaceFolders.map((folder, idx) => (
              <button
                key={idx}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Folder className={`h-3.5 w-3.5 ${folder.color} opacity-80 group-hover:scale-105 transition-transform`} />
                  <span className="truncate">{folder.name}</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Panel (Space / Settings) */}
        <div className="border-t border-slate-200/50 pt-4 mt-auto">
          {/* Cloud Storage Usage */}
          <div className="px-2.5 mb-4">
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1.5">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-slate-400" /> Storage
              </span>
              <span>12.4 MB / 100 MB</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-crimson rounded-full" style={{ width: "12.4%" }} />
            </div>
          </div>
          
          <div className="flex items-center justify-between px-2.5 text-slate-400 text-xs font-medium">
            <a href="#" className="hover:text-crimson transition-colors flex items-center gap-1.5 py-1">
              <HelpCircle className="h-3.5 w-3.5" /> Help & Support
            </a>
            <span className="text-[10px] text-slate-300">v2.0.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}
