// Default configuration for the scene
// You can modify this file to set persistent values

export const defaultConfig = {
    // ── Post Processing ─────────────────────────────────────────────────
    bloom: {
        intensity: 1.6,
        luminanceThreshold: 0,
        radius: 0.33,
        mipmapBlur: true,
    },
    chromaticAberration: {
        offset: 0,
        radialModulation: true,
        modulationOffset: 0.23,
    },
    noise: {
        opacity: 0.065,
    },
    vignette: {
        offset: 0,
        darkness: 1.1,
    },

    // ── Camera ──────────────────────────────────────────────────────────
    camera: {
        /** Позиция камеры в мировых координатах [x, y, z] */
        position: [0, 0, 26] as [number, number, number],
        /** Угол обзора камеры (degrees) */
        fov: 45,
    },

    // ── Scene Colors ────────────────────────────────────────────────────
    colors: {
        background: "#090909",
        planetoid: "#090909",
        planetoidEmissive: "#000000",
        orbits: [
            "#ffc022",
            "#ba214a",
            "#f35a0e",
            "#1c50d7",
            "#249118",
        ],
    },

    // ── Animation Timing ────────────────────────────────────────────────
    animation: {
        /** Задержка перед началом отрисовки орбит (секунды) */
        introDelay: 0.5,
        /** Длительность отрисовки одной орбиты (секунды) */
        drawDuration: 1.5,
        /** Общая длительность интро до первой волны (секунды) */
        introDuration: 6.0,
        /** Множитель параллакса при движении мыши */
        parallaxFactor: 0.7,
        /** Демпфирование параллакса (чем больше — тем мягче) */
        parallaxDamping: 1.5,
        /** Демпфирование возврата в центр при отпускании пальца на тач-устройстве */
        touchReturnDamping: 0.8,
    },

    // ── Spheres (Planets) ───────────────────────────────────────────────
    spheres: {
        /** Радиус центрального планетоида */
        coreRadius: 2,
        /** Цвет центрального планетоида */
        coreColor: "#0a0a0a",
        /** Размер орбитальных планет во время отрисовки (intro) */
        orbitSphereDrawingScale: 0.1,
        /** Размер орбитальных планет после intro */
        orbitSphereIdleScale: 0.1,
        /** Цвет орбитальных планет */
        orbitSphereColor: "#ffffff",
    },

    // ── Orbits ──────────────────────────────────────────────────────────
    orbits: {
        /** Количество орбит */
        count: 10,
        /** Минимальная скорость вращения орбитальных сфер */
        speedMin: 0.05,
        /** Максимальная скорость вращения орбитальных сфер */
        speedMax: 0.15,
        /** Толщина линии орбиты (px) по уровню качества [low, mid, high] */
        lineWidthByQuality: [1.35, 1.5, 1.75] as [number, number, number],
    },

    // ── Logo ────────────────────────────────────────────────────────────
    logo: {
        /** Позиция логотипа в мировых координатах [x, y, z] */
        position: [0, 0, 2.2] as [number, number, number],
        /** Размер плоскости логотипа [width, height] */
        planeSize: [2, 0.96] as [number, number],
    },

    // ── Wave Mechanics ──────────────────────────────────────────────────
    wave: {
        /** Скорость волны (цикл/сек) */
        speed: 0.37,
        /** Максимальный масштаб волны */
        maxScale: 25,
        /** Минимальный масштаб волны (начальный размер) */
        minScale: 1.5,

        // Timing (0-1 cycle)
        /** Конец фейд-ина (доля цикла 0-1) */
        fadeInEnd: 0.1,
        /** Начало фейд-аута (доля цикла 0-1) */
        fadeOutStart: 0.2,

        // Material Appearance
        /** Цвет волны */
        color: "#ffffff",
        /** Шероховатость поверхности */
        roughness: 0.08,
        /** Clear coat (лаковое покрытие) */
        clearcoat: 1,
        /** Металлическость */
        metalness: 0,
        /** Transmission (прозрачность/преломление) */
        transmission: 10,
        /** Толщина стекла */
        thickness: 3,
        /** Сила пространственной дисторсии */
        distortion: 0.3,
        /** Масштаб шума дисторсии */
        distortionScale: 0.16,
        /** Временная дисторсия (анимированная дисторсия по времени) */
        temporalDistortion: 0.1,
        /** Хроматическая аберрация (разложение цвета) */
        chromaticAberration: 0.5,
        /** Анизотропия (направленное отражение) */
        anisotropy: 0.48,
        /** Непрозрачность волны */
        opacity: 0.60,
    },
};
