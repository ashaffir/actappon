import axios from 'axios';
import { clsx } from 'clsx';
import { AlertCircle, AlertTriangle, BarChart2, Check, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function PostManager() {
    const [activeTab, setActiveTab] = useState('list'); // 'list' or 'stats' or 'check'
    
    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Post Manager</h1>
                <div className="flex bg-surface p-1 rounded-lg border border-white/5">
                   {['list', 'stats', 'check'].map(tab => (
                       <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                "px-4 py-2 rounded text-sm font-medium transition-colors capitalize",
                                activeTab === tab ? "bg-primary text-white" : "text-muted hover:text-white"
                            )}
                       >
                           {tab === 'check' ? 'Dup. Checker' : tab}
                       </button>
                   ))}
                </div>
            </header>

            {activeTab === 'list' && <PostsList />}
            {activeTab === 'stats' && <ActivityStats />}
            {activeTab === 'check' && <DuplicationChecker />}
        </div>
    );
}

function PostsList() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        axios.get(`${API_URL}/posts/all`).then(res => {
            setPosts(res.data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const filtered = posts.filter(p => p.content.toLowerCase().includes(search.toLowerCase()) || p.platform.includes(search.toLowerCase()));

    if(loading) return <div className="text-muted">Loading posts...</div>;

    return (
        <div className="space-y-4">
             <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                <input 
                    className="w-full bg-surface border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white focus:border-primary outline-none"
                    placeholder="Search posts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="bg-surface rounded-lg border border-white/5 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-black/20 text-muted uppercase text-xs font-bold">
                        <tr>
                            <th className="p-4">Platform</th>
                            <th className="p-4">Content Preview</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filtered.map(post => (
                            <tr key={post.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 font-bold capitalize text-gray-300">{post.platform}</td>
                                <td className="p-4 max-w-md truncate text-gray-400 font-mono text-xs">{post.content}</td>
                                <td className="p-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded text-xs font-bold uppercase",
                                        post.status === 'approved' ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                                    )}>
                                        {post.status}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500">{new Date(post.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan="4" className="p-8 text-center text-muted italic">No posts found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ActivityStats() {
    const [data, setData] = useState([]);
    
    useEffect(() => {
        axios.get(`${API_URL}/posts/activity?days=14`).then(res => setData(res.data));
    }, []);

    if(data.length === 0) return <div className="text-muted">Loading stats...</div>;

    // Simple max for scaling
    const maxVal = Math.max(...data.map(d => Object.values(d.stats).reduce((a, b) => a + b, 0)), 5);

    return (
        <div className="space-y-6">
             <div className="bg-surface p-6 rounded-lg border border-white/5">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <BarChart2 className="text-primary" /> 
                    Post Activity (Last 14 Days)
                </h3>
                
                <div className="flex justify-between h-64 gap-2 items-stretch">
                    {data.map((day, idx) => {
                         const total = Object.values(day.stats).reduce((a, b) => a + b, 0);
                         const height = (total / maxVal) * 100;
                         
                         return (
                             <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group relative justify-end">
                                 {/* Tooltip */}
                                 <div className="absolute bottom-full mb-2 bg-black text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 whitespace-nowrap left-1/2 -translate-x-1/2">
                                     <div className="font-bold">{day.date}</div>
                                     {Object.entries(day.stats).map(([k, v]) => v > 0 && <div key={k} className="capitalize">{k}: {v}</div>)}
                                 </div>
                                 
                                 <div className="w-full bg-white/5 rounded-t-sm flex flex-col-reverse overflow-hidden relative" style={{ height: '100%' }}>
                                     {/* Stacked bars */}
                                     {Object.entries(day.stats).map(([plat, count], i) => {
                                         if(count === 0) return null;
                                         const h = (count / maxVal) * 100;
                                         const color = plat === 'twitter' ? 'bg-blue-400' : plat === 'linkedin' ? 'bg-blue-600' : 'bg-orange-400';
                                         return (
                                             <div key={plat} style={{ height: `${h}%` }} className={clsx(color, "w-full transition-all hover:opacity-80")} />
                                         )
                                     })}
                                 </div>
                                 <div className="text-[10px] text-muted -rotate-45 mt-2 origin-top-left translate-y-2">{day.date.slice(5)}</div>
                             </div>
                         )
                    })}
                </div>
            </div>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                {['linkedin', 'twitter', 'blog'].map(plat => {
                    const total = data.reduce((acc, curr) => acc + (curr.stats[plat] || 0), 0);
                     return (
                         <div key={plat} className="bg-surface p-6 rounded-lg border border-white/5">
                             <div className="text-sm text-muted uppercase tracking-wider mb-2 font-bold">{plat}</div>
                             <div className="text-3xl font-bold">{total}</div>
                             <div className="text-xs text-muted mt-1">posts in last 14d</div>
                         </div>
                     )
                })}
            </div>
        </div>
    )
}

function DuplicationChecker() {
    const [content, setContent] = useState("");
    const [platform, setPlatform] = useState("linkedin");
    const [result, setResult] = useState(null);
    const [checking, setChecking] = useState(false);

    const check = async () => {
        if(!content) return;
        setChecking(true);
        try {
            const res = await axios.post(`${API_URL}/posts/check-duplication`, { platform, content });
            setResult(res.data);
        } catch(e) {
            console.error(e);
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-surface p-8 rounded-lg border border-white/5">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <AlertCircle className="text-yellow-400" />
                Duplication Check
            </h3>
            
            <div className="space-y-4">
                 <div>
                    <label className="block text-xs uppercase font-bold text-muted mb-2">Platform</label>
                    <div className="flex gap-2">
                        {['linkedin', 'twitter', 'blog'].map(p => (
                            <button
                                key={p}
                                onClick={() => { setPlatform(p); setResult(null); }}
                                className={clsx(
                                    "px-4 py-2 rounded border transition-colors capitalize",
                                    platform === p ? "bg-primary border-primary text-white" : "border-white/10 hover:border-white/30 text-muted"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs uppercase font-bold text-muted mb-2">Content to Check</label>
                    <textarea 
                        value={content}
                        onChange={e => { setContent(e.target.value); setResult(null); }}
                        className="w-full h-40 bg-black/20 rounded p-4 border border-white/10 focus:border-primary outline-none text-sm font-mono"
                        placeholder="Paste content here..."
                    />
                </div>
                
                <button 
                    onClick={check} 
                    disabled={!content || checking}
                    className="w-full py-3 bg-white text-black font-bold rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                    {checking ? "Checking..." : "Check for Duplicates"}
                </button>

                {result && (
                    <div className={clsx(
                        "p-4 rounded border mt-4 animate-in fade-in slide-in-from-top-2",
                        result.is_duplicate ? "bg-red-500/10 border-red-500/50 text-red-200" : "bg-green-500/10 border-green-500/50 text-green-200"
                    )}>
                        {result.is_duplicate ? (
                             <div className="flex items-start gap-3">
                                 <AlertTriangle className="shrink-0" />
                                 <div>
                                     <div className="font-bold">Duplicate Detected!</div>
                                     <div className="text-sm mt-1">This content was already posted on {new Date(result.created_at).toLocaleString()} (ID: {result.existing_id}).</div>
                                 </div>
                             </div>
                        ) : (
                             <div className="flex items-center gap-3">
                                 <Check className="shrink-0" />
                                 <div className="font-bold">No Duplicates Found</div>
                             </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
