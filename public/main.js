// This is the complete and final code for your main.js file

document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("address-form");
  const input = document.getElementById("address-input");

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

    // --- Create and show loading overlay ---
    let overlay = document.createElement("div");
    overlay.id = "thinking-overlay";
    overlay.className = "thinking-overlay"; 
    overlay.innerHTML = `
      <div class="thinking-spinner"></div>
      <p>Renovating...</p>
    `;
    if (document.body) {
         document.body.appendChild(overlay);
    } else {
        console.error("[main.js] document.body not found when trying to add overlay.");
        alert("Error setting up loading indicator.");
        return;
    }

    let data = null;

    try {
      // This now points to your live Node.js service
      const response = await fetch("https://renvo-node-js.onrender.com/api/analyze-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText || response.statusText}`);
      }

      data = await response.json();

      if (!data || !data.reportId) {
          throw new Error("Server response did not include a valid report ID.");
      }

      localStorage.setItem("reportId", data.reportId);

      // --- Remove overlay before redirecting ---
      if (overlay && document.body.contains(overlay)) {
          document.body.removeChild(overlay);
          overlay = null; 
      }

      // This now points to your live Python service report page
      const reportUrl = `https://renvo.onrender.com/report?reportId=${data.reportId}`;
      window.location.href = reportUrl;

    } catch (error) { 
      console.error("[main.js] Error in fetch/redirect process:", error);
      alert(`An error occurred: ${error.message || 'Unknown fetch/processing error'}`);
      
      // --- Ensure overlay is removed even on error ---
      if (overlay && document.body.contains(overlay)) {
        try {
           document.body.removeChild(overlay);
        } catch (removeError) {
            console.error("[main.js] Error removing overlay after primary error:", removeError);
        }
      }
    }
  }); 
});
