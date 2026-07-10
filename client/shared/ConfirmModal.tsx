import React from 'react';

export const ConfirmModal: React.FC<{ isOpen: boolean; message: string; onConfirm: () => void; onCancel: () => void; }> = ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="modal-glass animate-slide-up">
                <h3 className="text-xl font-black mb-4 text-text tracking-tight">Are you sure?</h3>
                <p className="text-muted mb-8 text-sm leading-relaxed">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button type="button" className="btn-secondary px-4 py-2.5 text-sm" onClick={onCancel}>Cancel</button>
                    <button type="button" className="btn-primary px-4 py-2.5 text-sm" onClick={onConfirm}>Confirm</button>
                </div>
            </div>
        </div>
    );
};
