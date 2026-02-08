import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
    AdditiveBlending,
    AmbientLight,
    BufferGeometry,
    Color,
    DynamicDrawUsage,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Line,
    LineBasicMaterial,
    Material,
    Mesh,
    MeshBasicMaterial,
    NoToneMapping,
    PointLight,
    Texture,
    TextureLoader,
    TorusGeometry,
} from 'three';
import { easing } from 'maath';
import { MeshTransmissionMaterial, useFBO } from '@react-three/drei';
import { defaultConfig } from '../../config/defaults';
import type { PerformanceConfig } from '../../hooks/usePerformanceTier';

interface OrbitData {
    geometry: BufferGeometry;
    pointCount: number;
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
    orbits: OrbitData[];
    data: WaveData;
    config: typeof defaultConfig.wave;
    onComplete: (id: number) => void;
    renderConfig: WaveRenderConfig;
    transmissionSamples: number;
    sharedBuffer: Texture;
    torusGeometry: TorusGeometry;
}

interface WaveRenderConfig {
    torusSegments: [number, number];
    transmissionResolution: number;
    transmissionSamples: number;
}

interface WaveMaterialProperties extends Material {
    distortion: number;
    thickness: number;
    opacity: number;
    roughness: number;
    chromaticAberration: number;
    color: Color;
}

interface OrbitFrameState {
    lastDrawCount: number;
    lastOpacity: number;
    lastProgress: number;
    lastScale: number;
}

interface OrbitalWavesProps {
    colors: typeof defaultConfig.colors;
    waveConfig: typeof defaultConfig.wave;
    perf: PerformanceConfig;
    quality: 0 | 1 | 2;
}

const INTRO_DELAY = 0.5;
const DRAW_DURATION = 1.5;
const INTRO_DURATION = 6.0;
const LIGHT_START = 3.5;
const SECONDARY_WAVE_SAMPLES_RATIO = 0.55;
const TERTIARY_WAVE_SAMPLES_RATIO = 0.34;

const easeInOutSine = (x: number): number => {
    return -(Math.cos(Math.PI * x) - 1) / 2;
};

function getOrbitStartTime(index: number): number {
    let accumulatedDelay = 0;

    for (let i = 1; i <= index; i++) {
        let waitFactor = 0.1;
        if (i === 1) waitFactor = 0.9;
        else if (i === 2) waitFactor = 0.6;
        else if (i === 3) waitFactor = 0.3;
        else waitFactor = 0.12;

        accumulatedDelay += DRAW_DURATION * waitFactor;
    }

    return INTRO_DELAY + accumulatedDelay;
}

function deactivateWaveMutable(wave: WaveData): void {
    wave.active = false;
}

function getWaveSlotSamples(slotIndex: number, baseSamples: number): number {
    if (slotIndex <= 0) return baseSamples;
    if (slotIndex === 1) return Math.max(1, Math.round(baseSamples * SECONDARY_WAVE_SAMPLES_RATIO));
    return Math.max(1, Math.round(baseSamples * TERTIARY_WAVE_SAMPLES_RATIO));
}

