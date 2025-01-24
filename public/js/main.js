// public/js/main.js

// Example: handle the sign-in form submission (if you included it on sign-in.html)
const signinForm = document.getElementById('signin-form');

if (signinForm) {
  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = event.target.email.value;
    const password = event.target.password.value;

    // In a real app, you'd send this to your server, e.g., using fetch:
    // const response = await fetch('/api/auth/login', { ... });
    // Then handle success/failure accordingly.

    console.log('Sign-In attempt:', { email, password });
    alert('Sign-In request sent (placeholder)!');
    // Clear form
    event.target.reset();
  });
}

// Example: handle the address form from index.html
const addressForm = document.querySelector('.address-form');

if (addressForm) {
  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const addressInput = document.getElementById('address-input').value;
    console.log('Searching for comps near:', addressInput);

    // You might fetch from your server, e.g.:
    // const res = await fetch(`/api/compare?address=${encodeURIComponent(addressInput)}`);
    // const data = await res.json();
    // Then display the results on the page.
  });
}
