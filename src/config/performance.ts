export interface PerformanceConfig {
    readonly maxDpr: number;
    readonly antialias: boolean;
    readonly torusSegments: [number, number];
    readonly sphereSegments: [number, number];
    readonly orbitSegments: number;
    readonly enableBloom: boolean;
    readonly enableChromaticAberration: boolean;
    readonly enableNoise: boolean;
    readonly enableVignette: boolean;
    readonly transmissionResolution: number;
    readonly transmissionSamples: number;
    readonly maxWaves: number;
}

export const maxPerformanceConfig: PerformanceConfig = {
    maxDpr: 2,
    antialias: true,
    torusSegments: [64, 128],
    sphereSegments: [64, 64],
    orbitSegments: 128,
    enableBloom: true,
    enableChromaticAberration: true,
    enableNoise: true,
    enableVignette: true,
    transmissionResolution: 256,
    transmissionSamples: 6,
    maxWaves: 5,
};