const ImpulseWave = memo(function ImpulseWave({
    orbits,
    data,
    config,
    onComplete,
    renderConfig,
    transmissionSamples,
    sharedBuffer,
    torusGeometry,
}: WaveProps) {
    const orbitPlaneRef = useRef<Group>(null);
    const scaleGroupRef = useRef<Group>(null);
    const transmissionMeshRef = useRef<Mesh>(null);

    const {
        speed: waveSpeed,
        maxScale: waveMaxScale,
        fadeInEnd,
        fadeOutStart,
        color: waveColor,
        roughness: waveRoughness,
        thickness: waveThickness,
        distortion: waveDistortion,
        opacity: waveOpacity,
        chromaticAberration: waveChromAb,
        anisotropy: waveAnisotropy,
        distortionScale: waveDistortionScale,
    } = config;

    useFrame((state) => {
        const orbitPlane = orbitPlaneRef.current;
        const scaleGroup = scaleGroupRef.current;
        const transmissionMesh = transmissionMeshRef.current;
        if (!orbitPlane || !scaleGroup || !transmissionMesh) return;
        const mat = transmissionMesh.material as WaveMaterialProperties;

        if (!data.active) {
            if (scaleGroup.visible) scaleGroup.visible = false;
            return;
        }

        if (!scaleGroup.visible) {
            scaleGroup.visible = true;
            const orbit = orbits[data.orbitIndex];
            if (orbit) {
                orbitPlane.rotation.set(orbit.rotationX, 0, orbit.rotationZ);
            }
            mat.color.set(waveColor);
            mat.roughness = waveRoughness;
            mat.chromaticAberration = waveChromAb;
            mat.opacity = 0;
            mat.distortion = 0;
            mat.thickness = 0;
        }

        const elapsed = state.clock.getElapsedTime() - data.startTime;
        const duration = 1 / waveSpeed;
        const cycle = Math.min(Math.max(elapsed / duration, 0), 1);

        if (cycle >= 1) {
            onComplete(data.id);
            scaleGroup.visible = false;
            mat.distortion = 0;
            mat.thickness = 0;
            mat.opacity = 0;
            return;
        }

        const minScale = 1.5;
        const scale = minScale + (cycle * (waveMaxScale - minScale));
        scaleGroup.scale.set(scale, 1, scale);

        let intensity = 0;
        if (cycle < fadeInEnd) {
            intensity = cycle / fadeInEnd;
        } else if (cycle > fadeOutStart) {
            intensity = 1 - (cycle - fadeOutStart) / (1 - fadeOutStart);
        } else {
            intensity = 1;
        }

        mat.opacity = intensity * waveOpacity;
        mat.distortion = intensity * waveDistortion;
        mat.thickness = intensity * waveThickness;
    });

    return (
        <group ref={orbitPlaneRef}>
            <group ref={scaleGroupRef} visible={false}>
                <mesh
                    ref={transmissionMeshRef}
                    rotation={[-Math.PI / 2, 0, 0]}
                    geometry={torusGeometry}
                    frustumCulled
                >
                    <MeshTransmissionMaterial
                        buffer={sharedBuffer}
                        resolution={renderConfig.transmissionResolution}
                        samples={transmissionSamples}
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
});

export const OrbitalWaves = ({ colors, waveConfig, perf, quality }: OrbitalWavesProps) => {
    const groupRef = useRef<Group>(null);
    const ambientLightRef = useRef<AmbientLight>(null);
    const mainLightRef = useRef<PointLight>(null);
    const logoMaterialRef = useRef<MeshBasicMaterial>(null);
    const wavesGroupRef = useRef<Group>(null);
    const orbitSphereMeshRef = useRef<InstancedMesh>(null);

    const orbitGroupRefs = useRef<Array<Group | null>>([]);
    const orbitLineRefs = useRef<Array<Line<BufferGeometry, LineBasicMaterial> | null>>([]);
    const orbitAnchorRefs = useRef<Array<Group | null>>([]);

    const hasCachedTransmissionFrame = useRef(false);
    const lastOrbitIndexRef = useRef<number>(-1);
    const lastActiveWaveRef = useRef<WaveData | null>(null);
    const activeWavesCountRef = useRef(0);
    const hasFiredIntroWave = useRef(false);
    const triggerQueue = useRef(false);
    const cachedColor = useRef(new Color());
    const targetRotation = useRef<[number, number, number]>([0, 0, 0]);
    const transmissionCacheVersion = useRef(0);
    const capturedTransmissionCacheVersion = useRef(-1);

    const waveRenderConfig = useMemo<WaveRenderConfig>(() => {
        const [baseRadial, baseTubular] = perf.torusSegments;
        const segmentScale = quality === 2 ? 1 : quality === 1 ? 0.82 : 0.68;

        const torusSegments: [number, number] = [
            Math.max(16, Math.floor(baseRadial * segmentScale)),
            Math.max(32, Math.floor(baseTubular * segmentScale)),
        ];

        const transmissionResolution =
            quality === 2
                ? perf.transmissionResolution
                : quality === 1
                  ? Math.max(96, Math.floor(perf.transmissionResolution * 0.75))
                  : Math.max(64, Math.floor(perf.transmissionResolution * 0.55));

        const transmissionSamples =
            quality === 2
                ? perf.transmissionSamples
                : quality === 1
                  ? Math.max(2, perf.transmissionSamples - 2)
                  : 1;

        return {
            torusSegments,
            transmissionResolution,
            transmissionSamples,
        };
    }, [perf.torusSegments, perf.transmissionResolution, perf.transmissionSamples, quality]);

    const sharedFbo = useFBO(
        waveRenderConfig.transmissionResolution,
        waveRenderConfig.transmissionResolution,
        {
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false,
            samples: 0,
        },
    );

    useEffect(() => {
        sharedFbo.texture.generateMipmaps = false;
    }, [sharedFbo]);

    const waveTorusGeometry = useMemo(
        () =>
            new TorusGeometry(
                1,
                0.5,
                waveRenderConfig.torusSegments[0],
                waveRenderConfig.torusSegments[1],
            ),
        [waveRenderConfig.torusSegments],
    );

    useEffect(() => {
        return () => waveTorusGeometry.dispose();
    }, [waveTorusGeometry]);

    useEffect(() => {
        transmissionCacheVersion.current += 1;
        hasCachedTransmissionFrame.current = false;
    }, [quality, waveRenderConfig.transmissionResolution, waveRenderConfig.transmissionSamples]);

    const logoTexture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'logo_vantage.svg');

    const orbitSphereSegments = useMemo<[number, number]>(() => {
        if (quality === 0) return [8, 8];
        if (quality === 1) return perf.tier === 'high' ? [12, 12] : [10, 10];
        if (perf.tier === 'low') return [10, 10];
        if (perf.tier === 'medium') return [12, 12];
        return [16, 16];
    }, [perf.tier, quality]);

    const coreSphereSegments = useMemo<[number, number]>(() => {
        if (quality === 2) return [20, 20];
        if (quality === 1) return [14, 14];
        return [10, 10];
    }, [quality]);

    const [orbits] = useState<OrbitData[]>(() => {
        const segments = perf.orbitSegments;

        return Array.from({ length: 10 }).map((_, i) => {
            const radius = 3 + i * 1.5;
            const points: number[] = [];

            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * Math.PI * 2;
                points.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
            }

            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(points, 3));

            return {
                geometry,
                pointCount: segments + 1,
                radius,
                colorIndex: i % 5,
                speed: (Math.random() * 0.1 + 0.05) * (i % 2 === 0 ? 1 : -1),
                rotationX: (Math.random() - 0.5) * Math.PI * 0.5,
                rotationZ: (Math.random() - 0.5) * Math.PI * 0.2,
            };
        });
    });

    const orbitDrawWindows = useMemo(
        () =>
            orbits.map((_, index) => {
                const start = getOrbitStartTime(index);
                return { start, end: start + DRAW_DURATION };
            }),
        [orbits],
    );

    const orbitLines = useMemo(
        () =>
            orbits.map(
                (orbit) =>
                    new Line(
                        orbit.geometry,
                        new LineBasicMaterial({
                            color: colors.orbits[orbit.colorIndex],
                            transparent: true,
                            opacity: 0,
                            blending: AdditiveBlending,
                            linewidth: 1,
                        }),
                    ),
            ),
        [colors.orbits, orbits],
    );

    const orbitFrameStateRef = useRef<OrbitFrameState[]>(
        Array.from({ length: orbits.length }).map(() => ({
            lastDrawCount: -1,
            lastOpacity: -1,
            lastProgress: -1,
            lastScale: -1,
        })),
    );

    useEffect(() => {
        return () => {
            for (const orbit of orbits) {
                orbit.geometry.dispose();
            }
        };
    }, [orbits]);

    useEffect(() => {
        return () => {
            for (const orbitLine of orbitLines) {
                orbitLine.material.dispose();
            }
        };
    }, [orbitLines]);

    useEffect(() => {
        const sphereMesh = orbitSphereMeshRef.current;
        if (!sphereMesh) return;
        sphereMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }, []);

    const maxActiveWaves = useMemo(() => {
        if (quality === 2) return perf.maxWaves;
        if (quality === 1) return Math.max(2, perf.maxWaves - 1);
        return Math.max(1, perf.maxWaves - 2);
    }, [perf.maxWaves, quality]);

    const [wavePool] = useState<WaveData[]>(() =>
        Array.from({ length: perf.maxWaves }).map((_, i) => ({
            id: i,
            active: false,
            startTime: 0,
            orbitIndex: 0,
        })),
    );

    const waveSlotTransmissionSamples = useMemo(
        () =>
            Array.from({ length: wavePool.length }, (_, slotIndex) =>
                getWaveSlotSamples(slotIndex, waveRenderConfig.transmissionSamples),
            ),
        [wavePool.length, waveRenderConfig.transmissionSamples],
    );

    const wavesRef = useRef<WaveData[]>(wavePool);

    useEffect(() => {
        const waves = wavesRef.current;
        let activeCount = 0;

        for (let i = 0; i < waves.length; i++) {
            const wave = waves[i];
            if (!wave) continue;

            if (i >= maxActiveWaves && wave.active) {
                wave.active = false;
                if (lastActiveWaveRef.current?.id === wave.id) {
                    lastActiveWaveRef.current = null;
                }
                continue;
            }

            if (wave.active) activeCount += 1;
        }

        activeWavesCountRef.current = activeCount;

    }, [maxActiveWaves]);

    const triggerWaveAction = useCallback((state: { clock: { getElapsedTime: () => number } }) => {
        const waves = wavesRef.current;
        const activationLimit = Math.min(maxActiveWaves, waves.length);
        const hadActiveWaves = activeWavesCountRef.current > 0;

        let availableWaveIndex = -1;
        for (let i = 0; i < activationLimit; i++) {
            if (!waves[i].active) {
                availableWaveIndex = i;
                break;
            }
        }

        if (availableWaveIndex === -1) return;

        const now = state.clock.getElapsedTime();
        const orbitCount = orbits.length;
        const previousOrbitIndex = lastOrbitIndexRef.current;

        const isBusyOrbit = (orbitIndex: number): boolean => {
            for (let i = 0; i < activationLimit; i++) {
                const wave = waves[i];
                if (wave.active && wave.orbitIndex === orbitIndex) return true;
            }
            return false;
        };

        let nextOrbitIndex = -1;
        const randomAttempts = Math.max(orbitCount * 2, 8);
        for (let attempt = 0; attempt < randomAttempts; attempt++) {
            const candidate = Math.floor(Math.random() * orbitCount);
            if (candidate === previousOrbitIndex) continue;
            if (isBusyOrbit(candidate)) continue;
            nextOrbitIndex = candidate;
            break;
        }

        if (nextOrbitIndex === -1) {
            for (let i = 0; i < orbitCount; i++) {
                if (i === previousOrbitIndex) continue;
                if (isBusyOrbit(i)) continue;
                nextOrbitIndex = i;
                break;
            }
        }

        if (nextOrbitIndex === -1) {
            if (orbitCount > 1 && previousOrbitIndex >= 0) {
                nextOrbitIndex =
                    (previousOrbitIndex + 1 + Math.floor(Math.random() * (orbitCount - 1))) % orbitCount;
            } else {
                nextOrbitIndex = Math.floor(Math.random() * orbitCount);
            }
        }

        lastOrbitIndexRef.current = nextOrbitIndex;

        const nextWave = waves[availableWaveIndex];
        if (!nextWave || nextWave.active) return;

        nextWave.active = true;
        nextWave.startTime = now;
        nextWave.orbitIndex = nextOrbitIndex;
        activeWavesCountRef.current += 1;
        lastActiveWaveRef.current = nextWave;
        if (wavesGroupRef.current && !wavesGroupRef.current.visible) {
            wavesGroupRef.current.visible = true;
        }
        // Preserve the offscreen refraction cache while waves are already active.
        // Rebuild it only when entering the active state from idle.
        if (!hadActiveWaves) {
            transmissionCacheVersion.current += 1;
            hasCachedTransmissionFrame.current = false;
        }
    }, [maxActiveWaves, orbits.length]);

    const handlePointerDown = useCallback(() => {
        triggerQueue.current = true;
    }, []);

    useEffect(() => {
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [handlePointerDown]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            transmissionCacheVersion.current += 1;
            hasCachedTransmissionFrame.current = false;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useFrame((state, delta) => {
        const now = state.clock.getElapsedTime();

        const sceneGroup = groupRef.current;
        if (sceneGroup) {
            const x = state.pointer.x * 0.2;
            const y = -state.pointer.y * 0.2;
            const nextRotation = targetRotation.current;
            nextRotation[0] = y;
            nextRotation[1] = x;
            nextRotation[2] = 0;
            easing.dampE(sceneGroup.rotation, nextRotation, 1.5, delta);
        }

        const sphereMesh = orbitSphereMeshRef.current;
        let hasSphereMatrixUpdates = false;

        for (let i = 0; i < orbits.length; i++) {
            const orbit = orbits[i];
            const window = orbitDrawWindows[i];
            const runtime = orbitFrameStateRef.current[i];
            const orbitGroup = orbitGroupRefs.current[i];
            const orbitLine = orbitLineRefs.current[i];
            const orbitAnchor = orbitAnchorRefs.current[i];

            if (!runtime) continue;

            let drawProgress = 0;
            let opacity = 0;
            let isDrawing = false;

            if (now < window.start) {
                drawProgress = 0;
                opacity = 0;
            } else if (now <= window.end) {
                const rawProgress = (now - window.start) / DRAW_DURATION;
                drawProgress = easeInOutSine(rawProgress);
                opacity = 1;
                isDrawing = true;
            } else {
                drawProgress = 1;
                opacity = 0.6;
            }

            if (orbitGroup) {
                orbitGroup.rotation.y += delta * orbit.speed;
            }

            if (orbitLine) {
                const currentCount = Math.floor(drawProgress * orbit.pointCount);

                if (runtime.lastDrawCount !== currentCount) {
                    orbitLine.geometry.setDrawRange(0, currentCount);
                    runtime.lastDrawCount = currentCount;
                }

                if (runtime.lastOpacity !== opacity) {
                    orbitLine.material.opacity = opacity;
                    runtime.lastOpacity = opacity;
                }
            }

            if (orbitGroup && orbitAnchor && sphereMesh) {
                if (runtime.lastProgress !== drawProgress) {
                    const angle = drawProgress * Math.PI * 2;
                    orbitAnchor.position.set(Math.cos(angle) * orbit.radius, 0, Math.sin(angle) * orbit.radius);
                    runtime.lastProgress = drawProgress;
                }

                const targetScale = opacity > 0.01 ? (isDrawing ? 0.09 : 0.06) : 0.0001;
                if (runtime.lastScale !== targetScale) {
                    orbitAnchor.scale.setScalar(targetScale);
                    runtime.lastScale = targetScale;
                }

                orbitAnchor.updateWorldMatrix(true, false);
                sphereMesh.setMatrixAt(i, orbitAnchor.matrixWorld);
                hasSphereMatrixUpdates = true;
            }
        }

        if (sphereMesh && hasSphereMatrixUpdates) {
            sphereMesh.instanceMatrix.needsUpdate = true;
        }

        const hasActiveWaves = activeWavesCountRef.current > 0;
        const wavesGroup = wavesGroupRef.current;

        if (wavesGroup) {
            // Skip rendering all idle transmission meshes when there are no active waves.
            wavesGroup.visible = hasActiveWaves;
        }

        if (hasActiveWaves && wavesGroup) {
            const cacheVersionChanged =
                capturedTransmissionCacheVersion.current !== transmissionCacheVersion.current;

            // Cache scene refraction source once per cache version and reuse it across active waves.
            if (!hasCachedTransmissionFrame.current || cacheVersionChanged) {
                const gl = state.gl;
                if (!gl.getContext().isContextLost()) {
                    const oldToneMapping = gl.toneMapping;
                    const oldRenderTarget = gl.getRenderTarget();
                    wavesGroup.visible = false;

                    try {
                        gl.toneMapping = NoToneMapping;
                        gl.setRenderTarget(sharedFbo);
                        gl.render(state.scene, state.camera);
                        hasCachedTransmissionFrame.current = true;
                        capturedTransmissionCacheVersion.current = transmissionCacheVersion.current;
                    } finally {
                        gl.setRenderTarget(oldRenderTarget);
                        gl.toneMapping = oldToneMapping;
                        wavesGroup.visible = true;
                    }
                }
            }
        } else if (hasCachedTransmissionFrame.current) {
            hasCachedTransmissionFrame.current = false;
        }

        if (logoMaterialRef.current) {
            const activeWave = lastActiveWaveRef.current;

            if (activeWave?.active) {
                const elapsed = now - activeWave.startTime;
                const duration = 1 / waveConfig.speed;
                const cycle = Math.min(Math.max(elapsed / duration, 0), 1);

                const logoFadeStart = 0.15;
                const logoFadeEnd = 0.4;
                const startDelay = 0.02;
                const glowDuration = 0.15;
                const fadeIn = 0.05;

                let intensity = 0;

                if (cycle < startDelay) {
                    intensity = 0;
                } else if (cycle < startDelay + fadeIn) {
                    intensity = (cycle - startDelay) / fadeIn;
                } else if (cycle > logoFadeStart) {
                    const fadeProgress = (cycle - logoFadeStart) / (logoFadeEnd - logoFadeStart);
                    intensity = 1 - Math.min(Math.max(fadeProgress, 0), 1);
                } else {
                    intensity = 1;
                }

                logoMaterialRef.current.opacity = intensity;

                const targetColorHex = colors.orbits[orbits[activeWave.orbitIndex].colorIndex];
                const activeColor = cachedColor.current.set(targetColorHex);

                if (cycle > startDelay && cycle < startDelay + glowDuration) {
                    const glowProgress = (cycle - startDelay) / glowDuration;
                    const glowFalloff = 1 - glowProgress;
                    activeColor.multiplyScalar(1 + glowFalloff * 2);
                }

                logoMaterialRef.current.color.copy(activeColor);
            } else {
                easing.damp(logoMaterialRef.current, 'opacity', 0, 0.5, delta);
            }
        }

        if (triggerQueue.current) {
            triggerQueue.current = false;
            triggerWaveAction(state);
        }

        if (now > INTRO_DURATION && !hasFiredIntroWave.current) {
            hasFiredIntroWave.current = true;
            triggerWaveAction(state);
        }

        const ambientIntensity = now > LIGHT_START ? 0.4 : 0;
        const mainIntensity = now > LIGHT_START ? 1.5 : 0;

        if (ambientLightRef.current) {
            easing.damp(ambientLightRef.current, 'intensity', ambientIntensity, 2, delta);
        }

        if (mainLightRef.current) {
            easing.damp(mainLightRef.current, 'intensity', mainIntensity, 2, delta);
        }
    });

    const handleWaveComplete = useCallback((id: number) => {
        for (const wave of wavesRef.current) {
            if (wave.id === id) {
                if (wave.active) {
                    deactivateWaveMutable(wave);
                    activeWavesCountRef.current = Math.max(0, activeWavesCountRef.current - 1);
                    if (lastActiveWaveRef.current?.id === id) {
                        lastActiveWaveRef.current = null;
                    }
                }
                break;
            }
        }
    }, []);

    return (
        <>
            <group ref={groupRef} onPointerDown={handlePointerDown} rotation={[0, 0, 0]}>
                <ambientLight ref={ambientLightRef} intensity={0} />
                <pointLight ref={mainLightRef} position={[10, 10, 10]} intensity={0} />
                <pointLight position={[-5, 5, -5]} intensity={0.5} color="#ffffff" distance={20} />

                <mesh
                    onClick={(event) => {
                        event.stopPropagation();
                        handlePointerDown();
                    }}
                >
                    <sphereGeometry args={[2, coreSphereSegments[0], coreSphereSegments[1]]} />
                    <meshBasicMaterial color="#0a0a0a" />
                </mesh>

                <group ref={wavesGroupRef} visible={false}>
                    {wavePool.map((wave) => (
                        <ImpulseWave
                            key={wave.id}
                            data={wave}
                            orbits={orbits}
                            config={waveConfig}
                            onComplete={handleWaveComplete}
                            renderConfig={waveRenderConfig}
                            transmissionSamples={
                                waveSlotTransmissionSamples[wave.id] ?? waveRenderConfig.transmissionSamples
                            }
                            sharedBuffer={sharedFbo.texture}
                            torusGeometry={waveTorusGeometry}
                        />
                    ))}
                </group>

                {orbits.map((orbit, index) => {
                    const directionScale = orbit.speed > 0 ? -1 : 1;
                    return (
                        <group
                            key={index}
                            ref={(group) => {
                                orbitGroupRefs.current[index] = group;
                            }}
                            rotation={[orbit.rotationX, 0, orbit.rotationZ]}
                            scale={[directionScale, 1, 1]}
                        >
                            <primitive
                                object={orbitLines[index]}
                                ref={(line: unknown) => {
                                    orbitLineRefs.current[index] =
                                        line as unknown as Line<BufferGeometry, LineBasicMaterial> | null;
                                }}
                            />

                            <group
                                ref={(anchor) => {
                                    orbitAnchorRefs.current[index] = anchor;
                                }}
                                position={[orbit.radius, 0, 0]}
                                scale={[0.0001, 0.0001, 0.0001]}
                            />
                        </group>
                    );
                })}

            </group>

            <instancedMesh
                ref={orbitSphereMeshRef}
                args={[undefined, undefined, orbits.length]}
                frustumCulled={false}
            >
                <sphereGeometry args={[1, orbitSphereSegments[0], orbitSphereSegments[1]]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </instancedMesh>

            <mesh
                position={[0, 0, 2.2]}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    handlePointerDown();
                }}
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
