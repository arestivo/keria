// Initialize CodeMirror 6 and proxy minimal textarea API so existing kueria.js continues to work.
// Uses esm.sh CDN to avoid bundling.
import {EditorView, keymap} from 'https://esm.sh/@codemirror/view@6.16.0';
import {EditorState} from 'https://esm.sh/@codemirror/state@6.2.1';
import {defaultKeymap} from 'https://esm.sh/@codemirror/commands@6.2.2';
import {sql} from 'https://esm.sh/@codemirror/lang-sql@6.1.2';
import {history, historyKeymap} from 'https://esm.sh/@codemirror/commands@6.2.2';

(function initCM(){
  const textarea = document.getElementById('queryEditor');
  if (!textarea) return;

  // Create wrapper and move after textarea
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-editor-wrapper';
  textarea.parentNode.insertBefore(wrapper, textarea.nextSibling);

  // Hide original textarea but keep it for form compatibility and legacy code
  textarea.style.display = 'none';

  const startValue = textarea.value || '';

  const state = EditorState.create({
    doc: startValue,
    extensions: [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      sql()
    ]
  });

  const view = new EditorView({
    state,
    parent: wrapper
  });

  // Keep textarea value in sync when editor changes (so server or form reads work)
  view.dispatch = (orig => (tr) => {
    const r = orig.call(view, tr);
    const val = view.state.doc.toString();
    textarea.value = val;
    return r;
  })(view.dispatch);

  // Expose a minimal proxy object so existing code that expects a textarea still works
  // Methods: value (getter/setter), focus(), setSelectionRange(start, end)
  const proxy = {
    get value() { return view.state.doc.toString(); },
    set value(v) { view.dispatch({changes: {from:0, to: view.state.doc.length, insert: String(v)}}); },
    focus() { view.focus(); },
    setSelectionRange(start, end) {
      const docLen = view.state.doc.length;
      const s = Math.max(0, Math.min(start, docLen));
      const e = Math.max(0, Math.min(end, docLen));
      view.dispatch({selection: {anchor: s, head: e}});
      view.focus();
    }
  };

  // Attach proxy to the DOM reference expected by kueria.js
  // kueria.js reads DOM.queryEditor at load time; ensure we update that too.
  if (window.DOM && window.DOM.queryEditor) {
    window.DOM.queryEditor = proxy;
  }
  // Also attach globally for scripts that do `document.getElementById('queryEditor')` after init
  textarea._cmProxy = proxy;

  // Keybinding: Ctrl+Enter to execute query — reuse existing QueryManager if available
  view.dom.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      if (window.QueryManager && typeof window.QueryManager.execute === 'function') {
        window.QueryManager.execute();
        e.preventDefault();
      }
    }
  });
})();
