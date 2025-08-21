document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("address-form");
    const input = document.getElementById("address-input");
    const overlay = document.getElementById('progress-overlay');
    const progressText = document.getElementById('progress-text');
    let statusInterval;
  
    if (!form || !input || !overlay) {
        console.error("[main.js] Essential HTML elements not found!");
        return;
    }
  
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const url = input.value.trim();
        if (!url) {
            alert("Please enter a valid Redfin or Zillow URL");
            return;
        }
  
        overlay.style.display = 'flex';
        startStatusUpdates();
  
        try {
            // THE FIX: Use a relative URL to call the backend of the current environment.
            const response = await fetch("/api/analyze-property", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url })
            });
  
            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`API Error: ${response.status} - ${errorBody.error || 'Unknown server error'}`);
            }
  
            const data = await response.json();
  
            if (!data || !data.reportId) {
                throw new Error("Server response did not include a valid report ID.");
            }
  
            // This redirects to the Python service's report page, which handles its own polling.
            const reportUrl = `https://renvo-python.onrender.com/report?reportId=${data.reportId}`;
            window.location.href = reportUrl;
  
        } catch (error) {
            console.error("[main.js] Error in fetch/redirect process:", error);
            alert(`An error occurred: ${error.message || 'Unknown fetch/processing error'}`);
            if (overlay) {
                overlay.style.display = 'none';
            }
            if (statusInterval) {
                clearInterval(statusInterval);
            }
        }
    });
  
    function startStatusUpdates() {
      const messages = [
          "Initializing Renvo AI analysis...",
          "Analyzing property details & imagery...",
          "Cross-referencing local market data...",
          "Simulating renovation project outcomes...",
          "Calculating financial projections & ROI...",
          "Compiling your custom report..."
      ];
      let messageIndex = 0;
  
      function updateText() {
          if (progressText && messageIndex < messages.length) {
              progressText.textContent = messages[messageIndex];
              messageIndex++;
          }
      }
  
      updateText();
      statusInterval = setInterval(updateText, 10000);
    }
  });