

export const index = 7;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/settings/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/7.CuS6fPuK.js"];
export const stylesheets = [];
export const fonts = [];
