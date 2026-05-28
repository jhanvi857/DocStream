"use client";

import React, { useState } from "react";
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

export default function Home() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<"landing" | "dashboard" | "editor">("landing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("mydocs");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [watchDemoOpen, setWatchDemoOpen] = useState(false);

  // Pre-loaded documents matching a premium SaaS environment
  const [documents, setDocuments] = useState<DocumentItem[]>([
    {
      id: "doc1",
      title: "Product Specs & API V2",
      lastEdited: "10 minutes ago",
      collaborators: [
        { name: "Sarah K.", avatar: "SK", color: "bg-crimson" },
        { name: "Marcus K.", avatar: "MK", color: "bg-crimson-hover" }
      ],
      isShared: true,
      isFavorite: true,
      category: "mydocs",
      content: `<h2>1. Project Goals</h2>
<p>We are standardising our core variables to enable a fully responsive grid. The key targets for the sprint are listed below:</p>
<ul>
  <li>Migrate components to Next.js App Router.</li>
  <li>Install and test tailwind theme mappings.</li>
  <li>Integrate collaborative cursors and comment boxes.</li>
</ul>
<h2 id="bot-para">2. Brand Guidelines</h2>
<p>For primary actions, CTAs, highlight states, and visual focus, use the primary crimson accent <strong>#93032E</strong>. For borders, use soft slate-100/200 greys to maintain workspace minimalism.</p>`
    },
    {
      id: "doc2",
      title: "Marketing Strategy Brief Q3",
      lastEdited: "2 hours ago",
      collaborators: [
        { name: "Tom L.", avatar: "TL", color: "bg-crimson-light text-crimson" }
      ],
      isShared: true,
      isFavorite: false,
      category: "mydocs",
      content: `<h2>Q3 Launch Campaign Strategy</h2>
<p>Our core goal is targeting SaaS creators looking for highly visual collaborative alternatives to traditional word documents.</p>
<h3>Distribution Channels:</h3>
<ul>
  <li>ProductHunt Launch</li>
  <li>Developer newsletters and targeted tech sponsorships</li>
  <li>SEO landing pages emphasizing performance speed and templates</li>
</ul>`
    },
    {
      id: "doc3",
      title: "Design Sprint Guidelines",
      lastEdited: "Yesterday",
      collaborators: [],
      isShared: false,
      isFavorite: true,
      category: "mydocs",
      content: `<h2>DocStream Design Philosophy</h2>
<p>Keep layouts extremely spacious. Leverage white space as a design element, letting the deep crimson color palette draw focus to key interactions without clutter.</p>`
    },
    {
      id: "doc4",
      title: "Engineering Onboarding Roadmap",
      lastEdited: "3 days ago",
      collaborators: [
        { name: "Marcus K.", avatar: "MK", color: "bg-crimson-hover" }
      ],
      isShared: true,
      isFavorite: false,
      category: "mydocs",
      content: `<h2>Engineering Quickstart</h2>
<p>Welcome to DocStream! Run the local dev server using <code>npm run dev</code>. Ensure environment variables for secure database sharing are loaded.</p>`
    },
    {
      id: "doc5",
      title: "Legacy Archive (Q1 Plan)",
      lastEdited: "2 weeks ago",
      collaborators: [],
      isShared: false,
      isFavorite: false,
      category: "trash",
      content: `<h2>Q1 Marketing Plan (Archived)</h2>
<p>This is a legacy document covering historical timelines. Feel free to purge or restore.</p>`
    }
  ]);

  // Document management handlers
  const handleSelectDoc = (id: string) => {
    setSelectedDocId(id);
    setActiveView("editor");
  };

  const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, isFavorite: !doc.isFavorite } : doc))
    );
  };

  const handleToggleShared = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, isShared: !doc.isShared } : doc))
    );
  };

  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const docToDelete = documents.find(d => d.id === id);
    if (!docToDelete) return;

    if (docToDelete.category === "trash") {
      // Permanent Delete
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      if (selectedDocId === id) setSelectedDocId(null);
    } else {
      // Send to Trash
      setDocuments(prev =>
        prev.map(doc => (doc.id === id ? { ...doc, category: "trash", isFavorite: false } : doc))
      );
    }
  };

  const handleRenameDoc = (id: string, newTitle: string) => {
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, title: newTitle, lastEdited: "Just now" } : doc))
    );
  };

  const handleCreateDoc = () => {
    const newDocId = `doc-${Date.now()}`;
    const newDoc: DocumentItem = {
      id: newDocId,
      title: `Untitled Document ${documents.length + 1}`,
      lastEdited: "Just now",
      collaborators: [],
      isShared: false,
      isFavorite: false,
      category: "mydocs",
      content: `<h2>Untitled Document</h2><p>Click here to start editing your new page...</p>`
    };

    setDocuments([newDoc, ...documents]);
    setSelectedDocId(newDocId);
    setActiveView("editor");
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
              <Link href="/login" className="hover:text-crimson transition-colors">Sign in</Link>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveView("dashboard")}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Go to Dashboard
              </button>
              <Link 
                href="/signup"
                className="rounded-xl bg-crimson hover:bg-crimson-hover text-white px-4 py-2 text-xs font-bold shadow-md shadow-crimson/15 cursor-pointer"
              >
                Get Started
              </Link>
            </div>
          </nav>

          {/* Hero */}
          <HeroSection 
            onGetStarted={() => router.push("/signup")}
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
              <p>© {new Date().getFullYear()} DocStream Inc. All rights reserved. Platform mock for review.</p>
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
                  <span className="text-slate-400 font-medium">{filteredDocs.length} items found</span>
                </div>
              </div>

              {/* Grid layout */}
              <DocGrid
                documents={filteredDocs}
                onSelectDoc={handleSelectDoc}
                onToggleFavorite={handleToggleFavorite}
                onToggleShared={handleToggleShared}
                onDeleteDoc={handleDeleteDoc}
                onRenameDoc={handleRenameDoc}
              />
            </main>
          </div>
        </div>
      )}

      {/* 3. EDITOR VIEW */}
      {activeView === "editor" && selectedDoc && (
        <EditorPreview
          document={selectedDoc}
          onBack={() => setActiveView("dashboard")}
          onUpdateContent={handleUpdateContent}
          onUpdateTitle={handleUpdateTitle}
          onToggleFavorite={handleToggleFavorite}
          onToggleShared={handleToggleShared}
        />
      )}

    </div>
  );
}
