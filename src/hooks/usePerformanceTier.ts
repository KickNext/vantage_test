/**
 * Хук для определения уровня производительности устройства.
 *
 * Определяет «тир» (high / medium / low) на основе:
 * - User-Agent (мобильное устройство или нет)
 * - Количество логических ядер CPU (navigator.hardwareConcurrency)
 * - Объём оперативной памяти (navigator.deviceMemory, где доступен)
 * - Размер экрана (предполагаем, что маленький экран = мобилка)
 * - Пиксельная плотность (devicePixelRatio)
 *
 * Возвращает объект с рекомендованными настройками рендера для
 * каждого тира, чтобы сцена оставалась плавной на всех устройствах.
 */

import { useMemo } from 'react';

/** Уровень производительности устройства */
export type PerformanceTier = 'high' | 'medium' | 'low';

/** Рекомендованные параметры рендера для данного тира */
export interface PerformanceConfig {
    /** Уровень тира */
    readonly tier: PerformanceTier;

    /** Максимальный DPR (device pixel ratio) */
    readonly maxDpr: number;

    /** Включить ли сглаживание */
    readonly antialias: boolean;

    // --- Геометрия ---

    /** Сегменты тора: [radialSegments, tubularSegments] */
    readonly torusSegments: [number, number];

    /** Сегменты сферы: [widthSegments, heightSegments] */
    readonly sphereSegments: [number, number];

    /** Сегменты орбитальной линии */
    readonly orbitSegments: number;

    // --- Пост-процессинг ---

    /** Включить Bloom */
    readonly enableBloom: boolean;

    /** Включить Chromatic Aberration */
    readonly enableChromaticAberration: boolean;

    /** Включить Noise */
    readonly enableNoise: boolean;

    /** Включить Vignette */
    readonly enableVignette: boolean;

    // --- MeshTransmissionMaterial (Shared FBO) ---

    /**
     * Разрешение общего FBO для MeshTransmissionMaterial.
     * На всех тирах используется MeshTransmissionMaterial с пропом buffer —
     * один FBO-рендер на все волны вместо O(N).
     * Адаптивное разрешение: high=256, medium=128, low=64.
     */
    readonly transmissionResolution: number;

    /** Количество сэмплов для MeshTransmissionMaterial */
    readonly transmissionSamples: number;

    /** Максимальное число одновременных волн */
    readonly maxWaves: number;
}

/**
 * Определяет, является ли текущее устройство мобильным.
 * Проверяет User-Agent, touch-поддержку и размер экрана.
 */
function detectIsMobile(): boolean {
    if (typeof window === 'undefined') return false;

    // Проверка User-Agent
    const ua = navigator.userAgent || '';
    const mobileUaPattern = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    if (mobileUaPattern.test(ua)) return true;

    // Touch-only устройство (нет мыши)
    if ('ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches) return true;

    return false;
}

/**
 * Определяет тир на основе характеристик устройства.
 */
function detectPerformanceTier(): PerformanceTier {
    if (typeof window === 'undefined') return 'medium';

    const isMobile = detectIsMobile();
    const cores = navigator.hardwareConcurrency || 4;

    // navigator.deviceMemory — нестандартный API (Chrome, Edge)
    const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

    // Мобильное устройство — сразу понижаем
    if (isMobile) {
        // Совсем слабое мобильное: мало ядер или мало памяти
        if (cores <= 4 || (memory !== undefined && memory <= 4)) {
            return 'low';
        }
        // Мощная мобилка (iPad Pro, флагман)
        return 'medium';
    }

    // Десктоп
    if (cores >= 8 && (memory === undefined || memory >= 8)) {
        return 'high';
    }

    if (cores <= 4 || (memory !== undefined && memory <= 4)) {
        return 'low';
    }

    return 'medium';
}

/**
 * Формирует конфиг производительности на основе тира.
 */
function buildConfig(tier: PerformanceTier): PerformanceConfig {
    switch (tier) {
        case 'high':
            return {
                tier,
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

        case 'medium':
            return {
                tier,
                maxDpr: 1.5,
                // На medium сглаживание выполняется FXAA-проходом (без тяжелого MSAA).
                antialias: true,

                torusSegments: [24, 48],
                sphereSegments: [24, 24],
                orbitSegments: 48,

                enableBloom: true,
                enableChromaticAberration: false,
                enableNoise: false,
                enableVignette: true,

                // Shared FBO: один рендер на все волны.
                // Разрешение уменьшено для экономии GPU.
                transmissionResolution: 128,
                transmissionSamples: 4,
                maxWaves: 3,
            };

        case 'low':
            return {
                tier,
                maxDpr: 1,
                // На low оставляем только дешёвое сглаживание FXAA.
                antialias: true,

                torusSegments: [16, 32],
                sphereSegments: [16, 16],
                orbitSegments: 48,

                // На low-тире тяжелые пост-эффекты отключены.
                enableBloom: false,
                enableChromaticAberration: false,
                enableNoise: false,
                enableVignette: false,

                // Shared FBO: минимальное разрешение для слабых устройств.
                // 64px достаточно для эффекта рефракции при O(1) рендере.
                transmissionResolution: 64,
                transmissionSamples: 2,
                maxWaves: 2,
            };
    }
}

/**
 * Хук, возвращающий конфигурацию производительности на основе
 * характеристик текущего устройства.
 *
 * Результат стабилен в течение жизни компонента (useMemo без deps).
 *
 * @example
 * ```tsx
 * const perf = usePerformanceTier();
 * // perf.tier === 'low' | 'medium' | 'high'
 * // perf.maxDpr, perf.enableBloom и т.д.
 * ```
 */
export function usePerformanceTier(): PerformanceConfig {
    return useMemo(() => {
        const tier = detectPerformanceTier();
        const config = buildConfig(tier);

        if (import.meta.env.DEV) {
            console.log(
                `%c[Performance] Tier: ${tier.toUpperCase()}`,
                'color: #4cc9f0; font-weight: bold;',
                config,
            );
        }

        return config;
    }, []);
}
