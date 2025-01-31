document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("address-form");
    const input = document.getElementById("address-input");
    const trendingList = document.getElementById("trending-homes");
  
    form.addEventListener("submit", async function (event) {
      event.preventDefault(); // Prevent page reload
  
      const address = input.value.trim();
      if (!address) {
        alert("Please enter a valid address.");
        return;
      }
  
      // Call API to fetch comparable properties
      try {
        const response = await fetch(`/api/comparables?address=${encodeURIComponent(address)}`);
        const data = await response.json();
  
        if (data.success && data.data.length > 0) {
          trendingList.innerHTML = ""; // Clear previous results
  
          data.data.forEach((property) => {
            const card = document.createElement("div");
            card.classList.add("home-card");
  
            card.innerHTML = `
              <img src="https://via.placeholder.com/300x200" alt="Property Image">
              <div class="card-details">
                <h3>${property.address}</h3>
                <p>${property.bedrooms} Beds · ${property.bathrooms} Baths · $${property.sale_price.toLocaleString()}</p>
              </div>
            `;
  
            trendingList.appendChild(card);
          });
        } else {
          trendingList.innerHTML = "<p>No comparable properties found.</p>";
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        trendingList.innerHTML = "<p>Failed to load data. Please try again.</p>";
      }
    });
  });
  