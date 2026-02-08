import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { PerformanceMonitor } from '@react-three/drei';
import { Vector2 } from 'three';
import { OrbitalWaves } from './OrbitalWaves';
import { defaultConfig } from '../../config/defaults';
import { usePerformanceTier } from '../../hooks/usePerformanceTier';
import type { PerformanceTier } from '../../hooks/usePerformanceTier';

type RuntimeQuality = 0 | 1 | 2;

const QUALITY_DROP_COOLDOWN_MS = 900;
const QUALITY_RISE_COOLDOWN_MS = 3200;

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
    if (tier === 'high') return 1;
    if (tier === 'medium') return 0.75;
    return 0.5;
}

function tierToMidQuality(maxQuality: RuntimeQuality): RuntimeQuality {
    return maxQuality === 2 ? 1 : maxQuality;
}

export const Background3D = () => {
    const perf = usePerformanceTier();

    const minDpr = tierToMinDpr(perf.tier);
    const maxQuality = tierToMaxQuality(perf.tier);

    // Start with moderated DPR to keep the intro animation smooth, then scale up/down from runtime metrics.
    const [dpr, setDpr] = useState(() => Math.min(perf.maxDpr, Math.max(1, minDpr)));
    const [quality, setQuality] = useState<RuntimeQuality>(maxQuality);

    const qualityRef = useRef<RuntimeQuality>(maxQuality);
    const lastQualityChangeRef = useRef(0);

    const handlePerformanceChange = useCallback(
        ({ factor }: { factor: number }) => {
            const nextDpr = Math.round((minDpr + (perf.maxDpr - minDpr) * factor) * 4) / 4;
            const clampedDpr = Math.max(minDpr, Math.min(perf.maxDpr, nextDpr));

            setDpr((prev) => (Math.abs(prev - clampedDpr) < 0.01 ? prev : clampedDpr));

            const targetQuality =
                factor >= 0.8
                    ? maxQuality
                    : factor >= 0.58
                      ? tierToMidQuality(maxQuality)
                      : 0;

            const currentQuality = qualityRef.current;
            if (targetQuality === currentQuality) return;

            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const cooldown =
                targetQuality < currentQuality ? QUALITY_DROP_COOLDOWN_MS : QUALITY_RISE_COOLDOWN_MS;

            if (now - lastQualityChangeRef.current < cooldown) return;

            qualityRef.current = targetQuality;
            lastQualityChangeRef.current = now;
            setQuality(targetQuality);
        },
        [maxQuality, minDpr, perf.maxDpr],
    );

    const handleFallback = useCallback(() => {
        const fallbackDpr = Math.max(minDpr, perf.maxDpr * 0.7);

        setDpr((prev) => (Math.abs(prev - fallbackDpr) < 0.01 ? prev : fallbackDpr));

        qualityRef.current = 0;
        lastQualityChangeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setQuality(0);
    }, [minDpr, perf.maxDpr]);

    const postFx = useMemo(() => {
        const resolutionScale = quality === 2 ? 1 : quality === 1 ? 0.86 : 0.72;
        const bloomIntensityMultiplier = quality === 2 ? 1 : quality === 1 ? 0.9 : 0.78;

        return {
            resolutionScale,
            multisampling: quality === 2 && perf.tier === 'high' ? 2 : 0,
            bloomIntensity: defaultConfig.bloom.intensity * bloomIntensityMultiplier,
            enableChromaticAberration: quality === 2 && perf.enableChromaticAberration,
            enableNoise: quality === 2 && perf.enableNoise,
        };
    }, [quality, perf.enableChromaticAberration, perf.enableNoise, perf.tier]);

    const caOffsetVec = useMemo(
        () =>
            new Vector2(
                defaultConfig.chromaticAberration.offset,
                defaultConfig.chromaticAberration.offset,
            ),
        [],
    );

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

    const hasPostFx = perf.enableBloom;

    const composerEffects = useMemo(() => {
        const bloom = (
            <Bloom
                luminanceThreshold={defaultConfig.bloom.luminanceThreshold}
                mipmapBlur={defaultConfig.bloom.mipmapBlur}
                intensity={postFx.bloomIntensity}
                radius={defaultConfig.bloom.radius}
            />
        );

        if (postFx.enableChromaticAberration && postFx.enableNoise) {
            return (
                <>
                    {bloom}
                    <ChromaticAberration
                        offset={caOffsetVec}
                        radialModulation={defaultConfig.chromaticAberration.radialModulation}
                        modulationOffset={defaultConfig.chromaticAberration.modulationOffset}
                    />
                    <Noise opacity={defaultConfig.noise.opacity} />
                </>
            );
        }

        if (postFx.enableChromaticAberration) {
            return (
                <>
                    {bloom}
                    <ChromaticAberration
                        offset={caOffsetVec}
                        radialModulation={defaultConfig.chromaticAberration.radialModulation}
                        modulationOffset={defaultConfig.chromaticAberration.modulationOffset}
                    />
                </>
            );
        }

        if (postFx.enableNoise) {
            return (
                <>
                    {bloom}
                    <Noise opacity={defaultConfig.noise.opacity} />
                </>
            );
        }

        return bloom;
    }, [caOffsetVec, postFx.bloomIntensity, postFx.enableChromaticAberration, postFx.enableNoise]);

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
            <div style={vignetteStyle} />

            <Canvas
                camera={{ position: [0, 0, 26], fov: 45 }}
                gl={{
                    antialias: perf.antialias && quality > 0,
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

                    {hasPostFx && (
                        <EffectComposer
                            enableNormalPass={false}
                            multisampling={postFx.multisampling}
                            resolutionScale={postFx.resolutionScale}
                        >
                            {composerEffects}
                        </EffectComposer>
                    )}
                </Suspense>
            </Canvas>
        </div>
    );
};
