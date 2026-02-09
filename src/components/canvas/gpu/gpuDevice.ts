/**
 * Синглтон для управления TypeGPU WebGPU device.
 *
 * Обеспечивает единственный экземпляр GPU-устройства на приложение.
 * Дедуплицирует параллельные вызовы инициализации через общий Promise.
 * При недоступности WebGPU (старые браузеры, iOS < 26) запоминает
 * отрицательный результат и не пытается инициализироваться повторно.
 *
 * @module gpu/gpuDevice
 */

import tgpu from 'typegpu';

/** Тип TypeGPU root — выводится из возвращаемого типа tgpu.init() */
export type TgpuRoot = NonNullable<Awaited<ReturnType<typeof tgpu.init>>>;

// ---------------------------------------------------------------------------
// Внутреннее состояние модуля (module-level singleton)
// ---------------------------------------------------------------------------

/** Кэшированный инстанс TypeGPU root */
let cachedRoot: TgpuRoot | null = null;

/** Promise текущей инициализации (для дедупликации параллельных вызовов) */
let initPromise: Promise<TgpuRoot | null> | null = null;

/** Флаг: WebGPU гарантированно недоступен на этом устройстве */
let knownUnavailable = false;

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Инициализирует TypeGPU WebGPU device с высокопроизводительным адаптером.
 *
 * - Повторные вызовы возвращают кэшированный инстанс (O(1)).
 * - Параллельные вызовы дедуплицируются через общий Promise.
 * - Возвращает null если WebGPU недоступен.
 * - При повторной ошибке не пытается инициализироваться снова.
 *
 * @returns TypeGPU root или null при недоступности WebGPU
 */
export async function initGPUDevice(): Promise<TgpuRoot | null> {
    // Быстрый выход: уже инициализирован
    if (cachedRoot) return cachedRoot;

    // Быстрый выход: известно что WebGPU недоступен
    if (knownUnavailable) return null;

    // Дедупликация: если уже идёт инициализация — ждём тот же Promise
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const root = await tgpu.init({
                adapter: { powerPreference: 'high-performance' },
            });

            cachedRoot = root;
            console.log('[GPUCompute] WebGPU device инициализирован');
            return root;
        } catch (error: unknown) {
            knownUnavailable = true;
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(`[GPUCompute] WebGPU недоступен (CPU fallback): ${reason}`);
            return null;
        }
    })();

    return initPromise;
}

/**
 * Возвращает текущий кэшированный TypeGPU root.
 * Не инициализирует device — используйте initGPUDevice() для инициализации.
 */
export function getGPURoot(): TgpuRoot | null {
    return cachedRoot;
}

/**
 * Базовая синхронная проверка наличия navigator.gpu.
 * НЕ гарантирует успешную инициализацию device (нужен requestAdapter + requestDevice).
 */
export function isWebGPULikelySupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Уничтожает GPU device и освобождает все связанные ресурсы.
 * Сбрасывает синглтон — следующий вызов initGPUDevice() создаст новый device.
 */
export function destroyGPUDevice(): void {
    if (cachedRoot) {
        cachedRoot.destroy();
        cachedRoot = null;
        initPromise = null;
        console.log('[GPUCompute] GPU device уничтожен');
    }
}
