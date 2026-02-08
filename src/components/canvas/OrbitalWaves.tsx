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
    renderConfig: WaveRenderConfig;
    sharedBuffer: Texture;
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

const ImpulseWave = memo(function ImpulseWave({
    orbit,
    data,
    config,
    onComplete,
    renderConfig,
    sharedBuffer,
}: WaveProps) {
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

    const rotation = useMemo(() => [orbit.rotationX, 0, orbit.rotationZ] as [number, number, number], [orbit]);

    useFrame((state) => {
        if (!data.active) {
            if (scaleGroupRef.current && scaleGroupRef.current.scale.x !== 0) {
                scaleGroupRef.current.scale.set(0, 0, 0);
            }
            return;
        }

        if (!scaleGroupRef.current) return;

        const elapsed = state.clock.getElapsedTime() - data.startTime;
        const duration = 1 / waveSpeed;
        const cycle = Math.min(Math.max(elapsed / duration, 0), 1);

        if (cycle >= 1) {
            onComplete(data.id);

            scaleGroupRef.current.scale.set(0, 0, 0);
            if (transmissionMeshRef.current) {
                const mat = transmissionMeshRef.current.material as WaveMaterialProperties;
                mat.distortion = 0;
                mat.thickness = 0;
                mat.opacity = 0;
            }
            return;
        }

        const minScale = 1.5;
        const scale = minScale + (cycle * (waveMaxScale - minScale));
        scaleGroupRef.current.scale.set(scale, 1, scale);

        let intensity = 0;
        if (cycle < fadeInEnd) {
            intensity = cycle / fadeInEnd;
        } else if (cycle > fadeOutStart) {
            intensity = 1 - (cycle - fadeOutStart) / (1 - fadeOutStart);
        } else {
            intensity = 1;
        }

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
                <mesh ref={transmissionMeshRef} rotation={[-Math.PI / 2, 0, 0]} frustumCulled>
                    <torusGeometry
                        args={[1, 0.5, renderConfig.torusSegments[0], renderConfig.torusSegments[1]]}
                    />
                    <MeshTransmissionMaterial
                        buffer={sharedBuffer}
                        resolution={renderConfig.transmissionResolution}
                        samples={renderConfig.transmissionSamples}
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

    const fboFrameCounter = useRef(0);
    const lastOrbitIndices = useRef<number[]>([]);
    const lastActiveWaveId = useRef<number>(-1);
    const hasFiredIntroWave = useRef(false);
    const triggerQueue = useRef(false);
    const cachedColor = useRef(new Color());
    const targetRotation = useRef<[number, number, number]>([0, 0, 0]);

    const fboRenderInterval = useMemo(() => {
        if (quality === 2) return perf.tier === 'high' ? 1 : 2;
        if (quality === 1) return perf.tier === 'high' ? 2 : 3;
        return 4;
    }, [perf.tier, quality]);

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
    );

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

    const wavesRef = useRef<WaveData[]>(wavePool);

    useEffect(() => {
        const waves = wavesRef.current;
        for (let i = maxActiveWaves; i < waves.length; i++) {
            waves[i].active = false;
        }
    }, [maxActiveWaves]);

    const triggerWaveAction = useCallback((state: { clock: { getElapsedTime: () => number } }) => {
        const waves = wavesRef.current;
        const activationLimit = Math.min(maxActiveWaves, waves.length);

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

        let nextOrbitIndex = Math.floor(Math.random() * orbitCount);
        let attempts = 0;
        while (lastOrbitIndices.current.includes(nextOrbitIndex) && attempts < 10) {
            nextOrbitIndex = Math.floor(Math.random() * orbitCount);
            attempts++;
        }

        const history = [nextOrbitIndex, ...lastOrbitIndices.current];
        if (history.length > 3) history.pop();
        lastOrbitIndices.current = history;

        const nextWave = waves[availableWaveIndex];
        if (!nextWave || nextWave.active) return;

        nextWave.active = true;
        nextWave.startTime = now;
        nextWave.orbitIndex = nextOrbitIndex;
        lastActiveWaveId.current = nextWave.id;
    }, [maxActiveWaves, orbits.length]);

    const handlePointerDown = useCallback(() => {
        triggerQueue.current = true;
    }, []);

    useEffect(() => {
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [handlePointerDown]);

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
            sceneGroup.updateMatrixWorld(true);
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
                const pointsCount = orbitLine.geometry.getAttribute('position').count;
                const currentCount = Math.floor(drawProgress * pointsCount);

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

                orbitGroup.updateMatrixWorld(true);
                sphereMesh.setMatrixAt(i, orbitAnchor.matrixWorld);
                hasSphereMatrixUpdates = true;
            }
        }

        if (sphereMesh && hasSphereMatrixUpdates) {
            sphereMesh.instanceMatrix.needsUpdate = true;
        }

        const hasActiveWaves = wavesRef.current.some((wave) => wave.active);

        if (hasActiveWaves && wavesGroupRef.current) {
            fboFrameCounter.current++;
            if (fboFrameCounter.current >= fboRenderInterval) {
                fboFrameCounter.current = 0;

                const oldToneMapping = state.gl.toneMapping;
                state.gl.toneMapping = NoToneMapping;

                wavesGroupRef.current.visible = false;
                state.gl.setRenderTarget(sharedFbo);
                state.gl.render(state.scene, state.camera);
                state.gl.setRenderTarget(null);
                wavesGroupRef.current.visible = true;

                state.gl.toneMapping = oldToneMapping;
            }
        } else {
            fboFrameCounter.current = 0;
        }

        if (lastActiveWaveId.current !== -1 && logoMaterialRef.current) {
            let activeWave: WaveData | undefined;
            for (const wave of wavesRef.current) {
                if (wave.id === lastActiveWaveId.current) {
                    activeWave = wave;
                    break;
                }
            }

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
                if (wave.active) deactivateWaveMutable(wave);
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

                <group ref={wavesGroupRef}>
                    {wavePool.map((wave) => (
                        <ImpulseWave
                            key={wave.id}
                            data={wave}
                            orbit={orbits[wave.orbitIndex]}
                            config={waveConfig}
                            onComplete={handleWaveComplete}
                            renderConfig={waveRenderConfig}
                            sharedBuffer={sharedFbo.texture}
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
