// background.js - Simple background script for Chrome extension
const API_CONFIG = {
  // baseUrl: "http://localhost:8000", // Your FastAPI server URL
  baseUrl: "https://renvo-python.onrender.com",
  endpoints: {
    quickReport: "/api/analyze-property",
    getReport: "/api/report/status?reportId=",
    reportPage: "/report?reportId="
  }
};

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
          const reportUrl = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.reportPage}${message.reportId}`;
          chrome.tabs.create({ url: reportUrl });
          sendResponse({ success: true });
          break;

        case 'generateReport':
          const { apiEndpoint, payload } = message;
          fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          .then(async (response) => {
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }
            return response.json();
          })
          .then(data => {
            sendResponse(data);
          })
          .catch(error => {
            console.error('Background fetch error:', error);
            sendResponse({ error: error.message });
          });
          
          // generateReportFromBackground(message.apiEndpoint, message.requestData, message.deviceId)
          //   .then(data => sendResponse(data))
          //   .catch(error => {
          //     console.error('API request failed:', error);
          //     sendResponse({ error: error.message });
          //   });
          return true;
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

// Perform the generate report fetch from the background
async function generateReportFromBackground(apiEndpoint, requestData, deviceId) {
    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': deviceId
        },
        body: JSON.stringify(requestData)
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
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