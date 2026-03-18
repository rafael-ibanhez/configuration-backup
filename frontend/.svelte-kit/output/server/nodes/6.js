

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/hardware-tree/_id_/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/6.6-65MoWt.js"];
export const stylesheets = [];
export const fonts = [];
