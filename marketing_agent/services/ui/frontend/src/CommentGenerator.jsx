import axios from 'axios';
import { Copy, History, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useModal } from './ModalContext';
import { copyToClipboard } from './utils';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const PLATFORMS = ["LinkedIn", "Twitter/X", "Reddit", "Facebook", "Instagram", "Blog Comments"];
const TONES = [
    "Professional", "Supportive", "Contrarian", 
    "Inquisitive", "Witty/Humorous", "Concise", 
    "Detailed", "Empathetic"
];
const LANGUAGE_OPTIONS = ["English", "Hebrew"];

export default function CommentGenerator() {
    // Inputs
    const [targetContent, setTargetContent] = useState("");
    const [targetUrl, setTargetUrl] = useState("");
    const [platform, setPlatform] = useState("LinkedIn");
    const [tone, setTone] = useState("Professional");
    const [language, setLanguage] = useState("English");
    
    // Outputs
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // History
    const [history, setHistory] = useState([]);
    
    // Feedback
    const { showAlert } = useModal();
    const [copiedIndex, setCopiedIndex] = useState(null); // Track which item was just copied

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${API_URL}/comments/history`);
            setHistory(res.data);
        } catch (e) {
            console.error("Failed to load history", e);
        }
    };

    const handleGenerate = async () => {
        if (!targetContent && !targetUrl) return showAlert("Please enter content text OR a source URL.");
        
        setLoading(true);
        setSuggestions([]);
        try {
            const res = await axios.post(`${API_URL}/comments/generate`, {
                target_content: targetContent,
                target_url: targetUrl,
                platform,
                tone,
                language
            });
            setSuggestions(res.data.comments);
        } catch (e) {
            console.error(e);
            showAlert(e.response?.data?.detail || "Failed to generate comments.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyAndLog = async (comment, index) => {
        // 1. Copy to clipboard
        try {
            await copyToClipboard(comment);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 1500);
        } catch (err) {
            console.error('Failed to copy!', err);
            showAlert("Failed to copy to clipboard");
            return;
        }

        // 2. Log to backend
        try {
            await axios.post(`${API_URL}/comments/log`, {
                target_content: targetContent,
                target_url: targetUrl,
                generated_content: comment,
                platform,
                tone,
                language
            });
            // 3. Refresh History
            fetchHistory();
        } catch (e) {
            console.error("Failed to log comment", e);
            // Non-blocking error, user still got the clipboard content
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
            <h2 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="text-primary" /> Comment Generator
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
                
                {/* LEFT: Context & Controls */}
                <div className="flex flex-col space-y-4 h-full overflow-y-auto pr-2">
                    <div className="bg-surface p-6 rounded-lg border border-surface space-y-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Target Context</h3>
                        
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Content you are reading (Paste snippet here)</label>
                            <textarea 
                                value={targetContent}
                                onChange={(e) => setTargetContent(e.target.value)}
                                className="w-full h-40 bg-black/20 border border-white/10 rounded p-3 text-sm text-gray-200 outline-none focus:border-primary resize-none"
                                placeholder="Paste the post, article, or comment you want to reply to..."
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Source URL (Optional)</label>
                            <input 
                                type="text"
                                value={targetUrl}
                                onChange={(e) => setTargetUrl(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-primary"
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className="bg-surface p-6 rounded-lg border border-surface space-y-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Settings</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Platform</label>
                                <select 
                                    value={platform}
                                    onChange={(e) => setPlatform(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-primary"
                                >
                                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Tone / Goal</label>
                                <select 
                                    value={tone}
                                    onChange={(e) => setTone(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-primary"
                                >
                                    {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 block mb-2">Language</label>
                            <div className="grid grid-cols-2 gap-2">
                                {LANGUAGE_OPTIONS.map(option => (
                                    <button
                                        key={option}
                                        onClick={() => setLanguage(option)}
                                        className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
                                            language === option
                                                ? "bg-primary border-primary text-white"
                                                : "bg-black/20 border-white/10 text-muted hover:text-white hover:border-white/30"
                                        }`}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={handleGenerate}
                            disabled={loading || (!targetContent && !targetUrl)}
                            className="w-full py-3 rounded bg-primary text-white font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                            {loading ? "Generating..." : "Generate Ideas"}
                        </button>
                    </div>

                     {/* Recent History Preview */}
                     <div className="flex-1 min-h-[200px] bg-surface p-6 rounded-lg border border-surface flex flex-col">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                             <History size={14} /> Recent Logged Activity
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                            {history.length === 0 ? (
                                <p className="text-xs text-center text-gray-500 py-4">No comments logged recently.</p>
                            ) : (
                                history.map(item => (
                                    <div key={item.id} className="text-xs bg-black/20 p-2 rounded border border-white/5">
                                        <div className="flex justify-between text-gray-500 mb-1">
                                            <span>{item.platform} • {item.tone}</span>
                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-gray-300 line-clamp-2" title={item.generated_content}>
                                            "{item.generated_content}"
                                        </div>
                                        <div className="mt-1 text-gray-600 italic truncate" title={item.target_content}>
                                            Ref: {item.target_content}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                     </div>
                </div>

                {/* RIGHT: Suggestions */}
                <div className="bg-surface rounded-lg border border-surface p-6 flex flex-col h-full overflow-hidden">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">AI Suggestions</h3>
                    
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {suggestions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted text-center p-8 opacity-50">
                                <MessageSquare size={48} className="mb-4 text-gray-600" />
                                <p>Suggestions will appear here after you generate them.</p>
                            </div>
                        ) : (
                            suggestions.map((suggestion, idx) => (
                                <div key={idx} className="bg-black/20 border border-white/10 rounded-lg p-4 group hover:border-primary/50 transition-colors">
                                    <p dir={language === "Hebrew" ? "rtl" : "ltr"} className="whitespace-pre-wrap text-gray-200 mb-4 font-serif leading-relaxed">
                                        {suggestion}
                                    </p>
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={() => handleCopyAndLog(suggestion, idx)}
                                            className={`
                                                flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all
                                                ${copiedIndex === idx 
                                                    ? "bg-green-600 text-white" 
                                                    : "bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
                                                }
                                            `}
                                        >
                                            {copiedIndex === idx ? (
                                                 <>Copied & Logged!</>
                                            ) : (
                                                 <><Copy size={14} /> Copy & Log</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
