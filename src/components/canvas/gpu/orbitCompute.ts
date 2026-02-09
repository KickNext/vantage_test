/**
 * GPU compute shader для генерации орбитальной геометрии.
 *
 * Вычисляет точки эллиптических орбит (cos/sin) параллельно на GPU
 * через TypeGPU TGSL (TypeScript → WGSL транспиляция).
 *
 * Каждый поток обрабатывает одну точку одной орбиты:
 *   position.x = cos(theta) * radiusX
 *   position.y = 0
 *   position.z = sin(theta) * radiusZ
 *
 * CPU fallback обеспечивает идентичный результат на устройствах без WebGPU.
 *
 * @module gpu/orbitCompute
 */

import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { initGPUDevice, type TgpuRoot } from './gpuDevice';
import type { GPUComputeConfig, OrbitGeometryResult } from './types';

/** Полный оборот в радианах (2π) */
const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// GPU-путь — вычисление через TypeGPU compute shader
// ---------------------------------------------------------------------------

/**
 * Вычисляет орбитальную геометрию на GPU через TypeGPU compute pipeline.
 *
 * Алгоритм:
 * 1. CPU подготавливает per-point данные (theta, radiusX, radiusZ)
 * 2. Данные загружаются в GPU-буферы (storage readonly)
 * 3. Compute shader параллельно вычисляет cos/sin для каждой точки
 * 4. Результат читается обратно на CPU (buffer.read())
 * 5. Плоский массив разбивается на per-orbit Float32Array
 *
 * @param root - Инициализированный TypeGPU root (WebGPU device)
 * @param config - Параметры орбит (радиусы, фазы, количество сегментов)
 * @returns Массив Float32Array позиций для каждой орбиты
 * @throws При ошибке GPU compute (caller обрабатывает через CPU fallback)
 */
async function computeOnGPU(
    root: TgpuRoot,
    config: GPUComputeConfig,
): Promise<Float32Array[]> {
    const { orbitCount, segmentsPerOrbit, orbits } = config;
    const pointsPerOrbit = segmentsPerOrbit + 1;
    const totalPoints = orbitCount * pointsPerOrbit;

    // --- Pre-compute per-point данные на CPU ---
    // GPU получает готовые theta/radius/radius per-point для максимальной простоты шейдера.
    // Это избавляет от integer-to-float конверсии внутри TGSL (не везде поддерживается).
    const thetaValues: number[] = new Array(totalPoints);
    const rxValues: number[] = new Array(totalPoints);
    const rzValues: number[] = new Array(totalPoints);

    for (let i = 0; i < orbitCount; i++) {
        const orbit = orbits[i];
        const offset = i * pointsPerOrbit;

        for (let j = 0; j < pointsPerOrbit; j++) {
            const idx = offset + j;
            thetaValues[idx] = (j / segmentsPerOrbit) * TWO_PI + orbit.phaseOffset;
            rxValues[idx] = orbit.radiusX;
            rzValues[idx] = orbit.radiusZ;
        }
    }

    // --- Создание GPU-буферов ---
    // Readonly storage: входные данные (theta, radiusX, radiusZ per-point)
    const thetas = root.createReadonly(d.arrayOf(d.f32, totalPoints), thetaValues);
    const radiiX = root.createReadonly(d.arrayOf(d.f32, totalPoints), rxValues);
    const radiiZ = root.createReadonly(d.arrayOf(d.f32, totalPoints), rzValues);

    // Mutable storage: выходные позиции (3 float per point: x, y, z)
    const output = root.createMutable(d.arrayOf(d.f32, totalPoints * 3));

    // --- TGSL Compute Pipeline ---
    // Каждый поток (idx) обрабатывает одну точку:
    //   output[idx*3 + 0] = cos(theta) * radiusX
    //   output[idx*3 + 1] = 0.0
    //   output[idx*3 + 2] = sin(theta) * radiusZ
    const pipeline = root['~unstable'].createGuardedComputePipeline(
        (idx: number) => {
            'use gpu';

            const base = idx * 3;
            const theta = thetas.$[idx];
            const rx = radiiX.$[idx];
            const rz = radiiZ.$[idx];

            output.$[base] = std.cos(theta) * rx;
            output.$[base + 1] = 0.0;
            output.$[base + 2] = std.sin(theta) * rz;
        },
    );

    // --- Dispatch: один поток на точку ---
    pipeline.dispatchThreads(totalPoints);

    // --- Readback результатов с GPU на CPU ---
    const rawResult = await output.read();

    // TypeGPU read() может вернуть number[] — конвертируем в Float32Array
    const flatPositions = new Float32Array(rawResult as ArrayLike<number>);

    // --- Разбиваем плоский массив на per-orbit Float32Array ---
    const positions: Float32Array[] = new Array(orbitCount);
    for (let i = 0; i < orbitCount; i++) {
        const start = i * pointsPerOrbit * 3;
        const end = start + pointsPerOrbit * 3;
        positions[i] = flatPositions.slice(start, end);
    }

    return positions;
}

