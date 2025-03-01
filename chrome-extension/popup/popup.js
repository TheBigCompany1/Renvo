// popup.js - Handles popup UI and functionality

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    // Load recent reports
    loadRecentReports();

    // Check if we're currently on a property page
    checkCurrentPage();
});

// Load recent reports from storage
async function loadRecentReports() {
    const { generatedReports = [] } = await chrome.storage.local.get(['generatedReports']);
    const reportsList = document.getElementById('reports-list');

    if (generatedReports.length === 0) {
        reportsList.innerHTML = '<div class="empty-message">No recent reports</div>';
        return;
    }

    // Generate HTML for recent reports
    const reportsHTML = generatedReports.map((report, index) => {
        const date = new Date(report.timestamp).toLocaleDateString();
        return `
        <div class="report-item" data-report-id="${report.reportId}">
          <div class="report-property">${report.propertyAddress || 'Property Report'}</div>
          <div class="report-date">${date}</div>
          <button class="view-report-btn" data-report-id="${report.reportId}">
            View Report
          </button>
        </div>
      `;
    }).join('');

    reportsList.innerHTML = reportsHTML;

    // Add click event listeners to view report buttons
    document.querySelectorAll('.view-report-btn').forEach(button => {
        button.addEventListener('click', () => {
            const reportId = button.dataset.reportId;
            openFullReport(reportId);
        });
    });
}

// Check if we're on a property page
function checkCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const currentTab = tabs[0];
        const url = currentTab.url;

        // Check if URL matches property listing patterns
        const isPropertyPage =
            url.includes('zillow.com/homes/') ||
            url.includes('redfin.com/') && url.includes('/home/') ||
            url.includes('realtor.com/realestateandhomes-detail/');

        if (isPropertyPage) {
            // Show property detected message
            document.getElementById('not-on-property-page').classList.add('hidden');
            document.getElementById('on-property-page').classList.remove('hidden');

            // Try to send a message to check if content script is ready
            try {
                await chrome.tabs.sendMessage(currentTab.id, { action: 'checkReady' });
            } catch (error) {
                // Content script might not be ready yet, show loading state
                document.getElementById('on-property-page').querySelector('p').textContent =
                    'Property page detected. Extension is initializing...';
            }
        }
    });
}

// Open full report in new tab
function openFullReport(reportId) {
    const reportUrl = `https://app.yourdomain.com/report/${reportId}`;
    chrome.tabs.create({ url: reportUrl });
}