export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.DS-WTOm4.js",app:"_app/immutable/entry/app.DYEEQ061.js",imports:["_app/immutable/entry/start.DS-WTOm4.js","_app/immutable/chunks/rfct6HEx.js","_app/immutable/chunks/Bd-eXrky.js","_app/immutable/chunks/DFj4ioVo.js","_app/immutable/chunks/CgOUicJh.js","_app/immutable/entry/app.DYEEQ061.js","_app/immutable/chunks/PPVm8Dsz.js","_app/immutable/chunks/Bd-eXrky.js","_app/immutable/chunks/koCNJOSy.js","_app/immutable/chunks/CgOUicJh.js","_app/immutable/chunks/CJMKcFSL.js","_app/immutable/chunks/D3h_O1yp.js","_app/immutable/chunks/C6xWfsG8.js","_app/immutable/chunks/DFj4ioVo.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/equipment/[id]",
				pattern: /^\/equipment\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/hardware-tree",
				pattern: /^\/hardware-tree\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/hardware-tree/compare",
				pattern: /^\/hardware-tree\/compare\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/hardware-tree/[id]",
				pattern: /^\/hardware-tree\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/settings",
				pattern: /^\/settings\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