// ---------------------------------------------------------------------------
// CPU fallback — идентичный алгоритм без GPU
// ---------------------------------------------------------------------------

/**
 * CPU fallback: вычисляет орбитальную геометрию тем же алгоритмом.
 * Используется когда WebGPU недоступен (старые браузеры, iOS < 26).
 *
 * @param config - Параметры орбит
 * @returns Массив Float32Array позиций для каждой орбиты
 */
function computeOnCPU(config: GPUComputeConfig): Float32Array[] {
    const { orbitCount, segmentsPerOrbit, orbits } = config;
    const pointsPerOrbit = segmentsPerOrbit + 1;
    const positions: Float32Array[] = new Array(orbitCount);

    for (let i = 0; i < orbitCount; i++) {
        const orbit = orbits[i];
        const points = new Float32Array(pointsPerOrbit * 3);

        for (let j = 0; j < pointsPerOrbit; j++) {
            const theta = (j / segmentsPerOrbit) * TWO_PI + orbit.phaseOffset;
            const base = j * 3;
            points[base] = Math.cos(theta) * orbit.radiusX;
            points[base + 1] = 0;
            points[base + 2] = Math.sin(theta) * orbit.radiusZ;
        }

        positions[i] = points;
    }

    return positions;
}

// ---------------------------------------------------------------------------
// Публичный API — автоматический выбор GPU/CPU
// ---------------------------------------------------------------------------

/**
 * Вычисляет орбитальную геометрию с автоматическим выбором GPU/CPU.
 *
 * Приоритет: GPU (WebGPU/TypeGPU) → CPU fallback.
 * При ошибке GPU compute автоматически переключается на CPU.
 * Логирует источник и время вычислений в консоль.
 *
 * Типичное количество точек: 10 орбит × 257 точек = 2570 точек.
 *
 * @param config - Конфигурация вычислений (орбиты, сегменты)
 * @returns Результат с позициями и метаданными (source, timing)
 */
export async function computeOrbitGeometry(
    config: GPUComputeConfig,
): Promise<OrbitGeometryResult> {
    const totalPoints = config.orbitCount * (config.segmentsPerOrbit + 1);

    // --- Попытка GPU compute ---
    try {
        const root = await initGPUDevice();

        if (root) {
            const gpuStart = performance.now();
            const positions = await computeOnGPU(root, config);
            const computeTimeMs = performance.now() - gpuStart;

            console.log(
                `[GPUCompute] Орбитальная геометрия` +
                ` (${config.orbitCount} орбит × ${config.segmentsPerOrbit + 1} точек = ${totalPoints})` +
                ` вычислена на GPU за ${computeTimeMs.toFixed(1)}ms`,
            );

            return { positions, computeTimeMs, source: 'gpu' };
        }
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[GPUCompute] GPU compute ошибка, CPU fallback: ${reason}`);
    }

    // --- CPU fallback ---
    const cpuStart = performance.now();
    const positions = computeOnCPU(config);
    const computeTimeMs = performance.now() - cpuStart;

    console.log(
        `[GPUCompute] Орбитальная геометрия (${totalPoints} точек)` +
        ` вычислена на CPU за ${computeTimeMs.toFixed(1)}ms`,
    );

    return { positions, computeTimeMs, source: 'cpu' };
}
