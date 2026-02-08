import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Canvas } from '@react-three/fiber';
import {
    EffectComposer,
    Bloom,
    Noise,
    FXAA,
    SMAA,
} from '@react-three/postprocessing';
import { PerformanceMonitor, Preload } from '@react-three/drei';
import { HalfFloatType } from 'three';
import { OrbitalWaves } from './OrbitalWaves';
import { defaultConfig } from '../../config/defaults';
import { usePerformanceTier } from '../../hooks/usePerformanceTier';
import type { PerformanceTier } from '../../hooks/usePerformanceTier';

type RuntimeQuality = 0 | 1 | 2;

const QUALITY_DROP_COOLDOWN_MS = 900;
const QUALITY_RISE_COOLDOWN_MS = 3200;
const DPR_DROP_COOLDOWN_MS = 800;
const DPR_RISE_COOLDOWN_MS = 1500;
const DPR_MIN_DELTA_TO_APPLY = 0.1;
const STARTUP_QUALITY_RISE_DELAY_MS = 6000;

function tierToMaxQuality(tier: PerformanceTier): RuntimeQuality {
    switch (tier) {
        case 'high':
            return 2;
        case 'medium':
            return 1;
        default:
            return 0;
    }
}

function tierToMinDpr(tier: PerformanceTier): number {
    if (tier === 'high') return 1.5;
    if (tier === 'medium') return 1;
    return 0.75;
}

function tierToMidQuality(maxQuality: RuntimeQuality): RuntimeQuality {
    return maxQuality === 2 ? 1 : maxQuality;
}

function tierToMinQuality(tier: PerformanceTier): RuntimeQuality {
    return tier === 'low' ? 0 : 1;
}

