import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyToClipboard } from './utils';

export default function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await copyToClipboard(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    return (
        <button 
            onClick={handleCopy}
            className={`p-1.5 rounded transition-all duration-200 ${
                copied 
                ? "bg-green-500/20 text-green-400" 
                : "hover:bg-white/10 text-gray-400 hover:text-white"
            }`}
            title="Copy to clipboard"
        >
            {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
    );
}
