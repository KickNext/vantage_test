/**
 * Типы для GPU-вычислений орбитальной геометрии.
 *
 * Определяют контракт между CPU-стороной (React/Three.js) и GPU compute шейдером.
 * Все параметры — readonly для обеспечения иммутабельности конфигурации.
 *
 * @module gpu/types
 */

/**
 * Параметры одной эллиптической орбиты для GPU-вычисления.
 * Соответствуют полуосям эллипса и начальной фазе.
 */
export interface OrbitGPUParams {
    /** Радиус по оси X (полуось эллипса) */
    readonly radiusX: number;
    /** Радиус по оси Z (полуось эллипса) */
    readonly radiusZ: number;
    /** Начальное фазовое смещение в радианах */
    readonly phaseOffset: number;
}

/**
 * Результат вычисления орбитальной геометрии (GPU или CPU).
 * Содержит позиции точек и метаданные о вычислении.
 */
export interface OrbitGeometryResult {
    /** Массив Float32Array позиций [x,y,z, x,y,z, ...] для каждой орбиты */
    readonly positions: Float32Array[];
    /** Время вычисления в миллисекундах (без учёта инициализации device) */
    readonly computeTimeMs: number;
    /** Источник вычисления: GPU (WebGPU/TypeGPU) или CPU (fallback) */
    readonly source: 'gpu' | 'cpu';
}

/**
 * Конфигурация для GPU/CPU вычислений орбитальной геометрии.
 * Передаётся в computeOrbitGeometry() для генерации точек орбит.
 */
export interface GPUComputeConfig {
    /** Общее количество орбит */
    readonly orbitCount: number;
    /** Количество сегментов на одну орбиту (pointCount = segments + 1) */
    readonly segmentsPerOrbit: number;
    /** Параметры каждой орбиты (radiusX, radiusZ, phaseOffset) */
    readonly orbits: readonly OrbitGPUParams[];
}
