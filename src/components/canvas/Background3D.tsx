import { Suspense, useMemo, type ReactElement } from 'react';
import { Canvas } from '@react-three/fiber';
import {
    EffectComposer,
    Bloom,
    Noise,
} from '@react-three/postprocessing';
import { Preload } from '@react-three/drei';
import { HalfFloatType } from 'three';
import { OrbitalWaves } from './OrbitalWaves';
import { defaultConfig } from '../../config/defaults';
import { maxPerformanceConfig } from '../../config/performance';

type RuntimeQuality = 0 | 1 | 2;
const MAX_QUALITY: RuntimeQuality = 2;

export const Background3D = () => {
    const perf = maxPerformanceConfig;
    const quality = MAX_QUALITY;
    const dpr = perf.maxDpr;

    const postFx = useMemo(
        () => ({
            resolutionScale: 1,
            multisampling: perf.antialias ? 4 : 0,
            bloomIntensity: defaultConfig.bloom.intensity,
            bloomLuminanceThreshold: defaultConfig.bloom.luminanceThreshold,
            bloomLuminanceSmoothing: 0.03,
            bloomRadius: defaultConfig.bloom.radius,
            bloomMipmapBlur: defaultConfig.bloom.mipmapBlur,
            bloomLevels: 8,
            frameBufferType: HalfFloatType,
            enableBloom: perf.enableBloom,
            enableNoise: perf.enableNoise,
        }),
        [perf.antialias, perf.enableBloom, perf.enableNoise],
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

    const showVignette = perf.enableVignette;
    const hasPostFx = postFx.enableBloom || postFx.enableNoise;

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

        return <>{effects}</>;
    }, [
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
