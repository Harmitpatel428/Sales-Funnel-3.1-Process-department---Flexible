'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ClassifiedError } from '../utils/errorHandling';
import { RecoveryAction } from '@/lib/middleware/error-handler'; // Assuming shared type or redefine
import { AnimatePresence, motion } from 'framer-motion';

// Redefine if not shared easily or import from client utils if moved
interface RecoveryOption {
  label: string;
  action: () => Promise<void> | void;
  variant?: 'primary' | 'secondary' | 'danger';
  description?: string;
}

interface RecoveryState {
  isOpen: boolean;
  error: ClassifiedError | null;
  title: string;
  options: RecoveryOption[];
}

export function ErrorRecoveryPanel() {
  const [state, setState] = useState<RecoveryState>({
    isOpen: false,
    error: null,
    title: 'Error Recovery',
    options: []
  });

  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    const handleRecoveryEvent = (event: CustomEvent<Omit<RecoveryState, 'isOpen'>>) => {
      setState({
        isOpen: true,
        ...event.detail
      });
    };

    window.addEventListener('app-error-recovery', handleRecoveryEvent as EventListener);
    return () => window.removeEventListener('app-error-recovery', handleRecoveryEvent as EventListener);
  }, []);

  const handleAction = async (option: RecoveryOption) => {
    setIsRecovering(true);
    try {
      await option.action();
      setState(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      console.error('Recovery failed', e);
      // Optionally shake or show error
    } finally {
      setIsRecovering(false);
    }
  };

  const close = () => setState(prev => ({ ...prev, isOpen: false }));

  return (
    <Dialog.Root open={state.isOpen} onOpenChange={close}>
      <AnimatePresence>
        {state.isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 bg-black/50 z-[120]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-[6px] bg-white p-[25px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] focus:outline-none z-[130]"
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
              >
                <Dialog.Title className="text-xl font-bold text-gray-900 mb-2">
                  {state.title}
                </Dialog.Title>

                {state.error && (
                  <div className="mb-6 p-4 bg-red-50 rounded-md border border-red-100">
                    <p className="text-sm text-red-800 font-medium">{state.error.message}</p>
                    <p className="text-xs text-red-600 mt-1">Error Code: {state.error.code}</p>
                  </div>
                )}

                <Dialog.Description className="text-gray-500 text-sm mb-6">
                  Please select an action to resolve this issue:
                </Dialog.Description>

                <div className="space-y-3">
                  {state.options.map((option, idx) => (
                    <button
                      key={idx}
                      disabled={isRecovering}
                      onClick={() => handleAction(option)}
                      className={`w-full flex flex-col items-start p-3 rounded-lg border transition-all ${option.variant === 'primary'
                          ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                          : option.variant === 'danger'
                            ? 'border-red-200 bg-red-50 hover:bg-red-100'
                            : 'border-gray-200 hover:bg-gray-50'
                        } ${isRecovering ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`font-medium ${option.variant === 'primary' ? 'text-blue-700' :
                          option.variant === 'danger' ? 'text-red-700' : 'text-gray-900'
                        }`}>
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-xs text-gray-500 mt-1 text-left">
                          {option.description}
                        </span>
                      )}
                    </button>
                  ))}

                  <button
                    onClick={close}
                    disabled={isRecovering}
                    className="w-full p-2 text-center text-gray-500 text-sm hover:text-gray-700 mt-2"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function triggerErrorRecovery(detail: Omit<RecoveryState, 'isOpen'>) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-error-recovery', { detail }));
  }
}
