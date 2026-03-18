

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/hardware-tree/compare/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/5.Ckf36Cf4.js"];
export const stylesheets = [];
export const fonts = [];
