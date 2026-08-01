const ADMIN_RUNTIME_ENHANCEMENT_STYLE = `<style data-admin-runtime-enhancements="1">
:root{--ui-control-radius-px:var(--ui-radius-px,10px);--admin-toolbar-hover-bg:rgba(148,163,184,.14);--admin-toolbar-hover-bg-dark:rgba(51,65,85,.68)}
#app-shell .rounded-control,
#app-shell [role="tab"]{border-radius:max(16px,calc(var(--ui-control-radius-px) + 2px)) !important}
#app-shell [role="tab"]{position:relative;isolation:isolate}
#app-shell [data-admin-toolbar-group="title"]{min-width:0;flex:1 1 auto}
#app-shell [data-admin-page-title="1"]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#app-shell [data-admin-toolbar-group="actions"]{display:flex;align-items:center;justify-content:flex-end;gap:.25rem;flex-shrink:0;position:relative;z-index:2;white-space:nowrap}
#app-shell [data-admin-toolbar-group="actions"]>*{margin-left:0 !important;margin-right:0 !important}
#app-shell [data-admin-brand-mark="1"]{position:relative;overflow:hidden}
#app-shell [data-admin-brand-mark="1"] svg{display:block;width:1.1rem;height:1.1rem;color:currentColor;filter:drop-shadow(0 1px 2px rgba(15,23,42,.16))}
#app-shell [data-admin-toolbar-action]{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:2.5rem;height:2.5rem;padding:0;border:0 !important;background:transparent !important;color:#475569;box-shadow:none !important;border-radius:max(14px,var(--ui-control-radius-px));transition:background-color .18s ease,color .18s ease,transform .18s ease,opacity .18s ease}
.dark #app-shell [data-admin-toolbar-action]{color:#cbd5e1}
#app-shell [data-admin-toolbar-action]:hover{transform:translateY(-1px);background:var(--admin-toolbar-hover-bg) !important;color:#ea580c}
.dark #app-shell [data-admin-toolbar-action]:hover{background:var(--admin-toolbar-hover-bg-dark) !important;color:#fb923c}
#app-shell [data-admin-toolbar-action]:focus-visible{outline:none;background:var(--admin-toolbar-hover-bg) !important;box-shadow:0 0 0 2px rgba(249,115,22,.2) !important}
.dark #app-shell [data-admin-toolbar-action]:focus-visible{background:var(--admin-toolbar-hover-bg-dark) !important;box-shadow:0 0 0 2px rgba(251,146,60,.24) !important}
#app-shell [data-admin-toolbar-action] i[data-lucide],
#app-shell [data-admin-toolbar-action] svg{width:1.1rem;height:1.1rem}
#app-shell [data-admin-toolbar-action="theme"][data-theme-state="dark"]{color:#ea580c}
.dark #app-shell [data-admin-toolbar-action="theme"][data-theme-state="dark"]{color:#fb923c}
#app-shell [data-admin-toolbar-action="theme"][data-theme-state="light"]{color:#0369a1}
.dark #app-shell [data-admin-toolbar-action="theme"][data-theme-state="light"]{color:#7dd3fc}
body.bg-slate-50,body.antialiased{background:#f8fafc !important;color:#0f172a !important}
.dark body,.dark body.antialiased{background:#020617 !important;color:#e2e8f0 !important}
#app-shell{min-width:0;background:#f8fafc;color:#0f172a}
.dark #app-shell{background:#020617;color:#e2e8f0}
#view-nodes .node-toolbar-primary-btn,
#view-nodes .node-tag-filter-trigger,
#view-nodes .node-toolbar-search,
#view-nodes .node-tag-filter-chip,
#view-nodes .node-action-btn,
#node-modal .node-modal-primary-btn,
#node-modal .node-modal-secondary-btn,
#view-settings .set-tab{position:relative;z-index:1}
#view-nodes .node-toolbar-primary-btn,
#view-nodes .node-tag-filter-trigger,
#view-nodes .node-toolbar-search,
#view-nodes .node-tag-filter-chip,
#view-nodes .node-action-btn,
#view-nodes .rounded-control,
#node-modal .node-modal-primary-btn,
#node-modal .node-modal-secondary-btn,
#view-logs .rounded-control,
#view-dns .rounded-control,
#view-settings .set-tab{border-radius:max(16px,calc(var(--ui-control-radius-px) + 4px)) !important}
#view-nodes .node-toolbar-primary-btn,
#view-nodes .node-tag-filter-trigger,
#view-nodes .node-toolbar-search,
#view-nodes .node-action-btn,
#node-modal .node-modal-primary-btn,
#node-modal .node-modal-secondary-btn{display:inline-flex;align-items:center;justify-content:center;isolation:isolate}
#view-nodes .node-tag-filter-panel-shell{position:relative;z-index:4}
#node-modal [data-admin-node-advanced="1"]{overflow:hidden;border:1px solid #e2e8f0;border-radius:max(16px,calc(var(--ui-control-radius-px) + 6px));background:rgba(248,250,252,.72)}
.dark #node-modal [data-admin-node-advanced="1"]{border-color:#334155;background:rgba(2,6,23,.34)}
#node-modal [data-admin-node-advanced="1"]>summary{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:1rem;cursor:pointer;list-style:none;color:#334155;font-size:.875rem;font-weight:600;user-select:none}
.dark #node-modal [data-admin-node-advanced="1"]>summary{color:#e2e8f0}
#node-modal [data-admin-node-advanced="1"]>summary::-webkit-details-marker{display:none}
#node-modal [data-admin-node-advanced="1"]>summary svg{width:1rem;height:1rem;transition:transform .18s ease}
#node-modal [data-admin-node-advanced="1"][open]>summary svg{transform:rotate(180deg)}
#node-modal [data-admin-node-advanced-content="1"]{display:grid;gap:1rem;padding:0 1rem 1rem;border-top:1px solid #e2e8f0}
.dark #node-modal [data-admin-node-advanced-content="1"]{border-color:#334155}
#node-modal [data-admin-node-advanced-fields="1"]{padding-top:1rem}
#node-modal [data-admin-node-advanced-headers="1"]{margin:0;background:#fff}
.dark #node-modal [data-admin-node-advanced-headers="1"]{background:rgba(15,23,42,.72)}
#node-modal>div[data-ui-dialog-surface="1"]{padding:1rem !important}
#node-modal #node-modal-title{margin-bottom:.75rem !important;font-size:1.125rem;line-height:1.5rem}
#node-modal form{max-height:calc(86vh - env(safe-area-inset-bottom) - env(safe-area-inset-top)) !important}
#node-modal form>*+*{margin-top:.75rem !important}
#node-modal form>[class*="grid"]{gap:.75rem !important}
#node-modal form label{margin-bottom:.2rem}
#node-modal form p[class*="text-xs"]{margin-top:.2rem;line-height:1.15rem}
#node-modal form input:not([type="checkbox"]):not([type="radio"]),
#node-modal form select{min-height:2.25rem;padding-top:.4rem !important;padding-bottom:.4rem !important}
#node-modal form .rounded-2xl.border{padding:.875rem !important}
#node-modal #node-lines-container{gap:.5rem}
#node-modal #node-lines-container>[data-node-line-row="1"]{padding:.625rem !important}
#node-modal [data-admin-node-lines-panel="1"]>div:first-child>div:first-child{min-width:0;flex:1 1 auto}
#node-modal [data-admin-node-lines-panel="1"]>div:first-child>div:last-child{flex:0 0 auto;white-space:nowrap}
#node-modal [data-admin-node-lines-panel="1"]>div:first-child>div:last-child button{flex-shrink:0;white-space:nowrap}
#node-modal [data-admin-node-advanced="1"]>summary{padding:.75rem .875rem}
#node-modal [data-admin-node-advanced-content="1"]{gap:.75rem;padding:0 .875rem .875rem}
#node-modal [data-admin-node-advanced-fields="1"]{padding-top:.875rem}
#node-modal form>div:last-child{margin-top:1rem !important;padding-top:.625rem !important;padding-bottom:.25rem !important}
#node-modal [data-admin-node-basic-grid="1"]{grid-template-columns:minmax(0,.85fr) repeat(3,minmax(0,1fr)) !important}
#node-modal [data-admin-node-meta-grid="1"]{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(15rem,1fr) !important}
#node-modal [data-admin-node-entry-field="1"] p{margin-bottom:0}
#node-modal [data-admin-node-stream-field="1"]{min-width:0}
@media (max-width:767px){#node-modal [data-admin-node-basic-grid="1"],#node-modal [data-admin-node-meta-grid="1"]{grid-template-columns:minmax(0,1fr) !important}}
@media (min-width:768px){#node-modal{max-width:72rem}}
#view-nodes [data-admin-node-toolbar="1"]{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;align-items:start}
#view-nodes [data-admin-node-toolbar-main="1"]{width:100%;max-width:none;min-width:0}
#view-nodes [data-admin-node-toolbar-row="1"]{display:grid;grid-template-columns:max-content max-content minmax(15rem,1fr);align-items:center;gap:.5rem;width:100%}
#view-nodes [data-admin-node-toolbar-actions="1"]{display:grid;grid-template-columns:repeat(3,max-content);align-items:center;justify-content:start;gap:.5rem;width:auto}
#view-nodes [data-admin-node-toolbar-actions="1"]>*{width:auto;min-height:2.5rem;margin:0}
.dark #view-nodes .node-toolbar-primary-btn,
.dark #node-modal .node-modal-primary-btn{background:#2563eb !important;color:#fff !important;box-shadow:0 10px 24px rgba(37,99,235,.22) !important}
.dark #view-nodes .node-toolbar-primary-btn:hover,
.dark #node-modal .node-modal-primary-btn:hover{background:#1d4ed8 !important}
.dark #view-nodes .node-tag-filter-trigger,
.dark #view-nodes .node-toolbar-search,
.dark #view-nodes .node-tag-filter-chip,
.dark #view-nodes .node-action-btn,
.dark #node-modal .node-modal-secondary-btn{background:rgba(15,23,42,.88) !important;color:#e2e8f0 !important;border-color:rgba(71,85,105,.82) !important;box-shadow:none !important}
.dark #view-nodes .node-card-shell,
.dark #view-nodes .node-tag-filter-panel-shell,
.dark #node-modal>div{background:#0f172a !important;border-color:#1e293b !important}
#view-settings{--settings-surface:#ffffff;--settings-soft:#f8fafc;--settings-border:#dbe3ee;--settings-border-strong:#cbd5e1;overflow-x:hidden}
.dark #view-settings{--settings-surface:#0f172a;--settings-soft:#111827;--settings-border:#334155;--settings-border-strong:#475569}
#view-settings,#view-settings .settings-view-layout,#view-settings #settings-forms,#settings-forms>[id^="set-"]{min-width:0;min-height:0}
#view-settings .settings-view-layout{align-items:flex-start;overflow-x:hidden}
#view-settings #settings-forms{flex:1 1 auto;min-width:0}
#settings-forms>[id^="set-"]>.settings-block.h-full{height:auto;min-height:0}
#view-settings .ui-settings-panel,
#view-settings .settings-nav-shell,
#view-settings .settings-block,
#view-settings .settings-list-shell{background:var(--settings-surface) !important;border-color:var(--settings-border) !important;background-image:none !important;box-shadow:none !important}
#view-settings .settings-summary-tile{border:1px solid var(--settings-border) !important;border-radius:max(16px,calc(var(--ui-control-radius-px) + 4px)) !important;background:var(--settings-soft) !important;padding:.875rem 1rem;box-shadow:none !important}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-grid="1"]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-file="1"]{display:grid;gap:.5rem;min-width:0;padding:1rem;border:1px solid var(--settings-border);border-radius:max(14px,var(--ui-control-radius-px));background:var(--settings-soft)}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-file="1"] input{width:100%;min-width:0}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-file-meta="1"],
#view-settings .settings-worker-html-update-card [data-admin-worker-html-status="1"]{overflow-wrap:anywhere}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-actions="1"]{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;padding-top:.25rem}
#view-settings .settings-worker-html-update-card [data-admin-worker-html-actions="1"] button{min-height:2.5rem}
#view-settings .ui-block-head,
#view-settings .settings-nav-shell .border-b,
#view-settings #settings-forms>div>.ui-settings-panel+.ui-settings-panel{border-color:var(--settings-border) !important}
#view-settings .settings-secondary-btn,
#view-settings .settings-secondary-label,
#view-settings button[class*="border-slate-200"],
#view-settings button[class*="border-slate-300"],
#view-settings label[class*="border-slate-200"],
#view-settings label[class*="bg-slate-200"]{display:inline-flex;align-items:center;justify-content:center;border-radius:max(14px,var(--ui-control-radius-px)) !important;background:var(--settings-soft) !important;border:1px solid var(--settings-border) !important;color:#334155 !important;box-shadow:none !important;background-image:none !important}
.dark #view-settings .settings-secondary-btn,
.dark #view-settings .settings-secondary-label,
.dark #view-settings button[class*="border-slate-200"],
.dark #view-settings button[class*="border-slate-300"],
.dark #view-settings label[class*="border-slate-200"],
.dark #view-settings label[class*="bg-slate-200"]{background:var(--settings-soft) !important;border-color:var(--settings-border) !important;color:#e2e8f0 !important}
#view-settings .settings-secondary-btn:hover,
#view-settings .settings-secondary-label:hover,
#view-settings button[class*="border-slate-200"]:hover,
#view-settings button[class*="border-slate-300"]:hover,
#view-settings label[class*="border-slate-200"]:hover,
#view-settings label[class*="bg-slate-200"]:hover{background:var(--settings-surface) !important;border-color:var(--settings-border-strong) !important;color:#0f172a !important}
.dark #view-settings .settings-secondary-btn:hover,
.dark #view-settings .settings-secondary-label:hover,
.dark #view-settings button[class*="border-slate-200"]:hover,
.dark #view-settings button[class*="border-slate-300"]:hover,
.dark #view-settings label[class*="border-slate-200"]:hover,
.dark #view-settings label[class*="bg-slate-200"]:hover{background:#162033 !important;border-color:var(--settings-border-strong) !important;color:#f8fafc !important}
#view-settings .set-tab{background:var(--settings-surface) !important;border-color:var(--settings-border) !important;color:#475569 !important;box-shadow:none !important}
#view-settings .set-tab:hover{background:var(--settings-surface) !important;border-color:var(--settings-border-strong) !important;color:#0f172a !important}
.dark #view-settings .set-tab{background:var(--settings-surface) !important;color:#cbd5e1 !important}
.dark #view-settings .set-tab:hover{background:#162033 !important;color:#fff !important}
#view-settings .set-tab[aria-selected="true"]{background:var(--settings-surface) !important;border-color:#bfdbfe !important;color:#1d4ed8 !important;box-shadow:inset 0 0 0 1px rgba(191,219,254,.75) !important}
.dark #view-settings .set-tab[aria-selected="true"]{background:var(--settings-surface) !important;border-color:#3b82f6 !important;color:#bfdbfe !important;box-shadow:inset 0 0 0 1px rgba(59,130,246,.3) !important}
#view-settings button:disabled,
#view-settings .settings-secondary-btn:disabled,
#view-settings .set-tab:disabled{opacity:.65 !important;pointer-events:none}
@media (max-width:767px){#view-nodes [data-admin-node-toolbar-row="1"],#view-nodes [data-admin-node-toolbar-actions="1"]{grid-template-columns:minmax(0,1fr)}#view-nodes [data-admin-node-toolbar-row="1"]>*{width:100%}#view-settings .settings-view-layout{display:flex;flex-direction:column}#view-settings .settings-worker-html-update-card [data-admin-worker-html-grid="1"]{grid-template-columns:minmax(0,1fr)}#view-settings .settings-worker-html-update-card [data-admin-worker-html-actions="1"]{align-items:stretch;flex-direction:column}#view-settings .settings-worker-html-update-card [data-admin-worker-html-actions="1"] button{width:100%}}
@media (min-width:768px) and (max-width:1535px){#view-nodes [data-admin-node-toolbar-actions="1"]{grid-template-columns:repeat(3,minmax(0,1fr));width:100%}#view-nodes [data-admin-node-toolbar-actions="1"]>*{width:100%}}
@media (min-width:1536px){#view-nodes [data-admin-node-toolbar="1"]{grid-template-columns:minmax(0,1fr) max-content}#view-nodes [data-admin-node-toolbar-actions="1"]{justify-content:end}}
@media (min-width:768px){#app-shell.settings-split-layout #content-area{overflow:hidden}#app-shell.settings-split-layout #view-settings{height:100%;min-height:0;overflow:hidden}#app-shell.settings-split-layout #view-settings .settings-view-layout{height:100%;min-height:0}#app-shell.settings-split-layout #view-settings .settings-nav-shell{position:sticky;top:0;max-height:100%;overflow-y:auto;flex:0 0 auto}#app-shell.settings-split-layout #view-settings #settings-forms{height:100%;min-height:0;overflow-y:auto;padding-right:.25rem;scrollbar-gutter:stable}}
#app-shell.render-lite.settings-split-layout #view-settings .settings-nav-shell{position:static;top:auto;max-height:none;overflow:visible}
#app-shell input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
#app-shell select,
#app-shell textarea,
#app-shell label:has(> input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])),
#app-shell label:has(> select),
#app-shell label:has(> textarea){border-radius:var(--ui-control-radius-px) !important}
#app-shell i[data-lucide]{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}
#app-shell svg.lucide{display:block;flex-shrink:0;stroke:currentColor}
#view-dashboard [data-dashboard-traffic-card="1"]{position:relative !important}
#view-dashboard [data-dashboard-traffic-label="1"]{width:calc(100% - 2.75rem);padding-right:0;overflow:visible;text-overflow:clip;white-space:normal !important}
#view-dashboard [data-dashboard-traffic-toggle="1"]{position:absolute;top:1rem;right:1rem;display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;border:1px solid #dbe3ee;background:rgba(255,255,255,.9);color:#475569;border-radius:max(12px,var(--ui-control-radius-px));box-shadow:none;transition:background-color .18s ease,border-color .18s ease,color .18s ease,opacity .18s ease}
#view-dashboard [data-dashboard-traffic-toggle="1"]:hover{background:#f8fafc;border-color:#94a3b8;color:#047857}
#view-dashboard [data-dashboard-traffic-toggle="1"]:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(16,185,129,.22)}
#view-dashboard [data-dashboard-traffic-toggle="1"]:disabled{cursor:wait;opacity:.6}
#view-dashboard [data-dashboard-traffic-toggle="1"] i,#view-dashboard [data-dashboard-traffic-toggle="1"] svg{width:1rem;height:1rem}
.dark #view-dashboard [data-dashboard-traffic-toggle="1"]{border-color:#334155;background:rgba(15,23,42,.92);color:#cbd5e1}
.dark #view-dashboard [data-dashboard-traffic-toggle="1"]:hover{border-color:#64748b;background:#111827;color:#34d399}
</style>`;
const ADMIN_RUNTIME_ENHANCEMENT_SCRIPT = `<script data-admin-runtime-enhancements="1">
(() => {
  if (window.__ADMIN_RUNTIME_ENHANCEMENTS_READY__) return;
  window.__ADMIN_RUNTIME_ENHANCEMENTS_READY__ = true;

  const enqueue = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 16);
  const brandIconSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.25 5.75h9.5" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/><path d="M7.25 12h6.75" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/><path d="M7.25 18.25h9.5" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/><path d="M7.25 5.75v12.5" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/></svg>';
  const wikiTutorialUrl = 'https://wiki.8081666.xyz/新手教程';
  const shellHookSelector = '[data-admin-toolbar-group="title"],[data-admin-toolbar-group="actions"],[data-admin-page-title="1"],[data-admin-brand-shell="1"],[data-admin-brand-title="1"],[data-admin-brand-mark="1"],#view-dashboard,#view-nodes,#view-logs,#view-settings,#node-modal';
  let iconFrameId = 0;
  let shellFrameId = 0;
  let nodeModalWasOpen = false;
  let patchedSafetyContractApp = null;
  const dashboardTrafficState = {
    period: 'day',
    daily: null,
    monthly: null,
    monthlyPeriodKey: '',
    monthlyExpiresAt: 0,
    monthlyAvailable: false,
    pending: false
  };
  const DASHBOARD_MONTHLY_TRAFFIC_CLIENT_TTL_MS = 30 * 60 * 1000;
  const dashboardLayerState = {
    loadSeq: 0,
    statsLoaded: false,
    runtimeLoaded: false,
    hotspotLoaded: false,
    statsLoading: false,
    runtimeLoading: false,
    hotspotLoading: false
  };

  function shouldRetainDashboardD1WriteHotspot(hotspot) {
    if (!hotspot || typeof hotspot !== 'object') return false;
    return String(hotspot.status || '').trim().toLowerCase() !== 'idle';
  }

  function retainDashboardD1WriteHotspotInStats(stats, hotspot) {
    const payload = stats && typeof stats === 'object' ? stats : {};
    if (!shouldRetainDashboardD1WriteHotspot(hotspot)) return payload;
    return { ...payload, d1WriteHotspot: hotspot };
  }
  const workerHtmlUpdateState = {
    root: null,
    workerFile: null,
    indexFile: null,
    submitting: false,
    status: '必须同时选择 worker.js 和 index.html。',
    tone: ''
  };
  function canRenderIcons() {
    return !!window.lucide && typeof window.lucide.createIcons === 'function';
  }

  function renderIcons(root = document.body) {
    if (!canRenderIcons()) return false;
    try {
      if (root && root.nodeType === Node.ELEMENT_NODE) {
        window.lucide.createIcons({ root });
      } else {
        window.lucide.createIcons({});
      }
      return true;
    } catch (error) {
      console.error('admin runtime lucide refresh failed', error);
      return false;
    }
  }

  function scheduleIconRefresh(root = document.body) {
    if (iconFrameId) return;
    iconFrameId = enqueue(() => {
      iconFrameId = 0;
      renderIcons(root);
    });
  }

  const SENSITIVE_VALUE_PLACEHOLDER = '********';

  function setSensitiveInputVisibility(input, button, revealed) {
    if (!input || !button) return;
    input.type = revealed ? 'text' : 'password';
    button.setAttribute('aria-pressed', revealed ? 'true' : 'false');
    button.setAttribute('aria-label', revealed ? '隐藏敏感信息' : '显示敏感信息');
    button.setAttribute('title', revealed ? '隐藏敏感信息' : '显示敏感信息');
    button.innerHTML = '<i data-lucide="' + (revealed ? 'eye-off' : 'eye') + '" class="h-4 w-4" aria-hidden="true"></i>';
    scheduleIconRefresh(button);
  }

  function syncSensitiveInputPresentation(input, hint = '') {
    if (!input) return;
    const normalizedHint = String(hint || '').trim();
    input.placeholder = SENSITIVE_VALUE_PLACEHOLDER;
    input.dataset.sensitiveHint = normalizedHint;
    if (normalizedHint) input.setAttribute('title', normalizedHint);
    else input.removeAttribute('title');
    input.closest?.('[data-sensitive-input-toggle]')?.querySelector?.('button')?.toggleAttribute('disabled', input.disabled === true);
  }

  function mountSensitiveInputToggle(input) {
    if (!input || input.readOnly || input.dataset.sensitiveToggleBound === 'true') return;
    const basePlaceholder = input.getAttribute('placeholder') || '';
    input.dataset.sensitiveToggleBound = 'true';
    syncSensitiveInputPresentation(input, basePlaceholder);
    input.setAttribute('aria-label', input.getAttribute('aria-label') || '敏感信息');

    const parent = input.parentElement;
    if (!parent) return;
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-sensitive-input-toggle', '1');
    wrapper.style.cssText = 'position:relative;display:block;min-width:0;';
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.style.paddingRight = '2.75rem';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center text-slate-400 transition hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:text-sky-300';
    button.disabled = input.disabled;
    button.addEventListener('click', () => {
      setSensitiveInputVisibility(input, button, input.type === 'password');
    });
    wrapper.appendChild(button);
    setSensitiveInputVisibility(input, button, false);
    syncSensitiveInputPresentation(input, basePlaceholder);
  }

  function mountSensitiveInputToggles(root = document) {
    root?.querySelectorAll?.('input[type="password"]:not([readonly])').forEach((input) => mountSensitiveInputToggle(input));
  }

  function scheduleShellRefresh() {
    if (shellFrameId) return;
    shellFrameId = enqueue(() => {
      shellFrameId = 0;
      applyBrandEnhancements();
      applyToolbarEnhancements();
      applyLayoutEnhancements();
      applySafetyContractEnhancements();
      mountSensitiveInputToggles(document);
      syncDashboardTrafficToggle(window.App);
    });
  }

  function containsLucidePlaceholder(node) {
    if (!node) return false;
    if (node.matches?.('i[data-lucide]')) return true;
    return !!node.querySelector?.('i[data-lucide]');
  }

  function touchesShellHooks(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches?.(shellHookSelector)) return true;
    if (node.closest?.(shellHookSelector)) return true;
    return !!node.querySelector?.(shellHookSelector);
  }

  function getToolbarNodes() {
    const titleGroup = document.querySelector('[data-admin-toolbar-group="title"]');
    const actionGroup = document.querySelector('[data-admin-toolbar-group="actions"]');
    const titleNode = document.querySelector('[data-admin-page-title="1"]');
    const githubLink = actionGroup?.querySelector('a[href*="github.com/axuitomo/CF-EMBY-PROXY-UI"]') || null;
    const themeButton = actionGroup
      ? [...actionGroup.querySelectorAll('button')].find((button) => button.querySelector('[data-lucide="moon"],[data-lucide="sun"]')) || null
      : null;
    return { titleGroup, actionGroup, titleNode, githubLink, themeButton };
  }

  function getBrandNodes() {
    const brandShell = document.querySelector('[data-admin-brand-shell="1"]');
    if (!brandShell) return {};
    const brandTitle = brandShell.querySelector('[data-admin-brand-title="1"]');
    const brandMark = brandShell.querySelector('[data-admin-brand-mark="1"]');
    return { brandShell, brandTitle, brandMark };
  }

  function applyBrandEnhancements() {
    const { brandTitle, brandMark } = getBrandNodes();
    if (brandTitle) {
      brandTitle.setAttribute('title', String(brandTitle.textContent || '').trim());
    }
    if (!brandMark) return;
    brandMark.setAttribute('data-admin-brand-mark', '1');
    brandMark.setAttribute('aria-hidden', 'true');
    if (brandMark.dataset.adminBrandSvgApplied === '1') return;
    brandMark.dataset.adminBrandSvgApplied = '1';
    brandMark.textContent = '';
    brandMark.innerHTML = brandIconSvg;
  }

  function ensureWikiToolbarLink(actionGroup, themeButton) {
    if (!actionGroup) return null;
    let wikiLink = actionGroup.querySelector('[data-admin-toolbar-action="wiki"]');
    if (!wikiLink) {
      wikiLink = document.createElement('a');
      wikiLink.setAttribute('data-admin-toolbar-action', 'wiki');
      wikiLink.setAttribute('href', wikiTutorialUrl);
      wikiLink.setAttribute('target', '_blank');
      wikiLink.setAttribute('rel', 'noopener noreferrer');
      wikiLink.innerHTML = '<i data-lucide="book-open" aria-hidden="true"></i>';
      actionGroup.insertBefore(wikiLink, themeButton || null);
    }
    wikiLink.setAttribute('title', '打开 WIKI 新手教程');
    wikiLink.setAttribute('aria-label', '打开 WIKI 新手教程');
    return wikiLink;
  }

  function applyToolbarEnhancements() {
    const { titleGroup, actionGroup, titleNode, githubLink, themeButton } = getToolbarNodes();
    if (titleNode) {
      const titleText = String(titleNode.textContent || '').trim();
      titleNode.setAttribute('title', titleText);
    }
    if (githubLink) {
      githubLink.setAttribute('data-admin-toolbar-action', 'github');
      githubLink.setAttribute('aria-label', githubLink.getAttribute('aria-label') || '打开 GitHub 项目主页');
    }
    ensureWikiToolbarLink(actionGroup, themeButton);
    if (themeButton) {
      themeButton.setAttribute('data-admin-toolbar-action', 'theme');
      themeButton.setAttribute('type', 'button');
      const isDark = document.documentElement.classList.contains('dark') || document.body?.classList.contains('dark');
      const nextThemeLabel = isDark ? '切换到亮色模式' : '切换到暗色模式';
      themeButton.setAttribute('data-theme-state', isDark ? 'dark' : 'light');
      themeButton.setAttribute('title', nextThemeLabel);
      themeButton.setAttribute('aria-label', nextThemeLabel);
      if (!themeButton.dataset.adminThemeRefreshBound) {
        themeButton.dataset.adminThemeRefreshBound = '1';
        themeButton.addEventListener('click', () => scheduleShellRefresh());
      }
    }
  }

  function applyNodeToolbarLayout() {
    const search = document.querySelector('#node-search');
    const toolbarRow = search?.parentElement;
    const toolbarMain = toolbarRow?.parentElement;
    const toolbar = toolbarMain?.parentElement;
    if (!toolbarRow || !toolbarMain || !toolbar) return;
    toolbar.setAttribute('data-admin-node-toolbar', '1');
    toolbarMain.setAttribute('data-admin-node-toolbar-main', '1');
    toolbarRow.setAttribute('data-admin-node-toolbar-row', '1');
    const actionGroup = [...toolbar.children].find((child) => child !== toolbarMain) || null;
    actionGroup?.setAttribute('data-admin-node-toolbar-actions', '1');
  }

  function formatWorkerHtmlUploadBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    return value >= 1024 * 1024
      ? (value / (1024 * 1024)).toFixed(2) + ' MiB'
      : Math.round(value / 1024) + ' KiB';
  }

  function buildAdminHardRefreshUrl(revision = '') {
    const url = new URL(window.location.href);
    const normalizedRevision = String(revision || '').trim();
    if (normalizedRevision) url.searchParams.set('__admin_revision', normalizedRevision);
    url.searchParams.set('__admin_reload', Date.now().toString());
    return url;
  }

  function navigateWithAdminCacheBust(revision = '') {
    window.location.replace(buildAdminHardRefreshUrl(revision).toString());
  }

  async function waitForAdminShellRevision(revision = '') {
    const expectedRevision = String(revision || '').trim();
    if (!expectedRevision) return true;
    const delays = [500, 1000, 2000, 4000, 8000];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, delays[attempt - 1]));
      const probeUrl = buildAdminHardRefreshUrl(expectedRevision);
      probeUrl.searchParams.set('__admin_probe', String(attempt + 1));
      try {
        const response = await window.fetch(probeUrl.toString(), {
          method: 'HEAD',
          credentials: 'same-origin',
          cache: 'reload',
          headers: { Accept: 'text/html' }
        });
        if (response.ok && String(response.headers.get('X-Admin-Shell-Revision') || '').trim() === expectedRevision) return true;
      } catch {
        // Deployment propagation is retried with a bounded backoff.
      }
    }
    return false;
  }

  function validateWorkerHtmlUploadFiles(workerFile, indexFile) {
    if (!workerFile || !indexFile) return '必须同时选择 worker.js 和 index.html。';
    if (String(workerFile.name || '').trim().toLowerCase() !== 'worker.js') return 'Worker 文件名必须是 worker.js。';
    if (String(indexFile.name || '').trim().toLowerCase() !== 'index.html') return 'HTML 文件名必须是 index.html。';
    if (workerFile.size > 3 * 1024 * 1024) return 'worker.js 超过 3 MiB 上限。';
    if (indexFile.size > 2 * 1024 * 1024) return 'index.html 超过 2 MiB 上限。';
    return '';
  }

  function renderWorkerHtmlUpdateState() {
    const state = workerHtmlUpdateState;
    const root = state.root;
    if (!root) return;
    const workerMeta = root.querySelector('[data-admin-worker-file-meta="1"]');
    const indexMeta = root.querySelector('[data-admin-index-file-meta="1"]');
    const status = root.querySelector('[data-admin-worker-html-status="1"]');
    const submitButton = root.querySelector('[data-admin-worker-html-submit="1"]');
    const refreshButton = root.querySelector('[data-admin-worker-html-refresh="1"]');
    const workerInput = root.querySelector('[data-admin-worker-file-input="1"]');
    const indexInput = root.querySelector('[data-admin-index-file-input="1"]');
    const validationError = validateWorkerHtmlUploadFiles(state.workerFile, state.indexFile);
    if (workerMeta) workerMeta.textContent = state.workerFile ? state.workerFile.name + ' · ' + formatWorkerHtmlUploadBytes(state.workerFile.size) : '未选择';
    if (indexMeta) indexMeta.textContent = state.indexFile ? state.indexFile.name + ' · ' + formatWorkerHtmlUploadBytes(state.indexFile.size) : '未选择';
    if (status) {
      status.textContent = state.status || validationError || '两个文件已就绪。';
      status.classList.remove('border-rose-200', 'text-rose-700', 'border-emerald-200', 'text-emerald-700');
      if (state.tone === 'error') status.classList.add('border-rose-200', 'text-rose-700');
      if (state.tone === 'success') status.classList.add('border-emerald-200', 'text-emerald-700');
    }
    if (submitButton) {
      submitButton.disabled = state.submitting || Boolean(validationError);
      const label = submitButton.querySelector('span');
      if (label) label.textContent = state.submitting ? '更新中...' : '同时更新 Worker 和 HTML';
    }
    if (refreshButton) refreshButton.disabled = state.submitting;
    if (workerInput) workerInput.disabled = state.submitting;
    if (indexInput) indexInput.disabled = state.submitting;
    root.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
  }

  async function submitWorkerHtmlUpdate(app) {
    const state = workerHtmlUpdateState;
    const validationError = validateWorkerHtmlUploadFiles(state.workerFile, state.indexFile);
    if (validationError || state.submitting) {
      state.status = validationError || '更新正在执行中。';
      state.tone = 'error';
      renderWorkerHtmlUpdateState();
      return;
    }
    const accepted = typeof app?.askConfirm === 'function'
      ? await app.askConfirm('将同时更新当前 Worker 脚本和管理台 HTML。两个文件必须来自同一版本。', {
          title: '确认 Worker 和 HTML 更新',
          tone: 'warning',
          confirmText: '开始更新'
        })
      : true;
    if (!accepted) return;

    state.submitting = true;
    state.status = '正在读取并校验两个文件...';
    state.tone = '';
    renderWorkerHtmlUpdateState();
    try {
      const fileContents = await Promise.all([state.workerFile.text(), state.indexFile.text()]);
      state.status = '正在更新 HTML 与 Worker...';
      renderWorkerHtmlUpdateState();
      const result = await app.apiCall('updateWorkerAndAdminIndex', {
        workerFileName: state.workerFile.name,
        workerScriptContent: fileContents[0],
        indexFileName: state.indexFile.name,
        indexHtml: fileContents[1]
      });
      if (result?.revisions && typeof app.applyAdminRevisions === 'function') app.applyAdminRevisions(result.revisions);
      state.workerFile = null;
      state.indexFile = null;
      const workerInput = state.root?.querySelector('[data-admin-worker-file-input="1"]');
      const indexInput = state.root?.querySelector('[data-admin-index-file-input="1"]');
      if (workerInput) workerInput.value = '';
      if (indexInput) indexInput.value = '';
      state.status = 'Worker 和 index.html 已同时更新。';
      state.tone = 'success';
      app.showMessage?.('Worker 和 HTML 已更新。', { tone: 'success' });
      const targetRevision = String(result?.html?.revision || '').trim();
      state.status = '更新已提交，正在确认新页面版本...';
      renderWorkerHtmlUpdateState();
      if (await waitForAdminShellRevision(targetRevision)) {
        navigateWithAdminCacheBust(targetRevision);
        return;
      }
      state.status = '更新已完成，但边缘节点尚未确认新页面；请稍后手动刷新。';
    } catch (error) {
      state.status = '更新失败：' + (error?.message || '未知错误');
      state.tone = 'error';
      app.showMessage?.(state.status, { tone: 'error', modal: true });
    } finally {
      state.submitting = false;
      renderWorkerHtmlUpdateState();
    }
  }

  function syncWorkerHtmlUpdatePanel(app = window.App) {
    const root = document.querySelector('#admin-worker-html-update-root');
    if (!root || !app) return;
    if (workerHtmlUpdateState.root !== root) {
      workerHtmlUpdateState.root = root;
      workerHtmlUpdateState.workerFile = null;
      workerHtmlUpdateState.indexFile = null;
      workerHtmlUpdateState.status = '必须同时选择 worker.js 和 index.html。';
      workerHtmlUpdateState.tone = '';
    }
    if (!root.dataset.adminWorkerHtmlReady) {
      root.dataset.adminWorkerHtmlReady = '1';
      root.innerHTML = '<div class="ui-block-head"><div><div class="ui-section-kicker">Runtime Update</div><div class="ui-section-title">Worker 和 HTML 更新</div></div><span class="ui-chip-muted">双文件</span></div>'
        + '<div data-admin-worker-html-grid="1">'
        + '<label data-admin-worker-html-file="1"><span class="ui-field-label">worker.js</span><input data-admin-worker-file-input="1" type="file" accept=".js,text/javascript,application/javascript"><span data-admin-worker-file-meta="1" class="text-xs text-slate-500">未选择</span></label>'
        + '<label data-admin-worker-html-file="1"><span class="ui-field-label">index.html</span><input data-admin-index-file-input="1" type="file" accept=".html,text/html"><span data-admin-index-file-meta="1" class="text-xs text-slate-500">未选择</span></label>'
        + '</div>'
        + '<div data-admin-worker-html-status="1" role="status" aria-live="polite" class="mt-4 rounded-control border border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"></div>'
        + '<div data-admin-worker-html-actions="1" class="mt-4"><button data-admin-worker-html-refresh="1" type="button" class="settings-secondary-btn h-10 w-10" title="刷新当前页面" aria-label="刷新当前页面"><i data-lucide="refresh-cw" class="w-4 h-4" aria-hidden="true"></i></button><button data-admin-worker-html-submit="1" type="button" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm transition disabled:opacity-50 disabled:pointer-events-none"><i data-lucide="upload-cloud" class="w-4 h-4" aria-hidden="true"></i><span>同时更新 Worker 和 HTML</span></button></div>';
      root.querySelector('[data-admin-worker-file-input="1"]')?.addEventListener('change', (event) => {
        workerHtmlUpdateState.workerFile = event.currentTarget.files?.[0] || null;
        workerHtmlUpdateState.status = validateWorkerHtmlUploadFiles(workerHtmlUpdateState.workerFile, workerHtmlUpdateState.indexFile) || '两个文件已就绪。';
        workerHtmlUpdateState.tone = validateWorkerHtmlUploadFiles(workerHtmlUpdateState.workerFile, workerHtmlUpdateState.indexFile) ? '' : 'success';
        renderWorkerHtmlUpdateState();
      });
      root.querySelector('[data-admin-index-file-input="1"]')?.addEventListener('change', (event) => {
        workerHtmlUpdateState.indexFile = event.currentTarget.files?.[0] || null;
        workerHtmlUpdateState.status = validateWorkerHtmlUploadFiles(workerHtmlUpdateState.workerFile, workerHtmlUpdateState.indexFile) || '两个文件已就绪。';
        workerHtmlUpdateState.tone = validateWorkerHtmlUploadFiles(workerHtmlUpdateState.workerFile, workerHtmlUpdateState.indexFile) ? '' : 'success';
        renderWorkerHtmlUpdateState();
      });
      root.querySelector('[data-admin-worker-html-refresh="1"]')?.addEventListener('click', () => navigateWithAdminCacheBust());
      root.querySelector('[data-admin-worker-html-submit="1"]')?.addEventListener('click', () => submitWorkerHtmlUpdate(app));
      scheduleIconRefresh(root);
    }
    renderWorkerHtmlUpdateState();
  }

  function applySettingsLayout() {
    syncWorkerHtmlUpdatePanel(window.App);
  }

  function applyNodeAdvancedSettingsLayout() {
    const nodeModal = document.querySelector('#node-modal');
    const linesContainer = document.querySelector('#node-lines-container');
    const linesPanel = linesContainer?.closest('.rounded-2xl.border');
    const playbackInfoField = document.querySelector('#form-playback-info-mode');
    const advancedFields = playbackInfoField?.closest('.grid');
    const headersContainer = document.querySelector('#headers-container');
    const headersPanel = headersContainer?.parentElement;
    if (!linesPanel || !advancedFields || !headersPanel) return;
    linesPanel.setAttribute('data-admin-node-lines-panel', '1');

    let advancedSection = document.querySelector('[data-admin-node-advanced="1"]');
    if (!advancedSection) {
      advancedSection = document.createElement('details');
      advancedSection.setAttribute('data-admin-node-advanced', '1');
      advancedSection.open = true;
      advancedSection.innerHTML = '<summary><span>高级设置</span><i data-lucide="chevron-down" aria-hidden="true"></i></summary><div data-admin-node-advanced-content="1"></div>';
      linesPanel.insertAdjacentElement('afterend', advancedSection);
    }
    const content = advancedSection.querySelector('[data-admin-node-advanced-content="1"]');
    if (!content) return;
    const nodeModalIsOpen = !!nodeModal?.open;
    if (nodeModalIsOpen && !nodeModalWasOpen) advancedSection.open = true;
    nodeModalWasOpen = nodeModalIsOpen;
    advancedFields.setAttribute('data-admin-node-advanced-fields', '1');
    headersPanel.setAttribute('data-admin-node-advanced-headers', '1');
    if (advancedFields.parentElement !== content) content.appendChild(advancedFields);
    if (headersPanel.parentElement !== content) content.appendChild(headersPanel);
  }

  function applyNodePrimaryFieldsLayout() {
    const entryMode = document.querySelector('#form-entry-mode');
    const displayName = document.querySelector('#form-display-name');
    const tag = document.querySelector('#form-tag');
    const remark = document.querySelector('#form-remark');
    const streamMode = document.querySelector('#form-main-video-stream-mode');
    const entryField = entryMode?.parentElement;
    const basicGrid = displayName?.parentElement?.parentElement;
    const metaGrid = tag?.closest('.grid.grid-cols-1');
    const streamField = streamMode?.parentElement;
    const streamPanel = streamField?.closest('.rounded-2xl.border');
    if (entryField && basicGrid) {
      entryField.setAttribute('data-admin-node-entry-field', '1');
      basicGrid.setAttribute('data-admin-node-basic-grid', '1');
      if (basicGrid.firstElementChild !== entryField) basicGrid.insertBefore(entryField, basicGrid.firstElementChild);
    }
    if (metaGrid && remark && streamField) {
      metaGrid.setAttribute('data-admin-node-meta-grid', '1');
      streamField.setAttribute('data-admin-node-stream-field', '1');
      const remarkField = remark.parentElement;
      if (streamField.parentElement !== metaGrid || remarkField?.nextElementSibling !== streamField) {
        remarkField?.insertAdjacentElement('afterend', streamField);
      }
    }
    streamPanel?.remove();
  }

  function applyLayoutEnhancements() {
    applyNodeToolbarLayout();
    applySettingsLayout();
    applyNodePrimaryFieldsLayout();
    applyNodeAdvancedSettingsLayout();
  }

  function normalizeAdminActionError(responsePayload, status) {
    const error = new Error(responsePayload?.error?.message || 'HTTP ' + status);
    error.code = responsePayload?.error?.code || null;
    error.status = status;
    return error;
  }

  async function callConfirmedAdminAction(app, action, payload, confirmAction) {
    const requestInit = {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Confirm': confirmAction
      },
      body: JSON.stringify({ action, ...payload })
    };
    const adminPath = String(window.location?.pathname || '/admin');
    let response = await window.fetch(adminPath, requestInit);
    if (response.status === 401 && typeof app?.promptLogin === 'function') {
      await app.promptLogin();
      response = await window.fetch(adminPath, requestInit);
    }
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) throw normalizeAdminActionError(responsePayload, response.status);
    return responsePayload;
  }

  function getTidyResultGroups(result, key) {
    if (Array.isArray(result?.[key])) return result[key];
    return Array.isArray(result?.preview?.[key]) ? result.preview[key] : [];
  }

  function buildTidyExecutionResultMessage(app, result, summaryMessage, refreshIncomplete) {
    const groupDefinitions = [
      ['实际迁移字段', 'fieldGroups', true],
      ['实际删除', 'deleteGroups', false],
      ['实际重写', 'rewriteGroups', false],
      ['实际保留', 'preserveGroups', false]
    ];
    const lines = [summaryMessage];
    for (const [title, key, isFieldGroup] of groupDefinitions) {
      const groups = getTidyResultGroups(result, key);
      lines.push('', title + '：');
      if (!groups.length) {
        lines.push('• 无');
        continue;
      }
      for (const group of groups) {
        const formatter = isFieldGroup ? app.formatTidyFieldGroupText : app.formatTidyPreviewGroupText;
        lines.push(typeof formatter === 'function' ? formatter.call(app, group) : '• ' + String(group?.label || '未命名分组'));
      }
    }
    if (refreshIncomplete) {
      lines.push('', '设置或列表只完成了部分刷新，请手动刷新页面确认最新状态。');
    }
    return lines.join('\\n');
  }

  function collectD1ReadinessLines(status) {
    const readiness = status?.readiness && typeof status.readiness === 'object' ? status.readiness : {};
    const candidates = {
      ...(status?.tables && typeof status.tables === 'object' ? status.tables : {}),
      ...(status?.indexes && typeof status.indexes === 'object' ? status.indexes : {}),
      ...readiness
    };
    const lines = [];
    for (const [key, value] of Object.entries(candidates)) {
      if (typeof value === 'boolean') lines.push('• ' + key + '：' + (value ? '就绪' : '未就绪'));
      if (value && typeof value === 'object' && typeof value.ready === 'boolean') {
        lines.push('• ' + key + '：' + (value.ready ? '就绪' : '未就绪'));
      }
    }
    if (typeof status?.ftsReady === 'boolean' && !Object.prototype.hasOwnProperty.call(candidates, 'fts')) {
      lines.push('• FTS：' + (status.ftsReady ? '就绪' : '未就绪'));
    }
    return [...new Set(lines)];
  }

  function formatD1SchemaStatus(status = {}) {
    const issues = Array.isArray(status?.issues)
      ? status.issues.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const lines = ['当前结构：' + (status?.schemaReady === true ? '已就绪' : '未就绪')];
    const readinessLines = collectD1ReadinessLines(status);
    if (readinessLines.length) lines.push('', '表与索引：', ...readinessLines);
    const columns = status?.columns && typeof status.columns === 'object' ? status.columns : {};
    const columnLines = [];
    for (const [tableName, tableColumns] of Object.entries(columns)) {
      if (!tableColumns || typeof tableColumns !== 'object') continue;
      for (const [columnName, ready] of Object.entries(tableColumns)) {
        if (typeof ready === 'boolean') columnLines.push('• ' + tableName + '.' + columnName + '：' + (ready ? '就绪' : '缺失'));
      }
    }
    if (columnLines.length) lines.push('', '列状态：', ...columnLines);
    if (issues.length) lines.push('', '结构问题：', ...issues.map((issue) => '• ' + issue));
    return lines.join('\\n');
  }

  function formatD1InitializationResult(result = {}) {
    const initialization = result?.initialization && typeof result.initialization === 'object'
      ? result.initialization
      : {};
    const createdTables = Array.isArray(initialization.createdTables) ? initialization.createdTables : [];
    const actionLines = createdTables.length ? ['• 新建表：' + createdTables.join('、')] : ['• 当前结构无需调整'];
    if (initialization.ftsRebuilt === true) actionLines.push('• 构建 FTS 全文索引');
    return formatD1SchemaStatus(result?.status || {}) + '\\n\\n本次初始化：\\n' + actionLines.join('\\n');
  }

  function getDashboardTrafficNodes() {
    const count = document.querySelector('#dash-traffic-count');
    const card = count?.closest?.('.glass-card') || null;
    if (!card) return {};
    return {
      card,
      label: card.querySelector('p'),
      count,
      hint: card.querySelector('#dash-traffic-hint'),
      badges: card.querySelector('#dash-traffic-meta'),
      detail: card.querySelector('#dash-traffic-detail'),
      toggle: card.querySelector('[data-dashboard-traffic-toggle="1"]')
    };
  }

  function snapshotDashboardTrafficCard(nodes = getDashboardTrafficNodes()) {
    if (!nodes.card || !nodes.count) return null;
    return {
      count: String(nodes.count.textContent || ''),
      hint: String(nodes.hint?.textContent || ''),
      title: String(nodes.count.getAttribute('title') || ''),
      detail: String(nodes.detail?.textContent || ''),
      badgeHtml: String(nodes.badges?.innerHTML || '')
    };
  }

  function renderDashboardTrafficBadges(nodes, badges = [], app = window.App) {
    if (!nodes.badges) return;
    nodes.badges.replaceChildren();
    const normalizedBadges = Array.isArray(badges) ? badges : [];
    for (const badge of normalizedBadges) {
      if (!badge?.label) continue;
      const span = document.createElement('span');
      span.className = 'px-2.5 py-1 rounded-full text-[11px] font-medium ' + (app?.getDashboardBadgeClass?.(badge.tone) || 'bg-slate-100 text-slate-600');
      span.textContent = String(badge.label);
      nodes.badges.appendChild(span);
    }
  }

  function renderDashboardTrafficCard(view = {}, period = 'day', app = window.App) {
    const nodes = getDashboardTrafficNodes();
    if (!nodes.card || !nodes.count) return false;
    nodes.label.textContent = period === 'month'
      ? '本月视频流量 (CF Zone 总流量)'
      : '今日视频流量 (CF Zone 总流量)';
    nodes.count.textContent = String(view.count || '0 B');
    nodes.count.setAttribute('title', String(view.title || ''));
    if (nodes.hint) {
      nodes.hint.textContent = String(view.hint || '\u00a0');
      nodes.hint.setAttribute('title', String(view.title || ''));
    }
    if (nodes.detail) nodes.detail.textContent = String(view.detail || ' ');
    if (view.badgeHtml !== undefined && nodes.badges) nodes.badges.innerHTML = String(view.badgeHtml || '');
    else renderDashboardTrafficBadges(nodes, view.badges, app);
    return true;
  }

  function buildMonthlyTrafficCardView(payload = {}, app = window.App) {
    const title = [
      payload.trafficSourceText,
      payload.cfAnalyticsStatus,
      payload.cfAnalyticsError,
      payload.cfAnalyticsDetail,
      payload.warning
    ].filter(Boolean).join(' | ');
    const statusBadge = app?.getTrafficStatusBadge?.(payload) || {
      label: payload.cfAnalyticsLoaded ? '流量状态: Cloudflare 正常' : '流量状态: 查询失败',
      tone: payload.cfAnalyticsLoaded ? 'emerald' : 'red'
    };
    const freshnessBadge = app?.getStatsFreshnessBadge?.(payload) || {
      label: payload.cacheStatus === 'cache' ? '月统计: 缓存命中' : '月统计: 实时汇总',
      tone: payload.cacheStatus === 'cache' ? 'blue' : 'emerald'
    };
    return {
      count: payload.traffic || '0 B',
      hint: payload.trafficSourceText || payload.cfAnalyticsStatus || payload.cfAnalyticsError || '\u00a0',
      title,
      detail: [payload.cfAnalyticsStatus, payload.cfAnalyticsError, payload.cfAnalyticsDetail, payload.warning].filter(Boolean).join('\\n') || ' ',
      badges: [statusBadge, freshnessBadge]
    };
  }

  function updateDashboardTrafficToggleButton(nodes = getDashboardTrafficNodes()) {
    const button = nodes.toggle;
    if (!button) return;
    const showingMonth = dashboardTrafficState.period === 'month';
    const nextLabel = showingMonth ? '切换为今日流量' : '切换为本月流量';
    button.title = nextLabel;
    button.setAttribute('aria-label', nextLabel);
    button.setAttribute('aria-pressed', showingMonth ? 'true' : 'false');
    button.setAttribute('aria-busy', dashboardTrafficState.pending ? 'true' : 'false');
    button.disabled = dashboardTrafficState.pending;
    const icon = button.querySelector('i,svg');
    if (icon) icon.classList.toggle('animate-spin', dashboardTrafficState.pending);
  }

  function getDashboardMonthPeriodKey(app = window.App, timestamp = Date.now()) {
    const configuredOffset = Number(app?.runtimeConfig?.scheduleUtcOffsetMinutes ?? 480);
    const utcOffsetMinutes = Number.isFinite(configuredOffset) ? Math.trunc(configuredOffset) : 480;
    const shifted = new Date(Math.max(0, Number(timestamp) || Date.now()) + utcOffsetMinutes * 60 * 1000);
    return shifted.getUTCFullYear() + '-' + String(shifted.getUTCMonth() + 1).padStart(2, '0');
  }

  function isDashboardMonthlyTrafficCacheFresh(app = window.App, timestamp = Date.now()) {
    const now = Math.max(0, Number(timestamp) || Date.now());
    return dashboardTrafficState.monthlyAvailable === true
      && !!dashboardTrafficState.monthly
      && dashboardTrafficState.monthlyPeriodKey === getDashboardMonthPeriodKey(app, now)
      && Number(dashboardTrafficState.monthlyExpiresAt) > now;
  }

  async function toggleDashboardTrafficPeriod(app = window.App) {
    if (!app || dashboardTrafficState.pending) return;
    if (dashboardTrafficState.period === 'month') {
      dashboardTrafficState.period = 'day';
      if (dashboardTrafficState.daily) renderDashboardTrafficCard(dashboardTrafficState.daily, 'day', app);
      updateDashboardTrafficToggleButton();
      return;
    }

    dashboardTrafficState.daily = snapshotDashboardTrafficCard() || dashboardTrafficState.daily;
    dashboardTrafficState.period = 'month';
    const expectedPeriodKey = getDashboardMonthPeriodKey(app);
    if (isDashboardMonthlyTrafficCacheFresh(app)) {
      renderDashboardTrafficCard(dashboardTrafficState.monthly, 'month', app);
      updateDashboardTrafficToggleButton();
      return;
    }

    const retainedMonthly = dashboardTrafficState.monthlyAvailable === true
      && dashboardTrafficState.monthlyPeriodKey === expectedPeriodKey
      ? dashboardTrafficState.monthly
      : null;
    dashboardTrafficState.pending = true;
    renderDashboardTrafficCard(retainedMonthly || {
        count: '加载中...',
        hint: '正在汇总本月 CF Zone 流量',
        title: '本月流量按需加载',
        detail: ' ',
        badges: [{ label: '月统计: 加载中', tone: 'slate' }]
      }, 'month', app);
    updateDashboardTrafficToggleButton();
    try {
      const payload = await app.apiCall('getMonthlyTrafficStats');
      const monthlyView = buildMonthlyTrafficCardView(payload, app);
      const payloadPeriodKey = String(payload?.periodKey || expectedPeriodKey).trim() || expectedPeriodKey;
      const currentPeriodKey = getDashboardMonthPeriodKey(app);
      const querySucceeded = payload?.cfAnalyticsLoaded === true
        && String(payload?.cacheStatus || 'live').trim().toLowerCase() !== 'stale'
        && payloadPeriodKey === currentPeriodKey;
      if (querySucceeded) {
        dashboardTrafficState.monthly = monthlyView;
        dashboardTrafficState.monthlyPeriodKey = payloadPeriodKey;
        dashboardTrafficState.monthlyExpiresAt = Date.now() + DASHBOARD_MONTHLY_TRAFFIC_CLIENT_TTL_MS;
        dashboardTrafficState.monthlyAvailable = true;
      } else if (!retainedMonthly) {
        dashboardTrafficState.monthly = monthlyView;
        dashboardTrafficState.monthlyPeriodKey = payloadPeriodKey;
        dashboardTrafficState.monthlyExpiresAt = 0;
        dashboardTrafficState.monthlyAvailable = false;
      }
      if (dashboardTrafficState.period === 'month') {
        renderDashboardTrafficCard(querySucceeded ? monthlyView : (retainedMonthly || monthlyView), 'month', app);
      }
      if (payload?.cfAnalyticsLoaded !== true) {
        app.showMessage?.('本月流量查询失败: ' + (payload?.cfAnalyticsError || payload?.cfAnalyticsStatus || '未知错误'), { tone: 'error' });
      }
    } catch (error) {
      const failureView = {
        count: '加载失败',
        hint: '本月流量查询失败',
        title: String(error?.message || '未知错误'),
        detail: String(error?.message || '未知错误'),
        badges: [{ label: '月统计: 查询失败', tone: 'red' }]
      };
      if (!retainedMonthly) {
        dashboardTrafficState.monthly = failureView;
        dashboardTrafficState.monthlyPeriodKey = expectedPeriodKey;
        dashboardTrafficState.monthlyExpiresAt = 0;
        dashboardTrafficState.monthlyAvailable = false;
      }
      if (dashboardTrafficState.period === 'month') {
        renderDashboardTrafficCard(retainedMonthly || failureView, 'month', app);
      }
      app.showMessage?.('本月流量查询失败: ' + (error?.message || '未知错误'), { tone: 'error' });
    } finally {
      dashboardTrafficState.pending = false;
      updateDashboardTrafficToggleButton();
      scheduleIconRefresh(getDashboardTrafficNodes().card || document.body);
    }
  }

  function syncDashboardTrafficToggle(app = window.App) {
    const nodes = getDashboardTrafficNodes();
    if (!app || !nodes.card || !nodes.count) return;
    nodes.card.setAttribute('data-dashboard-traffic-card', '1');
    nodes.label?.setAttribute('data-dashboard-traffic-label', '1');
    if (!nodes.toggle) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-dashboard-traffic-toggle', '1');
      button.innerHTML = '<i data-lucide="repeat-2" aria-hidden="true"></i>';
      button.addEventListener('click', () => toggleDashboardTrafficPeriod(app));
      nodes.card.appendChild(button);
      nodes.toggle = button;
      scheduleIconRefresh(nodes.card);
    }
    if (dashboardTrafficState.period === 'day' && !dashboardTrafficState.pending) {
      dashboardTrafficState.daily = snapshotDashboardTrafficCard(nodes) || dashboardTrafficState.daily;
      if (String(nodes.label?.textContent || '') !== '今日视频流量 (CF Zone 总流量)') {
        nodes.label.textContent = '今日视频流量 (CF Zone 总流量)';
      }
    } else if (dashboardTrafficState.period === 'month' && dashboardTrafficState.monthly) {
      const monthlyCount = String(dashboardTrafficState.monthly.count || '0 B');
      if (
        String(nodes.count.textContent || '') !== monthlyCount
        || String(nodes.label?.textContent || '') !== '本月视频流量 (CF Zone 总流量)'
      ) {
        renderDashboardTrafficCard(dashboardTrafficState.monthly, 'month', app);
      }
    }
    updateDashboardTrafficToggleButton(nodes);
  }

  function patchSafetyContractMethods(app) {
    if (!app || patchedSafetyContractApp === app) return;
    patchedSafetyContractApp = app;

    // Older shells call this helper while hydrating settings, but did not expose it.
    // Keep the preview field populated from either the current or legacy repository key.
    if (typeof app.syncReleaseSourcePreviewInSettingsForm !== 'function') {
      app.syncReleaseSourcePreviewInSettingsForm = function syncReleaseSourcePreviewInSettingsForm() {
        const form = this.settingsForm && typeof this.settingsForm === 'object' ? this.settingsForm : {};
        const source = String(form.githubRepo || form.releaseRepo || form.repo || '').trim();
        if (source && form.githubRepo !== source) form.githubRepo = source;
        return source;
      };
    }

    if (typeof app.applyDashboardStatsState === 'function') {
      const applyDashboardStatsState = app.applyDashboardStatsState.bind(app);
      app.applyDashboardStatsState = function applyDashboardStatsStateWithTrafficPeriod(...args) {
        const retainedHotspot = this.dashboardD1WriteHotspot;
        const stats = retainDashboardD1WriteHotspotInStats(args[0], retainedHotspot);
        const result = applyDashboardStatsState(stats, ...args.slice(1));
        enqueue(() => {
          const nodes = getDashboardTrafficNodes();
          if (dashboardTrafficState.period === 'day') {
            dashboardTrafficState.daily = snapshotDashboardTrafficCard(nodes) || dashboardTrafficState.daily;
          } else if (dashboardTrafficState.monthly) {
            renderDashboardTrafficCard(dashboardTrafficState.monthly, 'month', app);
          }
          syncDashboardTrafficToggle(app);
        });
        return result;
      };
    }
    app.toggleDashboardTrafficPeriodFromUi = () => toggleDashboardTrafficPeriod(app);

    if (typeof app.loadDashboard === 'function') {
      app.loadDashboard = async function loadDashboardInLayers(routeToken = null, options = {}) {
        const forceRefresh = options?.forceRefresh === true;
        if (forceRefresh && this.dashboardRefreshPending) return null;
        const loadSeq = ++dashboardLayerState.loadSeq;
        const routeIsCurrent = () => loadSeq === dashboardLayerState.loadSeq && this.isRouteLoadCurrent(routeToken);
        const previousHotspot = this.dashboardD1WriteHotspot;
        const previousStatsAvailable = dashboardLayerState.statsLoaded || String(this.dashboardView?.nodes?.meta || '').includes('统计时间');
        const previousRuntimeText = String(this.dashboardRuntimeView?.updatedText || '').trim();
        const previousRuntimeAvailable = dashboardLayerState.runtimeLoaded || (!!previousRuntimeText && !previousRuntimeText.includes('未加载'));
        let liveStatsApplied = false;
        let liveRuntimeApplied = false;
        if (forceRefresh) this.dashboardRefreshPending = true;
        dashboardLayerState.statsLoading = true;
        dashboardLayerState.runtimeLoading = true;

        if (!forceRefresh) {
          void this.apiCall('getDashboardCachedSnapshot').then((payload) => {
            if (!routeIsCurrent()) return;
            const snapshot = payload?.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : null;
            if (!snapshot) return;
            const cacheMeta = snapshot.cacheMeta && typeof snapshot.cacheMeta === 'object' ? snapshot.cacheMeta : {};
            if (!liveStatsApplied && snapshot.stats && typeof snapshot.stats === 'object') {
              this.applyDashboardStatsState({ ...snapshot.stats, cacheStatus: cacheMeta.cacheStatus || 'cache' });
              dashboardLayerState.statsLoaded = true;
            }
            if (!liveRuntimeApplied && snapshot.runtimeStatus && typeof snapshot.runtimeStatus === 'object') {
              this.applyRuntimeStatusState(snapshot.runtimeStatus);
              dashboardLayerState.runtimeLoaded = true;
            }
            this.dashboardCacheMeta = cacheMeta;
          }).catch((error) => {
            console.warn('dashboard cached snapshot unavailable', error);
          });
        }

        const statsTask = this.apiCall('getDashboardCoreStats', { forceRefresh }).then((stats) => {
          if (!routeIsCurrent()) return stats;
          liveStatsApplied = true;
          this.applyDashboardStatsState(stats && typeof stats === 'object' ? stats : {});
          dashboardLayerState.statsLoaded = true;
          return stats;
        }).catch((error) => {
          if (routeIsCurrent() && !previousStatsAvailable) this.applyDashboardErrorState(error?.message || '仪表盘统计加载失败');
          throw error;
        }).finally(() => {
          if (loadSeq === dashboardLayerState.loadSeq) dashboardLayerState.statsLoading = false;
        });

        const runtimeTask = this.apiCall('getRuntimeStatus', { forceRefresh }).then((payload) => {
          if (!routeIsCurrent()) return payload;
          liveRuntimeApplied = true;
          const runtimeStatus = payload?.status && typeof payload.status === 'object' ? payload.status : {};
          this.applyRuntimeStatusState(runtimeStatus);
          this.patchAdminBootstrapCache({ runtimeStatus: this.runtimeStatus });
          dashboardLayerState.runtimeLoaded = true;
          return payload;
        }).catch((error) => {
          if (routeIsCurrent() && !previousRuntimeAvailable) this.applyRuntimeStatusErrorState(error?.message || '运行状态加载失败');
          throw error;
        }).finally(() => {
          if (loadSeq === dashboardLayerState.loadSeq) dashboardLayerState.runtimeLoading = false;
        });

        const showHotspot = this.runtimeConfig?.dashboardShowD1WriteHotspot === true;
        if (showHotspot) {
          dashboardLayerState.hotspotLoading = true;
          if (!dashboardLayerState.hotspotLoaded) {
            this.dashboardD1WriteHotspot = {
              ...(previousHotspot && typeof previousHotspot === 'object' ? previousHotspot : {}),
              status: 'loading',
              summary: 'D1 写入热点加载中',
              detail: '',
              available: false
            };
          }
          void this.apiCall('getDashboardD1WriteHotspot', { forceRefresh }).then((hotspot) => {
            if (!routeIsCurrent()) return;
            this.dashboardD1WriteHotspot = hotspot && typeof hotspot === 'object' ? hotspot : {};
            dashboardLayerState.hotspotLoaded = true;
          }).catch((error) => {
            if (!routeIsCurrent() || dashboardLayerState.hotspotLoaded) return;
            this.dashboardD1WriteHotspot = {
              ...(this.dashboardD1WriteHotspot || {}),
              status: 'failed',
              summary: 'D1 写入热点加载失败',
              detail: error?.message || '未知错误',
              available: false
            };
          }).finally(() => {
            if (loadSeq === dashboardLayerState.loadSeq) dashboardLayerState.hotspotLoading = false;
          });
        }

        const results = await Promise.allSettled([statsTask, runtimeTask]);
        if (forceRefresh && routeIsCurrent()) {
          const failures = results.filter((item) => item.status === 'rejected');
          if (failures.length) {
            this.showMessage('仪表盘部分刷新失败，已保留其余可用状态。', { tone: 'warning', modal: true });
          }
        }
        if (forceRefresh && loadSeq === dashboardLayerState.loadSeq) this.dashboardRefreshPending = false;
        return results;
      };
    }

    app.runPreviewedTidy = async function runPreviewedTidyWithPlanToken(rawScope = 'kv') {
      const scope = String(rawScope || 'kv').trim().toLowerCase() === 'd1' ? 'd1' : 'kv';
      const title = scope === 'd1' ? '整理 D1 数据' : '整理 KV 数据';
      const action = scope === 'd1' ? 'tidyD1Data' : 'tidyKvData';
      const confirmText = scope === 'd1' ? '开始整理 D1' : '开始整理 KV';
      try {
        let preview = await this.apiCall('previewTidyData', { scope });
        if (scope === 'd1' && preview?.requiresSchemaInitialization === true) {
          const initializeAccepted = await this.askConfirm(
            'D1 结构尚未通过兼容检查。当前预览不会授权删除；请先运行统一“初始化 DB”，完成后系统会重新生成实际整理预览。',
            {
              title: '整理 D1 前置检查',
              tone: 'warning',
              confirmText: '初始化 DB'
            }
          );
          if (!initializeAccepted) return;
          const initializationResult = await this.apiCall('initLogsDb');
          if (initializationResult?.revisions) this.applyAdminRevisions(initializationResult.revisions);
          await this.showMessage(formatD1InitializationResult(initializationResult), {
            title: '初始化 DB 结果',
            tone: initializationResult?.schemaReady === true ? 'success' : 'error',
            modal: true
          });
          if (initializationResult?.schemaReady !== true) return;
          preview = await this.apiCall('previewTidyData', { scope });
          if (preview?.requiresSchemaInitialization === true) {
            const error = new Error('D1 初始化后仍未通过兼容检查，请检查 Schema 状态');
            error.code = 'D1_SCHEMA_INCOMPATIBLE';
            throw error;
          }
        }
        const dialog = this.buildTidyPreviewConfirmDialog(preview, scope);
        const message = this.buildTidyPreviewConfirmText(preview, scope);
        const quotaBlocked = preview?.quotaBudget?.blocked === true;
        const accepted = await this.askConfirm(message, {
          title,
          tone: 'warning',
          confirmText: quotaBlocked ? '关闭' : confirmText,
          summary: dialog.summary,
          sections: dialog.sections,
          warnings: dialog.warnings
        });
        if (!accepted || quotaBlocked) return;
        const planToken = String(preview?.planToken || '');
        const executionPayload = { planToken };
        const result = await this.apiCall(action, executionPayload);
        const refreshTasks = [this.loadSettings()];
        if (scope === 'kv') {
          refreshTasks.push(this.loadNodes());
        } else {
          if (String(this.currentHash || '') === '#logs') refreshTasks.push(this.loadLogs(1));
          if (String(this.currentHash || '') === '#dashboard') refreshTasks.push(this.loadDashboard(null, { forceRefresh: true }));
        }
        const refreshIncomplete = (await Promise.allSettled(refreshTasks)).some((item) => item.status === 'rejected');
        const summaryMessage = scope === 'd1'
          ? this.buildD1TidySuccessMessage(result?.summary || {})
          : this.buildKvTidySuccessMessage(result);
        const resultMessage = buildTidyExecutionResultMessage(this, result, summaryMessage, refreshIncomplete);
        await this.showMessage(resultMessage, {
          title: scope === 'd1' ? 'D1 整理结果' : 'KV 整理结果',
          tone: refreshIncomplete ? 'warning' : 'success',
          modal: true
        });
      } catch (error) {
        console.error('runPreviewedTidy failed', error);
        const errorCode = String(error?.code || '');
        const scopeLabel = scope === 'd1' ? 'D1' : 'KV';
        const planRecoveryMessage = errorCode === 'TIDY_PLAN_STALE'
          ? scopeLabel + ' 整理计划已过期或数据已变化，请重新预览并确认后再执行。'
          : errorCode === 'TIDY_PLAN_INVALID'
            ? scopeLabel + ' 整理计划凭证无效，请重新预览并确认后再执行。'
            : '';
        this.showMessage(planRecoveryMessage || title + '失败: ' + (error?.message || '未知错误'), { tone: 'error', modal: true });
      }
    };

    app.exportSettingsWithSecretsFromUi = async function exportSettingsWithSecretsFromUi() {
      const accepted = await this.askConfirm(
        '完整设置备份会包含 Cloudflare API Token、Telegram Bot Token 等敏感密钥。请仅保存到可信位置，使用后及时删除。',
        { title: '导出含密钥设置', tone: 'danger', confirmText: '确认导出' }
      );
      if (!accepted) return;
      try {
        const result = await callConfirmedAdminAction(this, 'exportSettings', { includeSecrets: true }, 'exportSettings');
        if (result) this.downloadJson(result, 'emby_proxy_settings_with_secrets_' + Date.now() + '.json');
      } catch (error) {
        console.error('exportSettingsWithSecretsFromUi failed', error);
        this.showMessage('完整设置导出失败: ' + (error?.message || '未知错误'), { tone: 'error', modal: true });
      }
    };

    app.exportNodes = async function exportNodes() {
      try {
        const result = await this.apiCall('exportConfig');
        this.downloadJson(Array.isArray(result?.nodes) ? result.nodes : [], 'emby_nodes_' + Date.now() + '.json');
      } catch (error) {
        console.error('exportNodes failed', error);
        this.showMessage('节点导出失败: ' + (error?.message || '未知错误'), { tone: 'error', modal: true });
      }
    };

    app.exportFull = async function exportFullWithSecrets() {
      const accepted = await this.askConfirm('完整备份将包含服务密钥，请仅保存到可信位置。', {
        title: '导出完整备份', tone: 'danger', confirmText: '确认导出'
      });
      if (!accepted) return;
      try {
        const result = await callConfirmedAdminAction(this, 'exportConfig', { includeSecrets: true }, 'exportConfig');
        if (result) this.downloadJson(result, 'emby_proxy_full_backup_' + Date.now() + '.json');
      } catch (error) {
        console.error('exportFull failed', error);
        this.showMessage('完整备份导出失败: ' + (error?.message || '未知错误'), { tone: 'error', modal: true });
      }
    };

    app.initLogsDbFromUi = async function initializeDatabaseFromUi() {
      try {
        const result = await this.apiCall('initLogsDb');
        if (result?.revisions) this.applyAdminRevisions(result.revisions);
        await this.showMessage(formatD1InitializationResult(result), {
          title: '初始化 DB 结果',
          tone: result?.schemaReady === true ? 'success' : 'error',
          modal: true
        });
      } catch (error) {
        console.error('initLogsDbFromUi failed', error);
        this.showMessage('初始化 DB 失败: ' + (error?.message || '未知错误'), { tone: 'error', modal: true });
      }
    };

  }

  function createRuntimeActionButton(referenceButton, actionName, label, iconName, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = referenceButton?.className || 'px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium';
    button.setAttribute('data-admin-runtime-action', actionName);
    button.innerHTML = '<i data-lucide="' + iconName + '" class="w-4 h-4 mr-1" aria-hidden="true"></i>' + label;
    button.addEventListener('click', onClick);
    return button;
  }

  function syncSecretExportButton(app) {
    const settingsView = document.querySelector('#view-settings');
    const defaultExportButton = settingsView
      ? [...settingsView.querySelectorAll('button')].find((button) => String(button.textContent || '').trim() === '导出全局设置')
      : null;
    defaultExportButton?.setAttribute('title', '默认导出已脱敏，不包含 API Token 等密钥');
    const actionGroup = defaultExportButton?.parentElement;
    const existingButton = actionGroup?.querySelector('[data-admin-runtime-action="export-settings-secrets"]') || null;
    if (!actionGroup || app?.isSettingsExpertMode?.() !== true) {
      existingButton?.remove();
      return;
    }
    if (existingButton) return;
    const button = createRuntimeActionButton(
      defaultExportButton,
      'export-settings-secrets',
      '导出含密钥设置',
      'key-round',
      () => app.exportSettingsWithSecretsFromUi()
    );
    button.className = 'px-4 py-2 border border-amber-300 text-amber-700 rounded-xl text-sm transition hover:bg-amber-100 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/20';
    defaultExportButton.insertAdjacentElement('afterend', button);
  }

  function syncPlaybackInfoModeCopy() {
    const select = document.querySelector('#form-playback-info-mode');
    if (!select) return;
    const passthrough = select.querySelector('option[value="passthrough"]');
    const rewrite = select.querySelector('option[value="rewrite"]');
    if (passthrough) passthrough.textContent = '透传';
    if (rewrite) rewrite.textContent = '改写模式';
  }

  function applySafetyContractEnhancements() {
    const app = window.App;
    if (!app) return;
    patchSafetyContractMethods(app);
    syncSecretExportButton(app);
    syncPlaybackInfoModeCopy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scheduleIconRefresh(document.body);
      scheduleShellRefresh();
    }, { once: true });
  } else {
    scheduleIconRefresh(document.body);
    scheduleShellRefresh();
  }

  window.addEventListener('load', () => {
    scheduleIconRefresh(document.body);
    scheduleShellRefresh();
  }, { once: true });

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((records) => {
      let shouldRefreshIcons = false;
      let shouldRefreshShell = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (containsLucidePlaceholder(record.target)) shouldRefreshIcons = true;
          if (record.target === document.documentElement || record.target === document.body || touchesShellHooks(record.target)) {
            shouldRefreshShell = true;
          }
          continue;
        }
        for (const node of record.addedNodes) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
          if (containsLucidePlaceholder(node)) shouldRefreshIcons = true;
          if (touchesShellHooks(node)) shouldRefreshShell = true;
        }
      }
      if (shouldRefreshIcons) scheduleIconRefresh(document.body);
      if (shouldRefreshShell) scheduleShellRefresh();
    });

    const observe = () => {
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'open']
        });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observe, { once: true });
    } else {
      observe();
    }
  }
})();
</script>`;

export {
  ADMIN_RUNTIME_ENHANCEMENT_STYLE,
  ADMIN_RUNTIME_ENHANCEMENT_SCRIPT
};
