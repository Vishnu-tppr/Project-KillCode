// content.js - runs in the context of the page before the userscript loads
try {
    const extId = chrome.runtime.id;
    // Set a dataset attribute on documentElement
    document.documentElement.setAttribute('data-openai-oauth-ext-id', extId);
    
    // Also save to localStorage so the userscript can access it seamlessly
    localStorage.setItem('oai_local_ext_id', extId);
    
    // Dispatch event in case the userscript is listening for dynamic detection
    window.dispatchEvent(new CustomEvent('openai-oauth-ext-detected', { detail: { id: extId } }));
} catch (e) {
    console.error('[Sign in with ChatGPT] Content script error:', e);
}
