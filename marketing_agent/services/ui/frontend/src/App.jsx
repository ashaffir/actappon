import axios from 'axios';
import clsx from 'clsx';
import { Calendar, Check, ChevronRight, Copy, History, Inbox, LayoutDashboard, Lightbulb, LogOut, MessageSquare, Settings, Terminal, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import CommentGenerator from './CommentGenerator';
import { ModalProvider, useModal } from './ModalContext';
import PostManager from './PostManager';
import PostsGenerator from './PostsGenerator';
import SuggestionsHistory from './SuggestionsHistory';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_TOKEN_KEY = 'msoa_auth_token';

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
};

function App() {
  const [authToken, setAuthTokenState] = useState(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    setAuthToken(token);
    return token;
  });

  useEffect(() => {
    setAuthToken(authToken);
  }, [authToken]);

  const handleLogin = (token) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthToken(token);
    setAuthTokenState(token);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
    setAuthTokenState(null);
  };

  return (
    <ModalProvider>
      {authToken ? (
        <BrowserRouter>
        <div className="flex min-h-screen bg-background text-text font-sans">
            <Sidebar onLogout={handleLogout} />
            <main className="flex-1 p-8 overflow-y-auto">
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<InboxView />} />
                <Route path="/inbox/:id" element={<DetailView />} />
                <Route path="/history" element={<HistoryView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/posts" element={<PostsGenerator />} />
                <Route path="/post-manager" element={<PostManager />} />
                <Route path="/suggestions" element={<SuggestionsHistory />} />
                <Route path="/comments" element={<CommentGenerator />} />
            </Routes>
            </main>
        </div>
        </BrowserRouter>
      ) : (
        <LoginView onLogin={handleLogin} />
      )}
    </ModalProvider>
  );
}

