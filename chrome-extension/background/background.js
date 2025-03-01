// background.js - Simple background script for Chrome extension

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
    console.log('Renovation ROI Insights extension installed');

    // Set default API endpoint
    chrome.storage.local.set({
        apiEndpoint: 'https://api.yourdomain.com/v1',
        generatedReports: []
    });
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'extractData':
            // Forward the data extraction request to the content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'extractData' }, (response) => {
                    sendResponse(response);
                });
            });
            // Keep the message channel open for the async response
            return true;

        case 'trackReportGeneration':
            // Track report generation for analytics
            const { reportId, propertyAddress } = message;
            trackReportGeneration(reportId, propertyAddress);
            sendResponse({ success: true });
            break;

        case 'openReport':
            // Open a report in a new tab
            const reportUrl = `https://app.yourdomain.com/report/${message.reportId}`;
            chrome.tabs.create({ url: reportUrl });
            sendResponse({ success: true });
            break;
    }
});

// Track report generation (for analytics and history)
async function trackReportGeneration(reportId, propertyAddress) {
    // Get existing reports from storage
    const { generatedReports = [] } = await chrome.storage.local.get(['generatedReports']);

    // Add new report to the beginning of the list
    const updatedReports = [
        {
            reportId,
            propertyAddress,
            timestamp: new Date().toISOString()
        },
        ...generatedReports
    ].slice(0, 10); // Keep only the 10 most recent reports

    // Save updated list back to storage
    await chrome.storage.local.set({ generatedReports: updatedReports });

    // Update badge to show there's a new report
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

    // Clear badge after 30 seconds
    setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
    }, 30000);
}

// Listen for tab updates to detect when user navigates to a property page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        const url = tab.url;

        // Check if URL matches property listing patterns
        const isPropertyPage =
            url.includes('zillow.com/homes/') ||
            url.includes('redfin.com/') && url.includes('/home/') ||
            url.includes('realtor.com/realestateandhomes-detail/');

        if (isPropertyPage) {
            // Update badge to indicate we're on a property page
            chrome.action.setBadgeText({ text: '✓', tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
        } else {
            // Clear badge
            chrome.action.setBadgeText({ text: '', tabId });
        }
    }
});