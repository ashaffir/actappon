import axios from 'axios';
import { Check, Code, Image as ImageIcon, Loader2, Plus, RefreshCw, Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CopyButton from './CopyButton';
import { useModal } from './ModalContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STYLE_OPTIONS = [
    "Long", "Short", 
    "Personal", "Technical", 
    "Controversial", "Educational",
    "Industry Trends", "Case Study",
    "Storytelling", "Skeptical"
];
const LANGUAGE_OPTIONS = ["English", "Hebrew"];

export default function PostsGenerator() {
    const location = useLocation();
    const [platform, setPlatform] = useState('linkedin');
    const [language, setLanguage] = useState('English');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState(null);
    const [styleModifiers, setStyleModifiers] = useState([]);
    const [suggestionId, setSuggestionId] = useState(null); // Track ID for marking used
    const [customSuggestion, setCustomSuggestion] = useState('');
    
    // Check for passed state
    useEffect(() => {
        if (location.state?.suggestion) {
            const s = location.state.suggestion;
            setPlatform(s.platform.toLowerCase());
            setSuggestions([s.content]); // Just show the one passed
            setSelectedSuggestion(s.content);
            setSuggestionId(s.id);
        }
    }, [location.state]);
    
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [loadingGen, setLoadingGen] = useState(false);
    
    const [result, setResult] = useState(null);
    const [usedRagDocs, setUsedRagDocs] = useState([]);  // [NEW]
    const { showAlert, showConfirm } = useModal();

    const fetchSuggestions = async () => {
        setLoadingSuggestions(true);
        setSuggestions([]);
        setSelectedSuggestion(null);
        try {
            const res = await axios.post(`${API_URL}/generated-posts/suggestions`, { 
                platform,
                style_modifiers: styleModifiers,
                language
            });
            setSuggestions(res.data.suggestions);
            setSuggestionId(null); // Reset when fetching new ones
            if (res.data.used_rag_docs) { // [NEW] - Capture used docs from suggestion generation too if desired
                 setUsedRagDocs(res.data.used_rag_docs);
            }
        } catch (e) {
            console.error(e);
            showAlert("Failed to get suggestions");
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedSuggestion) return showAlert("Please select a suggestion first.");
        
        setLoadingGen(true);
        setResult(null);
        try {
            const res = await axios.post(`${API_URL}/generated-posts/generate`, {
                platform,
                instructions: selectedSuggestion,
                style_modifiers: styleModifiers,
                language
            });
            setResult(res.data);
            if (res.data.used_rag_docs) { // [NEW]
                setUsedRagDocs(res.data.used_rag_docs);
            }
        } catch (e) {
            console.error(e);
            showAlert(`Generation failed: ${e.response?.data?.detail || e.message}`);
        } finally {
            setLoadingGen(false);
        }
    };

    const handleApprove = async () => {
        if (!result) return;
        
        const confirmed = await showConfirm(
            "This will save the post to the database as APPROVED.",
            "Approve & Save"
        );
        
        if (confirmed) {
            try {
                await axios.post(`${API_URL}/generated-posts/approve`, {
                    platform,
                    content: result.content,
                    image_prompt: result.image_prompt,
                    mermaid_code: result.mermaid_code,
                    suggestion_id: suggestionId 
                });
                showAlert("Post approved and saved!", "Success");
                setResult(null);
                setSelectedSuggestion(null);
                setSuggestionId(null);
                // Clear state if any
                window.history.replaceState({}, document.title);
                setSuggestions([]);
            } catch (e) {
                showAlert("Failed to approve post.");
            }
        }
    };

    const toggleStyle = (style) => {
        if (styleModifiers.includes(style)) {
            setStyleModifiers(styleModifiers.filter(s => s !== style));
        } else {
            setStyleModifiers([...styleModifiers, style]);
        }
    };

    const handleAddCustomSuggestion = () => {
        if (!customSuggestion.trim()) return;
        const newSuggestion = customSuggestion.trim();
        setSuggestions([...suggestions, newSuggestion]);
        setSelectedSuggestion(newSuggestion);
        setSuggestionId(null);
        setCustomSuggestion('');
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Posts Generator</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column: Controls (4 cols) */}
                <div className="md:col-span-4 space-y-6">
                    
                    {/* Platform Selector */}
                    <div className="bg-surface p-6 rounded-lg border border-surface space-y-4">
                        <label className="block text-sm font-medium text-muted uppercase tracking-wider">Platform</label>
                        <select 
                            value={platform} 
                            onChange={(e) => {
                                setPlatform(e.target.value);
                                setSuggestions([]); 
                                setSelectedSuggestion(null);
                            }}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-primary"
                        >
                            <option value="linkedin">LinkedIn</option>
                            <option value="twitter">X (Twitter)</option>
                            <option value="blog">Blog</option>
                        </select>
                    </div>

                    <div className="bg-surface p-6 rounded-lg border border-surface">
                        <label className="block text-sm font-medium text-muted uppercase tracking-wider mb-4">Language</label>
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

                    {/* Suggestions Box */}
                    <div className="bg-surface p-6 rounded-lg border border-surface flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <label className="block text-sm font-medium text-muted uppercase tracking-wider flex items-center gap-2">
                                <Sparkles size={16} className="text-purple-400"/> Suggestions
                            </label>
                            {usedRagDocs.length > 0 && (
                                <div className="text-[10px] text-gray-500 flex items-center gap-1" title={usedRagDocs.join(", ")}>
                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                                    Using {usedRagDocs.length} Context Source{usedRagDocs.length > 1 ? 's' : ''}
                                </div>
                            )}
                            <button 
                                onClick={fetchSuggestions}
                                disabled={loadingSuggestions}
                                className="p-1.5 rounded hover:bg-white/10 text-primary transition-colors disabled:opacity-50"
                                title="Refresh Suggestions"
                            >
                                <RefreshCw size={16} className={loadingSuggestions ? "animate-spin" : ""} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {suggestions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted text-center p-4">
                                    <p className="text-sm mb-2">No suggestions yet.</p>
                                    <button onClick={fetchSuggestions} className="text-primary text-sm hover:underline" disabled={loadingSuggestions}>
                                        {loadingSuggestions ? "Thinking..." : "Get AI Suggestions"}
                                    </button>
                                </div>
                            ) : (
                                suggestions.map((s, i) => (
                                    <div 
                                        key={i}
                                        onClick={() => {
                                             setSelectedSuggestion(s);
                                             setSuggestionId(null); // Reset ID if user picks a fresh one from list (unless we map IDs to list, but currently just list of strings returned by API)
                                             // Note: Ideally API should return objects with IDs. Currently returns list[str]. 
                                             // Implementation Detail: The API returns `suggestions: List[str]`. 
                                             // To properly track usage of *new* suggestions, we'd need to change API response to objects. 
                                             // For now, only history-passed suggestions have an ID tracked. New ones aren't tracked as 'used' by ID unless we update frontend/backend contract.
                                             // But prompt asked to store ALL suggestions. Backend stores them on generation.
                                             // To mark them used, frontend needs the ID.
                                             // Currently we don't have IDs for newly generated suggestions in the frontend state.
                                             // Let's assume for now only stored/history ones are "marked used" effectively, 
                                             // or I'd need to refactor API response to return {id, content} objects.
                                        }}
                                        className={`p-3 rounded-lg text-sm cursor-pointer border transition-all ${
                                            selectedSuggestion === s 
                                                ? "bg-primary/20 border-primary text-white shadow-lg scale-[1.02]" 
                                                : "bg-black/20 border-transparent hover:bg-white/5 text-gray-300"
                                        }`}
                                    >
                                        {s}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Manual Input Area */}
                        <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
                            <input
                                type="text"
                                value={customSuggestion}
                                onChange={(e) => setCustomSuggestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSuggestion()}
                                placeholder="Type your own topic..."
                                className="flex-1 bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm outline-none focus:border-primary placeholder:text-gray-600"
                            />
                            <button
                                onClick={handleAddCustomSuggestion}
                                disabled={!customSuggestion.trim()}
                                className="p-2 rounded bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30 transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Style Settings */}
                     <div className="bg-surface p-6 rounded-lg border border-surface">
                        <label className="block text-sm font-medium text-muted uppercase tracking-wider mb-4">Style Settings</label>
                        <div className="flex flex-wrap gap-2">
                            {STYLE_OPTIONS.map(style => (
                                <button
                                    key={style}
                                    onClick={() => toggleStyle(style)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                        styleModifiers.includes(style)
                                            ? "bg-white text-black border-white"
                                            : "bg-transparent text-gray-400 border-gray-600 hover:border-gray-400"
                                    }`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate} 
                        disabled={loadingGen || !selectedSuggestion}
                        className="w-full py-3 rounded bg-primary text-white font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                    >
                        {loadingGen ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                        {loadingGen ? "Generating Draft..." : "Generate Draft"}
                    </button>
                </div>
                
                {/* Right Column: Result (8 cols) */}
                <div className="md:col-span-8 flex flex-col h-full min-h-[600px]">
                    {result ? (
                        <div className="bg-surface rounded-lg border border-surface flex flex-col overflow-hidden animate-fade-in h-full">
                            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-sm uppercase text-gray-400">Draft Preview</span>
                                    <div className="flex gap-1">
                                        {styleModifiers.map(m => (
                                            <span key={m} className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 uppercase">{m}</span>
                                        ))}
                                    </div>
                                </div>
                                {result.used_rag_docs && result.used_rag_docs.length > 0 && (
                                     <div className="text-[10px] text-muted flex gap-2">
                                         <span className="font-bold">Sources:</span>
                                         {result.used_rag_docs.map(doc => (
                                             <span key={doc} className="underline decoration-dotted" title={doc}>
                                                 {doc.length > 20 ? doc.substring(0,18)+'...' : doc}
                                             </span>
                                         ))}
                                     </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                     <CopyButton text={result.content} />
                                     <button 
                                        onClick={handleApprove}
                                        className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-green-900/20"
                                     >
                                        <Check size={16} /> Approve & Save
                                    </button>
                                </div>
                            </div>
                            
                            <div className="p-8 space-y-8 overflow-y-auto flex-1 bg-gradient-to-br from-surface to-black/40">
                                <div dir={language === 'Hebrew' ? 'rtl' : 'ltr'} className="whitespace-pre-wrap text-base leading-relaxed font-serif text-gray-200">
                                    {result.content}
                                </div>
                                
                                {(result.image_prompt || result.mermaid_code) && (
                                    <div className="border-t border-white/10 pt-6 mt-6">
                                        <h4 className="text-xs font-bold text-muted uppercase mb-4 text-white/50 tracking-widest">Graphical Aids</h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            {result.image_prompt && (
                                                <div className="bg-black/40 p-4 rounded border border-white/5">
                                                    <div className="flex items-center gap-2 text-purple-400 mb-2 text-xs font-bold uppercase tracking-wider">
                                                        <ImageIcon size={14} /> Image Prompt
                                                    </div>
                                                    <p className="text-sm text-gray-400 italic font-mono">{result.image_prompt}</p>
                                                </div>
                                            )}
                                            {result.mermaid_code && (
                                                <div className="bg-black/40 p-4 rounded border border-white/5">
                                                     <div className="flex items-center gap-2 text-cyan-400 mb-2 text-xs font-bold uppercase tracking-wider">
                                                        <Code size={14} /> Mermaid Code
                                                    </div>
                                                    <pre className="text-xs text-blue-300 overflow-x-auto font-mono bg-black/20 p-2 rounded">
                                                        {result.mermaid_code}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-muted border-2 border-dashed border-white/5 rounded-lg bg-surface/10 p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                                <Sparkles size={32} className="text-gray-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-300 mb-2">Create New Content</h3>
                            <p className="max-w-md text-gray-500">Select a platform, generate some AI suggestions, pick your favorite topic, and apply style settings to generate a draft.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
