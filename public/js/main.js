document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('address-form');
  const addressInput = document.getElementById('address-input');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const address = addressInput.value.trim();
      if (!address) {
        alert('Please enter an address.');
        return;
      }
      try {
        // Call your Flask endpoint. If backend is on a different port, include the full URL.
        const response = await fetch('http://127.0.0.1:5000/api/generate-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_json: address })
        });
        const data = await response.json();
        console.log('Renovation ideas:', data.renovation_ideas);
        // Display the AI response (for now, in an alert)
        alert('Renovation Ideas:\n' + data.renovation_ideas);
      } catch (err) {
        console.error(err);
        alert('Error generating ideas. Please try again.');
      }
    });
  }
});
