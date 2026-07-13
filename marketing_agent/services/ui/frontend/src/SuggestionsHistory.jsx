import axios from 'axios';
import { ArrowRight, CheckCircle, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from './ModalContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function SuggestionsHistory() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all'); // all, unused
    const navigate = useNavigate();
    const { showAlert } = useModal();

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/suggestions/history`);
            setHistory(res.data);
        } catch (e) {
            console.error(e);
            showAlert("Failed to load history.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleUse = (item) => {
        // Navigate to PostsGenerator with this suggestion
        navigate('/posts', { state: { suggestion: item } });
    };

    const filteredHistory = history.filter(item => {
        if (filter === 'unused') return !item.is_used;
        return true;
    });

    return (
        <div className="max-w-6xl mx-auto space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Suggestions History</h2>
                <div className="flex gap-2">
                    <button 
                         onClick={() => setFilter('all')}
                         className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-primary text-white' : 'bg-surface hover:bg-white/5 text-gray-400'}`}
                    >
                        All
                    </button>
                    <button 
                         onClick={() => setFilter('unused')}
                         className={`px-3 py-1 rounded text-sm ${filter === 'unused' ? 'bg-primary text-white' : 'bg-surface hover:bg-white/5 text-gray-400'}`}
                    >
                        Unused Only
                    </button>
                </div>
            </div>

            <div className="bg-surface rounded-lg border border-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-black/20 text-xs uppercase font-medium text-muted">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Platform</th>
                                <th className="px-6 py-3">Suggestion</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredHistory.map((item) => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} />
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap uppercase text-xs font-bold tracking-wider text-muted">
                                        {item.platform}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="line-clamp-2 max-w-md" title={item.content}>{item.content}</p>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {item.is_used ? (
                                            <div className="flex flex-col gap-1 items-start">
                                                <span className="flex items-center gap-1 text-green-400 text-xs font-bold uppercase bg-green-900/20 px-2 py-1 rounded w-fit">
                                                    <CheckCircle size={12} /> Used
                                                </span>
                                                {item.used_at && (
                                                    <span className="text-[10px] text-green-500/60 font-mono">
                                                        {new Date(item.used_at).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-500 text-xs font-bold uppercase bg-white/5 px-2 py-1 rounded w-fit">
                                                Unused
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button 
                                            onClick={() => handleUse(item)}
                                            className="text-primary hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                                        >
                                            Use <ArrowRight size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {loading && <div className="p-8 text-center text-gray-500">Loading history...</div>}
                {!loading && filteredHistory.length === 0 && <div className="p-8 text-center text-gray-500">No suggestions found.</div>}
            </div>
        </div>
    );
}
