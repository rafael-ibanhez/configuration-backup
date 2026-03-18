import { h as head, e as ensure_array_like, c as escape_html, a as attr, i as derived } from "../../../../chunks/index2.js";
import "../../../../chunks/api.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let allTrees = [];
    const models = derived(() => [...new Set(allTrees.map((t) => t.model))].sort((a, b) => a.localeCompare(b)));
    const versionsForModel = derived(() => allTrees.filter((t) => t.model === model).map((t) => ({
      value: t.software_version,
      label: t.version_to ? `${t.software_version} – ${t.version_to}` : `${t.software_version}+`
    })).sort((a, b) => a.value.localeCompare(b.value, void 0, { numeric: true })));
    let model = "";
    let fromVersion = "";
    let toVersion = "";
    const canCompare = derived(() => false);
    head("1ri2c3d", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Compare Hardware Trees — Nilpeter Config Backup</title>`);
      });
    });
    $$renderer2.push(`<div class="mb-8"><a href="/hardware-tree" class="text-sm text-slate-500 hover:text-slate-700 transition-colors">← Hardware Trees</a> <h1 class="text-2xl font-bold text-slate-900 mt-3">Compare Hardware Trees</h1> <p class="text-sm text-slate-500 mt-1">Select a machine model and two software versions to see what changed.</p></div> <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">`);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="grid grid-cols-1 sm:grid-cols-3 gap-4"><div><label for="ht-compare-model" class="block text-sm font-medium text-slate-700 mb-1">Machine model</label> `);
    $$renderer2.select(
      {
        id: "ht-compare-model",
        value: model,
        class: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50",
        disabled: models().length === 0
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`— select model —`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_2 = ensure_array_like(models());
        for (let $$index = 0, $$length = each_array_2.length; $$index < $$length; $$index++) {
          let m = each_array_2[$$index];
          $$renderer3.option({ value: m }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(m)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div> <div><label for="ht-compare-from" class="block text-sm font-medium text-slate-700 mb-1">From version</label> `);
    $$renderer2.select(
      {
        id: "ht-compare-from",
        value: fromVersion,
        class: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50",
        disabled: !model
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`— select version —`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_3 = ensure_array_like(versionsForModel());
        for (let $$index_1 = 0, $$length = each_array_3.length; $$index_1 < $$length; $$index_1++) {
          let v = each_array_3[$$index_1];
          $$renderer3.option({ value: v.value, disabled: v.value === toVersion }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(v.label)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div> <div><label for="ht-compare-to" class="block text-sm font-medium text-slate-700 mb-1">To version</label> `);
    $$renderer2.select(
      {
        id: "ht-compare-to",
        value: toVersion,
        class: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50",
        disabled: !model
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`— select version —`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_4 = ensure_array_like(versionsForModel());
        for (let $$index_2 = 0, $$length = each_array_4.length; $$index_2 < $$length; $$index_2++) {
          let v = each_array_4[$$index_2];
          $$renderer3.option({ value: v.value, disabled: v.value === fromVersion }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(v.label)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="mt-4 flex items-center justify-between">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span></span>`);
    }
    $$renderer2.push(`<!--]--> <button${attr("disabled", !canCompare(), true)} class="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`Compare`);
    }
    $$renderer2.push(`<!--]--></button></div></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
