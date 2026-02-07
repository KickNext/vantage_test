import { useMemo, useCallback, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { PerformanceMonitor } from '@react-three/drei';
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

    /**
     * Адаптивный DPR, управляемый PerformanceMonitor.
     * onChange получает factor (0..1) и плавно масштабирует DPR
     * между minDpr и perf.maxDpr. Нет stale closure — factor
     * приходит напрямую из колбэка.
     *
     * Минимальный DPR зависит от тира:
     * - high: не ниже 1.0 (десктоп, нет смысла давить ниже)
     * - medium: не ниже 0.75
     * - low: не ниже 0.5
     */
    const minDpr = perf.tier === 'high' ? 1 : perf.tier === 'medium' ? 0.75 : 0.5;
    const [dpr, setDpr] = useState(perf.maxDpr);

    /**
     * Плавное масштабирование DPR через factor.
     * factor=0 → minDpr, factor=1 → perf.maxDpr.
     * Округляем до 0.25 для стабильности (избегаем микро-дроблений).
     */
    const handlePerformanceChange = useCallback(
        ({ factor }: { factor: number }) => {
            const newDpr = Math.round((minDpr + (perf.maxDpr - minDpr) * factor) * 4) / 4;
            setDpr(Math.max(minDpr, Math.min(perf.maxDpr, newDpr)));
        },
        [minDpr, perf.maxDpr],
    );

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
                    // Всегда запрашиваем мощный GPU —
                    // low-power может выбрать встроенный GPU,
                    // который ещё слабее.
                    powerPreference: 'high-performance',
                }}
                dpr={dpr}
                // flat отключает tone mapping на уровне Canvas —
                // один лишний shader-проход УБРАН.
                flat
                frameloop="always"
            >
                <color attach="background" args={[bgColor]} />

                {/*
                  * PerformanceMonitor замеряет реальный FPS и автоматически
                  * масштабирует DPR через onChange(factor).
                  * factor (0..1) → линейная интерполяция minDpr..maxDpr.
                  * 
                  * Не используем onIncline/onDecline (stale closure проблема),
                  * а получаем factor напрямую — всегда актуальное значение.
                  * 
                  * flipflops=5: даём больше времени на стабилизацию,
                  * чтобы intro-анимация не убила DPR навсегда.
                  */}
                <PerformanceMonitor
                    ms={300}
                    iterations={8}
                    factor={1}
                    step={0.05}
                    flipflops={5}
                    bounds={(refreshrate) => (refreshrate > 90 ? [50, 85] : [45, 58])}
                    onChange={handlePerformanceChange}
                    onFallback={() => setDpr(Math.max(minDpr, perf.maxDpr * 0.75))}
                />

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
                        <EffectComposer enableNormalPass={false} multisampling={0}>
                            <Bloom
                                luminanceThreshold={bloomThreshold}
                                mipmapBlur
                                intensity={bloomIntensity * 0.8}
                                radius={bloomRadius}
                                levels={3}
                            />
                        </EffectComposer>
                    )}
                    {/* На low-тире — ноль пост-процессинга */}
                </Suspense>
            </Canvas>
        </div>
    );
};
