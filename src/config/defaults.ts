// Default configuration for the scene
// You can modify this file to set persistent values

export const defaultConfig = {
    // Post Processing
    bloom: {
        intensity: 1.4000000000000001,
        luminanceThreshold: 0,
        radius: 0.23,
        mipmapBlur: true
    },
    chromaticAberration: {
        offset: 0,
        radialModulation: true,
        modulationOffset: 0.5299999999999999
    },
    noise: {
        opacity: 0.055
    },
    vignette: {
        offset: 0,
        darkness: 1.6
    },

    // Scene Colors
    colors: {
        background: "#0a0a0a",
        planetoid: "#0a0a0a",
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
        speed: 0.3,
        maxScale: 9,
        // Timing (0-1 cycle)
        fadeInEnd: 0,
        fadeOutStart: 0.195,

        // Material Appearance
        color: "#ffffff",
        roughness: 0.1,
        clearcoat: 1.0,
        metalness: 0,
        transmission: 1, // implicit
        thickness: 2.5, // multiplier
        distortion: 0.25, // multiplier
        distortionScale: 0.1,
        chromaticAberration: 0.5,
        anisotropy: 0.5,
        opacity: 0.2 // multiplier
    }
};
