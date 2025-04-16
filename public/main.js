// Place this code in public/main.js (Normal Version)

document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("address-form");
  const input = document.getElementById("address-input");

  // Check if form and input exist ONCE on load
  if (!form || !input) {
      console.error("[main.js] Essential HTML elements (form or input) not found!");
      alert("Error initializing page: Form elements missing.");
      return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) {
      alert("Please enter a valid Redfin or Zillow URL");
      return;
    }

    // --- Create and show overlay ---
    let overlay = document.createElement("div");
    overlay.id = "thinking-overlay";
    overlay.className = "thinking-overlay"; // Make sure this class exists in your CSS
    overlay.innerHTML = `
      <div class="thinking-spinner"></div>
      <p>Renovating...</p>
    `;
    if (document.body) {
         document.body.appendChild(overlay);
         console.log("[main.js] Overlay added.");
    } else {
        console.error("[main.js] document.body not found when trying to add overlay.");
        alert("Error setting up loading indicator.");
        return;
    }
    // --- End overlay creation ---

    let data = null; // Define data outside the try block

    try {
      console.log("[main.js] Fetching /api/analyze-property...");
      const response = await fetch("/api/analyze-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
        // No AbortController in this version
      });
      console.log(`[main.js] Initial response status: ${response.status}`);
      console.log("[main.js] Response headers:", JSON.stringify([...response.headers]));

      if (!response.ok) {
          // Handle HTTP errors first
          const errorText = await response.text();
          console.error(`[main.js] API call failed with status ${response.status}:`, errorText);
          throw new Error(`API Error: ${response.status} - ${errorText || response.statusText}`);
      }

      // Try parsing JSON
      try {
          console.log("[main.js] Attempting response.json()...");
          data = await response.json(); // Expecting { reportId: '...', ... }
          console.log("[main.js] Successfully parsed response data:", JSON.stringify(data));
      } catch (jsonError) {
          console.error("[main.js] Error parsing JSON response:", jsonError);
          // Attempt to get raw text for context if JSON parsing fails
          const rawTextForError = await response.text().catch(e => `Could not get raw text: ${e.message}`);
          console.error("[main.js] Raw text during parse error:", rawTextForError);
          throw new Error(`Failed to parse JSON response from server: ${jsonError.message}`);
      }

      // Validate received data
      if (!data || !data.reportId) {
          console.error("[main.js] Parsed data is missing reportId:", data);
          throw new Error("Server response did not include a valid report ID.");
      }

      // Store ID
      localStorage.setItem("reportId", data.reportId);
      console.log(`[main.js] Stored reportId: ${data.reportId}`);

      // Remove the overlay (check again using the 'overlay' variable)
      console.log("[main.js] Removing overlay before redirect...");
      if (overlay && document.body.contains(overlay)) {
          document.body.removeChild(overlay);
          console.log("[main.js] Overlay removed.");
          overlay = null; // Nullify after removing
      } else {
          console.warn("[main.js] Overlay element not found or already removed before redirect attempt.");
      }

      // Redirect
      const reportUrl = `http://127.0.0.1:5000/report?reportId=${data.reportId}`;
      console.log(`[main.js] Attempting redirect to: ${reportUrl}`);
      window.location.href = reportUrl;
      console.log("[main.js] Redirect initiated (may not see this log).");

    } catch (error) { // Catch errors from fetch, json parsing, other issues
      console.error("[main.js] Error in fetch/redirect process:", error);
      alert(`An error occurred: ${error.message || 'Unknown fetch/processing error'}`);
      // Ensure overlay is removed even on error
      if (overlay && document.body.contains(overlay)) {
        try {
           document.body.removeChild(overlay);
           console.log("[main.js] Overlay removed after error.");
        } catch (removeError) {
            console.error("[main.js] Error removing overlay after primary error:", removeError);
        }
      }
    }
  }); // End of event listener
}); // End of DOMContentLoaded