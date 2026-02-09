/**
 * GPU Compute модуль для ускорения вычислений орбитальной геометрии.
 *
 * Использует TypeGPU (WebGPU) для параллельного вычисления точек эллиптических орбит.
 * При недоступности WebGPU (старые браузеры, iOS < 26) автоматически переключается на CPU.
 *
 * Точка входа:
 *   computeOrbitGeometry(config) — вычисляет позиции точек орбит (GPU/CPU)
 *
 * Управление GPU device:
 *   initGPUDevice()       — инициализирует WebGPU device (singleton)
 *   getGPURoot()          — возвращает кэшированный device
 *   destroyGPUDevice()    — освобождает GPU ресурсы
 *   isWebGPULikelySupported() — быстрая проверка navigator.gpu
 *
 * @module gpu
 */

export { computeOrbitGeometry } from './orbitCompute';
export {
    initGPUDevice,
    getGPURoot,
    destroyGPUDevice,
    isWebGPULikelySupported,
    type TgpuRoot,
} from './gpuDevice';
export type {
    OrbitGPUParams,
    OrbitGeometryResult,
    GPUComputeConfig,
} from './types';
