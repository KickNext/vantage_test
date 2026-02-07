import { useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { OrbitalWaves } from './OrbitalWaves';
import { Vector2 } from 'three';
import type { SceneType } from '../../types';
import { useControls, folder, button } from 'leva';
import { defaultConfig } from '../../config/defaults';
import { usePerformanceTier } from '../../hooks/usePerformanceTier';

interface Background3DProps {
    scene: SceneType;
}

export const Background3D = ({ scene: _scene }: Background3DProps) => {
    /** Адаптивный конфиг производительности (high / medium / low) */
    const perf = usePerformanceTier();

    const {
        // Post Processing
        bloomIntensity, bloomRadius, bloomThreshold,
        caOffset, caModulation,
        noiseOpacity,
        vignetteOffset, vignetteDarkness,
        bgColor,

        // Wave Mechanics
        waveSpeed, waveMaxScale, fadeInEnd, fadeOutStart,
        waveColor, waveRoughness, waveThickness, waveDistortion, waveOpacity,
        waveChromAb, waveAnisotropy, waveDistortionScale,

        // Scene Colors
        planetColor, orbitColor1, orbitColor2, orbitColor3, orbitColor4, orbitColor5
    } = useControls('Environment', {
        'Post Processing': folder({
            bloomIntensity: { value: defaultConfig.bloom.intensity, min: 0, max: 5 },
            bloomRadius: { value: defaultConfig.bloom.radius, min: 0, max: 1 },
            bloomThreshold: { value: defaultConfig.bloom.luminanceThreshold, min: 0, max: 1 },
            caOffset: { value: defaultConfig.chromaticAberration.offset, min: 0, max: 0.01, step: 0.001 },
            caModulation: { value: defaultConfig.chromaticAberration.modulationOffset, min: 0, max: 1 },
            noiseOpacity: { value: defaultConfig.noise.opacity, min: 0, max: 0.5 },
            vignetteOffset: { value: defaultConfig.vignette.offset, min: 0, max: 1, label: 'Vignette Start' },
            vignetteDarkness: { value: defaultConfig.vignette.darkness, min: 0, max: 2, label: 'Vignette Strength' },
        }),
        'Global Colors': folder({
            bgColor: { value: defaultConfig.colors.background }
        }),
        'Wave Mechanics': folder({
            'Behavior': folder({
                waveSpeed: { value: defaultConfig.wave.speed, min: 0.01, max: 1.0 },
                waveMaxScale: { value: defaultConfig.wave.maxScale, min: 1, max: 30 },
                fadeInEnd: { value: defaultConfig.wave.fadeInEnd, min: 0, max: 0.5 },
                fadeOutStart: { value: defaultConfig.wave.fadeOutStart, min: 0.1, max: 1.0 },
            }),
            'Material': folder({
                waveColor: { value: defaultConfig.wave.color },
                waveRoughness: { value: defaultConfig.wave.roughness, min: 0, max: 1 },
                waveThickness: { value: defaultConfig.wave.thickness, min: 0, max: 10 },
                waveDistortion: { value: defaultConfig.wave.distortion, min: 0, max: 2 },
                waveDistortionScale: { value: defaultConfig.wave.distortionScale, min: 0, max: 2, label: 'Noise Scale' },
                waveOpacity: { value: defaultConfig.wave.opacity, min: 0, max: 1 },
                waveChromAb: { value: defaultConfig.wave.chromaticAberration, min: 0, max: 2, label: 'ChromAb' },
                waveAnisotropy: { value: defaultConfig.wave.anisotropy, min: 0, max: 1 },
            })
        }),
        'Scene Colors': folder({
            planetColor: { value: defaultConfig.colors.planetoid, label: 'Planet' },
            orbitColor1: { value: defaultConfig.colors.orbits[0], label: 'Orbit 1' },
            orbitColor2: { value: defaultConfig.colors.orbits[1], label: 'Orbit 2' },
            orbitColor3: { value: defaultConfig.colors.orbits[2], label: 'Orbit 3' },
            orbitColor4: { value: defaultConfig.colors.orbits[3], label: 'Orbit 4' },
            orbitColor5: { value: defaultConfig.colors.orbits[4], label: 'Orbit 5' },
        }),
        'System': folder({
            exportConfig: button((get) => {
                const config = {
                    bloom: {
                        intensity: get('Environment.Post Processing.bloomIntensity'),
                        luminanceThreshold: get('Environment.Post Processing.bloomThreshold'),
                        radius: get('Environment.Post Processing.bloomRadius'),
                        mipmapBlur: true
                    },
                    chromaticAberration: {
                        offset: get('Environment.Post Processing.caOffset'),
                        radialModulation: true,
                        modulationOffset: get('Environment.Post Processing.caModulation')
                    },
                    noise: {
                        opacity: get('Environment.Post Processing.noiseOpacity')
                    },
                    vignette: {
                        offset: get('Environment.Post Processing.vignetteOffset'),
                        darkness: get('Environment.Post Processing.vignetteDarkness')
                    },
                    colors: {
                        background: get('Environment.Global Colors.bgColor'),
                        planetoid: get('Environment.Scene Colors.planetColor'),
                        planetoidEmissive: defaultConfig.colors.planetoidEmissive,
                        orbits: [
                            get('Environment.Scene Colors.orbitColor1'),
                            get('Environment.Scene Colors.orbitColor2'),
                            get('Environment.Scene Colors.orbitColor3'),
                            get('Environment.Scene Colors.orbitColor4'),
                            get('Environment.Scene Colors.orbitColor5')
                        ]
                    },
                    wave: {
                        speed: get('Environment.Wave Mechanics.Behavior.waveSpeed'),
                        maxScale: get('Environment.Wave Mechanics.Behavior.waveMaxScale'),
                        fadeInEnd: get('Environment.Wave Mechanics.Behavior.fadeInEnd'),
                        fadeOutStart: get('Environment.Wave Mechanics.Behavior.fadeOutStart'),
                        color: get('Environment.Wave Mechanics.Material.waveColor'),
                        roughness: get('Environment.Wave Mechanics.Material.waveRoughness'),
                        clearcoat: 1.0,
                        metalness: 0,
                        transmission: 1,
                        thickness: get('Environment.Wave Mechanics.Material.waveThickness'),
                        distortion: get('Environment.Wave Mechanics.Material.waveDistortion'),
                        distortionScale: get('Environment.Wave Mechanics.Material.waveDistortionScale'),
                        opacity: get('Environment.Wave Mechanics.Material.waveOpacity'),
                        chromaticAberration: get('Environment.Wave Mechanics.Material.waveChromAb'),
                        anisotropy: get('Environment.Wave Mechanics.Material.waveAnisotropy')
                    }
                };
                console.log('%c Configuration Export ', 'background: #222; color: #bada55; padding: 4px; border-radius: 4px;');
                console.log(JSON.stringify(config, null, 4));
                alert('Configuration logged to console! Open DevTools (F12) to copy.');
            })
        })
    });

    const waveConfig = useMemo(() => ({
        speed: waveSpeed,
        maxScale: waveMaxScale,
        fadeInEnd,
        fadeOutStart,
        color: waveColor,
        roughness: waveRoughness,
        thickness: waveThickness,
        distortion: waveDistortion,
        distortionScale: waveDistortionScale,
        opacity: waveOpacity,
        chromaticAberration: waveChromAb,
        anisotropy: waveAnisotropy,
        clearcoat: 1.0,
        metalness: 0,
        transmission: 1
    }), [waveSpeed, waveMaxScale, fadeInEnd, fadeOutStart, waveColor, waveRoughness, waveThickness, waveDistortion, waveOpacity, waveChromAb, waveAnisotropy, waveDistortionScale]);

    const sceneColors = useMemo(() => ({
        planetoid: planetColor,
        orbits: [orbitColor1, orbitColor2, orbitColor3, orbitColor4, orbitColor5],
        background: bgColor,
        planetoidEmissive: defaultConfig.colors.planetoidEmissive
    }), [planetColor, orbitColor1, orbitColor2, orbitColor3, orbitColor4, orbitColor5, bgColor]);

    /**
     * offset для ChromaticAberration мемоизирован, чтобы не создавать
     * новый Vector2 на каждый рендер.
     */
    const caOffsetVec = useMemo(() => new Vector2(caOffset, caOffset), [caOffset]);

    /**
     * CSS Vignette — заменяет GPU Vignette-эффект.
     * Использует radial-gradient с цветом фона, поэтому:
     * - Нет лишнего shader-прохода (бесплатно для GPU)
     * - Точно совпадает с цветом фона на AMOLED
     * - vignetteOffset управляет размером прозрачной зоны в центре
     * - vignetteDarkness управляет непрозрачностью краёв
     */
    const vignetteStyle = useMemo<React.CSSProperties>(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none' as const,
        zIndex: 1,
        background: `radial-gradient(
            ellipse at center,
            transparent ${Math.round(vignetteOffset * 100)}%,
            ${bgColor} ${Math.round(100 - vignetteDarkness * 20)}%
        )`,
    }), [vignetteOffset, vignetteDarkness, bgColor]);

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, background: bgColor }}>
            {/* CSS Vignette overlay — совпадает с цветом фона */}
            <div style={vignetteStyle} />
            <Canvas
                camera={{ position: [0, 0, 26], fov: 45 }}
                gl={{
                    antialias: perf.antialias,
                    alpha: false,
                    preserveDrawingBuffer: false,
                    // На слабых устройствах предпочитаем производительность
                    powerPreference: perf.tier === 'low' ? 'low-power' : 'high-performance',
                }}
                dpr={[1, perf.maxDpr]}
                // На low-тире рендер через requestAnimationFrame вместо setAnimationLoop
                // для Natural frame pacing
                frameloop="always"
            >
                <color attach="background" args={[bgColor]} />

                <Suspense fallback={null}>
                    <OrbitalWaves colors={sceneColors} waveConfig={waveConfig} perf={perf} />

                    {/*
                      * EffectComposer строго типизирует children,
                      * поэтому рендерим разные наборы эффектов.
                      *
                      * Vignette заменена CSS radial-gradient (см. выше).
                      * На low-тире EffectComposer не рендерится —
                      * ноль пост-процессинг-проходов.
                      */}
                    {perf.tier === 'high' && (
                        <EffectComposer enableNormalPass={false}>
                            <Bloom
                                luminanceThreshold={bloomThreshold}
                                mipmapBlur
                                intensity={bloomIntensity}
                                radius={bloomRadius}
                            />
                            <ChromaticAberration
                                offset={caOffsetVec}
                                radialModulation={true}
                                modulationOffset={caModulation}
                            />
                            <Noise opacity={noiseOpacity} />
                        </EffectComposer>
                    )}
                    {perf.tier === 'medium' && (
                        <EffectComposer enableNormalPass={false}>
                            <Bloom
                                luminanceThreshold={bloomThreshold}
                                mipmapBlur
                                intensity={bloomIntensity}
                                radius={bloomRadius}
                            />
                        </EffectComposer>
                    )}
                    {/* На low-тире — ноль пост-процессинга */}
                </Suspense>
            </Canvas>
        </div>
    );
};
