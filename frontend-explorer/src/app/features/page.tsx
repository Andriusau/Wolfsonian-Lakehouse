"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface Feature {
  id: string;
  title: string;
  description: string;
  system: "lakehouse" | "metabase" | "pipeline" | "general";
  category: string;
  status: "done" | "in_progress" | "planned" | "under_review";
  submitter_name: string;
  submitter_email?: string; // Visible in admin mode
  admin_response?: string;
  votes: number;
  created_at: string;
}

interface Stats {
  total: number;
  done: number;
  in_progress: number;
  planned: number;
  under_review: number;
}

const CATEGORIES = [
  "All Categories",
  "Search & Discovery",
  "Exhibitions & Games",
  "Media & Images",
  "Metadata & Indexing",
  "Exports & Collections",
  "UI & Navigation",
  "Metabase BI",
  "Data Quality",
  "Infrastructure & Monitoring",
  "Merch & Interactive",
  "General",
];

export default function FeaturesPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    done: 0,
    in_progress: 0,
    planned: 0,
    under_review: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin Mode State
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPasskey, setAdminPasskey] = useState<string>("");
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [loginPasskeyInput, setLoginPasskeyInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Editing AA Note inline
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"votes" | "newest">("votes");

  // User Voted IDs (persisted locally)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formSystem, setFormSystem] = useState<"lakehouse" | "metabase" | "pipeline" | "general">("lakehouse");
  const [formCategory, setFormCategory] = useState("Search & Discovery");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Load features and user's past votes & check admin passkey
  useEffect(() => {
    try {
      const savedVotes = localStorage.getItem("wolfsonian_lakehouse_feature_votes");
      if (savedVotes) {
        setVotedIds(new Set(JSON.parse(savedVotes)));
      }
    } catch {
      // Ignore localStorage errors
    }

    // Check if admin passkey is passed via URL (?admin=passkey) or saved in localStorage
    let activeKey = "";
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryAdmin = urlParams.get("admin");
      if (queryAdmin) {
        activeKey = queryAdmin;
        localStorage.setItem("wolfsonian_admin_passkey", queryAdmin);
      } else {
        activeKey = localStorage.getItem("wolfsonian_admin_passkey") || "";
      }
    } catch {
      // Ignore
    }

    if (activeKey) {
      setAdminPasskey(activeKey);
    }

    fetchFeatures(activeKey);
  }, []);

  const fetchFeatures = async (passkey?: string) => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      const keyToUse = passkey !== undefined ? passkey : adminPasskey;
      if (keyToUse) {
        headers["x-admin-key"] = keyToUse;
      }

      const res = await fetch("/api/features", { headers });
      if (!res.ok) {
        throw new Error(`Failed to load features: ${res.statusText}`);
      }
      const data = await res.json();
      setFeatures(data.features || []);
      setIsAdmin(Boolean(data.is_admin));
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message || "Could not load features.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch("/api/features", {
        headers: { "x-admin-key": loginPasskeyInput.trim() },
      });
      const data = await res.json();
      if (data.is_admin) {
        setIsAdmin(true);
        setAdminPasskey(loginPasskeyInput.trim());
        localStorage.setItem("wolfsonian_admin_passkey", loginPasskeyInput.trim());
        setFeatures(data.features || []);
        setIsAdminLoginOpen(false);
        setLoginPasskeyInput("");
      } else {
        setLoginError("Invalid admin passkey. Please try again.");
      }
    } catch {
      setLoginError("Verification failed. Please check network connection.");
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    setAdminPasskey("");
    try {
      localStorage.removeItem("wolfsonian_admin_passkey");
    } catch {
      // Ignore
    }
    fetchFeatures("");
  };

  const handleStatusChange = async (id: string, newStatus: Feature["status"]) => {
    try {
      // Optimistic update
      setFeatures((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );

      await fetch("/api/features", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPasskey,
        },
        body: JSON.stringify({ id, status: newStatus }),
      });

      // Refresh stats
      fetchFeatures(adminPasskey);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleSaveNote = async (id: string) => {
    setIsSavingNote(true);
    try {
      // Optimistic update
      setFeatures((prev) =>
        prev.map((item) => (item.id === id ? { ...item, admin_response: noteDraft.trim() } : item))
      );

      await fetch("/api/features", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPasskey,
        },
        body: JSON.stringify({ id, admin_response: noteDraft.trim() }),
      });

      setEditingNoteId(null);
      setNoteDraft("");
    } catch (err) {
      console.error("Failed to save AA note:", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this feature request?")) {
      return;
    }

    try {
      setFeatures((prev) => prev.filter((item) => item.id !== id));
      await fetch("/api/features", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminPasskey,
        },
        body: JSON.stringify({ id }),
      });
      fetchFeatures(adminPasskey);
    } catch (err) {
      console.error("Failed to delete feature request:", err);
    }
  };

  const handleVote = async (id: string) => {
    if (votedIds.has(id)) {
      return; // Already voted in this browser session
    }

    // Optimistic UI update
    setFeatures((prev) =>
      prev.map((item) => (item.id === id ? { ...item, votes: item.votes + 1 } : item))
    );

    const newVoted = new Set(votedIds).add(id);
    setVotedIds(newVoted);
    try {
      localStorage.setItem(
        "wolfsonian_lakehouse_feature_votes",
        JSON.stringify(Array.from(newVoted))
      );
    } catch {
      // Ignore
    }

    try {
      await fetch(`/api/features/${id}/vote`, { method: "POST" });
    } catch (err) {
      console.error("Voting failed:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formName.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }
    if (!formEmail.trim() || !formEmail.includes("@")) {
      setSubmitError("Please enter a valid email address.");
      return;
    }
    if (!formTitle.trim()) {
      setSubmitError("Please enter a feature title.");
      return;
    }
    if (!formDescription.trim()) {
      setSubmitError("Please provide a description of the request.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          system: formSystem,
          category: formCategory,
          title: formTitle.trim(),
          description: formDescription.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }

      // Add to local state optimistically
      if (data.item) {
        setFeatures((prev) => [data.item, ...prev]);
        setStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          under_review: prev.under_review + 1,
        }));
      }

      setSubmitSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitSuccess(false);
        // Reset form
        setFormTitle("");
        setFormDescription("");
        setStatusFilter("under_review");
      }, 1500);
    } catch (err: any) {
      setSubmitError(err.message || "An error occurred while submitting.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered and sorted features
  const filteredFeatures = useMemo(() => {
    return features
      .filter((item) => {
        // Status filter
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        // System filter
        if (systemFilter !== "all" && item.system !== systemFilter) {
          return false;
        }
        // Category filter
        if (categoryFilter !== "All Categories" && item.category !== categoryFilter) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchDesc = item.description.toLowerCase().includes(q);
          const matchAdmin = (item.admin_response || "").toLowerCase().includes(q);
          const matchCategory = item.category.toLowerCase().includes(q);
          const matchAuthor = item.submitter_name.toLowerCase().includes(q);
          const matchEmail = (item.submitter_email || "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchAdmin && !matchCategory && !matchAuthor && !matchEmail) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "votes") {
          return b.votes - a.votes;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [features, statusFilter, systemFilter, categoryFilter, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col font-mono selection:bg-mca-yellow selection:text-black antialiased">
      {/* Admin Mode Status Banner */}
      {isAdmin && (
        <div className="bg-mca-cyan text-black px-6 py-2.5 text-xs uppercase font-bold flex items-center justify-between tracking-wider shadow-md">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-black animate-ping" />
            <span>ADMIN MODE ACTIVE — LOGGED IN AS AA (SUBMITTER EMAILS &amp; STATUS CONTROLS UNLOCKED)</span>
          </div>
          <button
            onClick={handleAdminLogout}
            className="px-3 py-1 bg-black text-white hover:bg-white hover:text-black transition-colors text-[10px] cursor-pointer"
          >
            [LOGOUT ADMIN]
          </button>
        </div>
      )}

      {/* Top Banner Navigation Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-white/20 text-xs uppercase font-bold tracking-wider divide-y-2 md:divide-y-0 md:divide-x-2 divide-white/20 bg-black">
        <Link
          href="/"
          className="p-4 flex items-center justify-between hover:bg-white hover:text-black transition-colors group cursor-pointer"
        >
          <span>← RETURN TO LAKEHOUSE</span>
          <span className="text-mca-cyan group-hover:text-black">WOLFSONIAN-FIU</span>
        </Link>
        <div className="p-4 flex items-center justify-between">
          <span>FEATURE TRACKER</span>
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-mca-cyan animate-pulse" />
            <span className="text-mca-cyan">{isAdmin ? "ADMIN CONSOLE" : "LIVE ARCHIVE"}</span>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>TOTAL PROPOSALS</span>
          <span className="text-white font-mono">{stats.total}</span>
        </div>
        <div
          onClick={() => setIsModalOpen(true)}
          className="p-4 flex items-center justify-between group cursor-pointer bg-mca-cyan text-black hover:bg-white transition-colors"
        >
          <span className="font-bold">+ SUBMIT REQUEST</span>
          <span className="text-black font-mono font-bold">[NEW]</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full px-6 md:px-12 2xl:px-24 py-10 md:py-16 flex-1 space-y-12 max-w-7xl mx-auto">
        {/* Header Title Section */}
        <header className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-mca-cyan font-bold font-mono flex items-center gap-2">
                <span>RUNNING ROADMAP &amp; DEV CHANGELOG</span>
                {!isAdmin && (
                  <button
                    onClick={() => setIsAdminLoginOpen(true)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 font-mono underline ml-2 cursor-pointer"
                  >
                    [Admin Unlock]
                  </button>
                )}
              </div>
              <h1 className="text-4xl md:text-6xl font-black font-display uppercase tracking-tight text-white leading-none">
                FEATURE REQUESTS &amp; <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-300 to-mca-cyan">
                  CHANGELOG
                </span>
              </h1>
              <p className="text-slate-400 text-sm md:text-base font-sans max-w-2xl leading-relaxed">
                Submit desired features and changes for{" "}
                <span className="text-white font-mono">lakehouse.wolfsonian.org</span> and{" "}
                <span className="text-white font-mono">metabase.wolfsonian.org</span>. All entries are reviewed by
                AA with live dev updates.
              </p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-8 py-4 bg-mca-cyan text-black font-mono font-bold text-sm tracking-wider uppercase hover:bg-white transition-all transform hover:-translate-y-0.5 shadow-lg shadow-mca-cyan/20 flex items-center justify-center gap-2 self-start md:self-auto cursor-pointer"
            >
              <span>+</span> SUBMIT A FEATURE REQUEST
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
            <div
              onClick={() => setStatusFilter("all")}
              className={`p-4 border cursor-pointer transition-all ${
                statusFilter === "all"
                  ? "border-mca-cyan bg-mca-cyan/10"
                  : "border-white/15 bg-white/5 hover:border-white/40"
              }`}
            >
              <div className="text-[10px] text-slate-400 uppercase tracking-widest">Total Proposals</div>
              <div className="text-2xl md:text-3xl font-bold font-display text-white mt-1">{stats.total}</div>
            </div>
            <div
              onClick={() => setStatusFilter("in_progress")}
              className={`p-4 border cursor-pointer transition-all ${
                statusFilter === "in_progress"
                  ? "border-mca-yellow bg-mca-yellow/10"
                  : "border-white/15 bg-white/5 hover:border-white/40"
              }`}
            >
              <div className="text-[10px] text-mca-yellow uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-mca-yellow animate-ping" />
                In Progress
              </div>
              <div className="text-2xl md:text-3xl font-bold font-display text-mca-yellow mt-1">
                {stats.in_progress}
              </div>
            </div>
            <div
              onClick={() => setStatusFilter("done")}
              className={`p-4 border cursor-pointer transition-all ${
                statusFilter === "done"
                  ? "border-emerald-400 bg-emerald-400/10"
                  : "border-white/15 bg-white/5 hover:border-white/40"
              }`}
            >
              <div className="text-[10px] text-emerald-400 uppercase tracking-widest">Completed / Done</div>
              <div className="text-2xl md:text-3xl font-bold font-display text-emerald-400 mt-1">
                {stats.done}
              </div>
            </div>
            <div
              onClick={() => setStatusFilter("under_review")}
              className={`p-4 border cursor-pointer transition-all ${
                statusFilter === "under_review"
                  ? "border-mca-cyan bg-mca-cyan/10"
                  : "border-white/15 bg-white/5 hover:border-white/40"
              }`}
            >
              <div className="text-[10px] text-mca-cyan uppercase tracking-widest">Under Review</div>
              <div className="text-2xl md:text-3xl font-bold font-display text-mca-cyan mt-1">
                {stats.under_review}
              </div>
            </div>
          </div>
        </header>

        {/* Filter and Search Toolbar */}
        <section className="space-y-4 bg-[#111111] border border-white/15 p-6">
          {/* Search bar */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={isAdmin ? "SEARCH FEATURES, SUBMITTER EMAILS, KEYWORDS..." : "SEARCH FEATURES, DEV UPDATES, KEYWORDS..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black border border-white/30 px-5 py-3 text-sm text-white placeholder:text-slate-500 font-mono uppercase focus:outline-none focus:border-mca-cyan transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-mono"
                >
                  [CLEAR]
                </button>
              )}
            </div>

            {/* Sort options */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 uppercase tracking-wider hidden sm:inline">SORT:</span>
              <button
                onClick={() => setSortBy("votes")}
                className={`px-4 py-3 text-xs uppercase font-bold tracking-wider border transition-colors cursor-pointer ${
                  sortBy === "votes"
                    ? "bg-white text-black border-white"
                    : "bg-black text-slate-300 border-white/20 hover:border-white"
                }`}
              >
                ▲ MOST UPVOTED
              </button>
              <button
                onClick={() => setSortBy("newest")}
                className={`px-4 py-3 text-xs uppercase font-bold tracking-wider border transition-colors cursor-pointer ${
                  sortBy === "newest"
                    ? "bg-white text-black border-white"
                    : "bg-black text-slate-300 border-white/20 hover:border-white"
                }`}
              >
                🕒 NEWEST
              </button>
            </div>
          </div>

          {/* System & Status Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10 text-xs">
            {/* System Tabs */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-slate-400 uppercase tracking-wider mr-1">System:</span>
              {[
                { id: "all", label: "ALL" },
                { id: "lakehouse", label: "LAKEHOUSE WEB" },
                { id: "metabase", label: "METABASE BI" },
                { id: "pipeline", label: "DATA PIPELINE" },
              ].map((sys) => (
                <button
                  key={sys.id}
                  onClick={() => setSystemFilter(sys.id)}
                  className={`px-3 py-1.5 uppercase font-bold tracking-wider text-[11px] border transition-colors cursor-pointer ${
                    systemFilter === sys.id
                      ? "bg-mca-cyan text-black border-mca-cyan"
                      : "bg-black text-slate-400 border-white/15 hover:border-white/50"
                  }`}
                >
                  {sys.label}
                </button>
              ))}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 uppercase tracking-wider">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter feature requests by category"
                className="bg-black border border-white/20 text-white text-xs px-3 py-1.5 uppercase font-mono focus:outline-none focus:border-mca-cyan cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Results Counter & Active Filter Tags */}
        <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider font-mono">
          <div>
            SHOWING <span className="text-white font-bold">{filteredFeatures.length}</span> OF{" "}
            <span className="text-white font-bold">{features.length}</span> REQUESTS
          </div>
          {(statusFilter !== "all" || systemFilter !== "all" || categoryFilter !== "All Categories" || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setSystemFilter("all");
                setCategoryFilter("All Categories");
                setSearchQuery("");
              }}
              className="text-mca-yellow hover:underline cursor-pointer"
            >
              [RESET ALL FILTERS]
            </button>
          )}
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-20 text-center text-slate-400 font-mono uppercase tracking-widest flex flex-col items-center justify-center gap-3">
            <div className="h-6 w-6 border-2 border-mca-cyan border-t-transparent animate-spin rounded-full" />
            Loading Wolfsonian Lakehouse Feature Log...
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-950/50 border-2 border-red-500 text-red-200 text-xs">
            <span className="font-bold text-red-400">[ERROR LOADING REQUESTS]</span> {error}
          </div>
        )}

        {/* Features List */}
        {!loading && !error && (
          <div className="space-y-4">
            {filteredFeatures.length === 0 ? (
              <div className="p-12 text-center border border-white/10 bg-black/40 space-y-4">
                <div className="text-3xl">🔍</div>
                <div className="text-sm font-bold text-white uppercase tracking-wider">
                  No matching feature requests found
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Try adjusting your filters, or submit a new feature request using the button below.
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-6 py-2.5 bg-mca-cyan text-black text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors cursor-pointer"
                >
                  + Submit This Request
                </button>
              </div>
            ) : (
              filteredFeatures.map((item) => {
                const hasVoted = votedIds.has(item.id);
                const isEditingThisNote = editingNoteId === item.id;

                return (
                  <article
                    key={item.id}
                    className={`p-6 border transition-all flex flex-col md:flex-row gap-6 items-start group ${
                      isAdmin
                        ? "border-mca-cyan/30 bg-[#0c1214]"
                        : "border-white/15 bg-[#0f0f0f] hover:border-white/40"
                    }`}
                  >
                    {/* Upvote Button */}
                    <div className="flex md:flex-col items-center gap-2 self-start flex-shrink-0">
                      <button
                        onClick={() => handleVote(item.id)}
                        disabled={hasVoted}
                        title={hasVoted ? "You have already upvoted this feature" : "Upvote this feature"}
                        className={`px-4 py-2.5 md:py-3 md:w-16 flex md:flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                          hasVoted
                            ? "bg-mca-cyan/20 border-mca-cyan text-mca-cyan"
                            : "bg-black border-white/20 text-white hover:border-mca-cyan hover:text-mca-cyan hover:bg-white/5"
                        }`}
                      >
                        <span className={`text-base leading-none ${hasVoted ? "text-mca-cyan" : ""}`}>▲</span>
                        <span className="font-mono font-bold text-xs">{item.votes}</span>
                      </button>
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest hidden md:inline">
                        {hasVoted ? "VOTED" : "VOTE"}
                      </span>
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 space-y-3 w-full">
                      {/* Badges Row */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider font-bold">
                        {/* Status Badge */}
                        {item.status === "done" && (
                          <span className="px-2.5 py-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                            ✓ DONE
                          </span>
                        )}
                        {item.status === "in_progress" && (
                          <span className="px-2.5 py-1 bg-amber-950/80 text-mca-yellow border border-mca-yellow/50 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-mca-yellow animate-ping" />
                            ⚡ IN PROGRESS
                          </span>
                        )}
                        {item.status === "planned" && (
                          <span className="px-2.5 py-1 bg-indigo-950/80 text-indigo-300 border border-indigo-500/40">
                            📅 PLANNED
                          </span>
                        )}
                        {item.status === "under_review" && (
                          <span className="px-2.5 py-1 bg-cyan-950/80 text-mca-cyan border border-mca-cyan/40">
                            🔍 UNDER REVIEW
                          </span>
                        )}

                        {/* System Badge */}
                        <span className="px-2.5 py-1 bg-black text-slate-300 border border-white/20">
                          {item.system === "lakehouse"
                            ? "LAKEHOUSE"
                            : item.system === "metabase"
                            ? "METABASE BI"
                            : item.system === "pipeline"
                            ? "PIPELINE"
                            : "SYSTEM"}
                        </span>

                        {/* Category */}
                        <span className="px-2.5 py-1 bg-white/5 text-slate-400 border border-white/10">
                          {item.category}
                        </span>

                        {/* Admin Submitter Email Badge */}
                        {isAdmin && item.submitter_email && (
                          <a
                            href={`mailto:${item.submitter_email}?subject=Wolfsonian Lakehouse: ${encodeURIComponent(item.title)}`}
                            className="px-2.5 py-1 bg-mca-cyan/20 text-mca-cyan border border-mca-cyan/60 hover:bg-mca-cyan hover:text-black transition-colors"
                            title="Click to email the submitter directly"
                          >
                            ✉️ {item.submitter_email}
                          </a>
                        )}
                      </div>

                      {/* Title */}
                      <h2 className="text-lg md:text-xl font-bold font-display tracking-tight text-white uppercase group-hover:text-mca-cyan transition-colors">
                        {item.title}
                      </h2>

                      {/* Request Description */}
                      <p className="text-slate-300 text-xs md:text-sm font-sans leading-relaxed">
                        {item.description}
                      </p>

                      {/* AA Dev Update Box */}
                      {item.admin_response && !isEditingThisNote && (
                        <div className="p-3.5 bg-[#180505] border-l-4 border-red-500 text-red-200 text-xs font-sans space-y-1 rounded-none shadow-sm">
                          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center justify-between">
                            <span>AA UPDATE / DEV NOTE:</span>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingNoteId(item.id);
                                  setNoteDraft(item.admin_response || "");
                                }}
                                className="text-[10px] text-red-300 hover:text-white underline font-mono cursor-pointer"
                              >
                                [Edit Note]
                              </button>
                            )}
                          </div>
                          <p className="font-mono text-red-200 leading-relaxed font-semibold">
                            {item.admin_response}
                          </p>
                        </div>
                      )}

                      {/* Admin inline Note Editor */}
                      {isAdmin && isEditingThisNote && (
                        <div className="p-3 bg-red-950/40 border border-red-500 space-y-2">
                          <label className="text-[10px] font-mono text-red-400 uppercase font-bold">
                            Edit AA Dev Note / Resolution:
                          </label>
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            rows={3}
                            placeholder="Type AA update here (e.g. Done. In progress. Tested and working.)..."
                            className="w-full bg-black border border-red-400 p-2 text-xs font-mono text-white focus:outline-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setEditingNoteId(null);
                                setNoteDraft("");
                              }}
                              className="px-3 py-1 border border-white/20 text-[10px] uppercase font-bold"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveNote(item.id)}
                              disabled={isSavingNote}
                              className="px-4 py-1 bg-red-500 text-white text-[10px] uppercase font-bold hover:bg-red-400"
                            >
                              {isSavingNote ? "Saving..." : "Save AA Note"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Footer Info & Admin Actions Bar */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-4 text-[10px] text-slate-500 font-mono uppercase tracking-widest border-t border-white/5">
                        <div className="flex items-center gap-4">
                          <span>SUBMITTED BY: {item.submitter_name}</span>
                          <span>{new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>

                        {/* Admin Action Buttons */}
                        {isAdmin && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-slate-400">SET STATUS:</span>
                            <select
                              value={item.status}
                              onChange={(e) => handleStatusChange(item.id, e.target.value as Feature["status"])}
                              className="bg-black border border-mca-cyan text-mca-cyan px-2 py-0.5 text-[10px] font-mono uppercase cursor-pointer"
                            >
                              <option value="under_review">UNDER REVIEW</option>
                              <option value="in_progress">IN PROGRESS</option>
                              <option value="planned">PLANNED</option>
                              <option value="done">DONE</option>
                            </select>

                            {!item.admin_response && !isEditingThisNote && (
                              <button
                                onClick={() => {
                                  setEditingNoteId(item.id);
                                  setNoteDraft("");
                                }}
                                className="px-2 py-0.5 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer text-[10px]"
                              >
                                + ADD AA NOTE
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2 py-0.5 border border-red-800 text-red-500 hover:bg-red-800 hover:text-white transition-colors cursor-pointer text-[10px]"
                            >
                              ✕ DELETE
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Admin Login Modal */}
      {isAdminLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0e0e0e] border-2 border-mca-cyan p-6 space-y-6">
            <button
              onClick={() => setIsAdminLoginOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-lg p-2"
            >
              ✕
            </button>
            <div className="space-y-1">
              <div className="text-[10px] font-mono text-mca-cyan uppercase tracking-widest font-bold">
                RESTRICTED CONSOLE
              </div>
              <h2 className="text-xl font-bold font-display uppercase tracking-tight text-white">
                Admin Unlock (AA)
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Enter your admin passkey to reveal submitter email addresses, change request statuses, and publish AA dev notes.
              </p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              {loginError && (
                <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 text-xs font-mono">
                  [ERROR] {loginError}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                  Admin Passkey
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter passkey..."
                  value={loginPasskeyInput}
                  onChange={(e) => setLoginPasskeyInput(e.target.value)}
                  className="w-full bg-black border border-white/30 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-mca-cyan font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminLoginOpen(false)}
                  className="px-4 py-2 border border-white/20 text-slate-300 text-xs uppercase font-bold tracking-wider hover:border-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-mca-cyan text-black text-xs uppercase font-bold tracking-wider hover:bg-white transition-colors"
                >
                  Unlock Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submission Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#0e0e0e] border-2 border-white p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-lg p-2"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="space-y-2 border-b border-white/20 pb-4">
              <div className="text-[10px] font-mono text-mca-cyan uppercase tracking-widest font-bold">
                NEW PROPOSAL
              </div>
              <h2 className="text-2xl font-bold font-display uppercase tracking-tight text-white">
                Submit a Feature Request or Change
              </h2>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                Have an idea for <span className="text-white font-mono">lakehouse.wolfsonian.org</span> or{" "}
                <span className="text-white font-mono">metabase.wolfsonian.org</span>? Fill out the details below.
                All entries are reviewed and tracked.
              </p>
            </div>

            {/* Success Toast */}
            {submitSuccess ? (
              <div className="p-8 text-center bg-emerald-950/60 border-2 border-emerald-500 space-y-3">
                <div className="text-4xl">✓</div>
                <div className="text-lg font-bold text-white uppercase font-display">
                  Feature Request Submitted!
                </div>
                <p className="text-xs text-emerald-300 font-mono">
                  Thank you! Your suggestion has been added to the board under review.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {submitError && (
                  <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 text-xs font-mono">
                    [ERROR] {submitError}
                  </div>
                )}

                {/* Submitter Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                      Your Name <span className="text-mca-cyan">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nicolaus B. or Curatorial Staff"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-black border border-white/30 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-mca-cyan font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                      Your Email <span className="text-mca-cyan">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="name@fiu.edu"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-black border border-white/30 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-mca-cyan font-mono"
                    />
                    <span className="block text-[9px] text-slate-500 font-sans">
                      Never displayed publicly; used solely for notification updates.
                    </span>
                  </div>
                </div>

                {/* System & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                      Target System
                    </label>
                    <select
                      value={formSystem}
                      onChange={(e: any) => setFormSystem(e.target.value)}
                      className="w-full bg-black border border-white/30 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-mca-cyan font-mono uppercase cursor-pointer"
                    >
                      <option value="lakehouse">Wolfsonian Lakehouse Explorer</option>
                      <option value="metabase">Metabase Analytics BI</option>
                      <option value="pipeline">Data Pipeline & Ingestion</option>
                      <option value="general">General / Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                      Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-black border border-white/30 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-mca-cyan font-mono uppercase cursor-pointer"
                    >
                      {CATEGORIES.filter((c) => c !== "All Categories").map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Feature Title */}
                <div className="space-y-1.5">
                  <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                    Feature Summary / Title <span className="text-mca-cyan">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Add 3D Model Visualizer for Sculptural Works"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full bg-black border border-white/30 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-mca-cyan font-mono"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-xs uppercase tracking-wider font-bold text-slate-300">
                    Detailed Request / Use Case <span className="text-mca-cyan">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe the requested feature, behavior, or bug fix. What problem does this solve? How will this improve your workflow?"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-black border border-white/30 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-mca-cyan font-mono font-sans"
                  />
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 border border-white/20 text-slate-300 text-xs uppercase font-bold tracking-wider hover:border-white hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-mca-cyan text-black text-xs uppercase font-bold tracking-wider hover:bg-white transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Feature Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
