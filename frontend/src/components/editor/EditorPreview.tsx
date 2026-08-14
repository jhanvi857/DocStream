/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, @typescript-eslint/no-unused-vars */
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowLeft, Bold, Italic, Underline, List, Heading1, Heading2,
  MessageSquare, Star, Lock, Globe, CheckCircle, Users, ShieldAlert, Trash2
} from "lucide-react";
import { DocumentItem } from "../dashboard/DocGrid";
import { WS_BASE_URL, getAccessToken, getUserID, getEmail, getDocumentHistory, getDocument, getWordSuggestions, Document, HistoryOp } from "@/lib/api";
import { CRDTDoc, diffAndGenerateOps, Op, CRDTChar } from "@/lib/crdt";
import ShareModal from "./ShareModal";

interface Comment {
  id: string;
  author: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  createdAt?: string;
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
  const [fullDoc, setFullDoc] = useState<Document | null>(null);
  const [userRole, setUserRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (!doc.id) return;
    const fetchDocDetails = async () => {
      try {
        const details = await getDocument(doc.id);
        setFullDoc(details);
        if (details.user_role) {
          setUserRole(details.user_role as "owner" | "editor" | "viewer");
        } else {
          const currentUserID = getUserID();
          if (currentUserID && details.owner_id === currentUserID) {
            setUserRole("owner");
          } else {
            setUserRole("viewer");
          }
        }
      } catch (err) {
        console.error("Failed to load document details", err);
      }
    };
    fetchDocDetails();
  }, [doc.id]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [activeTab, setActiveTab] = useState<"outline" | "history">("outline");

  // Real-Time States
  const [collaborators, setCollaborators] = useState<Array<{ userID: string; userName: string; color: string; position?: number | null }>>([]);
  const remoteCursors = useMemo(() => {
    const cursors: Record<string, { name: string; color: string; position: number }> = {};
    collaborators.forEach(c => {
      if (c.position !== undefined && c.position !== null) {
        cursors[c.userID] = {
          name: c.userName,
          color: c.color,
          position: c.position
        };
      }
    });
    return cursors;
  }, [collaborators]);
  const [cursorCoords, setCursorCoords] = useState<Record<string, { top: number; left: number; name: string; color: string }>>({});
  const [historyOps, setHistoryOps] = useState<HistoryOp[]>([]);
  const groupedHistoryOps = useMemo(() => {
    if (!historyOps || historyOps.length === 0) return [];

    // Sort ops chronologically (oldest first) to build activity forward
    const sortedOps = [...historyOps].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      const validA = isNaN(timeA) ? 0 : timeA;
      const validB = isNaN(timeB) ? 0 : timeB;
      return validA - validB;
    });

    const grouped: Array<{
      userName: string;
      opType: "insert" | "delete";
      text: string;
      count: number;
      time: string;
      timestamp: number;
      isNewline?: boolean;
    }> = [];

