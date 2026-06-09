"use client";

import React, { useState } from "react";
import { FileText, MoreVertical, Star, Trash, Edit3, Share2, Eye, EyeOff, Globe } from "lucide-react";

export interface Collaborator {
  name: string;
  avatar: string;
  color: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  lastEdited: string;
  collaborators: Collaborator[];
  isShared: boolean;
  isFavorite: boolean;
  category: "mydocs" | "shared" | "favorites" | "trash";
  content: string;
}

interface DocGridProps {
  documents: DocumentItem[];
  onSelectDoc: (id: string) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onToggleShared: (id: string, e: React.MouseEvent) => void;
  onDeleteDoc: (id: string, e: React.MouseEvent) => void;
  onRenameDoc: (id: string, newTitle: string) => void;
}

export default function DocGrid({
  documents,
  onSelectDoc,
  onToggleFavorite,
  onToggleShared,
  onDeleteDoc,
  onRenameDoc
}: DocGridProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleRenameSubmit = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (renameValue.trim()) {
      onRenameDoc(id, renameValue.trim());
      setEditingId(null);
    }
  };

  const startRenaming = (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setRenameValue(doc.title);
    setActiveMenuId(null);
  };

  return (
    <div className="w-full select-none">
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">No documents found</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            Create a new document or change your search/navigation filter to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map((doc) => {
            const isMenuOpen = activeMenuId === doc.id;
            const isEditing = editingId === doc.id;

            return (
              <div
                key={doc.id}
                onClick={() => !isEditing && onSelectDoc(doc.id)}
                className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition-all duration-200 cursor-pointer ${
                  doc.category === "trash" 
                    ? "border-slate-100 hover:shadow-md opacity-75"
                    : "border-slate-100 hover:-translate-y-1 hover:shadow-lg hover:shadow-crimson/5 hover:border-crimson/20"
                }`}
              >
                
                {/* Top bar of Card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-crimson-light/60 text-crimson">
                    <FileText className="h-5 w-5" />
                  </div>

                  {/* Actions (Favorites & Options) */}
                  <div className="flex items-center gap-1">
                    {doc.category !== "trash" && (
                      <button
                        onClick={(e) => onToggleFavorite(doc.id, e)}
                        className={`rounded-lg p-1.5 transition-colors cursor-pointer hover:bg-slate-100 ${
                          doc.isFavorite ? "text-crimson" : "text-slate-300 hover:text-slate-400"
                        }`}
                      >
                        <Star className="h-4 w-4 fill-current stroke-current" />
                      </button>
                    )}

                    {/* Options Dropdown */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : doc.id);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <>
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                            }}
                            className="fixed inset-0 z-10"
                          />
                          <div className="absolute right-0 mt-1 w-36 origin-top-right rounded-xl border border-slate-100 bg-white p-1 shadow-2xl ring-1 ring-black/5 z-20">
                            {doc.category !== "trash" && (
                              <>
                                <button
                                  onClick={(e) => startRenaming(doc, e)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg cursor-pointer"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Rename</span>
                                </button>
                                <button
                                  onClick={(e) => onToggleShared(doc.id, e)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg cursor-pointer"
                                >
                                  {doc.isShared ? <EyeOff className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                                  <span>{doc.isShared ? "Make Private" : "Share"}</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => onDeleteDoc(doc.id, e)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-crimson hover:bg-crimson-light hover:text-crimson-hover rounded-lg cursor-pointer"
                            >
                              <Trash className="h-3.5 w-3.5" />
                              <span>{doc.category === "trash" ? "Delete Permanently" : "Move to Trash"}</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Title and Editing */}
                <div className="mb-4">
                  {isEditing ? (
                    <form 
                      onSubmit={(e) => handleRenameSubmit(doc.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-full border border-crimson/50 rounded px-2 py-1 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-crimson"
                        autoFocus
                      />
                      <button 
                        type="submit" 
                        className="bg-crimson text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-crimson-hover cursor-pointer"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <h3 className="text-sm font-bold text-slate-800 truncate leading-snug group-hover:text-crimson transition-colors">
                      {doc.title}
                    </h3>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">Edited {doc.lastEdited}</p>
                </div>

                {/* Footer block (Avatars & Badges) */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-2">
                  {/* Badges */}
                  <div className="flex items-center gap-1">
                    {doc.isShared ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-crimson-light px-2 py-0.5 text-[9px] font-bold text-crimson border border-crimson/20">
                        <Globe className="h-2.5 w-2.5" /> Shared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500 border border-slate-100">
                        Private
                      </span>
                    )}
                  </div>

                  {/* Overlapping Avatars */}
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {doc.collaborators.map((c, i) => (
                      <div
                        key={i}
                        className={`h-5.5 w-5.5 rounded-full ${c.color} text-[8px] font-extrabold text-white flex items-center justify-center ring-2 ring-white select-none`}
                        title={c.name}
                      >
                        {c.avatar}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
