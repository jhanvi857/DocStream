"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import WatchDemoModal from "@/components/landing/WatchDemoModal";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import DocGrid, { DocumentItem } from "@/components/dashboard/DocGrid";
import EditorPreview from "@/components/editor/EditorPreview";
import { ShieldCheck } from "lucide-react";
import { 
  getAccessToken, 
  getUserID, 
  getDocuments, 
  createDocument, 
  updateDocumentTitle, 
  deleteDocument, 
  shareDocument 
} from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<"landing" | "dashboard" | "editor">("landing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("mydocs");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [watchDemoOpen, setWatchDemoOpen] = useState(false);
  
  // Dynamic documents state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  // Authentication route guard
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      if (activeView !== "landing") {
        router.push("/login");
      }
    }
  }, [activeView, router]);

  // Load documents from the backend
  const fetchDocs = async () => {
    setLoading(true);
    try {
      const apiDocs = await getDocuments();
      const currentUserID = getUserID();

      const mapped = apiDocs.map((doc) => {
        // Read local overrides for favorites and trash bins
        const favs = JSON.parse(localStorage.getItem("docstream_favs") || "[]");
        const trashed = JSON.parse(localStorage.getItem("docstream_trash") || "[]");

        const isFavorite = favs.includes(doc.id);
        const isTrash = trashed.includes(doc.id);

        let parsedContent = "";
        try {
          if (doc.content) {
            if (typeof doc.content === "string") {
              parsedContent = doc.content;
            } else {
              parsedContent = JSON.stringify(doc.content);
            }
          }
        } catch {
          // Fallback
        }

        const isShared = doc.owner_id !== currentUserID;

        return {
          id: doc.id,
          title: doc.title,
          lastEdited: new Date(doc.updated_at).toLocaleDateString() + " " + new Date(doc.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          collaborators: [], // Populated live when opening the editor WS session
          isShared: isShared,
          isFavorite: isFavorite,
          category: isTrash ? "trash" : (isShared ? "shared" : "mydocs"),
          content: parsedContent
        } as DocumentItem;
      });
      
      setDocuments(mapped);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && activeView === "dashboard") {
      fetchDocs();
    }
  }, [isAuthenticated, activeView]);

  // Document management handlers
  const handleSelectDoc = (id: string) => {
    setSelectedDocId(id);
    setActiveView("editor");
  };

  const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const favs = JSON.parse(localStorage.getItem("docstream_favs") || "[]");
    let newFavs;
    if (favs.includes(id)) {
      newFavs = favs.filter((fid: string) => fid !== id);
    } else {
      newFavs = [...favs, id];
    }
    localStorage.setItem("docstream_favs", JSON.stringify(newFavs));

    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, isFavorite: !doc.isFavorite } : doc))
    );
  };

  const handleToggleShared = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    if (doc.isShared && doc.owner_id !== getUserID()) {
      alert("Only the document owner can configure sharing permissions.");
      return;
    }

    const email = prompt("Enter the email address of the collaborator you want to invite:");
    if (email && email.trim()) {
      try {
        await shareDocument(id, email.trim(), "editor");
        alert(`Document successfully shared with ${email}!`);
        setDocuments(prev =>
          prev.map(d => (d.id === id ? { ...d, isShared: true } : d))
        );
      } catch (err: any) {
        alert(`Failed to share document: ${err.message}`);
      }
    }
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const docToDelete = documents.find(d => d.id === id);
    if (!docToDelete) return;

    if (docToDelete.category === "trash") {
      // Permanent Delete on server
      const confirmDelete = confirm("Are you sure you want to permanently delete this document? This action cannot be undone.");
      if (!confirmDelete) return;

      try {
        await deleteDocument(id);
        const trashed = JSON.parse(localStorage.getItem("docstream_trash") || "[]");
        localStorage.setItem("docstream_trash", JSON.stringify(trashed.filter((tid: string) => tid !== id)));
        setDocuments(prev => prev.filter(doc => doc.id !== id));
        if (selectedDocId === id) setSelectedDocId(null);
      } catch (err: any) {
        alert(`Failed to delete document: ${err.message}`);
      }
    } else {
      // Send to local Trash
      const trashed = JSON.parse(localStorage.getItem("docstream_trash") || "[]");
      if (!trashed.includes(id)) {
        localStorage.setItem("docstream_trash", JSON.stringify([...trashed, id]));
      }
      setDocuments(prev =>
        prev.map(doc => (doc.id === id ? { ...doc, category: "trash", isFavorite: false } : doc))
      );
    }
  };

  const handleRenameDoc = async (id: string, newTitle: string) => {
    try {
      await updateDocumentTitle(id, newTitle);
      setDocuments(prev =>
        prev.map(doc => (doc.id === id ? { ...doc, title: newTitle, lastEdited: "Just now" } : doc))
      );
    } catch (err: any) {
      alert(`Failed to rename document: ${err.message}`);
    }
  };

  const handleCreateDoc = async () => {
    try {
      const newDoc = await createDocument(`Untitled Document ${documents.length + 1}`);
      const newDocItem: DocumentItem = {
        id: newDoc.id,
        title: newDoc.title,
        lastEdited: "Just now",
        collaborators: [],
        isShared: false,
        isFavorite: false,
        category: "mydocs",
        content: ""
      };

      setDocuments([newDocItem, ...documents]);
      setSelectedDocId(newDoc.id);
      setActiveView("editor");
    } catch (err: any) {
      alert(`Failed to create document: ${err.message}`);
    }
  };

  const handleUpdateContent = (id: string, newContent: string) => {
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, content: newContent } : doc))
    );
  };

  const handleUpdateTitle = (id: string, newTitle: string) => {
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, title: newTitle, lastEdited: "Just now" } : doc))
    );
  };

  // Filter logic based on active tab in Sidebar and Search queries
  const getFilteredDocs = () => {
    return documents.filter(doc => {
      // Match Search query
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            doc.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Match Category tab
      if (activeTab === "favorites") {
        return doc.isFavorite && doc.category !== "trash";
      }
      if (activeTab === "trash") {
        return doc.category === "trash";
      }
      if (activeTab === "shared") {
        return doc.isShared && doc.category !== "trash";
      }
      // "mydocs" shows all non-trashed documents
      return doc.category !== "trash";
    });
  };

  const filteredDocs = getFilteredDocs();
  const selectedDoc = documents.find(d => d.id === selectedDocId);

  // Tab counts
  const myDocsCount = documents.filter(d => d.category !== "trash").length;
  const sharedCount = documents.filter(d => d.isShared && d.category !== "trash").length;
  const favoritesCount = documents.filter(d => d.isFavorite && d.category !== "trash").length;
  const trashCount = documents.filter(d => d.category === "trash").length;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      
      {/* 1. LANDING PAGE VIEW */}
      {activeView === "landing" && (
        <div className="flex flex-col flex-1">
          {/* Header/Navbar */}
          <nav className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveView("landing")}>
              <div className="h-8 w-8 rounded-xl bg-crimson flex items-center justify-center shadow-lg shadow-crimson/15">
                <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight font-display">DocStream</span>
            </div>

            <div className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-500">
              <a href="#" className="hover:text-crimson transition-colors">Features</a>
              <a href="#" className="hover:text-crimson transition-colors">Security</a>
              <a href="#" className="hover:text-crimson transition-colors">Pricing</a>
              {isAuthenticated ? (
                <button onClick={() => setActiveView("dashboard")} className="hover:text-crimson transition-colors cursor-pointer">Dashboard</button>
              ) : (
                <Link href="/login" className="hover:text-crimson transition-colors">Sign in</Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (isAuthenticated) {
                    setActiveView("dashboard");
                  } else {
                    router.push("/login");
                  }
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Go to Dashboard
              </button>
              {!isAuthenticated && (
                <Link 
                  href="/signup"
                  className="rounded-xl bg-crimson hover:bg-crimson-hover text-white px-4 py-2 text-xs font-bold shadow-md shadow-crimson/15 cursor-pointer"
                >
                  Get Started
                </Link>
              )}
            </div>
          </nav>

          {/* Hero */}
          <HeroSection 
            onGetStarted={() => {
              if (isAuthenticated) {
                setActiveView("dashboard");
              } else {
                router.push("/signup");
              }
            }}
            onWatchDemo={() => setWatchDemoOpen(true)}
          />

          {/* Features */}
          <FeaturesSection />

          {/* Watch Demo Modal */}
          <WatchDemoModal 
            isOpen={watchDemoOpen}
            onClose={() => setWatchDemoOpen(false)}
          />

          {/* Landing Footer */}
          <footer className="bg-crimson text-white py-16 border-t border-slate-800">
            <div className="mx-auto max-w-7xl px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-10">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-crimson flex items-center justify-center">
                    <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  </div>
                  <span className="font-bold text-white font-display">DocStream</span>
                </div>
                <p className="text-xs leading-relaxed max-w-xs">
                  A premium SaaS writing workspace configured for modern development environments and real-time syncing workflows.
                </p>
              </div>

              <div>
                <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Product</h4>
                <ul className="space-y-2 text-xs font-medium">
                  <li><a href="#" className="hover:text-white transition-colors">Workspace Editor</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Domain Sharing</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Access Controls</a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Integrations</h4>
                <ul className="space-y-2 text-xs font-medium">
                  <li><a href="#" className="hover:text-white transition-colors">Notion Sync</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Slack Mentions</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Google Drive Import</a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Security</h4>
                <ul className="space-y-2 text-xs font-medium">
                  <li><a href="#" className="hover:text-white transition-colors">ISO Certification</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">End-to-End Encryption</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Privacy Audits</a></li>
                </ul>
              </div>
            </div>
            <div className="mx-auto max-w-7xl px-6 lg:px-8 border-t border-slate-800 pt-8 mt-12 text-center text-xs">
              <p>© {new Date().getFullYear()} DocStream Inc. All rights reserved.</p>
            </div>
          </footer>
        </div>
      )}

      {/* 2. DASHBOARD VIEW */}
      {activeView === "dashboard" && (
        <div className="flex flex-1 flex-row">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            myDocsCount={myDocsCount}
            sharedCount={sharedCount}
            favoritesCount={favoritesCount}
            trashCount={trashCount}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <div className="flex-1 flex flex-col min-h-screen">
            <Header
              onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
              onCreateDoc={handleCreateDoc}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onGoHome={() => setActiveView("landing")}
            />

            {/* Dashboard Content Container */}
            <main className="flex-1 px-6 py-8 md:px-8 overflow-y-auto max-w-7xl w-full mx-auto">
              
              {/* Dashboard Sub-Header */}
              <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-800 font-display capitalize">
                    {activeTab === "mydocs" && "My Documents"}
                    {activeTab === "shared" && "Shared with me"}
                    {activeTab === "favorites" && "Favorited Docs"}
                    {activeTab === "trash" && "Trash Bin"}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {activeTab === "mydocs" && "Displaying all active notes and briefs in your private space."}
                    {activeTab === "shared" && "These documents are actively shared with external team domains."}
                    {activeTab === "favorites" && "Starred elements for quick access and bookmarks."}
                    {activeTab === "trash" && "Archived records. Deleting here will wipe files permanently."}
                  </p>
                </div>
                
                {/* Floating Quick Stats */}
                <div className="hidden sm:flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-600">
                    <ShieldCheck className="h-4 w-4 text-crimson" />
                    <span>Domain Lock</span>
                  </div>
                  <div className="h-3 w-px bg-slate-200" />
                  <span className="text-slate-400 font-medium">
                    {loading ? "Loading..." : `${filteredDocs.length} items found`}
                  </span>
                </div>
              </div>

              {/* Grid layout */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <svg className="animate-spin h-8 w-8 text-crimson mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-xs font-semibold">Retrieving workspace documents...</p>
                </div>
              ) : (
                <DocGrid
                  documents={filteredDocs}
                  onSelectDoc={handleSelectDoc}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleShared={handleToggleShared}
                  onDeleteDoc={handleDeleteDoc}
                  onRenameDoc={handleRenameDoc}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {/* 3. EDITOR VIEW */}
      {activeView === "editor" && selectedDoc && (
        <EditorPreview
          document={selectedDoc}
          onBack={() => {
            setActiveView("dashboard");
            fetchDocs(); // Refresh documents grid
          }}
          onUpdateContent={handleUpdateContent}
          onUpdateTitle={handleUpdateTitle}
          onToggleFavorite={handleToggleFavorite}
          onToggleShared={handleToggleShared}
        />
      )}

    </div>
  );
}