    for (const op of sortedOps) {
      if (op.opType === "insert" && !op.char) continue;

      const date = new Date(op.createdAt);
      const timestamp = isNaN(date.getTime()) ? Date.now() : date.getTime();
      const opTime = isNaN(date.getTime())
        ? "Recently"
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      let displayChar = op.char ? op.char.replace(/&nbsp;/gi, " ").replace(/amp;/gi, "") : "";
      if (displayChar === "\u00A0") displayChar = " ";

      const isNewlineOp = op.char === "\n" || op.char === "\r\n";
      const opTypeNorm = op.opType === "delete" ? "delete" : "insert";
      const rawUser = op.userName || op.userID || "Collaborator";
      const userNameNorm = rawUser.includes("@") ? rawUser.split("@")[0] : rawUser;

      const last = grouped[grouped.length - 1];

      // Session match: same user within 2 minutes (120,000ms) of active editing
      const isSameSession =
        last &&
        last.userName === userNameNorm &&
        Math.abs(timestamp - last.timestamp) < 120000;

      if (isSameSession) {
        last.timestamp = timestamp;
        last.time = opTime;

        if (opTypeNorm === "delete") {
          // Absorb typo backspaces into active insertion string if available
          if (last.opType === "insert" && last.text.length > 0) {
            last.text = last.text.slice(0, -1);
            if (last.count > 1) last.count--;
          } else if (last.opType === "delete") {
            last.count++;
          } else {
            grouped.push({
              userName: userNameNorm,
              opType: "delete",
              text: "",
              count: 1,
              time: opTime,
              timestamp,
            });
          }
        } else if (isNewlineOp) {
          if (last.opType === "insert") {
            last.text += "\n";
            last.count++;
          } else {
            grouped.push({
              userName: userNameNorm,
              opType: "insert",
              text: "\n",
              count: 1,
              time: opTime,
              timestamp,
            });
          }
        } else {
          // Character insertion in active session - append full text without breaking multiline entries
          if (last.opType === "insert") {
            last.text += displayChar;
            last.count++;
          } else {
            grouped.push({
              userName: userNameNorm,
              opType: "insert",
              text: displayChar,
              count: 1,
              time: opTime,
              timestamp,
            });
          }
        }
      } else {
        // New editing session
        if (opTypeNorm === "delete") {
          grouped.push({
            userName: userNameNorm,
            opType: "delete",
            text: "",
            count: 1,
            time: opTime,
            timestamp,
          });
        } else {
          grouped.push({
            userName: userNameNorm,
            opType: "insert",
            text: isNewlineOp ? "Newline (↵)" : displayChar,
            count: 1,
            time: opTime,
            timestamp,
            isNewline: isNewlineOp,
          });
        }
      }
    }

    // Filter out HTML tags and fragments, and prune empty insert entries after backspace absorption
    const finalGrouped: typeof grouped = [];
    for (const entry of grouped) {
      if (entry.opType === "insert" && !entry.isNewline) {
        const cleanedText = cleanHistoryText(entry.text);
        if (!cleanedText || cleanedText.trim().length === 0) continue;
        entry.text = cleanedText;
      }
      finalGrouped.push(entry);
    }

