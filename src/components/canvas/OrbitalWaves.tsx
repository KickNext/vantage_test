import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
    BufferGeometry, Float32BufferAttribute, AdditiveBlending,
    Group, Mesh, TextureLoader, Color, AmbientLight, PointLight,
    MeshBasicMaterial, Line, LineBasicMaterial, Material, Texture,
    NoToneMapping
} from 'three';
import { easing } from 'maath';
import { MeshTransmissionMaterial, useFBO } from '@react-three/drei';
import { defaultConfig } from '../../config/defaults';
import type { PerformanceConfig } from '../../hooks/usePerformanceTier';

interface OrbitData {
    geometry: BufferGeometry;
    radius: number;
    colorIndex: number;
    speed: number;
    rotationX: number;
    rotationZ: number;
}

interface WaveData {
    active: boolean;
    startTime: number;
    orbitIndex: number;
    id: number;
}

interface WaveProps {
    orbit: OrbitData;
    data: WaveData;
    config: typeof defaultConfig.wave;
    onComplete: (id: number) => void;
    perf: PerformanceConfig;
    /**
     * Общая текстура сцены для рефракции.
     * Когда передана — MeshTransmissionMaterial пропускает
     * свой собственный FBO-рендер и использует эту текстуру.
     * Один буфер на все волны = O(1) вместо O(N) рендеров.
     */
    sharedBuffer: Texture;
}

/**
 * Расширенный интерфейс для доступа к свойствам MeshTransmissionMaterial
 * и MeshPhysicalMaterial через единый тип.
 */
interface WaveMaterialProperties extends Material {
    distortion: number;
    thickness: number;
    opacity: number;
    roughness: number;
    chromaticAberration: number;
    color: Color;
}

const ImpulseWave = ({ orbit, data, config, onComplete, perf, sharedBuffer }: WaveProps) => {
    const scaleGroupRef = useRef<Group>(null);
    const transmissionMeshRef = useRef<Mesh>(null);

    // Wave parameters from props
    const {
        speed: waveSpeed, maxScale: waveMaxScale, fadeInEnd, fadeOutStart,
        color: waveColor, roughness: waveRoughness, thickness: waveThickness,
        distortion: waveDistortion, opacity: waveOpacity,
        chromaticAberration: waveChromAb, anisotropy: waveAnisotropy, distortionScale: waveDistortionScale
    } = config;

    // Rotate to match orbit
    // UseMemo is safe here because orbit prop only changes when the wave is reused for a different orbit
    const rotation = useMemo(() => [orbit.rotationX, 0, orbit.rotationZ] as [number, number, number], [orbit]);

    useFrame((state) => {
        // Always ensuring resetting if inactive, though the exit condition usually handles it
        if (!data.active) {
            if (scaleGroupRef.current && scaleGroupRef.current.scale.x !== 0) {
                scaleGroupRef.current.scale.set(0, 0, 0);
            }
            return;
        }

        if (!scaleGroupRef.current) return;

        const t = state.clock.getElapsedTime();
        const elapsed = t - data.startTime;
        const duration = 1 / waveSpeed;
        const cycle = Math.min(Math.max(elapsed / duration, 0), 1);

        if (cycle >= 1) {
            onComplete(data.id);
            // Reset scale instantly to avoid visuals
            if (scaleGroupRef.current) scaleGroupRef.current.scale.set(0, 0, 0);
            // Reset material properties to ensure no ghostly artifacts
            if (transmissionMeshRef.current) {
                const mat = transmissionMeshRef.current.material as WaveMaterialProperties;
                mat.distortion = 0;
                mat.thickness = 0;
                mat.opacity = 0;
            }
            return;
        }

        // Expansion
        // Fix: Start wave from the surface of the Black Hole (Radius 2).
        // Torus Geometry is typically Radius 1. With tube 0.5, outer is 1.5.
        // We need scale * 1.5 > 2.0. So minScale ~1.4. Let's start at 1.5 to be safe.
        const minScale = 1.5;
        const scale = minScale + (cycle * (waveMaxScale - minScale));
        scaleGroupRef.current.scale.set(scale, 1, scale);

        // Intensity
        let intensity = 0;
        if (cycle < fadeInEnd) {
            intensity = cycle / fadeInEnd;
        } else if (cycle > fadeOutStart) {
            intensity = 1 - (cycle - fadeOutStart) / (1 - fadeOutStart);
        } else {
            intensity = 1;
        }

        // Material Logic
        if (transmissionMeshRef.current) {
            const mat = transmissionMeshRef.current.material as WaveMaterialProperties;
            mat.opacity = intensity * waveOpacity;
            mat.color.set(waveColor);
            mat.distortion = intensity * waveDistortion;
            mat.thickness = intensity * waveThickness;
            mat.roughness = waveRoughness;
            mat.chromaticAberration = waveChromAb;
        }
    });

    return (
        <group rotation={rotation}>
            <group ref={scaleGroupRef} scale={[0, 0, 0]}>
                <mesh ref={transmissionMeshRef} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={true}>
                    <torusGeometry args={[1, 0.5, perf.torusSegments[0], perf.torusSegments[1]]} />
                    {/*
                      * MeshTransmissionMaterial используется на ВСЕХ тирах.
                      * Ключевая оптимизация: проп buffer={sharedBuffer}
                      * указывает материалу использовать общую текстуру сцены
                      * вместо рендера собственного FBO.
                      *
                      * Без buffer: каждая волна = 1 полный рендер сцены.
                      * С sharedBuffer: все волны делят 1 рендер = O(1).
                      */}
                    <MeshTransmissionMaterial
                        buffer={sharedBuffer}
                        resolution={perf.transmissionResolution}
                        samples={perf.transmissionSamples}
                        thickness={0}
                        roughness={waveRoughness}
                        anisotropy={waveAnisotropy}
                        chromaticAberration={waveChromAb}
                        distortion={0}
                        distortionScale={waveDistortionScale}
                        temporalDistortion={0.1}
                        color={waveColor}
                        attenuationDistance={Infinity}
                        toneMapped={false}
                        transparent
                        depthWrite={false}
                    />
                </mesh>
            </group>
        </group>
    );
}

