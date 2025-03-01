# Renovation ROI Chrome Extension Structure

## Directory Structure

```
renovation-roi-extension/
│
├── manifest.json                 # Extension configuration
│
├── background/
│   └── background.js             # Simplified background script
│
├── content/
│   ├── content.js                # Property data extraction
│   ├── overlay.js                # UI button injection and modal
│   └── styles.css                # UI styling
│
├── popup/
│   ├── popup.html                # Simple popup UI
│   ├── popup.js                  # Popup functionality
│   └── popup.css                 # Popup styling
│
├── lib/                          # Shared utilities
│   └── extract-helpers.js        # Helper functions for data extraction
│
└── assets/
    └── icons/                    # Extension icons
        ├── icon16.png
        ├── icon48.png
        ├── icon128.png
        └── logo.svg
```