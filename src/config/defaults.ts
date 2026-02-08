// Default configuration for the scene
// You can modify this file to set persistent values

export const defaultConfig = {
    // Post Processing
    bloom: {
        intensity: 1.6,
        luminanceThreshold: 0,
        radius: 0.33,
        mipmapBlur: true
    },
    chromaticAberration: {
        offset: 0,
        radialModulation: true,
        modulationOffset: 0.23
    },
    noise: {
        opacity: 0.065
    },
    vignette: {
        offset: 0,
        darkness: 1.1
    },

    // Scene Colors
    colors: {
        background: "#090909",
        planetoid: "#090909",
        planetoidEmissive: "#000000",
        orbits: [
            "#ffc022",
            "#ba214a",
            "#f35a0e",
            "#1c50d7",
            "#249118"
        ]
    },

    // Wave Mechanics
    wave: {
        speed: 0.37,
        maxScale: 25,
        // Timing (0-1 cycle)
        fadeInEnd: 0.1,
        fadeOutStart: 0.2,

        // Material Appearance
        color: "#ffffff",
        roughness: 0.08,
        clearcoat: 1,
        metalness: 0,
        transmission: 1,
        thickness: 3,
        distortion: 0.15,
        distortionScale: 0.16,
        chromaticAberration: 2,
        anisotropy: 0.48,
        opacity: 0.60
    }
};