interface OrbitComponentProps {
    geometry: BufferGeometry;
    speed: number;
    rotationX: number;
    rotationZ: number;
    color: string;
    radius: number;
    index: number;
    active: boolean;
}

// Sine easing for smoother curved start/end
const easeInOutSine = (x: number): number => {
    return -(Math.cos(Math.PI * x) - 1) / 2;
};

const Orbit = ({ geometry, speed, rotationX, rotationZ, color, radius, index }: OrbitComponentProps) => {
    const groupRef = useRef<Group>(null);
    const lineRef = useRef<Line<BufferGeometry, LineBasicMaterial>>(null);
    const sphereRef = useRef<Mesh>(null);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const t = state.clock.getElapsedTime();
        const introDelay = 0.5; // Global waiting before start

        // Timing Configuration
        const drawDuration = 1.5;

        // Dynamic Start Time Calculation
        // "Accelerating cascade":
        // 1st->2nd gap: Large (0.9) - "First second ok"
        // 2nd->3rd gap: Medium (0.6) - Start acceleration
        // 3rd->4th gap: Short (0.3)  - Snap
        // Rest: Very short (0.1)     - Machine gun fire
        let accumulatedDelay = 0;
        for (let i = 1; i <= index; i++) {
            let waitFactor = 0.1;
            if (i === 1) waitFactor = 0.9;
            else if (i === 2) waitFactor = 0.6;
            else if (i === 3) waitFactor = 0.3;
            else waitFactor = 0.12;

            accumulatedDelay += drawDuration * waitFactor;
        }

        const start = introDelay + accumulatedDelay;
        const end = start + drawDuration;

        let drawProgress = 0;
        let opacity = 0;

        if (t < start) {
            drawProgress = 0;
            opacity = 0;
        } else if (t >= start && t <= end) {
            const rawProgress = (t - start) / drawDuration;
            drawProgress = easeInOutSine(rawProgress);
            opacity = 1.0;
        } else {
            drawProgress = 1;
            opacity = 0.6; // Settled state
        }

        // 1. Continuous Rotation
        groupRef.current.rotation.y += delta * speed;

        // 2. Draw Animation (Update line geometry)
        if (lineRef.current) {
            // Количество точек = сегменты + 1
            const pointsCount = lineRef.current.geometry.getAttribute('position').count;
            const currentCount = Math.floor(drawProgress * pointsCount);
            // setDrawRange(start, count)
            lineRef.current.geometry.setDrawRange(0, currentCount);
            lineRef.current.material.opacity = opacity;
        }

        // 3. Planetoid Leading the Line
        if (sphereRef.current) {
            // Visibility: Only visible while drawing or fully drawn
            sphereRef.current.visible = opacity > 0.01;

            // Position Calculation
            const angle = drawProgress * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            sphereRef.current.position.set(x, 0, z);

            // Scale effect
            const isDrawing = t >= start && t <= end;
            const baseScale = 0.06;
            const scale = isDrawing ? baseScale * 1.5 : baseScale;
            sphereRef.current.scale.setScalar(scale);
        }
    });

    // If speed is negative (CW rotation), we want the natural CW geometry (scale 1).
    // If speed is positive (CCW rotation), we want to flip geometry to be CCW (scale -1).
    // Natural geometry (cos, 0, sin) travels X -> Z which is clockwise in ThreeJS (Right -> Bottom).
    const directionScale = speed > 0 ? -1 : 1;

    return (
        <group ref={groupRef} rotation={[rotationX, 0, rotationZ]} scale={[directionScale, 1, 1]}>
            {/* Using basic 'line' instead of 'lineLoop' to allow open drawing without closing the gap immediately */}
            {/* @ts-expect-error — R3F line primitive конфликтует с SVG line в JSX типах */}
            <line ref={lineRef} geometry={geometry}>
                <lineBasicMaterial color={color} transparent opacity={0} blending={AdditiveBlending} linewidth={1} />
            </line>

            <mesh ref={sphereRef} position={[radius, 0, 0]}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
        </group>
    )
}

