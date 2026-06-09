"use client";

import React, { useEffect, useRef, useState } from "react";
import { 
  ArrowLeft, Bold, Italic, Underline, List, Heading1, Heading2, 
  MessageSquare, Star, Lock, Globe, CheckCircle, Clock, Users, ShieldAlert
} from "lucide-react";
import { DocumentItem } from "../dashboard/DocGrid";
import { WS_BASE_URL, getAccessToken, getUserID, getEmail, getDocumentHistory, HistoryOp } from "@/lib/api";
import { CRDTDoc, diffAndGenerateOps, Op, CRDTChar } from "@/lib/crdt";

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
  const wsRef = useRef<WebSocket | null>(null);
  
  // CRDT Refs
  const crdtRef = useRef<CRDTDoc>(new CRDTDoc(doc.id));
  const clockRef = useRef(0);
  const userIDRef = useRef("");

  // UI States
  const [title, setTitle] = useState(doc.title);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [activeTab, setActiveTab] = useState<"outline" | "history">("outline");
  
  // Real-Time States
  const [collaborators, setCollaborators] = useState<Array<{ userID: string; userName: string; color: string }>>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { name: string; color: string; position: number }>>({});
  const [cursorCoords, setCursorCoords] = useState<Record<string, { top: number; left: number; name: string; color: string }>>({});
  const [historyOps, setHistoryOps] = useState<HistoryOp[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  // Outline Generation State
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: string }>>([]);

  // Caret Offset calculation functions to prevent caret jump on content update
  const getCaretPosition = (element: HTMLElement): number => {
    let position = 0;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      position = preCaretRange.toString().length;
    }
    return position;
  };

  const setCaretPosition = (element: HTMLElement, offset: number) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);

    const nodeStack: Node[] = [element];
    let currentOffset = 0;
    let found = false;

    while (nodeStack.length > 0) {
      const node = nodeStack.pop()!;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextOffset = currentOffset + node.textContent!.length;
        if (offset >= currentOffset && offset <= nextOffset) {
          range.setStart(node, offset - currentOffset);
          range.setEnd(node, offset - currentOffset);
          found = true;
          break;
        }
        currentOffset = nextOffset;
      } else {
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }

    if (found) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  // Get pixel coordinate of caret index relative to the editor container
  const getCaretCoordinates = (element: HTMLElement, offset: number): { top: number; left: number } | null => {
    const selection = window.getSelection();
    if (!selection) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);

    const nodeStack: Node[] = [element];
    let currentOffset = 0;
    let found = false;

    while (nodeStack.length > 0) {
      const node = nodeStack.pop()!;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextOffset = currentOffset + node.textContent!.length;
        if (offset >= currentOffset && offset <= nextOffset) {
          range.setStart(node, offset - currentOffset);
          range.setEnd(node, offset - currentOffset);
          found = true;
          break;
        }
        currentOffset = nextOffset;
      } else {
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }

    if (found) {
      const rects = range.getClientRects();
      if (rects && rects.length > 0) {
        const parentRect = element.getBoundingClientRect();
        return {
          top: rects[0].top - parentRect.top,
          left: rects[0].left - parentRect.left,
        };
      }
    }
    return null;
  };

  // Update table of contents based on heading tags present inside the editor
  const updateOutline = () => {
    if (!editorRef.current) return;
    const headingElements = editorRef.current.querySelectorAll("h2, h3");
    const outlineItems: Array<{ id: string; text: string; level: string }> = [];
    headingElements.forEach((el, index) => {
      // Ensure element has an ID for anchoring
      if (!el.id) {
        el.id = `heading-${index}`;
      }
      outlineItems.push({
        id: el.id,
        text: el.textContent || "",
        level: el.tagName.toLowerCase()
      });
    });
    setHeadings(outlineItems);
  };

  // Connect to the WebSocket room on mount
  useEffect(() => {
    const token = getAccessToken();
    const currentUserID = getUserID();
    userIDRef.current = currentUserID || "";

    if (!token || !doc.id) return;

    // Load persistent comments from localStorage
    const savedComments = localStorage.getItem(`docstream_comments_${doc.id}`);
    if (savedComments) {
      setComments(JSON.parse(savedComments));
    } else {
      setComments([]);
    }

    // Connect WebSocket
    const wsUrl = `${WS_BASE_URL}/ws/document/${doc.id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Initiate Sync handshake
      ws.send(JSON.stringify({
        type: "sync",
        doc_id: doc.id,
        payload: { lastSeenClock: 0 }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.doc_id !== doc.id) return;

        switch (msg.type) {
          case "sync": {
            // Full document loading
            const chars: CRDTChar[] = msg.payload || [];
            crdtRef.current = new CRDTDoc(doc.id, chars);
            clockRef.current = chars.length;

            const content = crdtRef.current.toText();
            if (editorRef.current) {
              editorRef.current.innerHTML = content || "<h2>Untitled Document</h2><p>Click here to start editing your new page...</p>";
              updateOutline();
            }
            break;
          }

          case "sync_complete": {
            // Handshake completed, server clock set
            setSaveStatus("saved");
            break;
          }

          case "op": {
            // Apply incremental operational change from sibling connection
            const op: Op = msg.payload;
            if (op.user_id === userIDRef.current) return; // Skip own operations (optimistic ui applied it)

            crdtRef.current.apply(op);
            const content = crdtRef.current.toText();

            if (editorRef.current) {
              // Capture caret position if editor currently has focus
              const hasFocus = document.activeElement === editorRef.current;
              let caretPos = 0;
              if (hasFocus) {
                caretPos = getCaretPosition(editorRef.current);
              }

              editorRef.current.innerHTML = content || "<p></p>";

              if (hasFocus) {
                // Adjust caret position if an insert occurred before it
                let adjustedCaret = caretPos;
                if (op.op_type === "insert") {
                  // If inserted character position is before our caret, increment caret offset
                  // To keep simple, we can re-set position. If it was a simple insert/delete, setCaret restores it nicely.
                }
                setCaretPosition(editorRef.current, adjustedCaret);
              }
              updateOutline();
            }
            break;
          }

          case "presence": {
            const presence = msg.payload;
            if (presence.user_id === userIDRef.current) return;

            setCollaborators(prev => {
              if (presence.action === "join") {
                if (prev.some(c => c.userID === presence.user_id)) return prev;
                return [...prev, { userID: presence.user_id, userName: presence.user_name, color: presence.color }];
              } else {
                return prev.filter(c => c.userID !== presence.user_id);
              }
            });

            // Clean up cursor mapping on leave
            if (presence.action === "leave") {
              setRemoteCursors(prev => {
                const next = { ...prev };
                delete next[presence.user_id];
                return next;
              });
            }
            break;
          }

          case "cursor": {
            const cursor = msg.payload;
            if (cursor.user_id === userIDRef.current) return;

            setRemoteCursors(prev => ({
              ...prev,
              [cursor.user_id]: {
                name: cursor.user_name,
                color: cursor.color,
                position: cursor.position
              }
            }));
            break;
          }

          case "error": {
            console.error("WS Application error:", msg.payload);
            setSaveStatus("saved");
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error("Failed to parse websocket message:", err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = (err) => {
      console.error("WebSocket connection error:", err);
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [doc.id]);

  // Handle caret coordinates repositioning whenever cursors update
  useEffect(() => {
    if (!editorRef.current) return;
    const coords: Record<string, any> = {};
    for (const [uid, info] of Object.entries(remoteCursors)) {
      const coord = getCaretCoordinates(editorRef.current, info.position);
      if (coord) {
        coords[uid] = {
          top: coord.top,
          left: coord.left,
          name: info.name,
          color: info.color
        };
      }
    }
    setCursorCoords(coords);
  }, [remoteCursors, doc.content]);

  // Load document operation audit log from REST API
  const fetchHistoryLog = async () => {
    try {
      const ops = await getDocumentHistory(doc.id, 0, 25);
      setHistoryOps(ops);
    } catch (err) {
      console.error("Failed to load history operations:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistoryLog();
    }
  }, [activeTab]);

  useEffect(() => {
    setTitle(doc.title);
  }, [doc.title]);

  useEffect(() => {
    setSaveStatus("saved");
    setSelectedText("");
  }, [doc.id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Handle local text editing
  const handleInput = () => {
    if (!editorRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setSaveStatus("saving");

    const newHtml = editorRef.current.innerHTML;
    const oldHtml = crdtRef.current.toText();

    if (newHtml === oldHtml) {
      setSaveStatus("saved");
      return;
    }

    // Generate local operations via character diffing
    const ops = diffAndGenerateOps(
      crdtRef.current,
      oldHtml,
      newHtml,
      userIDRef.current,
      () => {
        clockRef.current++;
        return clockRef.current;
      }
    );

    // Apply locally and transmit each op
    ops.forEach(op => {
      crdtRef.current.apply(op);
      wsRef.current?.send(JSON.stringify({
        type: "op",
        doc_id: doc.id,
        payload: op
      }));
    });

    // Notify parent component about state updates
    onUpdateContent(doc.id, newHtml);
    updateOutline();

    // Trigger saved status timer
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus("saved");
    }, 600);

    // Broadcast our updated cursor index
    handleCaretUpdate();
  };

  // Broadcast local cursor offset
  const handleCaretUpdate = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!editorRef.current) return;
    
    // Guard: prevent cursor updates if focus is in comment box or elsewhere
    if (document.activeElement !== editorRef.current) return;

    const caretPos = getCaretPosition(editorRef.current);
    wsRef.current.send(JSON.stringify({
      type: "cursor",
      doc_id: doc.id,
      payload: { position: caretPos }
    }));
  };

  // Tracking text highlighting for comment threads
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      setSelectedText(selection.toString().trim());
    } else {
      setSelectedText("");
    }
    handleCaretUpdate();
  };

  // Apply rich-text formatting
  const applyFormat = (command: string, value: string = "") => {
    editorRef.current?.focus();
    window.document.execCommand(command, false, value);
    handleInput();
  };

  // Handle comments
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const email = getEmail() || "you@company.com";
    const newComment: Comment = {
      id: Date.now().toString(),
      author: email.split("@")[0],
      avatar: email.substring(0, 2).toUpperCase(),
      color: "bg-slate-700",
      text: newCommentText.trim(),
      time: "Just now",
      rangeText: selectedText || undefined
    };

    const updated = [newComment, ...comments];
    setComments(updated);
    localStorage.setItem(`docstream_comments_${doc.id}`, JSON.stringify(updated));

    setNewCommentText("");
    setSelectedText("");
  };

  // Smooth scroll helper for Table of Contents anchors
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

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
              {!wsConnected ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-0.5">
                    Connecting to server... <ShieldAlert className="h-2.5 w-2.5" />
                  </span>
                </>
              ) : saveStatus === "saving" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-crimson animate-pulse" />
                  <span className="text-[10px] text-slate-400 font-medium">Syncing changes...</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
        
        {/* PANEL 1: Left Document Outline / History Panel (Desktop only) */}
        <nav className="hidden md:flex w-56 flex-col border-r border-slate-100 bg-white p-4 space-y-4">
          <div className="flex border-b border-slate-150 pb-1.5">
            <button
              onClick={() => setActiveTab("outline")}
              className={`flex-1 text-center py-1 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "outline" ? "text-crimson border-b-2 border-crimson" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              Outline
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 text-center py-1 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "history" ? "text-crimson border-b-2 border-crimson" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              History
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === "outline" ? (
              <div className="space-y-1">
                {headings.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic p-2">
                    Use headings (H1, H2) to generate a document outline.
                  </p>
                ) : (
                  headings.map((h, idx) => (
                    <button
                      key={idx}
                      onClick={() => scrollToHeading(h.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer hover:bg-slate-50 truncate ${
                        h.level === "h2" ? "text-slate-700 pl-2" : "text-slate-500 pl-5 text-[11px]"
                      }`}
                    >
                      {h.text}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Activity Log</span>
                  <button onClick={fetchHistoryLog} className="text-[9px] font-bold text-crimson hover:underline cursor-pointer">Reload</button>
                </div>
                {historyOps.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic p-2">No editing logs found.</p>
                ) : (
                  <div className="space-y-2">
                    {historyOps.slice(0, 15).map((op, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-600">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-700 truncate max-w-[90px]">{op.userName.split("@")[0]}</span>
                          <span className="text-[8px] text-slate-400">{new Date(op.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                        <p className="leading-snug">
                          {op.opType === "insert" ? (
                            <>
                              Inserted <span className="font-mono bg-white px-1 rounded border">{op.char === " " ? "Space" : op.char}</span>
                            </>
                          ) : (
                            "Deleted character"
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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

            {/* Real-time Collaborative Cursors Overlay */}
            {Object.entries(cursorCoords).map(([uid, c]) => (
              <div 
                key={uid}
                className="absolute pointer-events-none transition-all duration-100 z-10"
                style={{
                  top: `${c.top + 64}px`, // Offset top padding of parent
                  left: `${c.left + 48}px`, // Offset left padding of parent
                }}
              >
                {/* Caret Vertical Line */}
                <div 
                  className="w-[2px] h-[18px] animate-pulse" 
                  style={{ backgroundColor: c.color }}
                />
                {/* Floating Name Label */}
                <div 
                  className="absolute -top-4 left-0 text-[8px] font-bold px-1 py-0.5 rounded text-white whitespace-nowrap shadow-xs select-none"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name.split("@")[0]}
                </div>
              </div>
            ))}

            {/* Document Bottom Footer */}
            <div className="border-t border-slate-100 pt-6 mt-8 flex justify-between items-center text-[11px] text-slate-400 select-none">
              <span>
                {collaborators.length > 0 
                  ? `Editing with: ${collaborators.map(c => c.userName.split("@")[0]).join(", ")}` 
                  : "Private session (no other editors connected)"}
              </span>
              <span>Cloud Sync Active</span>
            </div>
          </div>
        </main>

        {/* PANEL 3: Right Collaborators & Comments */}
        <aside className="hidden lg:flex w-72 flex-col border-l border-slate-100 bg-white p-4 space-y-6 overflow-y-auto">
          
          {/* Active Collaborators list */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Users className="h-3 w-3" /> Active Editors
              </span>
              <span className={`inline-flex h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
            </div>
            <div className="space-y-2">
              {collaborators.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic p-1">No other active editors</p>
              ) : (
                collaborators.map((c) => {
                  const initials = c.userName.substring(0, 2).toUpperCase();
                  return (
                    <div key={c.userID} className="flex items-center gap-2 px-1 py-0.5">
                      <div 
                        className="h-6.5 w-6.5 rounded-full text-white font-extrabold text-[9px] flex items-center justify-center select-none"
                        style={{ backgroundColor: c.color }}
                      >
                        {initials}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-800 leading-none truncate max-w-[150px]">{c.userName.split("@")[0]}</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Active now</span>
                      </div>
                    </div>
                  );
                })
              )}
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
