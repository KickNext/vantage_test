import React, { useEffect, useState } from 'react';

interface UIOverlayProps {
    onRestart: () => void;
    presetNumber: number;
    runId: number;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ onRestart, presetNumber, runId }) => {
    const [visible, setVisible] = useState(false);
    const [presetVisible, setPresetVisible] = useState(false);

    useEffect(() => {
        setVisible(false);
        setPresetVisible(false);

        const revealPresetTimer = setTimeout(() => {
            setPresetVisible(true);
        }, 40);
        const hidePresetTimer = setTimeout(() => {
            setPresetVisible(false);
        }, 2200);

        // Sync with intro duration (6.0s) + small buffer
        const timer = setTimeout(() => {
            setVisible(true);
        }, 6500);
        return () => {
            clearTimeout(revealPresetTimer);
            clearTimeout(hidePresetTimer);
            clearTimeout(timer);
        };
    }, [runId]);

    return (
        <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none', // Allow clicks to pass through to canvas
            zIndex: 10
        }}>
            <div style={{
                position: 'absolute',
                top: '24px',
                left: '24px',
                fontFamily: '"Orbitron", sans-serif',
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#ffffff',
                textShadow: '0 0 20px rgba(255,255,255,0.45)',
                opacity: presetVisible ? 0.78 : 0,
                transform: presetVisible ? 'translateY(0)' : 'translateY(-8px)',
                transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}>
                {String(presetNumber).padStart(2, '0')}
            </div>
            {/* Bottom Text Container */}
            <div style={{
                position: 'absolute',
                bottom: '50px',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                opacity: visible ? 0.5 : 0,
                transition: 'opacity 2.0s ease',
                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                transitionProperty: 'opacity, transform'
            }}>
                <span style={{
                    fontFamily: '"Orbitron", sans-serif',
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.2em',
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    textShadow: '0 0 20px rgba(0,255,255,0.5)',
                    opacity: 0.8
                }}>
                    Click or tap to unleash energy
                </span>
            </div>
            {/* Restart Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onRestart(); }}
                style={{
                    position: 'absolute',
                    top: '24px',
                    right: '24px',
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    padding: '10px',
                    cursor: 'pointer',
                    opacity: 0.6,
                    transition: 'opacity 0.3s',
                    pointerEvents: 'auto' // Re-enable clicks
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 15.31 15.31 18 12 18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4Z" fill="white" />
                </svg>
            </button>        </div>
    );
};
