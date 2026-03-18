import { b as attr_class, a as attr, s as stringify } from "../../chunks/index2.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let nameSearch = "";
    $$renderer2.push(`<div class="space-y-6"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-slate-900">Equipment</h1> <p class="text-sm text-slate-500 mt-0.5">Manage configurations and backup status</p></div> <a href="/settings" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"></path></svg> Add Equipment</a></div> <div class="space-y-3"><div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1"><button${attr_class(`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${stringify(
      "bg-white text-slate-900 shadow-sm border border-slate-200"
    )}`)}>Search by name</button> <button${attr_class(`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${stringify("text-slate-500 hover:text-slate-700")}`)}>Search by version</button></div> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="relative"><svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path></svg> <input${attr("value", nameSearch)} type="search" placeholder="Search equipment by name or description…" class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[0-->");
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="flex justify-center py-16"><div class="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
