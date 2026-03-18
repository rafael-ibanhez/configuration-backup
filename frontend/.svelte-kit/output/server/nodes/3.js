

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/equipment/_id_/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/3.C7G18izi.js"];
export const stylesheets = [];
export const fonts = [];
