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
    torusSegments: [16, 32],
    sphereSegments: [16, 16],
    orbitSegments: 32,
    enableBloom: false,
    enableChromaticAberration: false,
    enableNoise: true,
    enableVignette: true,
    transmissionResolution: 16,
    transmissionSamples: 1,
    maxWaves: 5,
};
