// Breadcrumb content script

(function () {
  if (window.__breadcrumb_loaded) return;
  window.__breadcrumb_loaded = true;

  let overlay = null;
  let dismissed = false;
  let selPriority = 'medium';

  const TAGS = ['Work', 'Research', 'Shopping', 'Read later', 'Reference', 'Fun'];

  function injectStyles() {
    if (document.getElementById('__bc_css')) return;
    const s = document.createElement('style');
    s.id = '__bc_css';
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');

      #__bc_wrap {
        position: fixed;
        bottom: 22px;
        right: 22px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: 'IBM Plex Sans', system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      #__bc_card {
        width: 310px;
        background: #111111;
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.04) inset;
        pointer-events: all;
        animation: __bc_in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;
        overflow: hidden;
      }
      @keyframes __bc_in  { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
      @keyframes __bc_out { to   { opacity:0; transform: translateY(8px); } }

      .__bc_hd {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px 9px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        background: #161616;
      }
      .__bc_brand {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      .__bc_name {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        font-weight: 500;
        color: #e8e6e0;
        letter-spacing: -0.02em;
      }
      .__bc_chevron { color: #d4a853; font-size: 11px; font-family: 'IBM Plex Mono', monospace; }
      .__bc_hint { font-size: 10px; color: #4a4845; }
      .__bc_x {
        background: none; border: none; cursor: pointer;
        color: #4a4845; font-size: 13px; line-height: 1;
        padding: 2px 4px; border-radius: 2px; transition: color 0.1s;
      }
      .__bc_x:hover { color: #e8e6e0; }

      .__bc_body { padding: 11px 12px; }

      .__bc_inp {
        width: 100%;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.08);
        border-top: 1px solid rgba(255,255,255,0.04);
        border-left: 2px solid #d4a853;
        padding: 8px 10px;
        font-family: 'IBM Plex Sans', system-ui, sans-serif;
        font-size: 12px;
        color: #e8e6e0;
        outline: none;
        resize: none;
        line-height: 1.45;
        display: block;
        transition: border-color 0.15s;
      }
      .__bc_inp:focus { border-color: rgba(255,255,255,0.15); border-left-color: #d4a853; }
      .__bc_inp::placeholder { color: #333; }

      .__bc_sublbl {
        font-size: 9px; color: #4a4845;
        text-transform: uppercase; letter-spacing: 0.1em;
        font-weight: 500; margin: 9px 0 5px;
        font-family: 'IBM Plex Sans', sans-serif;
      }

      .__bc_prios { display: flex; gap: 1px; background: rgba(255,255,255,0.05); }
      .__bc_pb {
        flex: 1; background: #161616; border: none;
        padding: 6px 5px; font-size: 10px; color: #4a4845;
        cursor: pointer; text-align: center;
        font-family: 'IBM Plex Sans', sans-serif;
        transition: all 0.12s; letter-spacing: 0.03em;
      }
      .__bc_pb:hover { background: #1e1e1e; color: #8a8680; }
      .__bc_pb.sel-high   { background: rgba(192,57,43,0.15); color: #e05c4e; }
      .__bc_pb.sel-medium { background: rgba(212,168,83,0.12); color: #d4a853; }
      .__bc_pb.sel-low    { background: rgba(58,125,79,0.15); color: #5aad76; }

      .__bc_tags { display: flex; flex-wrap: wrap; gap: 4px; }
      .__bc_tag {
        font-size: 10px; color: #4a4845;
        background: #1a1a1a; border: 1px solid rgba(255,255,255,0.06);
        padding: 2px 7px; cursor: pointer;
        font-family: 'IBM Plex Sans', sans-serif;
        transition: all 0.12s; user-select: none;
        letter-spacing: 0.02em;
      }
      .__bc_tag:hover { color: #8a8680; border-color: rgba(255,255,255,0.1); }
      .__bc_tag.sel { background: #d4a853; color: #111; border-color: #d4a853; }

      .__bc_footer {
        display: flex; gap: 1px;
        background: rgba(255,255,255,0.05);
        border-top: 1px solid rgba(255,255,255,0.07);
      }
      .__bc_skip {
        flex: 1; background: #161616; border: none;
        padding: 8px; font-size: 10.5px; color: #4a4845;
        cursor: pointer; font-family: 'IBM Plex Sans', sans-serif;
        transition: all 0.12s; letter-spacing: 0.03em;
      }
      .__bc_skip:hover { background: #1e1e1e; color: #8a8680; }
      .__bc_save {
        flex: 2; background: #d4a853; border: none;
        padding: 8px; font-size: 10.5px; font-weight: 500;
        color: #111; cursor: pointer;
        font-family: 'IBM Plex Sans', sans-serif;
        letter-spacing: 0.04em; transition: opacity 0.12s;
      }
      .__bc_save:hover { opacity: 0.85; }
    `;
    document.head.appendChild(s);
  }

  function createPrompt() {
    if (overlay || dismissed) return;
    injectStyles();

    let selTags = [];
    selPriority = 'medium';

    const wrap = document.createElement('div');
    wrap.id = '__bc_wrap';
    wrap.innerHTML = `
      <div id="__bc_card">
        <div class="__bc_hd">
          <div class="__bc_brand">
            <span class="__bc_name">breadcrumb</span>
            <span class="__bc_chevron">›</span>
          </div>
          <span class="__bc_hint">why this tab?</span>
          <button class="__bc_x" id="__bc_close">✕</button>
        </div>
        <div class="__bc_body">
          <textarea class="__bc_inp" id="__bc_inp" rows="2"
            placeholder="e.g. compare prices · finish reading · fix this bug"></textarea>
          <div class="__bc_sublbl">Priority</div>
          <div class="__bc_prios" id="__bc_prios">
            <button class="__bc_pb" data-p="high">High</button>
            <button class="__bc_pb sel-medium" data-p="medium">Medium</button>
            <button class="__bc_pb" data-p="low">Low</button>
          </div>
          <div class="__bc_sublbl">Tags</div>
          <div class="__bc_tags" id="__bc_tags">
            ${TAGS.map(t => `<span class="__bc_tag" data-t="${t}">${t}</span>`).join('')}
          </div>
        </div>
        <div class="__bc_footer">
          <button class="__bc_skip" id="__bc_skip">skip</button>
          <button class="__bc_save" id="__bc_save">drop crumb →</button>
        </div>
      </div>`;

    document.body.appendChild(wrap);
    overlay = wrap;

    const inp = document.getElementById('__bc_inp');
    inp.focus();

    document.getElementById('__bc_prios').addEventListener('click', e => {
      const btn = e.target.closest('[data-p]');
      if (!btn) return;
      selPriority = btn.dataset.p;
      wrap.querySelectorAll('.__bc_pb').forEach(b => {
        b.className = '__bc_pb' + (b.dataset.p === selPriority ? ` sel-${selPriority}` : '');
      });
    });

    document.getElementById('__bc_tags').addEventListener('click', e => {
      const tag = e.target.closest('[data-t]');
      if (!tag) return;
      const t = tag.dataset.t;
      if (selTags.includes(t)) {
        selTags = selTags.filter(x => x !== t);
        tag.classList.remove('sel');
      } else {
        selTags.push(t);
        tag.classList.add('sel');
      }
    });

    document.getElementById('__bc_save').addEventListener('click', () => {
      const reason = inp.value.trim();
      if (!reason) {
        inp.style.borderLeftColor = '#c0392b';
        inp.placeholder = 'add a reason first…';
        inp.focus();
        return;
      }
      chrome.runtime.sendMessage({
        type: 'SAVE_REASON',
        reason,
        tags: selTags,
        priority: selPriority,
        reminderMinutes: 30
      }, () => closePrompt());
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('__bc_save').click();
      }
    });

    document.getElementById('__bc_skip').addEventListener('click', closePrompt);
    document.getElementById('__bc_close').addEventListener('click', closePrompt);
  }

  function closePrompt() {
    if (!overlay) return;
    const card = overlay.querySelector('#__bc_card');
    if (card) card.style.animation = '__bc_out 0.2s ease forwards';
    setTimeout(() => { overlay?.remove(); overlay = null; }, 220);
    dismissed = true;
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'PROMPT_REASON') {
      dismissed = false;
      overlay?.remove();
      overlay = null;
      createPrompt();
    }
  });
})();
