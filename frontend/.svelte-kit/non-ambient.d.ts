
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/equipment" | "/equipment/[id]" | "/hardware-tree" | "/hardware-tree/compare" | "/hardware-tree/[id]" | "/settings";
		RouteParams(): {
			"/equipment/[id]": { id: string };
			"/hardware-tree/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/equipment": { id?: string };
			"/equipment/[id]": { id: string };
			"/hardware-tree": { id?: string };
			"/hardware-tree/compare": Record<string, never>;
			"/hardware-tree/[id]": { id: string };
			"/settings": Record<string, never>
		};
		Pathname(): "/" | `/equipment/${string}` & {} | "/hardware-tree" | "/hardware-tree/compare" | `/hardware-tree/${string}` & {} | "/settings";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/robots.txt" | string & {};
	}
}