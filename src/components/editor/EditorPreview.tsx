"use client";

import React, { useEffect, useRef, useState } from "react";
import { 
  ArrowLeft, Bold, Italic, Underline, List, Heading1, Heading2, 
  MessageSquare, Star, Lock, Globe, CheckCircle
} from "lucide-react";
import { DocumentItem } from "../dashboard/DocGrid";

interface Comment {
  id: string;
  author: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  rangeText?: string;
}

interface EditorPreviewProps {
  document: DocumentItem;
  onBack: () => void;
  onUpdateContent: (id: string, newContent: string) => void;
  onUpdateTitle: (id: string, newTitle: string) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onToggleShared: (id: string, e: React.MouseEvent) => void;
}

export default function EditorPreview({
  document: doc,
  onBack,
  onUpdateContent,
  onUpdateTitle,
  onToggleFavorite,
  onToggleShared
}: EditorPreviewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [comments, setComments] = useState<Comment[]>([
    {
      id: "c1",
      author: "Marcus K.",
      avatar: "MK",
      color: "bg-crimson",
      text: "Is this deadline aligned with the engineering sprint schedule?",
      time: "2h ago",
      rangeText: "sprint timeline targets"
    },
    {
      id: "c2",
      author: "Sarah K.",
      avatar: "SK",
      color: "bg-crimson",
      text: "I'll upload the CSS layout assets by tomorrow noon.",
      time: "10m ago",
      rangeText: "brand style guide"
    }
  ]);
  const [newCommentText, setNewCommentText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [activeOutlineSection, setActiveOutlineSection] = useState("intro");
  
  // Bot typing simulation states
  const [botTyping, setBotTyping] = useState(false);
  const [botText, setBotText] = useState("");
  const [botCursorOffset, setBotCursorOffset] = useState(0);

  useEffect(() => {
    setTitle(doc.title);
  }, [doc.title]);

  useEffect(() => {
    setSelectedText("");
    setSaveStatus("saved");

    if (editorRef.current) {
      editorRef.current.innerHTML = doc.content;
    }
  }, [doc.id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Handle manual typing in contenteditable
  const handleInput = () => {
    setSaveStatus("saving");
    if (editorRef.current) {
      onUpdateContent(doc.id, editorRef.current.innerHTML);
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus("saved");
    }, 800);
  };

  // Keep tracking selected text for comment attachment
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      setSelectedText(selection.toString().trim());
    } else {
      setSelectedText("");
    }
  };

  // Run formatting commands
  const applyFormat = (command: string, value: string = "") => {
    editorRef.current?.focus();
    window.document.execCommand(command, false, value);
    handleInput();
  };

  // Handle adding comments
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      author: "John Doe (You)",
      avatar: "JD",
      color: "bg-slate-700",
      text: newCommentText.trim(),
      time: "Just now",
      rangeText: selectedText || undefined
    };

    setComments([newComment, ...comments]);
    setNewCommentText("");
    setSelectedText("");
  };

  // Simulated Real-Time Collaboration Typing Effect
  useEffect(() => {
    // Start typing simulation after 3 seconds in editor
    const botTimeout = setTimeout(() => {
      setBotTyping(true);
      const phrases = [
        " In addition, we should standardise our core variables on Tailwind CSS config, specifically targeting deep rich crimson (#93032E) for primary actions.",
        " We also require a secondary review from marketing to ensure tone matches our premium product guidelines."
      ];
      // Pick random phrase
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      let charIdx = 0;

      const typeInterval = setInterval(() => {
        setBotText(prev => prev + phrase[charIdx]);
        setBotCursorOffset(charIdx * 6);
        charIdx++;

        // Trigger Editor save status
        setSaveStatus("saving");

        if (charIdx >= phrase.length) {
          clearInterval(typeInterval);
          setBotTyping(false);
          setSaveStatus("saved");
          
          // Append the typed text to the actual editorRef content
          if (editorRef.current) {
            const botParagraph = editorRef.current.querySelector("#bot-para");
            if (botParagraph) {
              botParagraph.innerHTML += phrase;
              onUpdateContent(doc.id, editorRef.current.innerHTML);
            }
          }

          // Add a comment from Sarah
          const botComment: Comment = {
            id: `bot-c-${Date.now()}`,
            author: "Sarah K.",
            avatar: "SK",
            color: "bg-crimson",
            text: "I've appended our design targets directly to the branding section. Let me know what you think!",
            time: "Just now",
            rangeText: "primary actions"
          };
          setComments(prev => [botComment, ...prev]);
        }
      }, 70); // Type character every 70ms

      return () => clearInterval(typeInterval);
    }, 4500);

    return () => clearTimeout(botTimeout);
  }, [doc.id]);

  const outlineSections = [
    { id: "intro", label: "1. Introduction" },
    { id: "objectives", label: "2. Core Objectives" },
    { id: "branding", label: "3. Brand Guidelines" },
    { id: "sprint", label: "4. Sprint Timeline" }
  ];

  return (
    <div className="flex flex-1 flex-col bg-slate-50 min-h-screen">
      
      {/* Editor Sub-Header / Tool Bar */}
      <div className="flex h-16 w-full items-center justify-between border-b border-slate-100 bg-white px-6">
        
        {/* Back and Title */}
        <div className="flex items-center gap-4 max-w-xl flex-1">
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          
          <div className="flex flex-col flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                onUpdateTitle(doc.id, e.target.value);
              }}
              className="text-sm font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-crimson focus:outline-hidden py-0.5 px-1 rounded transition-colors"
            />
            
            {/* Auto Save Sync Status */}
            <div className="flex items-center gap-1.5 px-1 mt-0.5 select-none">
              {saveStatus === "saving" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson animate-pulse" />
                  <span className="text-[10px] text-slate-400 font-medium">Syncing changes...</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson-light" />
                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                    Saved to Cloud <CheckCircle className="h-2.5 w-2.5 text-crimson" />
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons (Favorites, Share) */}
        <div className="flex items-center gap-2">
          {/* Favorites Star Toggle */}
          <button
            onClick={(e) => onToggleFavorite(doc.id, e)}
            className={`rounded-xl p-2.5 border border-slate-100 transition-colors cursor-pointer hover:bg-slate-50 ${
              doc.isFavorite ? "text-crimson bg-crimson-light/30 border-crimson/20" : "text-slate-400"
            }`}
          >
            <Star className={`h-4.5 w-4.5 ${doc.isFavorite ? "fill-current" : ""}`} />
          </button>

          {/* Share Button Toggle */}
          <button
            onClick={(e) => onToggleShared(doc.id, e)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold border transition-all cursor-pointer ${
              doc.isShared 
                ? "bg-crimson-light text-crimson border-crimson/20 hover:bg-crimson-light/80"
                : "bg-crimson hover:bg-crimson-hover text-white border-transparent shadow-md shadow-crimson/10 hover:scale-[1.02]"
            }`}
          >
            {doc.isShared ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span>{doc.isShared ? "Shared Link Active" : "Share Doc"}</span>
          </button>
        </div>
      </div>

      {/* Main 3-Panel Workspace */}
      <div className="flex flex-1 flex-row overflow-hidden h-[calc(100vh-4rem)]">
        
        {/* PANEL 1: Left Document Outline (Desktop only) */}
        <nav className="hidden md:flex w-52 flex-col border-r border-slate-100 bg-white p-4 space-y-4">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">Outline</p>
            <div className="space-y-1">
              {outlineSections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => setActiveOutlineSection(sec.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeOutlineSection === sec.id
                      ? "text-crimson bg-crimson-light/40 border-l-2 border-crimson pl-2"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-l-2 border-transparent"
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4 mt-auto">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Shortcuts</p>
            <div className="text-[10px] text-slate-500 space-y-1.5 font-medium">
              <div className="flex justify-between"><span>Bold:</span><kbd className="bg-slate-100 px-1 rounded">Ctrl+B</kbd></div>
              <div className="flex justify-between"><span>Italic:</span><kbd className="bg-slate-100 px-1 rounded">Ctrl+I</kbd></div>
              <div className="flex justify-between font-bold text-crimson"><span>Add Comment:</span><span>Select text</span></div>
            </div>
          </div>
        </nav>

        {/* PANEL 2: Center Editor Canvas */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8 flex flex-col items-center">
          {/* Format Control Bar floating above sheet */}
          <div className="flex items-center gap-1 bg-white border border-slate-150 rounded-xl px-2 py-1.5 shadow-md shadow-slate-100 mb-6 sticky top-0 z-10 w-full max-w-2xl select-none">
            <button 
              onClick={() => applyFormat("bold")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button 
              onClick={() => applyFormat("italic")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button 
              onClick={() => applyFormat("underline")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Underline"
            >
              <Underline className="h-4 w-4" />
            </button>
            
            <div className="h-4 w-px bg-slate-200 mx-1" />

            <button 
              onClick={() => applyFormat("formatBlock", "h2")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Heading 1"
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button 
              onClick={() => applyFormat("formatBlock", "h3")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button 
              onClick={() => applyFormat("insertUnorderedList")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Bulleted List"
            >
              <List className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {selectedText && (
              <div className="flex items-center gap-1.5 text-xs text-crimson font-bold bg-crimson-light px-2.5 py-1 rounded-lg animate-pulse-glow">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Attach Comment</span>
              </div>
            )}
          </div>

          {/* Actual Document Sheet */}
          <div 
            className="w-full max-w-2xl bg-white border border-slate-100 shadow-xl rounded-2xl px-12 py-16 flex-1 min-h-[70vh] flex flex-col relative"
          >
            {/* Editor Canvas Container */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              dir="ltr"
              onInput={handleInput}
              onMouseUp={handleMouseUp}
              onKeyUp={handleMouseUp}
              data-placeholder="Start typing your ideas here..."
              className="editor-canvas outline-hidden prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed flex-1"
            />

            {/* Simulated Live Collaborator Bot Cursor Overlay */}
            {botTyping && (
              <div 
                className="absolute bg-crimson/5 border-l-2 border-crimson rounded-r-md px-1.5 py-0.5 pointer-events-none transition-all duration-300"
                style={{
                  top: "220px", 
                  left: `${110 + botCursorOffset}px`
                }}
              >
                <span className="text-slate-800 font-medium text-xs select-none">
                  {botText}
                </span>
                <span className="inline-block h-3.5 w-[2.5px] bg-crimson animate-pulse align-middle ml-0.5" />
                <span className="absolute -top-4 left-0 bg-crimson text-white text-[8px] font-bold px-1 py-0.5 rounded shadow-sm">
                  Sarah K. (typing)
                </span>
              </div>
            )}

            {/* Document Bottom Footer */}
            <div className="border-t border-slate-100 pt-6 mt-8 flex justify-between items-center text-[11px] text-slate-400 select-none">
              <span>Collaborating with Sarah K. and Marcus V.</span>
              <span>Updated a few moments ago</span>
            </div>
          </div>
        </main>

        {/* PANEL 3: Right Collaborators & Comments */}
        <aside className="hidden lg:flex w-72 flex-col border-l border-slate-100 bg-white p-4 space-y-6 overflow-y-auto">
          
          {/* Active Collaborators list */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Editors</span>
              <span className="inline-flex h-2 w-2 rounded-full bg-crimson" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 py-0.5">
                <div className="h-6.5 w-6.5 rounded-full bg-crimson text-white font-extrabold text-[9px] flex items-center justify-center select-none ring-2 ring-crimson-light">
                  SK
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-800 leading-none">Sarah K.</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Active on line 12</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-1 py-0.5">
                <div className="h-6.5 w-6.5 rounded-full bg-crimson-hover text-white font-extrabold text-[9px] flex items-center justify-center select-none ring-2 ring-crimson-light">
                  MK
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-800 leading-none">Marcus K.</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Reviewing comments</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comments System */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Discussion</span>
              <span className="text-[9px] font-bold text-slate-400">{comments.length} Comments</span>
            </div>

            {/* Comment Insertion Box */}
            <form onSubmit={handleAddComment} className="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-2">
              {selectedText ? (
                <div className="bg-white border-l-2 border-crimson p-1.5 rounded text-[10px] text-slate-500 mb-1 max-h-12 overflow-hidden truncate">
                  Quote: "{selectedText}"
                </div>
              ) : (
                <div className="text-[9px] text-slate-400 italic mb-1">
                  Select text on the page to quote it in a comment.
                </div>
              )}
              <textarea
                placeholder="Type a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="w-full bg-white border border-slate-200/80 rounded-lg p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-crimson focus:border-crimson"
                rows={2}
              />
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-400">Ctrl+Enter to post</span>
                <button
                  type="submit"
                  className="bg-crimson hover:bg-crimson-hover text-white px-3 py-1 rounded-lg text-[10px] font-bold shadow-xs cursor-pointer"
                >
                  Comment
                </button>
              </div>
            </form>

            {/* Comment Threads */}
            <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
              {comments.map((c) => (
                <div 
                  key={c.id} 
                  className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`h-5 w-5 rounded-full ${c.color} text-white font-extrabold text-[8px] flex items-center justify-center select-none`}>
                      {c.avatar}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-800">{c.author}</span>
                      <span className="text-[8px] text-slate-400">{c.time}</span>
                    </div>
                  </div>
                  {c.rangeText && (
                    <div className="bg-white border-l border-slate-300 text-[9px] text-slate-500 px-1 py-0.5 rounded truncate mb-1">
                      "{c.rangeText}"
                    </div>
                  )}
                  <p className="text-[10.5px] text-slate-600 leading-normal">{c.text}</p>
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>

    </div>
  );
}