function LoginView({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { username, password });
      onLogin(res.data.token);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface border border-white/10 rounded-lg p-8 space-y-5">
        <div className="flex items-center gap-3">
          <Terminal className="text-primary" size={28} />
          <div>
            <h1 className="text-xl font-bold">MSOA Console</h1>
            <p className="text-xs text-muted uppercase tracking-wider">Admin Access</p>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold text-muted mb-2">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-gray-200 outline-none focus:border-primary"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-xs uppercase font-bold text-muted mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-gray-200 outline-none focus:border-primary"
            autoComplete="current-password"
          />
        </div>
        {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded p-3">{error}</div>}
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-3 rounded bg-primary text-white font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

function Sidebar({ onLogout }) {
  const location = useLocation();
  const menu = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Inbox, label: 'Inbox', path: '/inbox' },
    { icon: History, label: 'History', path: '/history' },
    { icon: MessageSquare, label: 'Posts Gen', path: '/posts' },
    { icon: Calendar, label: 'Post Manager', path: '/post-manager' },
    { icon: Lightbulb, label: 'Suggestions', path: '/suggestions' },
    { icon: MessageSquare, label: 'Comments', path: '/comments' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="w-64 border-r border-surface flex flex-col p-4 bg-surface/30">
        <div className="flex items-center gap-2 mb-8 px-2">
            <Terminal className="text-primary w-6 h-6" />
            <h1 className="font-bold text-xl">MSOA Console</h1>
        </div>
        <nav className="space-y-1">
            {menu.map(item => (
                <Link 
                    key={item.path} 
                    to={item.path}
                    className={clsx(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                        location.pathname === item.path ? "bg-primary/20 text-primary border border-primary/20" : "text-muted hover:text-white hover:bg-white/5"
                    )}
                >
                    <item.icon size={20} />
                    <span className="font-medium">{item.label}</span>
                </Link>
            ))}
        </nav>
        <div className="mt-auto px-4 text-xs text-muted">
            <button onClick={onLogout} className="flex items-center gap-2 text-muted hover:text-white transition-colors mb-4">
                <LogOut size={14} />
                Sign out
            </button>
            v1.1.0 (Vertex AI)
        </div>
    </div>
  );
}




const ServiceCard = ({ name, data, onRunCollector }) => {
    const isRunning = data?.status === 'RUNNING';
    const desired = data?.desired_state || 'RUNNING';
    
    let displayStatus = data?.status || "UNKNOWN";
    let statusColor = "text-gray-400";
    let dotColor = "bg-gray-500";

    if (desired === 'STOPPED' && isRunning) {
        displayStatus = "STOPPING...";
        statusColor = "text-red-400";
        dotColor = "bg-red-500 animate-pulse";
    } else if (desired === 'PAUSED' && isRunning) {
        displayStatus = "PAUSING...";
        statusColor = "text-yellow-400";
        dotColor = "bg-yellow-500 animate-pulse";
    } else if (data?.status === 'PAUSED') {
        displayStatus = "PAUSED";
        statusColor = "text-yellow-400";
        dotColor = "bg-yellow-500";
    } else if (isRunning) {
        displayStatus = "RUNNING";
        statusColor = "text-green-400";
        dotColor = "bg-green-500 animate-pulse";
    } else if (desired === 'STOPPED') {
         displayStatus = "STOPPED";
         statusColor = "text-red-400";
         dotColor = "bg-red-500";
    }

    return (
        <div className="bg-surface p-6 rounded-lg border border-surface flex flex-col h-64 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="uppercase text-xs font-bold text-muted mb-1">{name}</div>
                    <div className="flex items-center gap-2">
                         <div className={clsx("w-2 h-2 rounded-full", dotColor)} />
                        <span className={clsx("font-bold", statusColor)}>{displayStatus}</span>
                    </div>
                </div>
                 <div className="flex gap-1">
                    {name === 'collector' && (
                         <button 
                            onClick={onRunCollector}
                            disabled={isRunning || desired !== 'RUNNING'}
                            className={clsx("p-1.5 rounded hover:bg-white/10 text-blue-400", (isRunning || desired !== 'RUNNING') && "opacity-50 cursor-not-allowed")} 
                            title="Run Harvest Now"
                        >
                            <ChevronRight size={16} />
                         </button>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-black/30 rounded p-3 font-mono text-xs text-gray-400 overflow-y-auto whitespace-pre-wrap">
                {data?.message || "No logs yet..."}
            </div>
             <div className="text-[10px] text-muted mt-2 text-right">
                Last update: {data?.last_run ? new Date(data.last_run).toLocaleString() : 'Never'}
            </div>
        </div>
    );
};

function Dashboard() {
    const [stats, setStats] = useState(null);
    const [systemStatus, setSystemStatus] = useState(null);
    const [postStats, setPostStats] = useState(null);
    const { showConfirm, showAlert } = useModal();

    const loadData = () => {
        axios.get(`${API_URL}/dashboard/metrics`).then(res => setStats(res.data)).catch(console.error);
        axios.get(`${API_URL}/dashboard/services`).then(res => setSystemStatus(res.data)).catch(console.error);
        axios.get(`${API_URL}/generated-posts/stats`).then(res => setPostStats(res.data)).catch(console.error);
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleRunCollector = async () => {
        try {
            await axios.post(`${API_URL}/system/run/collector`);
            loadData();
        } catch (e) {
            showAlert("Failed to trigger");
        }
    };

    const executeGlobalControl = async (action) => {
        try {
            await axios.post(`${API_URL}/system/global/control`, { action });
            loadData();
        } catch (e) {
            console.error(e);
            showAlert(`Failed to ${action} system`);
        }
    };

    const confirmAction = async (action) => {
        let title, content, confirmText;
        if (action === "START") {
            title = "Start All Services";
            content = "This will start all system services (Collector, LLM, Executor). Are you sure?";
            confirmText = "Start System";
        } else if (action === "PAUSE") {
            title = "Pause System";
            content = "This will pause all services. Ongoing tasks may finish before pausing. Continue?";
            confirmText = "Pause All";
        } else if (action === "RESUME") {
             title = "Resume System";
             content = "This will resume all services from their paused state.";
             confirmText = "Resume All";
        } else if (action === "STOP") {
            title = "Stop System";
            content = "This will stop all services. This effectively halts the agent. You can restart it later.";
            confirmText = "Stop Everything";
        }

        const confirmed = await showConfirm(content, title, confirmText);
        if (confirmed) {
            executeGlobalControl(action);
        }
    };


    if (!stats) return <div>Loading dashboard...</div>;

    const cards = [
        { label: 'Pending Review', value: stats.pending_review, color: 'text-yellow-400' },
        { label: 'Approved', value: stats.approved, color: 'text-green-400' },
        { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
    ];

    // --- Global State Logic ---
    const services = ['collector', 'llm', 'executor'];
    const serviceStates = services.map(s => systemStatus?.[s]?.desired_state || 'STOPPED');
    
    const allStopped = serviceStates.every(s => s === 'STOPPED');
    const allPaused = serviceStates.every(s => s === 'PAUSED');
    const anyRunning = serviceStates.some(s => s === 'RUNNING');
    
    // Logic:
    // RUNNING: If any service is running (or intended to run)
    // PAUSED: If all are paused (and nothing is running)
    // STOPPED: If all are stopped
    
    let globalState = "STOPPED";
    if (anyRunning) globalState = "RUNNING";
    else if (allPaused) globalState = "PAUSED";


    return (
        <div className="space-y-8 relative">

            
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">System Dashboard</h2>
                
                {/* Global Controls */}
                <div className="flex bg-surface rounded-lg p-1 border border-surface">
                    
                    {/* Start Button: Active only if completely stopped */}
                    <button 
                        onClick={() => confirmAction("START")} 
                        disabled={globalState !== 'STOPPED'}
                        className={clsx(
                            "px-4 py-2 rounded flex items-center gap-2 font-medium transition-all",
                            globalState === 'STOPPED' 
                                ? "hover:bg-white/5 text-green-400" 
                                : "opacity-30 cursor-not-allowed text-gray-500"
                        )}
                    >
                        <ChevronRight size={18} /> Start All
                    </button>

                    <div className="w-[1px] bg-white/10 my-1 mx-1" />
                    
                    {/* Pause/Resume Button */}
                    {globalState === 'PAUSED' ? (
                         <button 
                            onClick={() => confirmAction("RESUME")} 
                            className="px-4 py-2 rounded hover:bg-white/5 text-green-400 flex items-center gap-2 font-medium"
                        >
                             <div className="w-4 h-4 flex items-center justify-center">
                                 <ChevronRight size={18} />
                             </div>
                             Resume All
                        </button>
                    ) : (
                         <button 
                            onClick={() => confirmAction("PAUSE")} 
                            disabled={globalState !== 'RUNNING'}
                            className={clsx(
                                "px-4 py-2 rounded flex items-center gap-2 font-medium transition-all",
                                globalState === 'RUNNING'
                                    ? "hover:bg-white/5 text-yellow-400"
                                    : "opacity-30 cursor-not-allowed text-gray-500"
                            )}
                        >
                            <div className="w-4 h-4 flex items-center justify-center gap-[2px]">
                                <div className="w-1 h-3 bg-current rounded-sm"/>
                                <div className="w-1 h-3 bg-current rounded-sm"/>
                            </div>
                            Pause All
                        </button>
                    )}

                    <div className="w-[1px] bg-white/10 my-1 mx-1" />
                    
                     {/* Stop Button: Active if RUNNING or PAUSED */}
                     <button 
                        onClick={() => confirmAction("STOP")} 
                        disabled={globalState === 'STOPPED'}
                        className={clsx(
                            "px-4 py-2 rounded flex items-center gap-2 font-medium transition-all",
                            (globalState === 'RUNNING' || globalState === 'PAUSED')
                                ? "hover:bg-white/5 text-red-400"
                                : "opacity-30 cursor-not-allowed text-gray-500"
                        )}
                    >
                        <div className="w-3 h-3 bg-current rounded-sm" /> Stop All
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
                {cards.map(c => (
                    <div key={c.label} className="bg-surface p-6 rounded-lg border border-surface">
                        <div className="text-sm text-muted mb-2 uppercase tracking-wider">{c.label}</div>
                        <div className={`text-4xl font-bold ${c.color}`}>{c.value}</div>
                    </div>
                ))}
            </div>

            <h3 className="text-lg font-bold text-white/50 mt-8 mb-4">Service Status</h3>
             <div className="grid grid-cols-3 gap-6">
                 {['collector', 'llm', 'executor'].map(service => (
                     <ServiceCard key={service} name={service} data={systemStatus?.[service]} onRunCollector={handleRunCollector} />
                 ))}
             </div>

            <h3 className="text-lg font-bold text-white/50 mt-8 mb-4">LLM Analytics</h3>
            <div className="grid grid-cols-3 gap-4 mb-8">
                 <div className="bg-surface p-6 rounded-lg border border-surface">
                    <div className="text-sm text-muted mb-2 uppercase tracking-wider">Active Model</div>
                    <div className="text-xl font-bold font-mono text-purple-400 truncate" title={stats.llm_stats?.current_model}>{stats.llm_stats?.current_model || "N/A"}</div>
                 </div>
                 <div className="bg-surface p-6 rounded-lg border border-surface">
                    <div className="text-sm text-muted mb-2 uppercase tracking-wider">Last Run Tokens</div>
                    <div className="text-3xl font-bold text-white">{stats.llm_stats?.last_run_tokens?.toLocaleString() || 0}</div>
                 </div>
                 <div className="bg-surface p-6 rounded-lg border border-surface">
                    <div className="text-sm text-muted mb-2 uppercase tracking-wider">14d Token Usage</div>
                    <div className="text-3xl font-bold text-white">{stats.llm_stats?.accumulated_14d_tokens?.toLocaleString() || 0}</div>
                 </div>
            </div>

            {postStats && (
                <>
                <h3 className="text-lg font-bold text-white/50 mt-8 mb-4">Content Stats</h3>
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {Object.entries(postStats).map(([platform, data]) => (
                        <div key={platform} className="bg-surface p-6 rounded-lg border border-surface">
                            <div className="text-sm text-muted mb-2 uppercase tracking-wider">{platform}</div>
                            <div className="text-2xl font-bold text-white mb-1">{data.approved_count} Approved</div>
                             <div className="text-xs text-muted">
                                {data.last_approved_at ? `Last: ${new Date(data.last_approved_at).toLocaleDateString()}` : "No posts yet"}
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}
        </div>
    );
}

function SettingsView() {
  const [settings, setSettings] = useState({});
  const [changed, setChanged] = useState({});
  const [ragDocs, setRagDocs] = useState([]);
  const [newRagContent, setNewRagContent] = useState("");
  const [newRagFilename, setNewRagFilename] = useState("");
  const { showAlert } = useModal();

  useEffect(() => {
    fetchSettings();
    fetchRagDocs();
  }, []);

  const fetchSettings = () => {
    axios.get(`${API_URL}/settings`).then(r => setSettings(r.data));
  };

  const fetchRagDocs = () => {
    axios.get(`${API_URL}/rag/documents`).then(r => setRagDocs(r.data));
  };

  const handleChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    setChanged(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e) => {
    if(e) e.preventDefault();
    try {
      await axios.post(`${API_URL}/settings`, changed);
      showAlert("Settings saved successfully!", "Success");
      setChanged({});
    } catch (e) {
      showAlert("Failed to save settings.");
    }
  };

  const handleAddRag = async () => {
      if(!newRagFilename || !newRagContent) return showAlert("Please provide filename and content.");
      try {
          const res = await axios.post(`${API_URL}/rag/documents`, { filename: newRagFilename, content: newRagContent});
          setNewRagContent("");
          setNewRagFilename("");
          fetchSettings();
          fetchRagDocs();
          const count = Object.keys(res.data.applied_settings || {}).length;
          showAlert(count ? `Document added and ${count} settings updated.` : "Document added to RAG context.", "Success");
      } catch(e) {
          showAlert("Failed to add document.");
      }
  };

  const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target.result;
          setNewRagContent(content);
          setNewRagFilename(file.name);
      };
      reader.readAsText(file);
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Col 1: General Settings */}
      <div className="bg-surface p-8 rounded-lg border border-white/5 space-y-6">
        <h2 className="text-2xl font-bold mb-4">System Configuration</h2>
        <div className="space-y-4">
          {Object.entries(settings).map(([key, val]) => (
            <div key={key}>
              <label className="block text-xs uppercase font-bold text-muted mb-1">{key.replace(/_/g, " ")}</label>
              <input 
                type="text" 
                value={val} 
                onChange={e => handleChange(key, e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-gray-200 outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>
        <div className="pt-4 flex justify-end">
             <button 
                onClick={handleSave}
                disabled={Object.keys(changed).length === 0}
                className="px-6 py-2 bg-primary text-white font-bold rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
                Save Configuration
            </button>
        </div>
      </div>

      {/* Col 2: RAG Mgmt */}
      <div className="space-y-6">
          <div className="bg-surface p-8 rounded-lg border border-white/5">
                <h2 className="text-2xl font-bold mb-4">RAG Context Documents</h2>
                <div className="space-y-4 mb-8">
                     <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center hover:border-primary/50 transition-colors relative group">
                        <input 
                            type="file" 
                            onChange={handleFileUpload} 
                            accept=".txt,.md,.json,.csv"
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        />
                        <div className="pointer-events-none group-hover:scale-105 transition-transform duration-200">
                            <Upload className="mx-auto text-gray-400 mb-3 group-hover:text-primary transition-colors" size={32} />
                            <p className="text-sm font-bold text-white mb-1">Click or Drag to Upload File</p>
                            <p className="text-xs text-muted">Supports .txt, .md, .json</p>
                        </div>
                     </div>

                     {(newRagFilename || newRagContent) && (
                         <div className="bg-black/20 p-4 rounded border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className="flex justify-between items-start mb-2">
                                 <div>
                                     <span className="text-xs uppercase font-bold text-muted">Selected File</span>
                                     <div className="text-sm font-mono text-primary font-bold">{newRagFilename}</div>
                                 </div>
                                 <button onClick={() => { setNewRagFilename(""); setNewRagContent(""); }} className="text-gray-500 hover:text-white">
                                     <X size={14} />
                                 </button>
                             </div>
                             <div className="text-xs text-gray-400 font-mono line-clamp-3 bg-black/40 p-2 rounded">
                                 {newRagContent.slice(0, 300)}...
                             </div>
                              <button onClick={handleAddRag} className="w-full mt-3 py-2 bg-primary hover:bg-blue-600 text-white rounded font-bold text-sm transition-colors shadow-lg shadow-blue-900/20">
                                Confirm & Add to Context
                            </button>
                         </div>
                     )}
                </div>

                <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-muted block mb-2">Active Documents</label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {ragDocs.map(doc => (
                            <div key={doc.id} className="flex justify-between items-center p-3 bg-black/20 rounded border border-white/5 hover:border-white/10">
                                <div>
                                    <p className="text-sm font-medium text-blue-300">{doc.filename}</p>
                                    <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                                </div>
                                <button onClick={() => handleDeleteRag(doc.id)} className="text-red-400 hover:text-red-300 p-1">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {ragDocs.length === 0 && <p className="text-sm text-gray-600 italic">No custom documents added.</p>}
                    </div>
                </div>
          </div>
      </div>
    </div>
  );
}

function InboxView() {
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingAll, setRejectingAll] = useState(false);
  const { showConfirm, showAlert } = useModal();

  useEffect(() => {
    fetchOpps();
    const interval = setInterval(fetchOpps, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchOpps = async () => {
    try {
      const res = await axios.get(`${API_URL}/opportunities?status=pending`);
      setOpps(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAll = async () => {
    const confirmed = await showConfirm(
      `Reject all ${opps.length} pending inbox entries?`,
      "Reject All",
      "Reject All"
    );
    if (!confirmed) return;

    setRejectingAll(true);
    try {
      await axios.post(`${API_URL}/opportunities/reject-all`);
      setOpps([]);
    } catch (e) {
      console.error(e);
      showAlert("Failed to reject inbox entries.", "Error");
    } finally {
      setRejectingAll(false);
    }
  };

  if (loading) return <div>Loading inbox...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold">Inbox ({opps.length})</h2>
        <button
          onClick={handleRejectAll}
          disabled={opps.length === 0 || rejectingAll}
          className="px-4 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
        >
          <Trash2 size={16} />
          {rejectingAll ? "Rejecting..." : "Reject All"}
        </button>
      </div>
      {opps.length === 0 ? (
        <div className="text-muted italic bg-surface p-8 rounded-lg text-center">No pending opportunities. Great job!</div>
      ) : (
        <div className="grid gap-3">
          {opps.map(opp => (
            <Link 
              key={opp.id}
              to={`/inbox/${opp.id}`}
              className="bg-surface p-4 rounded-lg border border-surface hover:border-primary/50 cursor-pointer transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="font-medium text-lg text-white group-hover:text-primary transition-colors">
                  {opp.title}
                </div>
                <div className="text-sm text-muted flex items-center gap-2 mt-1">
                  <span className="uppercase text-xs tracking-wider font-bold text-gray-500">{opp.source}</span>
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-400">ID: {opp.id}</span>
                  {opp.search_query && <span className="text-xs bg-black/20 px-2 py-0.5 rounded text-gray-400">"{opp.search_query}"</span>}
                  <span>•</span>
                  <span>Score: {(opp.signal_strength * 100).toFixed(0)}</span>
                </div>
              </div>
              <ChevronRight className="text-muted group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailView() {
  const { id } = useParams(); // Need to import useParams
  // ... Detail View Logic needs to be adapted to fetch ID from URL
  // Simplified for brevity - in real world I'd refactor DetailView to take ID from params
  // Let's implement basics
  const [data, setData] = useState(null);
  // ...
  // Wait, I can't put full component here in limited thinking block step.
  // I will assume I need to implement a hook wrapper or modify DetailView above.
  return <DetailViewContent id={id} />;
}

// Wrapper to use params

const copyToClipboard = async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    } else {
        // Fallback for non-secure contexts or browsers without Clipboard API
        return new Promise((resolve, reject) => {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) resolve();
                else reject(new Error("document.execCommand('copy') failed"));
            } catch (err) {
                reject(err);
            }
        });
    }
};

function DetailViewContent({ id }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [editedContent, setEditedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { showConfirm, showPrompt, showAlert } = useModal();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/opportunities/${id}`);
        setData(res.data);
        if (res.data.drafts && res.data.drafts.length > 0) {
            setSelectedDraft(res.data.drafts[0]);
            setEditedContent(res.data.drafts[0].content);
        }
      } catch (e) {
          console.error(e);
      }
    };
    load();
  }, [id]);

  const handleApprove = async () => {
    const confirmed = await showConfirm("Are you sure you want to approve this opportunity?", "Confirm Approval");
    if (!confirmed) return;
    try {
      await axios.post(`${API_URL}/opportunities/${id}/approve`, {
        draft_id: selectedDraft.id,
        edited_content: editedContent
      });
      navigate('/inbox');
    } catch (e) {
      showAlert("Error approving", "Error");
    }
  };

  const handleReject = async () => {
    const reason = await showPrompt("Please enter the reason for rejection:", "Reject Opportunity");
    if (!reason) return;
    try {
      await axios.post(`${API_URL}/opportunities/${id}/reject`, { reason });
      navigate('/inbox');
    } catch (e) {
      showAlert("Error rejecting", "Error");
    }
  };

  if (!data) return <div>Loading detail...</div>;

  return (
    <div className="space-y-6">
      <Link to="/inbox" className="text-sm text-muted hover:text-white mb-2 inline-flex items-center gap-1">&larr; Back to Inbox</Link>
      
      {/* Header */}
      <div className="border-b border-surface pb-6">
        <div className="flex items-start justify-between">
            <h2 className="text-2xl font-bold flex-1 mr-4">{data.title}</h2>
            <div className="flex gap-2">
                <button onClick={handleReject} className="px-4 py-2 rounded bg-surface text-red-400 hover:bg-red-400/10 flex items-center gap-2">
                    <X size={18} /> Reject
                </button>
                <button onClick={handleApprove} className="px-4 py-2 rounded bg-primary text-white hover:bg-blue-600 flex items-center gap-2 font-medium">
                    <Check size={18} /> Approve
                </button>
            </div>
        </div>
        {/* ... Metadata ... */}
        <div className="mt-2 text-muted flex gap-4 text-sm">
            <span className="bg-white/10 px-2 rounded text-xs py-0.5 flex items-center">ID: {data.id}</span>
            <a href={data.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">View Source</a>
            {data.search_query && <span>From: "{data.search_query}"</span>}
            <span>•</span>
            <span>Signal: {(data.signal_strength * 100).toFixed(0)}%</span>
        </div>
      </div>

       <div className="grid grid-cols-2 gap-8">
        {/* Left Col: Analysis & Content */}
        <div className="space-y-6">
            <div className="bg-surface rounded-lg p-4">
                <h3 className="font-semibold mb-2 text-sm uppercase text-muted">Analysis</h3>
                <p className="text-sm leading-relaxed">{data.analysis_summary}</p>
            </div>

            <div className="bg-surface rounded-lg p-4 opacity-75">
                <h3 className="font-semibold mb-2 text-sm uppercase text-muted">Raw Context</h3>
                <div className="text-xs font-mono whitespace-pre-wrap h-64 overflow-y-auto text-gray-400">
                    {data.raw_content.slice(0, 1000)}...
                </div>
            </div>
        </div>

        {/* Right Col: Drafts */}
        <div className="bg-surface rounded-lg p-4 flex flex-col h-full">
            <h3 className="font-semibold mb-4 text-sm uppercase text-muted flex items-center gap-2">
                <MessageSquare size={16} />
                Draft Response
             </h3>
             <button
                onClick={() => {
                    copyToClipboard(editedContent)
                        .then(() => {
                             setCopied(true);
                             setTimeout(() => setCopied(false), 1000);
                        })
                        .catch(err => {
                            console.error("Failed to copy:", err);
                            // Optional: Show fallback alert if even fallback fails, but for now just logging.
                            // alert("Failed to copy to clipboard");
                        });
                }}
                className="p-2 rounded hover:bg-white/10 text-primary transition-colors mb-4 ml-auto flex items-center gap-2"
                title="Copy to Clipboard"
             >
                {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
             </button>
             
             {/* Draft Tabs */}
             <div className="flex gap-2 mb-4">
                {data.drafts && data.drafts.map(draft => (
                    <button
                        key={draft.id}
                        onClick={() => { setSelectedDraft(draft); setEditedContent(draft.content); setIsEditing(false); }}
                        className={clsx(
                            "px-3 py-1 rounded text-sm transition-colors",
                            selectedDraft?.id === draft.id ? "bg-primary text-white" : "bg-black/20 text-muted hover:bg-black/40"
                        )}
                    >
                        Variant {draft.variant_name}
                    </button>
                ))}
             </div>

             {/* Editor */}
             <div className="flex-1">
                <textarea
                    value={editedContent}
                    onChange={(e) => { setEditedContent(e.target.value); setIsEditing(true); }}
                    className="w-full h-full min-h-[300px] bg-black/20 rounded p-4 text-sm text-text border border-transparent focus:border-primary/50 outline-none resize-none font-mono leading-relaxed"
                />
             </div>
        </div>
      </div>
    </div>
  );
}

function HistoryView() {
    const [history, setHistory] = useState([]);
    useEffect(() => {
        axios.get(`${API_URL}/history`).then(res => setHistory(res.data));
    }, []);

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Actions Log</h2>
            <div className="grid gap-2">
                {history.map(item => (
                    <div key={item.id} className="bg-surface p-4 rounded flex flex-col gap-2 opacity-75 hover:opacity-100 transition-opacity">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-medium flex items-center gap-2">
                                    <span className="text-muted text-sm font-mono">[#{item.id}]</span>
                                    <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                                        {item.title}
                                    </a>
                                </div>
                                <div className="text-xs text-muted mt-1">Processed: {new Date(item.updated_at).toLocaleString()}</div>
                            </div>
                            <div className={clsx(
                                "px-2 py-1 rounded text-xs font-bold uppercase",
                                item.status === 'approved' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}>
                                {item.status}
                            </div>
                        </div>
                        {/* Error Message */}
                        {item.error_log && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-2 rounded mt-2 font-mono whitespace-pre-wrap">
                                <span className="font-bold">Execution Failed:</span> {item.error_log}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}



export default App;
