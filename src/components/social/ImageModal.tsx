import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ImageModalProps {
    url: string | null;
    onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ url, onClose }) => {
    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <AnimatePresence>
            {url && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    // bg-black/90 and p-4/p-8 creates that Twitter feel
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10"
                    onClick={onClose}
                >
                    {/* Close button - Top Left like Twitter mobile/web */}
                    <button
                        className="absolute top-4 left-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-[210]"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>

                    {/* Image Container */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        <motion.img
                            src={url}
                            alt="Preview"
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            // max-w-full and max-h-full ensures it never overflows the "safe area"
                            className="max-w-full max-h-full object-contain select-none"
                            referrerPolicy="no-referrer"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};