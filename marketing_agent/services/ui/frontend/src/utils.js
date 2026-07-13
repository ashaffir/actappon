export const copyToClipboard = async (text) => {
    // 1. Try modern Clipboard API first (if available and in secure context)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn("navigator.clipboard.writeText failed, trying fallback", err);
            // Fall through to fallback
        }
    }

    // 2. Fallback: document.execCommand('copy')
    // This is deprecated but necessary for HTTP (non-secure) contexts
    return new Promise((resolve, reject) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // Ensure it's not visible but part of DOM
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                resolve(true);
            } else {
                reject(new Error("document.execCommand('copy') failed"));
            }
        } catch (err) {
            reject(err);
        }
    });
};
