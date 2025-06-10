# Use the official Node.js 18 image as a base
FROM node:18-slim

# Set the working directory
WORKDIR /usr/src/app

# Install Google Chrome and necessary dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    # Needed for Chrome
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Download and install the latest stable version of Google Chrome
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
RUN apt-get install -y ./google-chrome-stable_current_amd64.deb && rm google-chrome-stable_current_amd64.deb

# === START DEBUGGING ===
# Verify that the Chrome executable exists and print its version
RUN echo "DEBUG: Verifying Chrome installation..."
RUN ls -l /usr/bin/google-chrome-stable
RUN google-chrome-stable --version
RUN echo "DEBUG: Chrome verification complete."
# === END DEBUGGING ===

# Copy application dependency manifests to the container
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 10000

# Set the command to run the application
CMD [ "node", "src/index.js" ]