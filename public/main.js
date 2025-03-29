document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("address-form");
  const input = document.getElementById("address-input");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) {
      alert("Please enter a valid Redfin or Zillow URL");
      return;
    }

    // Create and show the thinking overlay
    const overlay = document.createElement("div");
    overlay.className = "thinking-overlay";
    overlay.innerHTML = `
      <div class="thinking-spinner"></div>
      <p>Renovating...</p>
    `;
    document.body.appendChild(overlay);

    try {
      const response = await fetch("/api/analyze-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      console.log("Analysis result (ChatGPT):", data);

      // Save the report ID or full analysis result if needed
      localStorage.setItem("reportId", data.reportId);

      // Remove the overlay
      document.body.removeChild(overlay);
      // Redirect to the report page with the report ID
      window.location.href = `http://127.0.0.1:5000/report?reportId=${data.reportId}`;
    } catch (error) {
      console.error("Error fetching analysis result:", error);
      alert("An error occurred while fetching the analysis result.");
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }
  });
});
