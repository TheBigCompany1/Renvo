// --- DYNAMIC CONFIGURATION ---
// This variable will hold the correct API URL for the current environment.
let PYTHON_API_URL = '';

// This function runs first to get the configuration from the server.
async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        PYTHON_API_URL = config.pythonApiUrl;
        console.log('Successfully fetched config. Python API URL:', PYTHON_API_URL);
    } catch (error) {
        console.error('CRITICAL: Could not fetch server configuration.', error);
        // Display an error to the user if the config can't be loaded.
        const mainContent = document.getElementById('main-content');
        if(mainContent) {
            mainContent.innerHTML = `<div class="text-red-500 text-center p-8">Error: Could not connect to the server. Please refresh the page.</div>`;
        }
    }
}

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch the configuration before doing anything else.
    await fetchConfig();

    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId');

    if (reportId) {
        // We are on the results/polling page
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="text-center p-8">
                    <h2 class="text-2xl font-semibold mb-4">Generating Your Report...</h2>
                    <p class="text-gray-600 mb-6">This may take a few moments. We're analyzing the property details.</p>
                    <div class="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-32 w-32 mx-auto"></div>
                </div>
            `;
            pollForReport(reportId);
        }
    } else {
        // --- FIX: Listen for the 'submit' event on the form itself ---
        const form = document.getElementById('property-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
    }
});

async function handleFormSubmit(event) {
    // Prevent the default form submission which causes the page to reload.
    event.preventDefault();
    
    const url = document.getElementById('url-input').value;
    const resultsDiv = document.getElementById('results');
    // Get the button from the form that was submitted.
    const submitButton = event.target.querySelector('button[type="submit"]');

    resultsDiv.innerHTML = '<p class="text-blue-500">Analyzing... Please wait.</p>';
    submitButton.disabled = true;
    submitButton.classList.add('opacity-50');

    try {
        const response = await fetch('/api/analyze-property', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (response.ok && data.reportId) {
            // Use the dynamically fetched PYTHON_API_URL for redirection
            window.location.href = `${PYTHON_API_URL}/report?reportId=${data.reportId}`;
        } else {
            throw new Error(data.error || 'An unknown error occurred.');
        }
    } catch (error) {
        resultsDiv.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-50');
    }
}

async function pollForReport(reportId) {
    try {
        // Use the dynamically fetched PYTHON_API_URL for polling
        const statusResponse = await fetch(`${PYTHON_API_URL}/api/report/status?reportId=${reportId}`);
        const statusData = await statusResponse.json();

        if (statusData.status === 'complete') {
            // Use the dynamically fetched PYTHON_API_URL for the final redirect
            window.location.href = `${PYTHON_API_URL}/report?reportId=${reportId}`;
        } else if (statusData.status === 'error') {
            document.getElementById('main-content').innerHTML = `<div class="text-red-500 text-center p-8">An error occurred while generating your report.</div>`;
        } else {
            // If still processing, wait 3 seconds and poll again.
            setTimeout(() => pollForReport(reportId), 3000);
        }
    } catch (error) {
        console.error('Polling error:', error);
        document.getElementById('main-content').innerHTML = `<div class="text-red-500 text-center p-8">Could not retrieve report status. Please check the console for errors.</div>`;
    }
}
