// background.js - Simple background script for Chrome extension
const API_CONFIG = {
  // baseUrl: "http://localhost:8000", // Your FastAPI server URL
  baseUrl: "https://ww70e6xdhg.execute-api.us-east-2.amazonaws.com/dev",
  endpoints: {
    quickReport: "/api/extension/v1/quickreport",
    getReport: "/api/extension/v1/report/" // Will be appended with report ID
  }
};

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
    console.log('Renovation ROI Insights extension installed');

    // Set default API endpoint
    chrome.storage.local.set({
        // apiEndpoint: 'https://api.yourdomain.com/v1',
        apiEndpoint: 'https://ww70e6xdhg.execute-api.us-east-2.amazonaws.com/dev/api/extension/v1',
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
          const reportUrl = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.getReport}${message.reportId}`;
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

// Check status of a report
async function checkReportStatus(reportId) {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.getReport}${reportId}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const reportData = await response.json();
      
      // Update report status in storage
      const { generatedReports = [] } = await chrome.storage.local.get(['generatedReports']);
      
      const updatedReports = generatedReports.map(report => {
        if (report.reportId === reportId) {
          return {
            ...report,
            status: reportData.status,
            lastChecked: new Date().toISOString()
          };
        }
        return report;
      });
      
      await chrome.storage.local.set({ generatedReports: updatedReports });
      
      // If report is complete, show notification
      if (reportData.status === 'completed') {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/icons/icon128.png',
          title: 'ROI Analysis Complete',
          message: 'Your renovation ROI analysis is ready to view!',
          buttons: [{ title: 'View Report' }]
        });
      }
      
      return reportData;
    } catch (error) {
      console.error('Error checking report status:', error);
      return null;
    }
  }
  
  // Poll for report status updates
  function setupReportPolling() {
    // Check every 30 seconds for pending reports
    setInterval(async () => {
      try {
        const { generatedReports = [] } = await chrome.storage.local.get(['generatedReports']);
        
        // Find reports that are still processing
        const pendingReports = generatedReports.filter(report => 
          report.status !== 'completed' && report.status !== 'failed'
        );
        
        // Check status for each pending report
        for (const report of pendingReports) {
          await checkReportStatus(report.reportId);
        }
      } catch (error) {
        console.error('Error in report polling:', error);
      }
    }, 30000); // 30 seconds
  }
  
  // Initialize when extension is installed or updated
  chrome.runtime.onInstalled.addListener(() => {
    console.log('Renovation ROI Analyzer extension installed');
    
    // Set default options
    chrome.storage.local.set({
      apiEndpoint: `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.quickReport}`,
      generatedReports: []
    });
    
    // Setup report polling
    setupReportPolling();
  });