    // Reverse array so newest activity sessions appear at the top of the history feed
    return finalGrouped.reverse();
  }, [historyOps]);

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
      const parentRect = element.getBoundingClientRect();
      if (rects && rects.length > 0) {
        return {
          top: rects[0].top - parentRect.top,
          left: rects[0].left - parentRect.left,
        };
      }

      // Fallback for collapsed ranges at the end of text nodes
      const rect = range.getBoundingClientRect();
      if (rect && rect.top > 0) {
        return {
          top: rect.top - parentRect.top,
          left: rect.left - parentRect.left,
        };
      }
    }
    return null;
  };

  // Update table of contents based on heading tags present inside the editor
  const updateOutline = () => {
    if (!editorRef.current) return;
    const headingElements = editorRef.current.querySelectorAll("h1, h2, h3");
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

    if (!doc.id) return;

    // Load persistent comments from localStorage
    const savedComments = localStorage.getItem(`docstream_comments_${doc.id}`);
    if (savedComments) {
      setComments(JSON.parse(savedComments));
    } else {
      setComments([]);
    }

    // Connect WebSocket
    const wsUrl = `${WS_BASE_URL}/ws/document/${doc.id}${token ? "?token=" + token : ""}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setWsConnected(true);
      if (token) {
        ws.send(JSON.stringify({
          type: "auth",
          doc_id: doc.id,
          payload: { token }
        }));
      }
      // Initiate Sync handshake
      ws.send(JSON.stringify({
        type: "sync",
        doc_id: doc.id,
        payload: { lastSeenClock: 0 }
      }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
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
              editorRef.current.innerHTML = formatCRDTToHTML(content) || "<h2>Untitled Document</h2><p>Click here to start editing your new page...</p>";
              updateOutline();
            }
            break;
          }

          case "sync_complete": {
            // Handshake completed, server clock set
            setSaveStatus("saved");
            const payload = msg.payload || {};
            if (payload.user_id) {
              userIDRef.current = payload.user_id;
            }
            break;
          }

          case "op": {
            // Apply incremental operational change from sibling connection
            const op: Op = msg.payload;
            if (op.user_id === userIDRef.current) return; // Skip own operations (optimistic ui applied it)

            const senderName = collaborators.find(c => c.userID === op.user_id)?.userName || op.user_id;

            // Optimistically append to local history ops log
            setHistoryOps(prev => [...prev, {
              opType: op.op_type,
              char: op.char,
              position: 0,
              userID: op.user_id,
              userName: senderName,
              createdAt: op.created_at || new Date().toISOString()
            }]);

            try {
              crdtRef.current.apply(op);
              const content = crdtRef.current.toText();

              if (editorRef.current) {
                // Capture caret position if editor currently has focus
                const hasFocus = document.activeElement === editorRef.current;
                let caretPos = 0;
                if (hasFocus) {
                  caretPos = getCaretPosition(editorRef.current);
                }

                let adjustedCaret = caretPos;
                if (op.op_type === "insert") {
                  const activeChars = crdtRef.current.getActiveChars();
                  const opIdx = activeChars.findIndex(c => c.id === op.char_id);
                  if (opIdx !== -1 && opIdx <= caretPos) {
                    adjustedCaret = caretPos + 1;
                  }
                } else if (op.op_type === "delete") {
                  if (adjustedCaret > 0) {
                    adjustedCaret = Math.max(0, caretPos - 1);
                  }
                }

                editorRef.current.innerHTML = formatCRDTToHTML(content) || "<p></p>";

                if (hasFocus) {
                  setCaretPosition(editorRef.current, adjustedCaret);
                }
                updateOutline();
              }
            } catch (err) {
              console.error("CRDT operation out-of-sync, triggering full resync:", err);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: "sync",
                  doc_id: doc.id,
                  payload: { lastSeenClock: 0 }
                }));
              }
            }
            break;
          }

          case "presence": {
            const presence = msg.payload;
            if (presence.user_id === userIDRef.current) return;

            setCollaborators(prev => {
              if (presence.action === "join") {
                if (prev.some(c => c.userID === presence.user_id)) return prev;
                return [...prev, { userID: presence.user_id, userName: presence.user_name, color: presence.color, position: null }];
              } else {
                return prev.filter(c => c.userID !== presence.user_id);
              }
            });
            break;
          }

          case "cursor": {
            const cursor = msg.payload;
            if (cursor.user_id === userIDRef.current) return;

            setCollaborators(prev => {
              const exists = prev.some(c => c.userID === cursor.user_id);
              if (exists) {
                return prev.map(c => c.userID === cursor.user_id ? { ...c, position: cursor.position } : c);
              } else {
                return [...prev, {
                  userID: cursor.user_id,
                  userName: cursor.user_name,
                  color: cursor.color,
                  position: cursor.position
                }];
              }
            });
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
      if (wsRef.current !== ws) return;
      setWsConnected(false);
      setCollaborators([]);
    };

    ws.onerror = (err) => {
      if (wsRef.current !== ws) return;
      console.error("WebSocket connection error:", err);
      setWsConnected(false);
      setCollaborators([]);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setCollaborators([]);
    };
  }, [doc.id]);

  // Handle caret coordinates repositioning whenever cursors update
  useEffect(() => {
    if (!editorRef.current) return;
    const coords: Record<string, { top: number; left: number; name: string; color: string }> = {};
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
      const ops = await getDocumentHistory(doc.id, 0, 500);
      setHistoryOps(ops);
    } catch (err) {
      console.error("Failed to load history operations:", err);
    }
  };

  useEffect(() => {
    fetchHistoryLog();
  }, [doc.id]);

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

  // Autocomplete Suggestion States and Refs
  const [activeSuggestion, setActiveSuggestion] = useState<{
    prefix: string;
    word: string;
    suffix: string;
    top: number;
    left: number;
  } | null>(null);

  const autocompleteTimerRef = useRef<number | null>(null);
  const updateContentTimerRef = useRef<number | null>(null);
  const outlineTimerRef = useRef<number | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const cursorTimerRef = useRef<number | null>(null);
  const pendingHistoryOpsRef = useRef<HistoryOp[]>([]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (autocompleteTimerRef.current !== null) window.clearTimeout(autocompleteTimerRef.current);
      if (updateContentTimerRef.current !== null) window.clearTimeout(updateContentTimerRef.current);
      if (outlineTimerRef.current !== null) window.clearTimeout(outlineTimerRef.current);
      if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current);
      if (cursorTimerRef.current !== null) window.clearTimeout(cursorTimerRef.current);
    };
  }, []);

  const triggerAutocomplete = (caretPos: number) => {
    if (autocompleteTimerRef.current !== null) {
      window.clearTimeout(autocompleteTimerRef.current);
    }

    if (!editorRef.current || userRole === "viewer") {
      setActiveSuggestion(null);
      return;
    }

    autocompleteTimerRef.current = window.setTimeout(async () => {
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          setActiveSuggestion(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editorRef.current!);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        const textBeforeCaret = preCaretRange.toString();

        // Match the last alphanumeric word prefix being typed
        const match = textBeforeCaret.match(/([a-zA-Z0-9_]+)$/);
        if (!match) {
          setActiveSuggestion(null);
          return;
        }

        const prefix = match[1];
        // Minimum prefix length of 2 characters for autocomplete
        if (prefix.length < 2) {
          setActiveSuggestion(null);
          return;
        }

        // Query suggestions from backend
        const suggestions = await getWordSuggestions(doc.id, prefix, 3);
        if (suggestions && suggestions.length > 0) {
          // Take the highest frequency suggestion
          const bestSuggestion = suggestions[0].word;

          // Verify it matches the prefix case-insensitively, and has extra characters to suggest
          if (bestSuggestion.toLowerCase().startsWith(prefix.toLowerCase()) && bestSuggestion.length > prefix.length) {
            const suffix = bestSuggestion.substring(prefix.length);

            // Get coordinates of the caret
            const coord = getCaretCoordinates(editorRef.current!, caretPos);
            if (coord) {
              setActiveSuggestion({
                prefix,
                word: bestSuggestion,
                suffix,
                top: coord.top,
                left: coord.left
              });
              return;
            }
          }
        }
        setActiveSuggestion(null);
      } catch (err) {
        console.error("Autocomplete error:", err);
        setActiveSuggestion(null);
      }
    }, 150); // 150ms debounce
  };

  const acceptSuggestion = () => {
    if (!activeSuggestion || !editorRef.current) return;

    editorRef.current.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(activeSuggestion.suffix);
      range.insertNode(textNode);

      // Move cursor to end of inserted suffix
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      // Clear suggestion
      setActiveSuggestion(null);

      // Trigger editor inputs to register changes in CRDT and push via WebSocket
      handleInput();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab" && activeSuggestion) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }

    if (e.key === "Escape") {
      setActiveSuggestion(null);
      return;
    }
  };

  // Handle local text editing - optimized for 60fps native typing speed
  const handleInput = () => {
    if (!editorRef.current) return;

    // Instantly clear ghost suggestion when typing
    setActiveSuggestion(null);

    setSaveStatus(prev => (prev === "saving" ? prev : "saving"));

    // Extract HTML content from contenteditable DOM to preserve rich text and block formatting (h1, h2, h3, lists)
    const rawText = editorRef.current.innerHTML || "";
    const newText = rawText.replace(/\r\n/g, "\n").replace(/&nbsp;/gi, "\u00A0");
    const oldText = crdtRef.current.toText();

    if (newText === oldText) {
      setSaveStatus("saved");
      return;
    }

    // Generate local operations via fast character diffing
    const ops = diffAndGenerateOps(
      crdtRef.current,
      oldText,
      newText,
      userIDRef.current,
      () => {
        clockRef.current++;
        return clockRef.current;
      }
    );

    // Apply locally and transmit over WS if connected
    ops.forEach(op => {
      crdtRef.current.apply(op);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "op",
          doc_id: doc.id,
          payload: op
        }));
      }
    });

    // Throttled history ops flush (flushes accumulated ops to React state every 300ms live)
    const userEmail = getEmail() || "you@company.com";
    const newHistoryEntries: HistoryOp[] = ops.map(op => ({
      opType: op.op_type,
      char: op.char,
      position: 0,
      userID: userIDRef.current,
      userName: userEmail.split("@")[0],
      createdAt: new Date().toISOString()
    }));
    if (newHistoryEntries.length > 0) {
      pendingHistoryOpsRef.current.push(...newHistoryEntries);
      if (historyTimerRef.current === null) {
        historyTimerRef.current = window.setTimeout(() => {
          historyTimerRef.current = null;
          if (pendingHistoryOpsRef.current.length > 0) {
            const batch = [...pendingHistoryOpsRef.current];
            pendingHistoryOpsRef.current = [];
            setHistoryOps(prev => [...prev, ...batch]);
          }
        }, 300);
      }
    }

    // Debounce parent document content update (500ms)
    if (updateContentTimerRef.current !== null) {
      window.clearTimeout(updateContentTimerRef.current);
    }
    updateContentTimerRef.current = window.setTimeout(() => {
      onUpdateContent(doc.id, newText);
    }, 500);

    // Debounce Table of Contents outline update (300ms)
    if (outlineTimerRef.current !== null) {
      window.clearTimeout(outlineTimerRef.current);
    }
    outlineTimerRef.current = window.setTimeout(() => {
      updateOutline();
    }, 300);

    // Trigger saved status timer
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus("saved");
    }, 600);

    // Broadcast updated cursor offset
    handleCaretUpdate();
  };

  // Broadcast local cursor offset (debounced to avoid WS flooding)
  const handleCaretUpdate = () => {
    if (!editorRef.current) return;
    if (document.activeElement !== editorRef.current) return;

    if (cursorTimerRef.current !== null) {
      window.clearTimeout(cursorTimerRef.current);
    }
    cursorTimerRef.current = window.setTimeout(() => {
      if (!editorRef.current) return;
      const caretPos = getCaretPosition(editorRef.current);
      triggerAutocomplete(caretPos);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "cursor",
          doc_id: doc.id,
          payload: { position: caretPos }
        }));
      }
    }, 100);
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

  // Apply rich-text formatting (h1, h2, h3, bold, italic, underline, list)
  const applyFormat = (command: string, value: string = "") => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    if (command === "formatBlock") {
      const tag = value.toLowerCase().replace(/[<>]/g, ""); // "h1", "h2", "h3", "p"
      
      const selection = window.getSelection();
      let range: Range | null = null;
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      }

      // 1. Try standard execCommand formatBlock with browser candidate tags
      let success = false;
      const candidates = [tag.toUpperCase(), `<${tag.toUpperCase()}>`, tag, `<${tag}>` ];
      for (const cand of candidates) {
        try {
          success = window.document.execCommand("formatBlock", false, cand);
          if (success) break;
        } catch {
          // Continue to next candidate
        }
      }

      // 2. Direct DOM Element conversion fallback
      if (!success || range) {
        let container: Node | null = range ? range.commonAncestorContainer : null;
        if (container && container.nodeType === Node.TEXT_NODE) {
          container = container.parentNode;
        }
        
        // Find enclosing block element inside editorRef
        let blockParent = container as HTMLElement | null;
        while (
          blockParent &&
          blockParent !== editorRef.current &&
          !["P", "H1", "H2", "H3", "DIV", "LI"].includes(blockParent.tagName)
        ) {
          blockParent = blockParent.parentElement;
        }

        if (blockParent && blockParent !== editorRef.current) {
          // If already the requested tag, toggle back to "p"
          const targetTag = blockParent.tagName.toLowerCase() === tag ? "p" : tag;
          const newEl = document.createElement(targetTag);
          newEl.innerHTML = blockParent.innerHTML;
          blockParent.parentNode?.replaceChild(newEl, blockParent);

          // Restore selection to the new element
          if (selection) {
            const newRange = document.createRange();
            newRange.selectNodeContents(newEl);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } else {
          // Default: wrap editor content into target tag
          const newEl = document.createElement(tag);
          newEl.innerHTML = editorRef.current.innerHTML || "";
          editorRef.current.innerHTML = "";
          editorRef.current.appendChild(newEl);
        }
      }
    } else {
      window.document.execCommand(command, false, value);
    }

    handleInput();
  };

  // Format comment creation/relative time
  const formatCommentDisplayTime = (c: Comment) => {
    if (c.createdAt) {
      const date = new Date(c.createdAt);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    return c.time && c.time !== "Just now" ? c.time : "Recently";
  };

  // Handle comments
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const email = getEmail() || "you@company.com";
    const now = new Date();
    const formattedTime = now.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " at " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newComment: Comment = {
      id: Date.now().toString(),
      author: email.split("@")[0],
      avatar: email.substring(0, 2).toUpperCase(),
      color: "bg-slate-700",
      text: newCommentText.trim(),
      time: formattedTime,
      createdAt: now.toISOString(),
      rangeText: selectedText || undefined
    };

    const updated = [newComment, ...comments];
    setComments(updated);
    localStorage.setItem(`docstream_comments_${doc.id}`, JSON.stringify(updated));

    setNewCommentText("");
    setSelectedText("");
  };

  const handleDeleteComment = (commentId: string) => {
    const updated = comments.filter(c => c.id !== commentId);
    setComments(updated);
    localStorage.setItem(`docstream_comments_${doc.id}`, JSON.stringify(updated));
  };

  const handleClearAllComments = () => {
    setComments([]);
    localStorage.removeItem(`docstream_comments_${doc.id}`);
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
            className={`rounded-xl p-2.5 border border-slate-100 transition-colors cursor-pointer hover:bg-slate-50 ${doc.isFavorite ? "text-crimson bg-crimson-light/30 border-crimson/20" : "text-slate-400"
              }`}
          >
            <Star className={`h-4.5 w-4.5 ${doc.isFavorite ? "fill-current" : ""}`} />
          </button>

          {/* Share Button Toggle */}
          <button
            onClick={() => setShowShareModal(true)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold border transition-all cursor-pointer ${doc.isShared
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
              className={`flex-1 text-center py-1 text-xs font-bold transition-all cursor-pointer ${activeTab === "outline" ? "text-crimson border-b-2 border-crimson" : "text-slate-400 hover:text-slate-700"
                }`}
            >
              Outline
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 text-center py-1 text-xs font-bold transition-all cursor-pointer ${activeTab === "history" ? "text-crimson border-b-2 border-crimson" : "text-slate-400 hover:text-slate-700"
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
                    Use headings (H1, H2, H3) to generate a document outline.
                  </p>
                ) : (
                  headings.map((h, idx) => (
                    <button
                      key={idx}
                      onClick={() => scrollToHeading(h.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer hover:bg-slate-50 truncate ${
                        h.level === "h1"
                          ? "text-slate-900 font-bold pl-2"
                          : h.level === "h2"
                          ? "text-slate-700 pl-4"
                          : "text-slate-500 pl-6 text-[11px]"
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
                {groupedHistoryOps.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic p-2">No editing logs found.</p>
                ) : (
                  <div className="space-y-2">
                    {groupedHistoryOps.slice(0, 30).map((entry, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-600">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-700 truncate max-w-22.5">{entry.userName}</span>
                          <span className="text-[8px] text-slate-400">{entry.time}</span>
                        </div>
                        <p className="leading-snug">
                          {entry.opType === "insert" ? (
                            entry.isNewline ? (
                              <>
                                Inserted <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                                  {entry.count > 1 ? `${entry.count} Newlines (↵)` : "Newline (↵)"}
                                </span>
                              </>
                            ) : (
                              <>
                                Inserted <span className="font-mono font-medium bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800 text-[10px] max-w-full inline-block break-words whitespace-pre-wrap leading-relaxed">&quot;{entry.text}&quot;</span>
                              </>
                            )
                          ) : (
                            <span className="text-slate-500">Deleted {entry.count} character{entry.count > 1 ? "s" : ""}</span>
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
          <div className={`flex items-center gap-1 bg-white border border-slate-150 rounded-xl px-2 py-1.5 shadow-md shadow-slate-100 mb-6 sticky top-0 z-10 w-full max-w-2xl select-none ${userRole === "viewer" ? "pointer-events-none opacity-50" : ""}`}>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("bold")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("italic")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("underline")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              title="Underline"
            >
              <Underline className="h-4 w-4" />
            </button>
            
            <div className="h-4 w-px bg-slate-200 mx-1" />

            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("formatBlock", "h1")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer font-extrabold text-xs px-2"
              title="Heading 1"
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("formatBlock", "h2")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer font-bold text-xs px-2"
              title="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("formatBlock", "h3")}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer font-semibold text-xs px-2"
              title="Heading 3"
            >
              H3
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
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
              contentEditable={userRole !== "viewer"}
              suppressContentEditableWarning
              spellCheck
              dir="ltr"
              onInput={handleInput}
              onMouseUp={handleMouseUp}
              onKeyUp={handleMouseUp}
              onKeyDown={handleKeyDown}
              data-placeholder="Start typing your ideas here..."
              className="editor-canvas outline-hidden prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed flex-1 min-h-[300px] whitespace-pre-wrap break-words"
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
                  className="w-0.5 h-4.5 animate-pulse"
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

            {/* Local Autocomplete Ghost Suggestion */}
            {activeSuggestion && (
              <span
                className="absolute pointer-events-none text-slate-400/50 text-sm leading-relaxed select-none font-normal z-10 whitespace-pre italic"
                style={{
                  top: `${activeSuggestion.top + 64}px`,
                  left: `${activeSuggestion.left + 48}px`,
                }}
              >
                {activeSuggestion.suffix}
                <span className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-px rounded bg-slate-100 text-[8px] font-bold text-slate-400 border border-slate-200 select-none uppercase tracking-wide not-italic">
                  Tab
                </span>
              </span>
            )}

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
                        <span className="text-[11px] font-bold text-slate-800 leading-none truncate max-w-37.5">{c.userName.split("@")[0]}</span>
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
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400">{comments.length} Comments</span>
                {comments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllComments}
                    className="text-[9px] font-medium text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Comment Insertion Box */}
            <form onSubmit={handleAddComment} className="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-2">
              {selectedText ? (
                <div className="bg-white border-l-2 border-crimson p-1.5 rounded text-[10px] text-slate-500 mb-1 max-h-12 overflow-hidden truncate flex justify-between items-center">
                  <span className="truncate">&quot;{selectedText}&quot;</span>
                  <button type="button" onClick={() => setSelectedText("")} className="text-slate-400 hover:text-slate-600 text-xs ml-1 cursor-pointer">✕</button>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAddComment(e);
                  }
                }}
                className="w-full bg-white border border-slate-200/80 rounded-lg p-2 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-crimson focus:border-crimson"
                rows={2}
              />
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-400">Ctrl+Enter to post</span>
                <button
                  type="submit"
                  disabled={!newCommentText.trim()}
                  className="bg-crimson hover:bg-crimson-hover disabled:opacity-50 text-white px-3 py-1 rounded-lg text-[10px] font-bold shadow-xs cursor-pointer"
                >
                  Comment
                </button>
              </div>
            </form>

            {/* Comment Threads */}
            <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="text-center py-6 px-3 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <MessageSquare className="h-4 w-4 mx-auto mb-1.5 text-slate-300" />
                  <p className="text-[11px] font-semibold text-slate-500">No discussion yet</p>
                  <p className="text-[9px] text-slate-400 mt-0.5 leading-normal">
                    Select text in the editor to quote it, or type above to add a comment.
                  </p>
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors group relative"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded-full ${c.color} text-white font-extrabold text-[8px] flex items-center justify-center select-none`}>
                          {c.avatar}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-800">{c.author}</span>
                          <span className="text-[8px] text-slate-400">{formatCommentDisplayTime(c)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(c.id)}
                        title="Delete comment"
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded-md cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {c.rangeText && (
                      <div className="bg-white border-l-2 border-crimson/70 text-[9px] text-slate-500 px-2 py-1 rounded truncate mb-1.5 italic">
                        &quot;{c.rangeText}&quot;
                      </div>
                    )}
                    <p className="text-[10.5px] text-slate-600 leading-normal whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </aside>
      </div>

      {showShareModal && fullDoc && (
        <ShareModal
          document={fullDoc}
          onClose={() => setShowShareModal(false)}
          onUpdateDocument={(updated) => {
            setFullDoc(updated);
            doc.isShared = updated.public_sharing_enabled;
          }}
        />
      )}
    </div>
  );
}

