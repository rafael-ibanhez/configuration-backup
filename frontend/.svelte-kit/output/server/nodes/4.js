

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/hardware-tree/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/4.DAkYKoZU.js"];
export const stylesheets = [];
export const fonts = [];
