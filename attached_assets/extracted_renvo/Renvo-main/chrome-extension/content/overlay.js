// overlay.js - Injects the one-click report generation button

const API_CONFIG = {
  // baseUrl: "http://localhost:8000", // Your FastAPI server URL
  baseUrl: "https://renvo-python.onrender.com",
  endpoints: {
    quickReport: "/api/analyze-property",
    getReport: "/api/report/status?reportId=",
  }
};

// Create and inject ROI report button
function injectReportButton() {
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'roi-extension-button-container';

    // Create button
    const reportButton = document.createElement('button');
    reportButton.className = 'roi-extension-button';
    reportButton.innerHTML = '<span class="button-icon">📊</span> Add More Values to The Property';
    reportButton.addEventListener('click', handleReportButtonClick);

    // Add button to container
    buttonContainer.appendChild(reportButton);

    // Determine where to inject based on the website
    const website = detectWebsite();
    let targetElement;

    switch (website) {
        case 'zillow.com':
            // Find Zillow's action bar
            targetElement = document.querySelector('[data-testid="home-details-action-bar"]');
            break;
        case 'redfin.com':
            // Find Redfin's action bar
            targetElement = document.querySelector('.HomePageActions');
            break;
        case 'realtor.com':
            // Find Realtor's action bar
            targetElement = document.querySelector('.pdp-action-bar');
            break;
        default:
            return; // Exit if not on a supported site
    }

    // Inject button if target element exists
    if (targetElement) {
        targetElement.appendChild(buttonContainer);
    } else {
        // Fallback: inject at a fixed position on the page
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.top = '100px';
        buttonContainer.style.right = '20px';
        buttonContainer.style.zIndex = '9999';
        document.body.appendChild(buttonContainer);
    }
}

// Handle button click
function handleReportButtonClick() {
    // Show loading state
    toggleLoadingState(true);

    // Request data extraction
    chrome.runtime.sendMessage({ action: 'extractData' }, (response) => {
        if (response && response.success) {
            // Generate report with the extracted data
            generateReport(response.data);
        } else {
            // Show error
            showNotification('Error extracting property data', 'error');
            toggleLoadingState(false);
        }
    });
}

// content/overlay.js

// Send data to backend API
function generateReport(propertyData) {
    // Show loading state
    toggleLoadingState(true);
    
    // Get API endpoint from storage or use default
    chrome.storage.local.get(['apiEndpoint'], (result) => {
      const apiEndpoint = result.apiEndpoint || `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.quickReport}`;
      
      // Get device ID for anonymous tracking
      getOrCreateDeviceId().then(deviceId => {
        // Prepare the request data
        const requestData = {
          url: propertyData.url,
          address: propertyData.address,
          price: propertyData.price,
          beds: parseInt(propertyData.beds) || null,
          baths: parseFloat(propertyData.baths) || null,
          sqft: parseInt(propertyData.sqft?.replace(/[^0-9]/g, '')) || null,
          yearBuilt: parseInt(propertyData.yearBuilt) || null,
          lotSize: propertyData.lotSize,
          homeType: propertyData.homeType,
          propertyDescription: propertyData.propertyDescription,
          images: propertyData.images || []
        };
        
        const payload = { property_data: requestData };
      // Send request to background script to bypass CORS
      chrome.runtime.sendMessage({
        action: 'generateReport',
        apiEndpoint,
        payload,
        deviceId
      }, (data) => {
        if (chrome.runtime.lastError || data?.error) {
          console.error('API request failed:', chrome.runtime.lastError || data.error);
          showNotification('Failed to generate report. Please try again.', 'error');
          toggleLoadingState(false);
          return;
        }

        if (data.reportId) {
          storeReportInfo(data.reportId, propertyData.address);

          if (data.quickInsights) {
            showResultsPreview(data.quickInsights, data.reportId);
          } else {
            showProcessingMessage(data.reportId);
          }

          chrome.runtime.sendMessage({
            action: 'trackReportGeneration',
            reportId: data.reportId,
            propertyAddress: propertyData.address
          });
        } else {
          console.warn('No reportId returned in response:', data);
          showNotification('No report ID returned. Please try again.', 'error');
        }

        toggleLoadingState(false);
      });
    });
  });
}

// Generate or retrieve unique device ID
async function getOrCreateDeviceId() {
    const result = await chrome.storage.local.get(['deviceId']);

    if (result.deviceId) {
        return result.deviceId;
    }

    // Create a new ID
    const newDeviceId = 'ext_' + Math.random().toString(36).substring(2, 15);
    await chrome.storage.local.set({ deviceId: newDeviceId });

    return newDeviceId;
}

