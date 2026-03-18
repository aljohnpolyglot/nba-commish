import React from 'react';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ title, message, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-slate-400 mb-6 text-sm leading-relaxed">{message}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};
