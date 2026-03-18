import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 max-h-[70vh] overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const MinContractModal = ({ isOpen, onClose, baseAmount }: { isOpen: boolean, onClose: () => void, baseAmount: number }) => {
    const years = Array.from({ length: 11 }, (_, i) => i);
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Minimum Salary Computations">
            <table className="w-full text-sm text-left">
                <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-2">Years of Experience</th>
                        <th className="pb-2 text-right">Minimum Salary</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300">
                    {years.map(year => {
                        // Increases by 12.04% each year
                        const amount = baseAmount * Math.pow(1.1204, year);
                        return (
                            <tr key={year} className="border-b border-slate-800/50">
                                <td className="py-2">{year === 10 ? '10+' : year}</td>
                                <td className="py-2 text-right text-emerald-400">${amount.toFixed(3)}M</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Modal>
    );
};

export const MaxContractModal = ({ isOpen, onClose, basePercentage, salaryCap }: { isOpen: boolean, onClose: () => void, basePercentage: number, salaryCap: number }) => {
    const years = Array.from({ length: 11 }, (_, i) => i);
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Maximum Salary Computations">
            <table className="w-full text-sm text-left">
                <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-2">Years of Experience</th>
                        <th className="pb-2 text-right">% of Cap</th>
                        <th className="pb-2 text-right">Salary</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300">
                    {years.map(year => {
                        // Increases by 1% each year
                        const percentage = basePercentage + year;
                        const amount = (salaryCap * percentage / 100) / 1000000;
                        return (
                            <tr key={year} className="border-b border-slate-800/50">
                                <td className="py-2">{year === 10 ? '10+' : year}</td>
                                <td className="py-2 text-right">{percentage}%</td>
                                <td className="py-2 text-right text-emerald-400">${amount.toFixed(3)}M</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Modal>
    );
};

export const RookieContractModal = ({ isOpen, onClose, basePercentage, scaleAppliesTo, salaryCap }: { isOpen: boolean, onClose: () => void, basePercentage: number, scaleAppliesTo: string, salaryCap: number }) => {
    const numPicks = scaleAppliesTo === 'first_round' ? 30 : 60;
    const picks = Array.from({ length: numPicks }, (_, i) => i + 1);
    const decreaseRate = scaleAppliesTo === 'first_round' ? 0.0542 : 0.0271;
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Rookie Salary Computations">
            <table className="w-full text-sm text-left">
                <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-2">Draft Pick</th>
                        <th className="pb-2 text-right">% of Cap</th>
                        <th className="pb-2 text-right">Salary</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300">
                    {picks.map(pick => {
                        // Decreases by 5.42% (or 2.71%) each pick
                        const percentage = basePercentage * Math.pow(1 - decreaseRate, pick - 1);
                        const amount = (salaryCap * percentage / 100) / 1000000;
                        return (
                            <tr key={pick} className="border-b border-slate-800/50">
                                <td className="py-2">{pick}</td>
                                <td className="py-2 text-right">{percentage.toFixed(2)}%</td>
                                <td className="py-2 text-right text-emerald-400">${amount.toFixed(3)}M</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Modal>
    );
};