// Store report info in local storage
async function storeReportInfo(reportId, propertyAddress) {
    // Get existing reports
    const { generatedReports = [] } = await chrome.storage.local.get(['generatedReports']);

    // Add new report
    const updatedReports = [
        {
            reportId,
            propertyAddress,
            timestamp: new Date().toISOString()
        },
        ...generatedReports
    ].slice(0, 10); // Keep only the 10 most recent reports

    // Save to storage
    chrome.storage.local.set({ generatedReports: updatedReports });
}

// Show results preview
function showResultsPreview(quickInsights, reportId) {
    const modal = createModal('Renovation ROI Insights');
    
    const content = document.createElement('div');
    content.className = 'roi-results-preview';
    
    // Create the content based on quick insights
    content.innerHTML = `
      <div class="roi-insights-summary">
        <div class="roi-summary-item">
          <div class="summary-label">Property Potential</div>
          <div class="summary-value">${quickInsights.potentialScore}/10</div>
        </div>
        <div class="roi-summary-item">
          <div class="summary-label">Est. Renovation Budget</div>
          <div class="summary-value">$${formatNumber(quickInsights.estimatedBudget)}</div>
        </div>
        <div class="roi-summary-item">
          <div class="summary-label">Potential Value Increase</div>
          <div class="summary-value">$${formatNumber(quickInsights.potentialValueAdd)}</div>
        </div>
      </div>
      
      <h3>Top Renovation Opportunities</h3>
      <ul class="roi-opportunities-list">
        ${quickInsights.topOpportunities.map(opportunity => `
          <li>
            <strong>${opportunity.name}</strong>
            <div class="opportunity-roi">ROI: ${opportunity.estimatedRoi}%</div>
          </li>
        `).join('')}
      </ul>
      
      <div class="roi-cta">
        <p>Get the complete analysis with detailed cost breakdowns and ROI calculations</p>
        <button id="view-full-report" class="roi-extension-primary-button">View Full Report</button>
      </div>
    `;
    
    modal.appendChild(content);
    
    // Handle view full report button
    document.getElementById('view-full-report').addEventListener('click', () => {
      openFullReport(reportId);
      closeModal();
    });
  }

// Show processing message
function showProcessingMessage(reportId) {
    const modal = createModal('Report Processing');

    const content = document.createElement('div');
    content.className = 'roi-processing-message';

    content.innerHTML = `
      <div class="processing-icon">⚙️</div>
      <p>Your comprehensive renovation ROI report is being generated!</p>
      <p class="processing-details">Our AI agents are analyzing the property and calculating the best renovation opportunities for maximum return on investment.</p>
      <div class="roi-cta">
        <button id="view-full-report" class="roi-extension-primary-button">Go to Full Report</button>
      </div>
    `;

    modal.appendChild(content);

    // Handle view full report button
    document.getElementById('view-full-report').addEventListener('click', () => {
        openFullReport(reportId);
        closeModal();
    });
}


// Helper functions for UI
function createModal(title) {
    // Remove any existing modals
    const existingModal = document.querySelector('.roi-extension-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'roi-extension-modal-overlay';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'roi-extension-modal';

    // Create header with title and close button
    const header = document.createElement('div');
    header.className = 'roi-extension-modal-header';

    const titleElement = document.createElement('h2');
    titleElement.textContent = title;

    const closeButton = document.createElement('button');
    closeButton.className = 'roi-extension-modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', closeModal);

    header.appendChild(titleElement);
    header.appendChild(closeButton);

    // Add header to modal
    modal.appendChild(header);

    // Add modal to overlay, and overlay to document
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return modal;
}

function closeModal() {
    const overlay = document.querySelector('.roi-extension-modal-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `roi-extension-notification roi-extension-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.add('roi-extension-notification-hide');
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 5000);
}

function toggleLoadingState(isLoading) {
    const button = document.querySelector('.roi-extension-button');
    if (button) {
        if (isLoading) {
            button.classList.add('loading');
            button.innerHTML = '<span class="spinner"></span> Generating Report...';
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.innerHTML = '<span class="button-icon">📊</span> Generate Renovation ROI Report';
            button.disabled = false;
        }
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Initialize overlay when page is fully loaded
window.addEventListener('load', () => {
    // Small delay to ensure page elements are fully rendered
    setTimeout(injectReportButton, 1000);
});

// Listen for DOM changes to handle single-page apps
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if we need to re-inject our button
            if (!document.querySelector('.roi-extension-button-container')) {
                setTimeout(injectReportButton, 1000);
            }
        }
    }
});

// Start observing changes to the body element
observer.observe(document.body, { childList: true, subtree: true });

function openFullReport(reportId) {
  console.log("Opening full report for ID:", reportId);
  
  // Send message to background script to open the report
  chrome.runtime.sendMessage({ 
    action: 'openReport', 
    reportId: reportId
  }, response => {
    console.log("Got response from background:", response);
  });
}