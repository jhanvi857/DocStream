"use client";

import React, { useState } from "react";
import { Search, Bell, Plus, Menu, Globe, User, LogOut } from "lucide-react";
import { getEmail, logout } from "@/lib/api";

interface HeaderProps {
  onMenuToggle: () => void;
  onCreateDoc: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onGoHome: () => void;
}

export default function Header({
  onMenuToggle,
  onCreateDoc,
  searchQuery,
  setSearchQuery,
  onGoHome
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifications = [
    { id: 1, text: "System connection established", time: "Just now", read: false },
    { id: 2, text: "Welcome to DocStream workspace", time: "1h ago", read: true }
  ];

  const email = getEmail() || "you@company.com";
  const initials = email.substring(0, 2).toUpperCase();

  const handleSignOut = () => {
    logout();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-md px-6 select-none">
      
      {/* Left: Mobile hamburger menu & logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand Trigger to Go to Landing */}
        <button 
          onClick={onGoHome}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="h-7 w-7 rounded-lg bg-crimson flex items-center justify-center shadow-md shadow-crimson/10 group-hover:scale-105 transition-transform">
            <svg 
              className="h-3.5 w-3.5 text-white" 
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
          <span className="font-extrabold text-sm text-slate-800 font-display group-hover:text-crimson transition-colors lg:hidden block">DocStream</span>
        </button>
      </div>

      {/* Center: Search Documents */}
      <div className="mx-4 flex max-w-md flex-1 items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/60 px-3 py-1.5 focus-within:ring-2 focus-within:ring-crimson/25 focus-within:border-crimson focus-within:bg-white transition-all">
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs text-slate-800 outline-hidden placeholder:text-slate-400"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery("")}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Right: Notifications, Profile, Create button */}
      <div className="flex items-center gap-3">
        {/* "+ Create" Button */}
        <button
          onClick={onCreateDoc}
          className="inline-flex items-center gap-1.5 rounded-xl bg-crimson hover:bg-crimson-hover text-white px-4 py-2 text-xs font-bold shadow-md shadow-crimson/15 hover:scale-[1.02] transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>
        </button>

        {/* Notifications Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            className={`relative rounded-xl p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer ${
              showNotifications ? "bg-slate-100 text-slate-900" : ""
            }`}
          >
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-crimson ring-2 ring-white" />
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-slate-100 bg-white p-2 shadow-2xl ring-1 ring-black/5 animate-fade-in z-50">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-bold text-slate-800 font-display">Notifications</span>
                <button className="text-[10px] font-bold text-crimson hover:underline cursor-pointer">Mark all read</button>
              </div>
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div key={n.id} className="p-2.5 hover:bg-slate-50 transition-colors rounded-lg flex flex-col gap-0.5">
                    <p className={`text-[11px] leading-snug ${n.read ? "text-slate-500" : "text-slate-800 font-medium"}`}>
                      {n.text}
                    </p>
                    <span className="text-[9px] text-slate-400">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-1.5 rounded-full ring-2 ring-slate-100 hover:ring-crimson/30 transition-all p-0.5 cursor-pointer"
          >
            <div className="h-7 w-7 rounded-full bg-crimson text-white font-extrabold text-[10px] flex items-center justify-center select-none shadow-sm">
              {initials}
            </div>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-slate-100 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-fade-in z-50">
              <div className="px-3 py-2 border-b border-slate-100/80 mb-1">
                <p className="text-xs font-bold text-slate-800">Workspace User</p>
                <p className="text-[9px] text-slate-400 truncate">{email}</p>
              </div>
              <button 
                onClick={() => {
                  setShowProfileMenu(false);
                  onGoHome();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Go to Landing Page</span>
              </button>
              <a 
                href="#"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
              >
                <User className="h-3.5 w-3.5" />
                <span>My Profile</span>
              </a>
              <button 
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-crimson hover:bg-crimson-light hover:text-crimson-hover rounded-lg transition-colors border-t border-slate-100 mt-1 pt-2 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

      </div>

    </header>
  );
}