interface OrbitalWavesProps {
    colors: typeof defaultConfig.colors;
    waveConfig: typeof defaultConfig.wave;
    perf: PerformanceConfig;
}

export const OrbitalWaves = ({ colors, waveConfig, perf }: OrbitalWavesProps) => {
    const groupRef = useRef<Group>(null);
    const ambientLightRef = useRef<AmbientLight>(null);
    const mainLightRef = useRef<PointLight>(null);
    const logoMaterialRef = useRef<MeshBasicMaterial>(null);

    /** Группа волн — скрывается на время рендера в shared FBO */
    const wavesGroupRef = useRef<Group>(null);

    /**
     * Общий FBO для рефракции.
     * Сцена рендерится сюда один раз за кадр (без волн),
     * затем текстура передаётся каждому MeshTransmissionMaterial
     * через проп buffer — материал пропускает собственный FBO.
     * Разрешение адаптивно: high=256, medium=128, low=64.
     */
    const sharedFbo = useFBO(perf.transmissionResolution, perf.transmissionResolution);

    // Load Logo Texture
    const logoTexture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'logo_vantage.svg');

    // Use passed colors
    const orbitColors = colors.orbits;

    // Entrance state
    const [active, setActive] = useState(false);

    // Wave Management
    // Кол-во волн ограничено perf.maxWaves
    const [waves, setWaves] = useState<WaveData[]>(() =>
        Array.from({ length: perf.maxWaves }).map((_, i) => ({
            id: i,
            active: false,
            startTime: 0,
            orbitIndex: 0
        }))
    );

    const lastOrbitIndices = useRef<number[]>([]);
    const lastActiveWaveId = useRef<number>(-1);
    const hasFiredIntroWave = useRef<boolean>(false);
    const triggerQueue = useRef<boolean>(false);

    /**
     * Кэшированный экземпляр Color для переиспользования в useFrame.
     * Избегаем создания new Color() на каждом кадре,
     * что снижает нагрузку на GC.
     */
    const cachedColor = useRef(new Color());

    /** Орбиты с адаптивным кол-вом сегментов */
    const [orbits] = useState(() => {
        const segments = perf.orbitSegments;
        return Array.from({ length: 10 }).map((_, i) => {
            const radius = 3 + i * 1.5;
            const points = [];
            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * Math.PI * 2;
                points.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
            }
            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(points, 3));

            return {
                geometry,
                radius,
                colorIndex: i % 5,
                speed: (Math.random() * 0.1 + 0.05) * (i % 2 === 0 ? 1 : -1),
                rotationX: (Math.random() - 0.5) * Math.PI * 0.5,
                rotationZ: (Math.random() - 0.5) * Math.PI * 0.2,
            };
        });
    });

    const triggerWaveAction = (state: { clock: { getElapsedTime: () => number } }) => {
        const availableWaveIndex = waves.findIndex(w => !w.active);

        if (availableWaveIndex !== -1) {
            const now = state.clock.getElapsedTime();
            const orbitCount = 10;

            let nextIndex = Math.floor(Math.random() * orbitCount);
            // Avoid repeating recent orbits
            let attempts = 0;
            while (lastOrbitIndices.current.includes(nextIndex) && attempts < 10) {
                nextIndex = Math.floor(Math.random() * orbitCount);
                attempts++;
            }
            const newHistory = [nextIndex, ...lastOrbitIndices.current];
            if (newHistory.length > 3) newHistory.pop();
            lastOrbitIndices.current = newHistory;

            const newWaveId = waves[availableWaveIndex].id;
            lastActiveWaveId.current = newWaveId;

            setWaves(prev => {
                const copy = [...prev];
                copy[availableWaveIndex] = {
                    ...copy[availableWaveIndex],
                    active: true,
                    startTime: now,
                    orbitIndex: nextIndex
                };
                return copy;
            });
        }
    };

    const handlePointerDown = () => {
        triggerQueue.current = true;
    };

    // Global listener for background clicks
    useEffect(() => {
        const onGlobalClick = () => {
            triggerQueue.current = true;
        };
        window.addEventListener('pointerdown', onGlobalClick);
        return () => window.removeEventListener('pointerdown', onGlobalClick);
    }, []);

    useFrame((state, delta) => {
        // Auto-activate on mount/first frame
        if (!active) setActive(true);

        // ── Shared FBO ──────────────────────────────────────────
        // Рендерим сцену без волн в общий буфер один раз за кадр.
        // MeshTransmissionMaterial получает buffer={sharedFbo.texture}
        // и пропускает свой внутренний FBO-проход.
        // Результат: O(1) дополнительный рендер вместо O(N).
        if (wavesGroupRef.current) {
            const oldToneMapping = state.gl.toneMapping;
            state.gl.toneMapping = NoToneMapping;

            wavesGroupRef.current.visible = false;
            state.gl.setRenderTarget(sharedFbo);
            state.gl.render(state.scene, state.camera);
            state.gl.setRenderTarget(null);
            wavesGroupRef.current.visible = true;

            state.gl.toneMapping = oldToneMapping;
        }

        const now = state.clock.getElapsedTime();

        // 4. Update Logo Animation (Sync with last active wave)
        if (lastActiveWaveId.current !== -1 && logoMaterialRef.current) {
            const activeWave = waves.find(w => w.id === lastActiveWaveId.current);
            if (activeWave && activeWave.active) {
                const elapsed = now - activeWave.startTime;

                // Replicate ImpulseWave timing logic but faster
                const duration = 1 / waveConfig.speed;
                const cycle = Math.min(Math.max(elapsed / duration, 0), 1);

                // --- Logo Overlay Custom Timing ---
                // 1. "Fade out faster than wave": Snappier feel.
                // Start fading almost immediately (15%) and be gone by mid-wave (40%).
                const logoFadeStart = 0.15;
                const logoFadeEnd = 0.40;

                // 2. "Glow at beginning": Boost color intensity during the first 15%
                // Delayed slightly strictly to allow the wave to emerge first visually
                const startDelay = 0.02;
                const glowDuration = 0.15;
                // Glow strength определяет базовую интенсивность свечения лого

                let intensity = 0;
                const fadeIn = 0.05;

                if (cycle < startDelay) {
                    intensity = 0;
                } else if (cycle < startDelay + fadeIn) {
                    intensity = (cycle - startDelay) / fadeIn;
                } else if (cycle > logoFadeStart) {
                    const fadeProgress = (cycle - logoFadeStart) / (logoFadeEnd - logoFadeStart);
                    intensity = 1.0 - Math.min(Math.max(fadeProgress, 0), 1);
                } else {
                    intensity = 1;
                }

                // Apply to logo
                logoMaterialRef.current.opacity = intensity;

                // Set color with Glow (Bloom)
                // Переиспользуем кэшированный Color, чтобы не аллоцировать на каждом кадре
                const targetColorHex = orbitColors[orbits[activeWave.orbitIndex].colorIndex];
                const activeColor = cachedColor.current.set(targetColorHex);

                if (cycle > startDelay && cycle < startDelay + glowDuration) {
                    const glowProgress = (cycle - startDelay) / glowDuration;
                    const glowFalloff = 1 - glowProgress;
                    const boost = 1 + (glowFalloff * 2.0); // Boost up to 3x
                    activeColor.multiplyScalar(boost);
                }

                logoMaterialRef.current.color.copy(activeColor);

            } else {
                // Fade out smoothly if wave finishes or no wave
                easing.damp(logoMaterialRef.current, 'opacity', 0, 0.5, delta);
            }
        }

        // Process Trigger Queue
        if (triggerQueue.current) {
            triggerQueue.current = false;
            triggerWaveAction(state);
        }

        if (groupRef.current) {
            // ENTRANCE ANIMATION: "Loading Sequence"
            // 1. Scale fixed at 1 (No zoom out, just drawing)
            groupRef.current.scale.set(1, 1, 1);

            // 2. Rotation: Gentle stabilized drift relative to mouse
            const x = state.pointer.x * 0.2;
            const y = -state.pointer.y * 0.2; // Removed +0.5 offset so logo faces forward
            easing.dampE(groupRef.current.rotation, [y, x, 0], 1.5, delta);

            // 3. Lights
            // Intro sequence calculation:
            // IntroDelay(0.5) + Sum(delays) + DrawDuration(1.5).
            // Max accumulatedDelay ~3.8. End ~5.8s.
            // Let's set it to 6.0s to be safe and crisp.
            const introDuration = 6.0;
            const t = now;

            // Auto-fire first wave
            if (t > introDuration && !hasFiredIntroWave.current) {
                hasFiredIntroWave.current = true;
                triggerWaveAction(state);
            }

            const lightStart = 3.5;
            const ambIntensity = t > lightStart ? 0.4 : 0;
            const mainIntensity = t > lightStart ? 1.5 : 0;

            if (ambientLightRef.current) easing.damp(ambientLightRef.current, 'intensity', ambIntensity, 2.0, delta);
            if (mainLightRef.current) easing.damp(mainLightRef.current, 'intensity', mainIntensity, 2.0, delta);
        }
    });

    const handleWaveComplete = (id: number) => {
        setWaves(prev => {
            return prev.map(w => w.id === id ? { ...w, active: false } : w);
        });
    };

    return (
        <>
            <group ref={groupRef} onPointerDown={handlePointerDown} rotation={[0, 0, 0]}>
                <ambientLight ref={ambientLightRef} intensity={0} />
                <pointLight ref={mainLightRef} position={[10, 10, 10]} intensity={0} />

                {/* Rim light for the black hole effect - Fades in strictly */}
                <pointLight position={[-5, 5, -5]} intensity={active ? 0.5 : 0} color="#ffffff" distance={20} />

                {/* Central Black Hole: Replaces the planet */}
                <mesh onClick={(e) => { e.stopPropagation(); handlePointerDown(); }}>
                    <sphereGeometry args={[2, perf.sphereSegments[0], perf.sphereSegments[1]]} />
                    <meshBasicMaterial color="#0a0a0a" />
                </mesh>

                {/* Dynamic Wave Impulses — в группе для скрытия при FBO */}
                <group ref={wavesGroupRef}>
                    {waves.map(wave => (
                        <ImpulseWave
                            key={wave.id}
                            data={wave}
                            orbit={orbits[wave.orbitIndex]}
                            config={waveConfig}
                            onComplete={handleWaveComplete}
                            perf={perf}
                            sharedBuffer={sharedFbo.texture}
                        />
                    ))}
                </group>

                {/* Orbits */}
                {orbits.map((orbit, i) => (
                    <Orbit key={i} {...orbit} index={i} active={active} color={orbitColors[orbit.colorIndex]} />
                ))}
            </group>

            {/* Vantage Logo Overlay - Outside rotations to always face camera */}
            {/* Aspect Ratio 100:48 ~ 2.08. Black Hole Diameter = 4. Logo Width = 50% = 2. Height = 2 / 2.08 ~ 0.96 */}
            <mesh
                position={[0, 0, 2.2]}
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(); }}
            >
                <planeGeometry args={[2, 0.96]} />
                <meshBasicMaterial
                    ref={logoMaterialRef}
                    map={logoTexture}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </>
    );
};
