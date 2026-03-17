import "clsx";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="space-y-8"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-slate-900">Settings</h1> <p class="text-sm text-slate-500 mt-0.5">Manage equipment. Software versions and slots are managed on each equipment page.</p></div> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"></path></svg> New Equipment</button>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div><h2 class="text-base font-semibold text-slate-700 mb-3">All Equipment</h2> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex justify-center py-10"><div class="h-7 w-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