export const Background3D = () => {
    const perf = usePerformanceTier();

    const minDpr = tierToMinDpr(perf.tier);
    const minQuality = tierToMinQuality(perf.tier);
    const maxQuality = tierToMaxQuality(perf.tier);
    const initialQuality = tierToMidQuality(maxQuality);

    // Start with moderated DPR to keep the intro animation smooth, then scale up/down from runtime metrics.
    const [dpr, setDpr] = useState(() =>
        Math.min(perf.maxDpr, Math.max(perf.tier === 'high' ? 1.5 : 1, minDpr)),
    );
    const [quality, setQuality] = useState<RuntimeQuality>(initialQuality);

    const qualityRef = useRef<RuntimeQuality>(initialQuality);
    const lastQualityChangeRef = useRef(Number.NEGATIVE_INFINITY);
    const lastDprChangeRef = useRef(Number.NEGATIVE_INFINITY);
    const resumeGraceUntilRef = useRef(0);
    const allowQualityRiseAtRef = useRef(0);

    useEffect(() => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        allowQualityRiseAtRef.current = now + STARTUP_QUALITY_RISE_DELAY_MS;
        resumeGraceUntilRef.current = now + 800;
    }, []);

    const handlePerformanceChange = useCallback(
        ({ factor }: { factor: number }) => {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            if (now < resumeGraceUntilRef.current) return;

            const nextDpr = Math.round((minDpr + (perf.maxDpr - minDpr) * factor) * 4) / 4;
            const clampedDpr = Math.max(minDpr, Math.min(perf.maxDpr, nextDpr));

            setDpr((prev) => {
                const delta = clampedDpr - prev;
                if (Math.abs(delta) < DPR_MIN_DELTA_TO_APPLY) return prev;

                const cooldown = delta < 0 ? DPR_DROP_COOLDOWN_MS : DPR_RISE_COOLDOWN_MS;
                if (now - lastDprChangeRef.current < cooldown) return prev;

                lastDprChangeRef.current = now;
                return clampedDpr;
            });

            const highQualityThreshold = maxQuality === 2 ? 0.72 : 0.8;
            const midQualityThreshold = maxQuality === 2 ? 0.5 : 0.58;
            const targetQuality =
                factor >= highQualityThreshold
                    ? maxQuality
                    : factor >= midQualityThreshold
                      ? tierToMidQuality(maxQuality)
                      : minQuality;

            const currentQuality = qualityRef.current;
            if (targetQuality === currentQuality) return;
            if (targetQuality > currentQuality && now < allowQualityRiseAtRef.current) return;

            const cooldown =
                targetQuality < currentQuality ? QUALITY_DROP_COOLDOWN_MS : QUALITY_RISE_COOLDOWN_MS;

            if (now - lastQualityChangeRef.current < cooldown) return;

            qualityRef.current = targetQuality;
            lastQualityChangeRef.current = now;
            setQuality(targetQuality);
        },
        [maxQuality, minDpr, minQuality, perf.maxDpr],
    );

    const handleFallback = useCallback(() => {
        const fallbackDpr = Math.max(minDpr, perf.maxDpr * 0.7);
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

        setDpr((prev) => (Math.abs(prev - fallbackDpr) < 0.01 ? prev : fallbackDpr));

        lastDprChangeRef.current = now;
        qualityRef.current = minQuality;
        lastQualityChangeRef.current = now;
        allowQualityRiseAtRef.current = now + STARTUP_QUALITY_RISE_DELAY_MS;
        setQuality(minQuality);
    }, [minDpr, minQuality, perf.maxDpr]);

    useEffect(() => {
        const restoreVisualState = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const restoredDpr = Math.min(perf.maxDpr, Math.max(perf.tier === 'high' ? 1.5 : 1, minDpr));
            const restoredQuality = tierToMidQuality(maxQuality);

            resumeGraceUntilRef.current = now + 1200;
            lastDprChangeRef.current = Number.NEGATIVE_INFINITY;
            lastQualityChangeRef.current = Number.NEGATIVE_INFINITY;
            qualityRef.current = restoredQuality;
            allowQualityRiseAtRef.current = now + STARTUP_QUALITY_RISE_DELAY_MS;

            setDpr(restoredDpr);
            setQuality(restoredQuality);
        };

        document.addEventListener('visibilitychange', restoreVisualState);
        window.addEventListener('focus', restoreVisualState);

        return () => {
            document.removeEventListener('visibilitychange', restoreVisualState);
            window.removeEventListener('focus', restoreVisualState);
        };
    }, [maxQuality, minDpr, perf.maxDpr, perf.tier]);

    const postFx = useMemo(() => {
        const resolutionScale =
            quality === 2 ? 1 : quality === 1 ? (perf.tier === 'high' ? 1 : 0.9) : 0.8;
        const bloomIntensityMultiplier =
            quality === 2 ? 1 : quality === 1 ? (perf.tier === 'high' ? 0.97 : 0.9) : 0.78;
        const keepHighTierNoise = perf.tier === 'high' && quality >= 1;
        const highTierMsaa = perf.tier === 'high' && quality === 2;
        const mobileSafeMode = perf.isMobile;
        const mobileBloomEnabled = !mobileSafeMode || quality > 0;
        const mobileBloomIntensityScale = mobileSafeMode ? 0.58 : 1;
        const bloomLuminanceThreshold = mobileSafeMode
            ? Math.max(0.2, defaultConfig.bloom.luminanceThreshold)
            : defaultConfig.bloom.luminanceThreshold;
        const bloomLuminanceSmoothing = mobileSafeMode ? 0.24 : 0.03;
        const bloomRadius = mobileSafeMode ? Math.min(0.2, defaultConfig.bloom.radius) : defaultConfig.bloom.radius;
        const bloomMipmapBlur = mobileSafeMode ? true : defaultConfig.bloom.mipmapBlur;
        const bloomLevels =
            quality === 2
                ? mobileSafeMode
                    ? 6
                    : 8
                : quality === 1
                  ? mobileSafeMode
                      ? 5
                      : 6
                  : mobileSafeMode
                    ? 4
                    : 5;

        return {
            resolutionScale,
            multisampling: highTierMsaa ? 4 : 0,
            bloomIntensity: defaultConfig.bloom.intensity * bloomIntensityMultiplier * mobileBloomIntensityScale,
            bloomLuminanceThreshold,
            bloomLuminanceSmoothing,
            bloomRadius,
            bloomMipmapBlur,
            bloomLevels,
            frameBufferType: HalfFloatType,
            enableBloom: perf.enableBloom && mobileBloomEnabled,
            enableNoise: perf.enableNoise && (quality === 2 || keepHighTierNoise),
            antialiasMode: perf.antialias
                ? highTierMsaa
                    ? 'none'
                    : quality >= 1 || !perf.isMobile
                      ? 'smaa'
                      : 'fxaa'
                : 'none',
        };
    }, [
        perf.antialias,
        perf.enableBloom,
        perf.enableNoise,
        perf.isMobile,
        perf.tier,
        quality,
    ]);

    const vignetteStyle = useMemo(
        () => ({
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none' as const,
            zIndex: 1,
            background: `radial-gradient(
                ellipse at center,
                transparent ${Math.round(defaultConfig.vignette.offset * 100)}%,
                ${defaultConfig.colors.background} ${Math.round(100 - defaultConfig.vignette.darkness * 20)}%
            )`,
        }),
        [],
    );

    const showVignette = perf.enableVignette;

    const hasPostFx =
        postFx.enableBloom ||
        postFx.enableNoise ||
        postFx.antialiasMode !== 'none';

    const composerEffects = useMemo(() => {
        const effects: ReactElement[] = [];

        if (postFx.enableBloom) {
            effects.push(
                <Bloom
                    key="bloom"
                    luminanceThreshold={postFx.bloomLuminanceThreshold}
                    luminanceSmoothing={postFx.bloomLuminanceSmoothing}
                    mipmapBlur={postFx.bloomMipmapBlur}
                    levels={postFx.bloomLevels}
                    intensity={postFx.bloomIntensity}
                    radius={postFx.bloomRadius}
                />,
            );
        }

        if (postFx.enableNoise) {
            effects.push(<Noise key="noise" opacity={defaultConfig.noise.opacity} />);
        }

        if (postFx.antialiasMode === 'fxaa') {
            effects.push(<FXAA key="fxaa" />);
        } else if (postFx.antialiasMode === 'smaa') {
            effects.push(<SMAA key="smaa" />);
        }

        return <>{effects}</>;
    }, [
            postFx.antialiasMode,
            postFx.bloomIntensity,
            postFx.bloomLevels,
            postFx.bloomLuminanceThreshold,
            postFx.bloomLuminanceSmoothing,
            postFx.bloomMipmapBlur,
            postFx.bloomRadius,
            postFx.enableBloom,
            postFx.enableNoise,
        ]);

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                background: defaultConfig.colors.background,
            }}
        >
            {showVignette && <div style={vignetteStyle} />}

            <Canvas
                camera={{ position: [0, 0, 26], fov: 45 }}
                gl={{
                    antialias: false,
                    alpha: false,
                    preserveDrawingBuffer: false,
                    powerPreference: 'high-performance',
                    stencil: false,
                }}
                dpr={dpr}
                flat
                frameloop="always"
            >
                <color attach="background" args={[defaultConfig.colors.background]} />

                <PerformanceMonitor
                    ms={300}
                    iterations={8}
                    factor={1}
                    step={0.05}
                    flipflops={5}
                    bounds={(refreshRate) => (refreshRate > 90 ? [50, 85] : [45, 58])}
                    onChange={handlePerformanceChange}
                    onFallback={handleFallback}
                />

                <Suspense fallback={null}>
                    <OrbitalWaves
                        colors={defaultConfig.colors}
                        waveConfig={defaultConfig.wave}
                        perf={perf}
                        quality={quality}
                    />
                    <Preload all />

                    {hasPostFx && (
                        <EffectComposer
                            enableNormalPass={false}
                            multisampling={postFx.multisampling}
                            resolutionScale={postFx.resolutionScale}
                            frameBufferType={postFx.frameBufferType}
                            stencilBuffer={false}
                        >
                            {composerEffects}
                        </EffectComposer>
                    )}
                </Suspense>
            </Canvas>
        </div>
    );
};
