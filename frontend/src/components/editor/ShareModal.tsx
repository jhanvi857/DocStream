"use client";

import React, { useState, useEffect } from "react";
import { X, Globe, Lock, Copy, Check, UserPlus, ShieldAlert } from "lucide-react";
import { shareDocument, shareDocumentPublic, Document } from "@/lib/api";

interface ShareModalProps {
  document: Document;
  onClose: () => void;
  onUpdateDocument: (updatedDoc: Document) => void;
}

export default function ShareModal({ document: doc, onClose, onUpdateDocument }: ShareModalProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [publicEnabled, setPublicEnabled] = useState(doc.public_sharing_enabled);
  const [publicRole, setPublicRole] = useState<"editor" | "viewer">(
    (doc.public_sharing_role as "editor" | "viewer") || "viewer"
  );
  
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/?doc=${doc.id}` : "";

  // Reset alerts after 3 seconds
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage("");
        setErrorMessage("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setLoadingInvite(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await shareDocument(doc.id, inviteEmail.trim(), inviteRole);
      setSuccessMessage(`Successfully shared document with ${inviteEmail.trim()}!`);
      setInviteEmail("");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to invite collaborator");
    } finally {
      setLoadingInvite(false);
    }
  };

  const handlePublicSharingChange = async (enabled: boolean, role: "editor" | "viewer") => {
    setLoadingPublic(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await shareDocumentPublic(doc.id, enabled, role);
      
      const updatedDoc: Document = {
        ...doc,
        public_sharing_enabled: enabled,
        public_sharing_role: role,
      };
      onUpdateDocument(updatedDoc);
      
      setPublicEnabled(enabled);
      setPublicRole(role);
      setSuccessMessage("General access settings updated successfully!");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update general access settings");
    } finally {
      setLoadingPublic(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl p-6 relative flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 font-display">Share &quot;{doc.title}&quot;</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage collaborator and public link access permissions.</p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-700">
            <Check className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Section 1: Invite Collaborators */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-700 font-display uppercase tracking-wider">Invite Collaborator</label>
          <form onSubmit={handleSendInvite} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 focus-within:ring-2 focus-within:ring-crimson/25 focus-within:border-crimson focus-within:bg-white transition-all">
              <UserPlus className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="email"
                placeholder="Enter collaborator email..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 outline-hidden placeholder:text-slate-400"
              />
            </div>
            
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-hidden focus:border-crimson cursor-pointer"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>

            <button
              type="submit"
              disabled={loadingInvite || !inviteEmail.trim()}
              className="rounded-xl bg-crimson hover:bg-crimson-hover disabled:bg-slate-200 text-white px-4 py-2 text-xs font-bold shadow-md shadow-crimson/10 transition-colors cursor-pointer"
            >
              {loadingInvite ? "Inviting..." : "Invite"}
            </button>
          </form>
        </div>

        {/* Section 2: General / Public Link Access */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-slate-700 font-display uppercase tracking-wider">General Access</label>
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center shadow-xs shrink-0 mt-0.5">
              {publicEnabled ? (
                <Globe className="h-4.5 w-4.5 text-crimson" />
              ) : (
                <Lock className="h-4.5 w-4.5 text-slate-400" />
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-800">
                {publicEnabled ? "Anyone with the link" : "Restricted access"}
              </span>
              <p className="text-[10px] text-slate-400 leading-normal max-w-xs">
                {publicEnabled 
                  ? `Anyone on the internet with this link can ${publicRole === "editor" ? "edit" : "view"} the document.` 
                  : "Only people explicitly invited can access this document."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <select
                value={publicEnabled ? publicRole : "restricted"}
                disabled={loadingPublic}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "restricted") {
                    handlePublicSharingChange(false, "viewer");
                  } else {
                    handlePublicSharingChange(true, val as "editor" | "viewer");
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-hidden focus:border-crimson cursor-pointer"
              >
                <option value="restricted">Restricted</option>
                <option value="viewer">Anyone (Viewer)</option>
                <option value="editor">Anyone (Editor)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer Link Copy */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
          <div className="flex-1 mr-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-400 truncate">
            {shareUrl}
          </div>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-colors shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-slate-500" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