// sanitizeHTML sanitizes input HTML by stripping forbidden elements and attributes.
function sanitizeHTML(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const forbiddenTags = ["script", "iframe", "object", "embed", "applet", "meta", "link", "style"];
  forbiddenTags.forEach(tag => {
    const elements = doc.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  const allElements = doc.querySelectorAll("*");
  allElements.forEach(el => {
    // Remove attributes starting with 'on' (event handlers)
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const attr = el.attributes[i];
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
      // Remove javascript: hrefs/srcs
      if ((attr.name === "href" || attr.name === "src") && attr.value.trim().toLowerCase().startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
}

// formatCRDTToHTML formats CRDT text content into safe HTML preserving newlines as <br> tags
function formatCRDTToHTML(text: string): string {
  if (!text) return "";
  if (text.includes("<") && text.includes(">")) {
    return sanitizeHTML(text);
  }
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return escaped.replace(/\n/g, "<br>");
}

// cleanHistoryText extracts clean user-typed text from activity log entries using DOMParser and strips tag fragments
function cleanHistoryText(text: string): string {
  if (!text) return "";
  
  let cleaned = text;
  if (cleaned.includes("<") && cleaned.includes(">")) {
    if (typeof window !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(cleaned, "text/html");
        cleaned = doc.body.textContent || doc.body.innerText || "";
      } catch {
        cleaned = cleaned.replace(/<[^>]*>/g, "");
      }
    } else {
      cleaned = cleaned.replace(/<[^>]*>/g, "");
    }
  } else if (cleaned.includes("<") || cleaned.includes(">")) {
    cleaned = cleaned.replace(/<[^>]*>/g, "").replace(/<[^>]*$/g, "");
  }

  // Strip orphan HTML tag endings like "div>", "/div>", "p>", "span>", "font>", "h1>", "h2>", "h3>", "ul>", "li>"
  cleaned = cleaned
    .replace(/\/?(div|p|span|font|h1|h2|h3|ul|li|ol|br|u|b|i|strong|em)>/gi, "")
    .replace(/<[a-zA-Z0-9/]+/gi, "")
    .trim();

  return cleaned;
}
