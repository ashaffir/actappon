import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

const GlobalModal = ({ isOpen, title, content, onConfirm, onCancel, confirmText="Confirm", cancelText="Cancel", type="confirm", defaultValue="", onClose }) => {
    const [inputVal, setInputVal] = useState(defaultValue);
    
    useEffect(() => {
        if(isOpen) setInputVal(defaultValue);
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-surface border border-white/10 rounded-lg p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold mb-2">{title}</h3>
                <p className="text-gray-400 mb-6 text-sm whitespace-pre-wrap">{content}</p>
                
                {type === 'prompt' && (
                    <input 
                        type="text" 
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 mb-6 text-white focus:border-primary outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') onConfirm(inputVal);
                        }}
                    />
                )}

                <div className="flex justify-end gap-3">
                    {type !== 'alert' && (
                         <button onClick={onCancel || onClose} className="px-4 py-2 rounded hover:bg-white/5 text-gray-400 text-sm font-medium transition-colors">
                            {cancelText}
                        </button>
                    )}
                   
                    <button 
                        onClick={() => type === 'prompt' ? onConfirm(inputVal) : onConfirm()} 
                        className="px-4 py-2 rounded bg-primary text-white text-sm font-medium hover:bg-primary/80 transition-colors"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ModalProvider = ({ children }) => {
    const [modalConfig, setModalConfig] = useState(null);

    const showModal = useCallback((config) => {
        setModalConfig({ ...config, isOpen: true });
    }, []);

    const hideModal = useCallback(() => {
        setModalConfig(null);
    }, []);

    const showAlert = (message, title = "Alert") => {
        return new Promise((resolve) => {
            showModal({
                title,
                content: message,
                confirmText: "OK",
                type: "alert",
                onConfirm: () => {
                    hideModal();
                    resolve();
                },
                onClose: () => {
                   hideModal();
                   resolve();
                }
            });
        });
    };

    const showConfirm = (message, title = "Confirm", confirmText="Confirm") => {
        return new Promise((resolve) => {
            showModal({
                title,
                content: message,
                confirmText,
                cancelText: "Cancel",
                type: "confirm",
                onConfirm: () => {
                    hideModal();
                    resolve(true);
                },
                onCancel: () => {
                    hideModal();
                    resolve(false);
                },
                onClose: () => {
                    hideModal();
                    resolve(false);
                }
            });
        });
    };
    
    const showPrompt = (message, title = "Prompt", defaultValue = "") => {
         return new Promise((resolve) => {
            showModal({
                title,
                content: message,
                confirmText: "Submit",
                cancelText: "Cancel",
                type: "prompt",
                defaultValue,
                onConfirm: (value) => {
                    hideModal();
                    resolve(value);
                },
                onCancel: () => {
                    hideModal();
                    resolve(null);
                },
                onClose: () => {
                    hideModal();
                    resolve(null);
                }
            });
        });
    }

    return (
        <ModalContext.Provider value={{ showModal, hideModal, showAlert, showConfirm, showPrompt }}>
            {children}
            {modalConfig && <GlobalModal {...modalConfig} onClose={hideModal} />}
        </ModalContext.Provider>
    );
};
