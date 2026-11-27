import { esc } from './data.js';

const panels = {
  history: ['长时段历史','Deep history', () => import('./history-lab.js'), 'renderHistory'],
  space: ['太空足迹','Spaceflight', () => import('./space-lab.js'), 'renderSpace'],
  markets: ['证券日历','Market history', () => import('./markets.js'), 'renderMarkets'],
  coverage: ['数据愿望清单','Data wishlist', () => import('./wishlist.js'), 'renderWishlist'],
};

export const researchModes = Object.keys(panels);

export async function renderResearch(host, ctx, initialMode='history') {
  const tabs = document.createElement('nav');
  tabs.className = 'research-tabs';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label',ctx.t('研究专题','Research collections'));
  const page = document.createElement('section');
  page.className = 'research-page';
  page.setAttribute('role','tabpanel');
  host.replaceChildren(tabs,page);
  for (const [mode,[zh,en]] of Object.entries(panels)) {
    const button=document.createElement('button');
    button.type='button'; button.dataset.mode=mode; button.setAttribute('role','tab');
    button.textContent=ctx.t(zh,en);
    button.onclick=()=>void show(mode);
    tabs.append(button);
  }
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const buttons=[...tabs.querySelectorAll('button')];
    const index=buttons.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;
    buttons[next].focus(); buttons[next].click();
  });
  const disconnect = new MutationObserver(() => { if (!host.isConnected) { abandon?.abort(); disconnect.disconnect(); }});
  disconnect.observe(document.body,{childList:true,subtree:true});
  let abandon;
  ctx.signal?.addEventListener('abort', () => { abandon?.abort(); disconnect.disconnect(); }, { once: true });
  async function show(mode) {
    if (!panels[mode]) mode='history';
    abandon?.abort();
    abandon=new AbortController();
    const local=abandon;
    const target=document.createElement('div');
    page.replaceChildren(target);
    const [zh,en,importer,method]=panels[mode];
    page.setAttribute('aria-label',ctx.t(zh,en));
    for (const button of tabs.children) {
      const active=button.dataset.mode===mode;
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    }
    target.textContent=ctx.t('载入数据…','Loading data…');
    try {
      const mod=await importer();
      if (local.signal.aborted || !target.isConnected) return;
      await mod[method](target,{...ctx,signal:local.signal});
    } catch(error) {
      if (local.signal.aborted) return;
      console.error(error);
      target.innerHTML=`<p>${esc(ctx.t('专题暂未能载入。','This collection could not be loaded.'))}</p>`;
      const retry=document.createElement('button');retry.className='panel-action';retry.textContent=ctx.t('重试','Retry');retry.onclick=()=>void show(mode);target.append(retry);
    }
  }
  await show(initialMode);
}
