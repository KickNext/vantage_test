import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
    BufferGeometry,
    Color,
    DoubleSide,
    DynamicDrawUsage,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Material,
    Mesh,
    MeshBasicMaterial,
    NoToneMapping,
    NormalBlending,
    Texture,
    TextureLoader,
    TorusGeometry,
} from 'three';
import { easing } from 'maath';
import { MeshTransmissionMaterial, useFBO } from '@react-three/drei';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { defaultConfig } from '../../config/defaults';
import type { PerformanceConfig } from '../../config/performance';
import { computeOrbitGeometry } from './gpu';
import type { GPUComputeConfig } from './gpu';

interface OrbitData {
    geometry: BufferGeometry;
    pointCount: number;
    radius: number;
    radiusX: number;
    radiusZ: number;
    phaseOffset: number;
    colorIndex: number;
    speed: number;
    rotationX: number;
    rotationY: number;
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
    renderProfile: WaveSlotRenderProfile;
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

interface WaveSlotRenderProfile {
    samples: number;
    distortionFactor: number;
    chromaticFactor: number;
    opacityFactor: number;
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
    layoutPreset: OrbitLayoutPreset;
}

export type OrbitLayoutPreset =
    | 'cameraAware'
    | 'pairedFan'
    | 'waveArc'
    | 'orbitalCrown'
    | 'phaseLattice'
    | 'meridianWeave';

const INTRO_DELAY = defaultConfig.animation.introDelay;
const DRAW_DURATION = defaultConfig.animation.drawDuration;
const INTRO_DURATION = defaultConfig.animation.introDuration;
const LOGO_VISIBILITY_EPSILON = 0.01;

const ORBIT_LAYOUT_CONFIG: Record<OrbitLayoutPreset, { baseRadius: number; radiusStep: number }> = {
    cameraAware: {
        baseRadius: 4.8,
        radiusStep: 1.22,
    },
    pairedFan: {
        baseRadius: 4,
        radiusStep: 1.35,
    },
    waveArc: {
        baseRadius: 4.4,
        radiusStep: 1.28,
    },
    orbitalCrown: {
        baseRadius: 4.9,
        radiusStep: 1.18,
    },
    phaseLattice: {
        baseRadius: 4.55,
        radiusStep: 1.26,
    },
    meridianWeave: {
        baseRadius: 4.7,
        radiusStep: 1.22,
    },
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

function getOrbitLineBaseWidthPx(quality: 0 | 1 | 2): number {
    const widths = defaultConfig.orbits.lineWidthByQuality;
    return widths[quality];
}

function getOrbitSegments(baseSegments: number, quality: 0 | 1 | 2): number {
    const qualityFactor = quality === 2 ? 1.45 : quality === 1 ? 1.3 : 1.15;
    const retinaFactor = typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.5 ? 1.2 : 1;
    const segmentBoostFactor = 1.1;
    const targetSegments = Math.floor(baseSegments * qualityFactor * retinaFactor * segmentBoostFactor);
    const maxSegments = 256;
    return Math.min(maxSegments, Math.max(baseSegments, targetSegments));
}

function getOrbitPlacement(
    index: number,
    total: number,
    preset: OrbitLayoutPreset,
): Pick<OrbitData, 'rotationX' | 'rotationY' | 'rotationZ'> {
    if (preset === 'pairedFan') {
        if (total <= 1) {
            return { rotationX: 0, rotationY: 0, rotationZ: 0 };
        }

        if (index === 0) {
            return { rotationX: 0, rotationY: 0, rotationZ: 0 };
        }

        const pairCount = Math.ceil((total - 1) / 2);
        const pairIndex = Math.floor((index - 1) / 2) + 1;
        const direction = index % 2 === 0 ? 1 : -1;
        const pairT = pairCount > 0 ? pairIndex / pairCount : 0;

        const minTiltX = Math.PI * 0.03;
        const maxTiltX = Math.PI * 0.16;
        const maxTiltZ = Math.PI * 0.045;

        const tiltX = minTiltX + (maxTiltX - minTiltX) * Math.pow(pairT, 0.9);
        const tiltZ = maxTiltZ * (1 - pairT * 0.35);

        return {
            rotationX: direction * tiltX,
            rotationY: 0,
            rotationZ: direction * tiltZ,
        };
    }

    if (preset === 'waveArc') {
        if (total <= 1) {
            return { rotationX: Math.PI * 0.17, rotationY: 0, rotationZ: 0 };
        }

        const normalized = index / (total - 1);
        const centered = normalized * 2 - 1;
        const arcWave = Math.sin(normalized * Math.PI * 2);
        const detailWave = Math.cos(normalized * Math.PI * 3);

        const baseTiltX = Math.PI * 0.17;
        const waveTiltX = Math.PI * 0.035;
        const baseFanZ = Math.PI * 0.014;
        const detailFanZ = Math.PI * 0.008;

        return {
            rotationX: baseTiltX + arcWave * waveTiltX,
            rotationY: 0,
            rotationZ: centered * baseFanZ + detailWave * detailFanZ,
        };
    }

    if (preset === 'orbitalCrown') {
        if (total <= 1) {
            return { rotationX: Math.PI * 0.16, rotationY: 0, rotationZ: Math.PI * 0.03 };
        }

        const normalized = index / (total - 1);
        const crownPhase = normalized * Math.PI * 2;
        const petalWave = Math.sin(crownPhase * 3);
        const shoulderWave = Math.cos(crownPhase * 2);

        const baseTiltX = Math.PI * 0.155;
        const petalLiftX = Math.PI * 0.045;
        const maxYawY = Math.PI / 2;
        const rollWaveZ = Math.PI * 0.028;

        return {
            rotationX: baseTiltX + petalWave * petalLiftX,
            rotationY: normalized * maxYawY,
            rotationZ: shoulderWave * rollWaveZ,
        };
    }

    if (preset === 'phaseLattice') {
        if (total <= 1) {
            return { rotationX: Math.PI * 0.18, rotationY: 0, rotationZ: 0 };
        }

        const normalized = index / (total - 1);
        const centered = normalized * 2 - 1;
        const phase = normalized * Math.PI * 2;
        const lane = (index % 3) - 1; // -1, 0, 1
        const laneTilt = lane * Math.PI * 0.055;
        const swayWave = Math.sin(phase * 2.2);
        const yawWave = Math.cos(phase * 1.7);
        const altSign = index % 2 === 0 ? 1 : -1;

        const baseTiltX = Math.PI * 0.11;
        const swayTiltX = Math.PI * 0.03;
        const yawFanY = Math.PI * 0.44;
        const yawDetailY = Math.PI * 0.11;
        const rollZ = Math.PI * 0.06;

        return {
            rotationX: baseTiltX + laneTilt + swayWave * swayTiltX,
            rotationY: centered * yawFanY + yawWave * yawDetailY,
            rotationZ: altSign * rollZ,
        };
    }

    if (preset === 'meridianWeave') {
        if (total <= 1) {
            return { rotationX: Math.PI * 0.46, rotationY: 0, rotationZ: 0 };
        }

        const normalized = index / (total - 1);
        const centered = normalized * 2 - 1;
        const weaveWave = Math.sin(normalized * Math.PI * 4);
        const shoulderWave = Math.cos(normalized * Math.PI * 3);
        const sign = index % 2 === 0 ? 1 : -1;

        const baseTiltX = Math.PI * 0.46;
        const weaveTiltX = Math.PI * 0.08;
        const fanY = Math.PI * 0.62;
        const shoulderY = Math.PI * 0.08;
        const weaveRollZ = Math.PI * 0.06;

        return {
            rotationX: baseTiltX + weaveWave * weaveTiltX,
            rotationY: centered * fanY + shoulderWave * shoulderY,
            rotationZ: sign * weaveRollZ,
        };
    }

    if (total <= 1) {
        return { rotationX: Math.PI * 0.19, rotationY: 0, rotationZ: 0 };
    }

    const normalized = index / (total - 1);
    const centered = normalized * 2 - 1;
    const centerWeight = 1 - Math.abs(centered);

    // Camera-aware layout: keep one readable ring family angle with a tiny roll fan.
    const baseTiltX = Math.PI * 0.19;
    const centerLiftX = Math.PI * 0.025;
    const maxFanZ = Math.PI * 0.028;

    return {
        rotationX: baseTiltX + centerWeight * centerLiftX,
        rotationY: 0,
        rotationZ: centered * maxFanZ,
    };
}

function getWaveSlotRenderProfile(
    slotIndex: number,
    baseSamples: number,
    quality: 0 | 1 | 2,
): WaveSlotRenderProfile {
    if (slotIndex <= 0) {
        return {
            samples: baseSamples,
            distortionFactor: 1,
            chromaticFactor: 1,
            opacityFactor: 1,
        };
    }

    if (slotIndex === 1) {
        const slotOneSamples =
            quality === 2 ? Math.max(2, Math.floor(baseSamples * 0.55)) : Math.max(1, Math.floor(baseSamples * 0.5));

        return {
            samples: slotOneSamples,
            distortionFactor: 0.78,
            chromaticFactor: 0.72,
            opacityFactor: 0.92,
        };
    }

    if (slotIndex === 2) {
        return {
            samples: Math.max(1, Math.floor(baseSamples * 0.35)),
            distortionFactor: 0.58,
            chromaticFactor: 0.48,
            opacityFactor: 0.84,
        };
    }

    const fallbackSamples = 1;
    const fallbackDistortion = quality === 0 ? 0.3 : quality === 1 ? 0.38 : 0.44;
    const fallbackChromatic = quality === 0 ? 0.12 : quality === 1 ? 0.18 : 0.24;
    const fallbackOpacity = quality === 0 ? 0.68 : quality === 1 ? 0.74 : 0.78;

    return {
        samples: fallbackSamples,
        distortionFactor: fallbackDistortion,
        chromaticFactor: fallbackChromatic,
        opacityFactor: fallbackOpacity,
    };
}

const ImpulseWave = memo(function ImpulseWave({
    orbits,
    data,
    config,
    onComplete,
    renderConfig,
    renderProfile,
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
        temporalDistortion: waveTemporalDistortion,
        minScale: waveMinScale,
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
                orbitPlane.rotation.set(orbit.rotationX, orbit.rotationY, orbit.rotationZ);
            }
            mat.color.set(waveColor);
            mat.roughness = waveRoughness;
            mat.chromaticAberration = waveChromAb * renderProfile.chromaticFactor;
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

        const scale = waveMinScale + (cycle * (waveMaxScale - waveMinScale));
        scaleGroup.scale.set(scale, 1, scale);

        let intensity = 0;
        if (cycle < fadeInEnd) {
            intensity = cycle / fadeInEnd;
        } else if (cycle > fadeOutStart) {
            intensity = 1 - (cycle - fadeOutStart) / (1 - fadeOutStart);
        } else {
            intensity = 1;
        }

        const opacity = intensity * waveOpacity * renderProfile.opacityFactor;
        mat.opacity = opacity;
        mat.distortion = intensity * waveDistortion * renderProfile.distortionFactor;
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
                        samples={renderProfile.samples}
                        thickness={0}
                        roughness={waveRoughness}
                        anisotropy={waveAnisotropy}
                        chromaticAberration={waveChromAb * renderProfile.chromaticFactor}
                        distortion={0}
                        distortionScale={waveDistortionScale}
                        temporalDistortion={waveTemporalDistortion * renderProfile.distortionFactor}
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

export const OrbitalWaves = ({ colors, waveConfig, perf, quality, layoutPreset }: OrbitalWavesProps) => {
    const groupRef = useRef<Group>(null);
    const logoMaterialRef = useRef<MeshBasicMaterial>(null);
    const wavesGroupRef = useRef<Group>(null);
    const orbitSphereMeshRef = useRef<InstancedMesh>(null);

    const orbitGroupRefs = useRef<Array<Group | null>>([]);
    const orbitLineRefs = useRef<Array<Line2 | null>>([]);
    const orbitAnchorRefs = useRef<Array<Group | null>>([]);
    const orbitSpinRefs = useRef<Array<Group | null>>([]);

    const hasCachedTransmissionFrame = useRef(false);
    const lastOrbitIndexRef = useRef<number>(-1);
    const lastActiveWaveRef = useRef<WaveData | null>(null);
    const activeWavesCountRef = useRef(0);
    const hasFiredIntroWave = useRef(false);
    const isManualWaveTriggerUnlocked = useRef(false);
    const isLogoVisibleRef = useRef(false);
    const triggerQueue = useRef(false);
    const cachedColor = useRef(new Color());
    const targetRotation = useRef<[number, number, number]>([0, 0, 0]);
    const transmissionCacheVersion = useRef(0);
    const capturedTransmissionCacheVersion = useRef(-1);
    const lastOrbitLineScreenWidthPxRef = useRef(Number.NaN);

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
        if (quality === 1) return [12, 12];
        return [16, 16];
    }, [quality]);

    const coreSphereSegments = useMemo<[number, number]>(() => {
        if (quality === 2) return [20, 20];
        if (quality === 1) return [14, 14];
        return [10, 10];
    }, [quality]);

    const [orbits] = useState<OrbitData[]>(() => {
        const orbitCount = defaultConfig.orbits.count;
        const segments = getOrbitSegments(perf.orbitSegments, quality);
        const layoutConfig = ORBIT_LAYOUT_CONFIG[layoutPreset];

        return Array.from({ length: orbitCount }).map((_, i) => {
            const normalized = orbitCount <= 1 ? 0 : i / (orbitCount - 1);
            const radius = layoutConfig.baseRadius + i * layoutConfig.radiusStep;
            let radiusX = radius;
            let radiusZ = radius;
            let phaseOffset = 0;

            if (layoutPreset === 'phaseLattice') {
                const ellipseTightness = 0.48 + 0.24 * Math.sin(normalized * Math.PI);
                const majorScale = 1.12 + 0.12 * Math.cos(normalized * Math.PI * 2.5);
                radiusX = radius * majorScale;
                radiusZ = radius * ellipseTightness;
                if (i % 2 === 1) {
                    const temp = radiusX;
                    radiusX = radiusZ;
                    radiusZ = temp;
                }
                phaseOffset = normalized * Math.PI * 0.7 + (i % 2 === 0 ? 0 : Math.PI * 0.18);
            } else if (layoutPreset === 'meridianWeave') {
                const weaveCurve = Math.sin(normalized * Math.PI);
                const minorAxisScale = 0.58 + 0.1 * Math.cos(normalized * Math.PI * 3);
                const majorAxisScale = 1.22 - 0.16 * weaveCurve;

                radiusX = radius * minorAxisScale;
                radiusZ = radius * majorAxisScale;

                if (i % 2 === 1) {
                    const temp = radiusX;
                    radiusX = radiusZ;
                    radiusZ = temp;
                }

                phaseOffset = normalized * Math.PI * 1.3 + (i % 2 === 0 ? 0 : Math.PI * 0.5);
            }

            const points: number[] = [];
            const placement = getOrbitPlacement(i, orbitCount, layoutPreset);

            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * Math.PI * 2 + phaseOffset;
                points.push(Math.cos(theta) * radiusX, 0, Math.sin(theta) * radiusZ);
            }

            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(points, 3));

            return {
                geometry,
                pointCount: segments + 1,
                radius,
                radiusX,
                radiusZ,
                phaseOffset,
                colorIndex: i % 5,
                speed: (Math.random() * (defaultConfig.orbits.speedMax - defaultConfig.orbits.speedMin) + defaultConfig.orbits.speedMin) * (i % 2 === 0 ? 1 : -1),
                rotationX: placement.rotationX,
                rotationY: placement.rotationY,
                rotationZ: placement.rotationZ,
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

    const orbitLineBaseWidthPx = useMemo(
        () => getOrbitLineBaseWidthPx(quality),
        [quality],
    );

    const orbitLines = useMemo(
        () =>
            orbits.map((orbit) => {
                const lineGeometry = new LineGeometry();
                const positions = orbit.geometry.getAttribute('position').array as Float32Array;
                lineGeometry.setPositions(positions);
                lineGeometry.instanceCount = 0;

                const initialPixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                const lineMaterial = new LineMaterial({
                    color: colors.orbits[orbit.colorIndex],
                    transparent: true,
                    opacity: 0,
                    blending: NormalBlending,
                    linewidth: orbitLineBaseWidthPx * initialPixelRatio,
                    worldUnits: false,
                    toneMapped: false,
                    depthTest: true,
                    depthWrite: false,
                    side: DoubleSide,
                });

                return new Line2(lineGeometry, lineMaterial);
            }),
        [colors.orbits, orbitLineBaseWidthPx, orbits],
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
                orbitLine.geometry.dispose();
                orbitLine.material.dispose();
            }
        };
    }, [orbitLines]);

    useEffect(() => {
        lastOrbitLineScreenWidthPxRef.current = Number.NaN;
    }, [orbitLines]);

    useEffect(() => {
        orbitFrameStateRef.current = Array.from({ length: orbits.length }).map(() => ({
            lastDrawCount: -1,
            lastOpacity: -1,
            lastProgress: -1,
            lastScale: -1,
        }));
    }, [orbitLines, orbits.length]);

    useEffect(() => {
        const sphereMesh = orbitSphereMeshRef.current;
        if (!sphereMesh) return;
        sphereMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }, []);

    // --- GPU Compute: вычисление орбитальной геометрии на WebGPU ---
    // Первый рендер использует CPU-сгенерированные орбиты (синхронно, без задержки).
    // GPU compute запускается асинхронно и заменяет геометрию линий по готовности.
    // При недоступности WebGPU (iOS < 26, старые браузеры) — остаётся CPU-геометрия.
    useEffect(() => {
        let cancelled = false;

        // Определяем segmentsPerOrbit из уже созданных orbits
        const segmentsPerOrbit = orbits[0]?.pointCount
            ? orbits[0].pointCount - 1
            : 0;

        if (segmentsPerOrbit <= 0) return;

        const config: GPUComputeConfig = {
            orbitCount: orbits.length,
            segmentsPerOrbit,
            orbits: orbits.map((o) => ({
                radiusX: o.radiusX,
                radiusZ: o.radiusZ,
                phaseOffset: o.phaseOffset,
            })),
        };

        computeOrbitGeometry(config).then((result) => {
            if (cancelled) return;
            if (result.source !== 'gpu') return;

            // Обновляем геометрию линий GPU-вычисленными позициями.
            // Визуально идентично CPU-результату (та же математика, f32 точность).
            for (let i = 0; i < result.positions.length; i++) {
                const orbitLine = orbitLineRefs.current[i];
                if (!orbitLine) continue;

                // Сохраняем текущий прогресс отрисовки (intro-анимация может быть в процессе)
                const savedInstanceCount = orbitLine.geometry.instanceCount;

                // Заменяем позиции на GPU-вычисленные
                orbitLine.geometry.setPositions(result.positions[i]);

                // Восстанавливаем прогресс рисования — intro-анимация продолжается без разрыва
                orbitLine.geometry.instanceCount = savedInstanceCount;
            }
        });

        return () => {
            cancelled = true;
        };
    }, [orbits]);

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

    const waveSlotRenderProfiles = useMemo(
        () =>
            Array.from({ length: wavePool.length }, (_, slotIndex) =>
                getWaveSlotRenderProfile(slotIndex, waveRenderConfig.transmissionSamples, quality),
            ),
        [quality, wavePool.length, waveRenderConfig.transmissionSamples],
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

    const triggerWaveAction = useCallback((state: { clock: { getElapsedTime: () => number } }): boolean => {
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

        if (availableWaveIndex === -1) return false;

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
        if (!nextWave || nextWave.active) return false;

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
        return true;
    }, [maxActiveWaves, orbits.length]);

    const handlePointerDown = useCallback(() => {
        if (!isManualWaveTriggerUnlocked.current) return;
        if (isLogoVisibleRef.current) return;
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
        const currentPixelRatio = state.gl.getPixelRatio();
        const targetOrbitLineScreenWidthPx = orbitLineBaseWidthPx * currentPixelRatio;

        if (
            !Number.isFinite(lastOrbitLineScreenWidthPxRef.current) ||
            Math.abs(lastOrbitLineScreenWidthPxRef.current - targetOrbitLineScreenWidthPx) > 0.001
        ) {
            for (const orbitLine of orbitLineRefs.current) {
                if (!orbitLine) continue;
                orbitLine.material.linewidth = targetOrbitLineScreenWidthPx;
            }
            lastOrbitLineScreenWidthPxRef.current = targetOrbitLineScreenWidthPx;
        }

        const sceneGroup = groupRef.current;
        if (sceneGroup) {
            const x = state.pointer.x * defaultConfig.animation.parallaxFactor;
            const y = -state.pointer.y * defaultConfig.animation.parallaxFactor;
            const nextRotation = targetRotation.current;
            nextRotation[0] = y;
            nextRotation[1] = x;
            nextRotation[2] = 0;
            easing.dampE(sceneGroup.rotation, nextRotation, defaultConfig.animation.parallaxDamping, delta);
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
                drawProgress = rawProgress;
                opacity = 1;
                isDrawing = true;
            } else {
                drawProgress = 1;
                opacity = 1;
            }

            const maxSegmentCount = Math.max(1, orbit.pointCount - 1);
            const currentCount = Math.floor(drawProgress * maxSegmentCount);
            let phaseProgress = drawProgress;

            if (now > window.end) {
                const postElapsed = now - window.end;
                const targetCyclesPerSecond = Math.max(0.08, Math.abs(orbit.speed) / (Math.PI * 2));
                phaseProgress = 1 + postElapsed * targetCyclesPerSecond;
            }

            if (orbitLine) {
                if (runtime.lastDrawCount !== currentCount) {
                    orbitLine.geometry.instanceCount = currentCount;
                    runtime.lastDrawCount = currentCount;
                }

                if (runtime.lastOpacity !== opacity) {
                    orbitLine.material.opacity = opacity;
                    runtime.lastOpacity = opacity;
                }
            }

            if (orbitGroup && orbitAnchor && sphereMesh) {
                if (runtime.lastProgress !== phaseProgress) {
                    const angle = phaseProgress * Math.PI * 2 + orbit.phaseOffset;
                    orbitAnchor.position.set(Math.cos(angle) * orbit.radiusX, 0, Math.sin(angle) * orbit.radiusZ);
                    runtime.lastProgress = phaseProgress;
                }

                const targetScale = opacity > 0.01 ? (isDrawing ? defaultConfig.spheres.orbitSphereDrawingScale : defaultConfig.spheres.orbitSphereIdleScale) : 0.0001;
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

            isLogoVisibleRef.current = logoMaterialRef.current.opacity > LOGO_VISIBILITY_EPSILON;
        } else {
            isLogoVisibleRef.current = false;
        }

        if (triggerQueue.current) {
            triggerQueue.current = false;
            triggerWaveAction(state);
        }

        if (now > INTRO_DURATION && !hasFiredIntroWave.current) {
            const didTriggerIntroWave = triggerWaveAction(state);
            if (didTriggerIntroWave) {
                hasFiredIntroWave.current = true;
                isManualWaveTriggerUnlocked.current = true;
            }
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

                <mesh
                    onClick={(event) => {
                        event.stopPropagation();
                        handlePointerDown();
                    }}
                >
                    <sphereGeometry args={[defaultConfig.spheres.coreRadius, coreSphereSegments[0], coreSphereSegments[1]]} />
                    <meshBasicMaterial color={defaultConfig.spheres.coreColor} />
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
                            renderProfile={
                                waveSlotRenderProfiles[wave.id] ??
                                getWaveSlotRenderProfile(1, 1, quality)
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
                            rotation={[orbit.rotationX, orbit.rotationY, orbit.rotationZ]}
                            scale={[directionScale, 1, 1]}
                        >
                            <group
                                ref={(spin) => {
                                    orbitSpinRefs.current[index] = spin;
                                }}
                            >
                                <primitive
                                    object={orbitLines[index]}
                                    ref={(line: unknown) => {
                                        orbitLineRefs.current[index] = line as Line2 | null;
                                    }}
                                />
                                <group
                                    ref={(anchor) => {
                                        orbitAnchorRefs.current[index] = anchor;
                                    }}
                                    position={[
                                        Math.cos(orbit.phaseOffset) * orbit.radiusX,
                                        0,
                                        Math.sin(orbit.phaseOffset) * orbit.radiusZ,
                                    ]}
                                    scale={[0.0001, 0.0001, 0.0001]}
                                />
                            </group>
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
                <meshBasicMaterial color={defaultConfig.spheres.orbitSphereColor} toneMapped={false} />
            </instancedMesh>

            <mesh
                position={defaultConfig.logo.position}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    handlePointerDown();
                }}
            >
                <planeGeometry args={defaultConfig.logo.planeSize} />
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
