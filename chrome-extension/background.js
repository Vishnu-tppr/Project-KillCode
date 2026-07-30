// Background service worker for Sign in with ChatGPT
// Creates a dynamic DNR rule so the callback redirect works when loaded as
// an unpacked extension (any Chrome developer-mode ID), not just the Web Store ID.

const RULE_ID = 1;

async function installDynamicRule() {
    const extensionId = chrome.runtime.id;

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
            {
                id: RULE_ID,
                priority: 1,
                action: {
                    type: "redirect",
                    redirect: {
                        regexSubstitution: `chrome-extension://${extensionId}/src/confirm.html#\\0`,
                    },
                },
                condition: {
                    regexFilter: "^http://localhost:1455/auth/callback(\\?.*)?$",
                    resourceTypes: ["main_frame"],
                },
            },
        ],
    });
    console.log(`[Sign in with ChatGPT] DNR rule installed for ID: ${extensionId}`);
}

chrome.runtime.onInstalled.addListener(() => {
    installDynamicRule().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
    installDynamicRule().catch(console.error);
});

// Allow skillrack.com pages to detect this extension even when loaded as unpacked.
// The userscript sends an external message; we respond with the installed.json payload.
// This is a fallback — when the extension is installed from the Web Store the userscript
// detects it via the hardcoded fetch to chrome-extension://odbgboachaefbbbdiffcefhpkekhfcna/src/installed.json
if (chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
        if (message?.type === "openai-oauth-ping") {
            sendResponse({ installed: true, name: "sign-in-with-chatgpt", protocol: "openai-oauth-browser-extension", protocolVersion: 1 });
        }
        return false;
    });
}
